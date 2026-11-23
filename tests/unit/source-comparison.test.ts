import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  compareEnvironmentalSources,
  createOpenMeteoModelRecord,
  MAX_COMPARISON_DISTANCE_KM,
  MAX_COMPARISON_TIME_DIFF_MINUTES,
} from '@/domain/source-comparison';
import { EnvironmentalSourceRecord } from '@/domain/types';

describe('AVIR STEP 3 CORRECTIVE — Group D: Comparison Integrity & Parity (30-42)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-22T09:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });
  it('30. A single source does not generate consensus or artificial spread (Mode A)', () => {
    const singleModel = createOpenMeteoModelRecord({
      pm25: 145,
      timestamp: '2026-11-22T08:00:00Z',
      latitude: 28.61,
      longitude: 77.21,
    });

    const result = compareEnvironmentalSources([singleModel], 'pm25');

    expect(result.mode).toBe('mode_a_single_source');
    expect(result.status).toBe('insufficient_sources');
    expect(result.absoluteDifferenceUgM3).toBeNull();
    expect(result.relativeDifferencePercent).toBeNull();
    expect(result.summary).toContain('1 primary environmental dataset available');
    expect(result.summary).toContain('Independent comparison unavailable');
    expect(result.eligibleSourceIds).toEqual([singleModel.id]);
  });

  it('31. Missing source timestamp blocks numerical comparison (Mode B)', () => {
    const model = createOpenMeteoModelRecord({
      pm25: 120,
      timestamp: '2026-11-22T08:00:00Z',
      latitude: 28.61,
      longitude: 77.21,
    });

    const stationWithoutTime: EnvironmentalSourceRecord = {
      id: 'sensor-no-time',
      providerId: 'local',
      providerName: 'Station Without Time',
      sourceName: 'Untimed Station',
      sourceKind: 'physical_observation',
      status: 'fresh',
      latitude: 28.62,
      longitude: 77.22,
      distanceKm: 2,
      observedAt: null,
      retrievedAt: new Date().toISOString(),
      measurements: [{ pollutant: 'pm25', value: 130, unit: 'ug/m3', observedAt: null, averagingPeriodMinutes: 60 }],
      attribution: 'Local',
      provenance: { licenseOrAttribution: 'Test', isModel: false, limitations: [] },
    };

    const result = compareEnvironmentalSources([model, stationWithoutTime], 'pm25');
    expect(result.mode).toBe('mode_b_incompatible');
    expect(result.incompatibilityReasons?.some(r => r.includes('Missing measurement timestamp'))).toBe(true);
    expect(result.absoluteDifferenceUgM3).toBeNull();
  });

  it('32. Invalid source timestamp blocks comparison (Mode B)', () => {
    const model = createOpenMeteoModelRecord({
      pm25: 120,
      timestamp: '2026-11-22T08:00:00Z',
      latitude: 28.61,
      longitude: 77.21,
    });

    const stationInvalidTime: EnvironmentalSourceRecord = {
      id: 'sensor-bad-time',
      providerId: 'local',
      providerName: 'Station Bad Time',
      sourceName: 'Garbled Time Station',
      sourceKind: 'physical_observation',
      status: 'fresh',
      latitude: 28.62,
      longitude: 77.22,
      distanceKm: 2,
      observedAt: 'not-a-valid-date',
      retrievedAt: new Date().toISOString(),
      measurements: [{ pollutant: 'pm25', value: 130, unit: 'ug/m3', observedAt: 'not-a-valid-date', averagingPeriodMinutes: 60 }],
      attribution: 'Local',
      provenance: { licenseOrAttribution: 'Test', isModel: false, limitations: [] },
    };

    const result = compareEnvironmentalSources([model, stationInvalidTime], 'pm25');
    expect(result.mode).toBe('mode_b_incompatible');
    expect(result.incompatibilityReasons?.some(r => r.includes('Unparseable or invalid timestamp'))).toBe(true);
  });

  it('33. Stale observation blocks current comparison', () => {
    const model = createOpenMeteoModelRecord({
      pm25: 120,
      timestamp: new Date().toISOString(),
      latitude: 28.61,
      longitude: 77.21,
    });

    const staleTime = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const staleGroundStation: EnvironmentalSourceRecord = {
      id: 'station-stale',
      providerId: 'openaq',
      providerName: 'OpenAQ',
      sourceName: 'Historical Sensor Node',
      sourceKind: 'physical_observation',
      status: 'stale',
      latitude: 28.62,
      longitude: 77.22,
      distanceKm: 2,
      observedAt: staleTime,
      retrievedAt: new Date().toISOString(),
      measurements: [{ pollutant: 'pm25', value: 115, unit: 'ug/m3', observedAt: staleTime }],
      attribution: 'OpenAQ',
      provenance: { licenseOrAttribution: 'OpenAQ', isModel: false, limitations: [] },
    };

    const result = compareEnvironmentalSources([model, staleGroundStation], 'pm25');
    expect(result.mode).toBe('mode_a_single_source');
    expect(result.excludedSourceIds).toContain('station-stale');
  });

  it('34. Future-dated physical observation is rejected (clock skew > 10m)', () => {
    const model = createOpenMeteoModelRecord({
      pm25: 120,
      timestamp: new Date().toISOString(),
      latitude: 28.61,
      longitude: 77.21,
    });

    // 2 hours in the future
    const futureTime = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
    const futureStation: EnvironmentalSourceRecord = {
      id: 'station-future',
      providerId: 'local',
      providerName: 'Future Clock Station',
      sourceName: 'Skewed Time Station',
      sourceKind: 'physical_observation',
      status: 'fresh',
      latitude: 28.62,
      longitude: 77.22,
      distanceKm: 2,
      observedAt: futureTime,
      retrievedAt: new Date().toISOString(),
      measurements: [{ pollutant: 'pm25', value: 140, unit: 'ug/m3', observedAt: futureTime, averagingPeriodMinutes: 60 }],
      attribution: 'Local',
      provenance: { licenseOrAttribution: 'Test', isModel: false, limitations: [] },
    };

    const result = compareEnvironmentalSources([model, futureStation], 'pm25');
    expect(result.mode).toBe('mode_b_incompatible');
    expect(result.incompatibilityReasons?.some(r => r.includes('Future-dated physical observation timestamp rejected'))).toBe(true);
  });

  it('35. Missing averaging period blocks unsupported comparison (Rule C)', () => {
    const model = createOpenMeteoModelRecord({
      pm25: 120,
      timestamp: '2026-11-22T08:00:00Z',
      latitude: 28.61,
      longitude: 77.21,
    });

    const stationNoPeriod: EnvironmentalSourceRecord = {
      id: 'station-no-period',
      providerId: 'local',
      providerName: 'Sensor No Period',
      sourceName: 'Instantaneous Sensor',
      sourceKind: 'physical_observation',
      status: 'fresh',
      latitude: 28.62,
      longitude: 77.22,
      distanceKm: 2,
      observedAt: '2026-11-22T08:00:00Z',
      retrievedAt: new Date().toISOString(),
      measurements: [{ pollutant: 'pm25', value: 130, unit: 'ug/m3', observedAt: '2026-11-22T08:00:00Z', averagingPeriodMinutes: null }],
      attribution: 'Local',
      provenance: { licenseOrAttribution: 'Test', isModel: false, limitations: [] },
    };

    const result = compareEnvironmentalSources([model, stationNoPeriod], 'pm25');
    expect(result.mode).toBe('mode_b_incompatible');
    expect(result.incompatibilityReasons?.some(r => r.includes('Missing averaging period'))).toBe(true);
  });

  it('36. Different incompatible averaging periods block comparison (Mode B)', () => {
    const model1Hour = createOpenMeteoModelRecord({
      pm25: 150,
      timestamp: '2026-11-22T08:00:00Z',
      latitude: 28.61,
      longitude: 77.21,
    });

    const dailyStation24Hour: EnvironmentalSourceRecord = {
      id: 'station-daily',
      providerId: 'agency_daily',
      providerName: 'State Agency',
      sourceName: 'Regional 24-Hour Station',
      sourceKind: 'official_ground_station',
      status: 'fresh',
      latitude: 28.62,
      longitude: 77.22,
      distanceKm: 3,
      observedAt: '2026-11-22T08:00:00Z',
      retrievedAt: new Date().toISOString(),
      measurements: [{ pollutant: 'pm25', value: 160, unit: 'ug/m3', averagingPeriodMinutes: 1440, observedAt: '2026-11-22T08:00:00Z' }],
      attribution: 'State Agency',
      provenance: { licenseOrAttribution: 'State', isModel: false, limitations: [] },
    };

    const result = compareEnvironmentalSources([model1Hour, dailyStation24Hour], 'pm25');
    expect(result.mode).toBe('mode_b_incompatible');
    expect(result.incompatibilityReasons?.some(r => r.includes('Incompatible averaging periods'))).toBe(true);
  });

  it('37. Incompatible units block comparison (Mode B)', () => {
    const model = createOpenMeteoModelRecord({
      pm25: 120,
      timestamp: '2026-11-22T08:00:00Z',
      latitude: 28.61,
      longitude: 77.21,
    });

    const gasSensorInPpm: EnvironmentalSourceRecord = {
      id: 'sensor-ppm',
      providerId: 'provider_ppm',
      providerName: 'Custom Gas Sensor',
      sourceName: 'Surface Station (ppm unit)',
      sourceKind: 'physical_observation',
      status: 'fresh',
      latitude: 28.62,
      longitude: 77.22,
      distanceKm: 2,
      observedAt: '2026-11-22T08:00:00Z',
      retrievedAt: new Date().toISOString(),
      measurements: [{ pollutant: 'pm25', value: 80, unit: 'ppm', averagingPeriodMinutes: 60, observedAt: '2026-11-22T08:00:00Z' }],
      attribution: 'Local Sensor',
      provenance: { licenseOrAttribution: 'Test', isModel: false, limitations: [] },
    };

    const result = compareEnvironmentalSources([model, gasSensorInPpm], 'pm25');
    expect(result.mode).toBe('mode_b_incompatible');
    expect(result.incompatibilityReasons?.some(r => r.includes('Incompatible units'))).toBe(true);
  });

  it('38. Unknown source location blocks unsupported geographic comparison (Rule E)', () => {
    const model = createOpenMeteoModelRecord({
      pm25: 120,
      timestamp: '2026-11-22T08:00:00Z',
      latitude: 28.61,
      longitude: 77.21,
    });

    const unknownLocationStation: EnvironmentalSourceRecord = {
      id: 'station-no-coords',
      providerId: 'unknown',
      providerName: 'Unknown Location Net',
      sourceName: 'Floating Sensor',
      sourceKind: 'physical_observation',
      status: 'fresh',
      latitude: null,
      longitude: null,
      distanceKm: null, // Unknown location
      observedAt: '2026-11-22T08:00:00Z',
      retrievedAt: new Date().toISOString(),
      measurements: [{ pollutant: 'pm25', value: 125, unit: 'ug/m3', observedAt: '2026-11-22T08:00:00Z', averagingPeriodMinutes: 60 }],
      attribution: 'Unknown',
      provenance: { licenseOrAttribution: 'Unknown', isModel: false, limitations: [] },
    };

    const result = compareEnvironmentalSources([model, unknownLocationStation], 'pm25');
    expect(result.mode).toBe('mode_b_incompatible');
    expect(result.incompatibilityReasons?.some(r => r.includes('Unknown station location'))).toBe(true);
  });

  it('39. Duplicate upstream sources are not counted twice', () => {
    const model = createOpenMeteoModelRecord({
      pm25: 120,
      timestamp: '2026-11-22T08:00:00Z',
      latitude: 28.61,
      longitude: 77.21,
    });

    const cpcbOriginal: EnvironmentalSourceRecord = {
      id: 'cpcb-ito',
      upstreamProviderId: 'cpcb',
      stationId: 'station_101',
      providerId: 'cpcb',
      providerName: 'CPCB',
      sourceName: 'ITO Station (Direct CPCB)',
      sourceKind: 'official_ground_station',
      status: 'fresh',
      latitude: 28.63,
      longitude: 77.24,
      distanceKm: 3.0,
      observedAt: '2026-11-22T08:00:00Z',
      retrievedAt: new Date().toISOString(),
      measurements: [{ pollutant: 'pm25', value: 160, unit: 'ug/m3', averagingPeriodMinutes: 60, observedAt: '2026-11-22T08:00:00Z' }],
      attribution: 'CPCB',
      provenance: { licenseOrAttribution: 'CPCB', isModel: false, limitations: [] },
    };

    const openAqMirror: EnvironmentalSourceRecord = {
      id: 'openaq-cpcb-ito',
      upstreamProviderId: 'cpcb',
      stationId: 'station_101', // Identical upstream monitor!
      providerId: 'openaq',
      providerName: 'OpenAQ',
      sourceName: 'ITO Station (via OpenAQ)',
      sourceKind: 'official_ground_station',
      status: 'fresh',
      latitude: 28.63,
      longitude: 77.24,
      distanceKm: 3.0,
      observedAt: '2026-11-22T08:00:00Z',
      retrievedAt: new Date().toISOString(),
      measurements: [{ pollutant: 'pm25', value: 160, unit: 'ug/m3', averagingPeriodMinutes: 60, observedAt: '2026-11-22T08:00:00Z' }],
      attribution: 'OpenAQ',
      provenance: { licenseOrAttribution: 'OpenAQ', isModel: false, limitations: [] },
    };

    const result = compareEnvironmentalSources([model, cpcbOriginal, openAqMirror], 'pm25');
    // Duplicated station is deduplicated, leaving exactly 2 distinct sources compared
    expect(result.sourcesCompared.length).toBe(2);
    expect(result.mode).toBe('mode_c_comparable');
  });

  it('40. Two valid independent comparable PM2.5 records produce the correct difference (Mode C)', () => {
    const timestamp = '2026-11-22T08:00:00Z';

    const model = createOpenMeteoModelRecord({
      pm25: 152.0,
      timestamp,
      latitude: 28.61,
      longitude: 77.21,
    });

    const groundStation: EnvironmentalSourceRecord = {
      id: 'ground-chanakyapuri',
      providerId: 'openaq',
      providerName: 'AirNow Gov',
      sourceName: 'US Embassy Chanakyapuri',
      sourceKind: 'physical_observation',
      status: 'fresh',
      latitude: 28.59,
      longitude: 77.19,
      distanceKm: 3.1,
      observedAt: timestamp,
      retrievedAt: new Date().toISOString(),
      measurements: [{ pollutant: 'pm25', value: 164.0, unit: 'ug/m3', observedAt: timestamp, averagingPeriodMinutes: 60 }],
      attribution: 'AirNow',
      provenance: { licenseOrAttribution: 'AirNow Gov', isModel: false, limitations: [] },
    };

    const result = compareEnvironmentalSources([model, groundStation], 'pm25');

    expect(result.mode).toBe('mode_c_comparable');
    expect(result.status).toBe('comparable');
    expect(result.absoluteDifferenceUgM3).toBe(12.0);
    expect(result.minConcentration).toBe(152.0);
    expect(result.maxConcentration).toBe(164.0);
    expect(result.summary).toContain('12 µg/m³');
  });

  it('41. Three-source comparison preserves accurate eligible and excluded lists', () => {
    const timestamp = '2026-11-22T08:00:00Z';

    const model = createOpenMeteoModelRecord({
      pm25: 100,
      timestamp,
      latitude: 28.61,
      longitude: 77.21,
    });

    const eligibleGround: EnvironmentalSourceRecord = {
      id: 'ground-1',
      providerId: 'p1',
      providerName: 'P1',
      sourceName: 'Local Monitor 1',
      sourceKind: 'physical_observation',
      status: 'fresh',
      latitude: 28.62,
      longitude: 77.22,
      distanceKm: 2,
      observedAt: timestamp,
      retrievedAt: new Date().toISOString(),
      measurements: [{ pollutant: 'pm25', value: 110, unit: 'ug/m3', observedAt: timestamp, averagingPeriodMinutes: 60 }],
      attribution: 'P1',
      provenance: { licenseOrAttribution: 'P1', isModel: false, limitations: [] },
    };

    const distantGround: EnvironmentalSourceRecord = {
      id: 'ground-distant',
      providerId: 'p2',
      providerName: 'P2',
      sourceName: 'Distant Station (70km)',
      sourceKind: 'physical_observation',
      status: 'fresh',
      latitude: 29.5,
      longitude: 77.9,
      distanceKm: 70, // Incompatible distance (>35km)
      observedAt: timestamp,
      retrievedAt: new Date().toISOString(),
      measurements: [{ pollutant: 'pm25', value: 190, unit: 'ug/m3', observedAt: timestamp, averagingPeriodMinutes: 60 }],
      attribution: 'P2',
      provenance: { licenseOrAttribution: 'P2', isModel: false, limitations: [] },
    };

    const result = compareEnvironmentalSources([model, eligibleGround, distantGround], 'pm25');

    expect(result.mode).toBe('mode_c_comparable');
    expect(result.eligibleSourceIds).toEqual(['open-meteo-atmospheric-model', 'ground-1']);
    expect(result.excludedSourceIds).toContain('ground-distant');
    expect(result.sourcesCompared.length).toBe(2);
  });

  it('42. No arbitrary numerical confidence percentage is generated', () => {
    const timestamp = '2026-11-22T08:00:00Z';
    const model = createOpenMeteoModelRecord({ pm25: 100, timestamp, latitude: 28.61, longitude: 77.21 });
    const ground: EnvironmentalSourceRecord = {
      id: 'g1',
      providerId: 'p',
      providerName: 'P',
      sourceName: 'G1',
      sourceKind: 'physical_observation',
      status: 'fresh',
      latitude: 28.62,
      longitude: 77.22,
      distanceKm: 2,
      observedAt: timestamp,
      retrievedAt: new Date().toISOString(),
      measurements: [{ pollutant: 'pm25', value: 105, unit: 'ug/m3', observedAt: timestamp, averagingPeriodMinutes: 60 }],
      attribution: 'P',
      provenance: { licenseOrAttribution: 'P', isModel: false, limitations: [] },
    };

    const result = compareEnvironmentalSources([model, ground], 'pm25');
    expect((result as any).confidenceScorePercent).toBeUndefined();
    expect((result as any).agreementPercentage).toBeUndefined();
  });
});

describe('AVIR STEP 3 CORRECTIVE — Group E: Model Time Metadata (43-46)', () => {
  it('43. Model valid time is preserved in validAt field', () => {
    const validTime = '2026-11-22T09:00:00Z';
    const model = createOpenMeteoModelRecord({
      pm25: 110,
      timestamp: validTime,
      latitude: 28.61,
      longitude: 77.21,
    });

    expect(model.validAt).toBe(validTime);
    expect(model.measurements[0].validAt).toBe(validTime);
  });

  it('44. Unknown model initialization time stays null without guessing from current time', () => {
    const validTime = '2026-11-22T09:00:00Z';
    const model = createOpenMeteoModelRecord({
      pm25: 110,
      timestamp: validTime,
      latitude: 28.61,
      longitude: 77.21,
    });

    expect(model.modelRunAt).toBeNull();
  });

  it('45. Retrieval timestamp remains separate from model valid time', () => {
    const validTime = '2026-11-22T09:00:00Z';
    const retrievedTime = '2026-11-22T09:04:12Z';

    const model = createOpenMeteoModelRecord({
      pm25: 110,
      timestamp: validTime,
      latitude: 28.61,
      longitude: 77.21,
      retrievedAt: retrievedTime,
    });

    expect(model.validAt).toBe(validTime);
    expect(model.retrievedAt).toBe(retrievedTime);
    expect(model.validAt).not.toBe(model.retrievedAt);
  });

  it('46. Model readings are never labeled physical observations', () => {
    const model = createOpenMeteoModelRecord({
      pm25: 110,
      timestamp: '2026-11-22T09:00:00Z',
      latitude: 28.61,
      longitude: 77.21,
    });

    expect(model.sourceKind).toBe('atmospheric_model');
    expect(model.observedAt).toBeNull(); // Models do not have physical observation timestamps
    expect(model.provenance.isModel).toBe(true);
  });
});
