import { describe, it, expect } from 'vitest';
import {
  compareEnvironmentalSources,
  createOpenMeteoModelRecord,
  MAX_COMPARISON_DISTANCE_KM,
  MAX_COMPARISON_TIME_DIFF_MINUTES,
} from '@/domain/source-comparison';
import { EnvironmentalSourceRecord } from '@/domain/types';

describe('AVIR STEP 3 — Group E: Comparison Engine Modes & Eligibility (34-42)', () => {
  it('34. One source does not generate consensus or artificial spread (Mode A)', () => {
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

  it('35. Two sources with incompatible pollutant units are not averaged (Mode B)', () => {
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
      ingestedAt: new Date().toISOString(),
      measurements: [{ pollutant: 'pm25', value: 80, unit: 'ppm' }],
      attribution: 'Local Sensor',
      provenance: { licenseOrAttribution: 'Test', isModel: false, limitations: [] },
    };

    const result = compareEnvironmentalSources([model, gasSensorInPpm], 'pm25');

    expect(result.mode).toBe('mode_b_incompatible');
    expect(result.status).toBe('incompatible');
    expect(result.absoluteDifferenceUgM3).toBeNull();
    expect(result.incompatibilityReasons.some(r => r.includes('Incompatible units'))).toBe(true);
  });

  it('36. Different averaging periods prevent unjustified numerical consensus (Mode B)', () => {
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
      ingestedAt: new Date().toISOString(),
      measurements: [{ pollutant: 'pm25', value: 160, unit: 'ug/m3', averagingPeriodMinutes: 1440 }], // 24 hours
      attribution: 'State Agency',
      provenance: { licenseOrAttribution: 'State', isModel: false, limitations: [] },
    };

    const result = compareEnvironmentalSources([model1Hour, dailyStation24Hour], 'pm25');

    expect(result.mode).toBe('mode_b_incompatible');
    expect(result.status).toBe('incompatible');
    expect(result.absoluteDifferenceUgM3).toBeNull();
    expect(result.incompatibilityReasons.some(r => r.includes('Incompatible averaging periods'))).toBe(true);
  });

  it('37. Excessively stale observations (>24h old) are excluded from current comparisons', () => {
    const model = createOpenMeteoModelRecord({
      pm25: 120,
      timestamp: new Date().toISOString(),
      latitude: 28.61,
      longitude: 77.21,
    });

    // Observation from 48 hours ago
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
      ingestedAt: new Date().toISOString(),
      measurements: [{ pollutant: 'pm25', value: 115, unit: 'ug/m3', observedAt: staleTime }],
      attribution: 'OpenAQ',
      provenance: { licenseOrAttribution: 'OpenAQ', isModel: false, limitations: [] },
    };

    const result = compareEnvironmentalSources([model, staleGroundStation], 'pm25');

    // Stale source is excluded from active comparison
    expect(result.mode).toBe('mode_a_single_source');
    expect(result.excludedSourceIds).toContain('station-stale');
    expect(result.absoluteDifferenceUgM3).toBeNull();
  });

  it('38. Excessively distant measurements (>35km) are not treated as colocated (Mode B)', () => {
    const model = createOpenMeteoModelRecord({
      pm25: 130,
      timestamp: '2026-11-22T08:00:00Z',
      latitude: 28.61,
      longitude: 77.21,
    });

    // Station located 65 km away (outside Delhi-NCR metro envelope)
    const distantStation: EnvironmentalSourceRecord = {
      id: 'station-distant',
      providerId: 'regional',
      providerName: 'Distant Network',
      sourceName: 'Meerut Outskirts Station',
      sourceKind: 'official_ground_station',
      status: 'fresh',
      latitude: 29.0,
      longitude: 77.7,
      distanceKm: 65,
      observedAt: '2026-11-22T08:00:00Z',
      retrievedAt: new Date().toISOString(),
      ingestedAt: new Date().toISOString(),
      measurements: [{ pollutant: 'pm25', value: 185, unit: 'ug/m3' }],
      attribution: 'Regional',
      provenance: { licenseOrAttribution: 'Regional', isModel: false, limitations: [] },
    };

    const result = compareEnvironmentalSources([model, distantStation], 'pm25');

    expect(result.mode).toBe('mode_b_incompatible');
    expect(result.incompatibilityReasons.some(r => r.includes(`limit: ${MAX_COMPARISON_DISTANCE_KM}km`))).toBe(true);
    expect(result.absoluteDifferenceUgM3).toBeNull();
  });

  it('39. Observation timestamps differing by >120 minutes prevent direct comparison (Mode B)', () => {
    const modelTime = '2026-11-22T08:00:00Z';
    const groundTime = '2026-11-22T05:30:00Z'; // 150 minutes difference (>120m)

    const model = createOpenMeteoModelRecord({
      pm25: 140,
      timestamp: modelTime,
      latitude: 28.61,
      longitude: 77.21,
    });

    const unsynchronizedStation: EnvironmentalSourceRecord = {
      id: 'station-unsynced',
      providerId: 'openaq',
      providerName: 'OpenAQ',
      sourceName: 'Delayed Publishing Station',
      sourceKind: 'physical_observation',
      status: 'fresh',
      latitude: 28.62,
      longitude: 77.22,
      distanceKm: 2,
      observedAt: groundTime,
      retrievedAt: new Date().toISOString(),
      ingestedAt: new Date().toISOString(),
      measurements: [{ pollutant: 'pm25', value: 160, unit: 'ug/m3', observedAt: groundTime }],
      attribution: 'OpenAQ',
      provenance: { licenseOrAttribution: 'OpenAQ', isModel: false, limitations: [] },
    };

    const result = compareEnvironmentalSources([model, unsynchronizedStation], 'pm25');

    expect(result.mode).toBe('mode_b_incompatible');
    expect(result.incompatibilityReasons.some(r => r.includes(`${MAX_COMPARISON_TIME_DIFF_MINUTES}-minute threshold`))).toBe(true);
    expect(result.absoluteDifferenceUgM3).toBeNull();
  });

  it('40. Two genuinely comparable PM2.5 readings produce a correct absolute difference (Mode C)', () => {
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
      ingestedAt: new Date().toISOString(),
      measurements: [{ pollutant: 'pm25', value: 164.0, unit: 'ug/m3', observedAt: timestamp, averagingPeriodMinutes: 60 }],
      attribution: 'AirNow',
      provenance: { licenseOrAttribution: 'AirNow Gov', isModel: false, limitations: [] },
    };

    const result = compareEnvironmentalSources([model, groundStation], 'pm25');

    expect(result.mode).toBe('mode_c_comparable');
    expect(result.status).toBe('comparable');
    // |164.0 - 152.0| = 12.0 ug/m3
    expect(result.absoluteDifferenceUgM3).toBe(12.0);
    expect(result.minConcentration).toBe(152.0);
    expect(result.maxConcentration).toBe(164.0);
    expect(result.summary).toContain('12 µg/m³');
    expect(result.sourcesCompared.length).toBe(2);
  });

  it('41. Arbitrary numerical confidence is not displayed (zero fabricated confidence percentage)', () => {
    const timestamp = '2026-11-22T08:00:00Z';

    const model = createOpenMeteoModelRecord({ pm25: 100, timestamp, latitude: 28.61, longitude: 77.21 });
    const ground = {
      id: 'g1', providerId: 'p', providerName: 'P', sourceName: 'G1', sourceKind: 'physical_observation' as const,
      status: 'fresh' as const, latitude: 28.62, longitude: 77.22, distanceKm: 2, observedAt: timestamp,
      retrievedAt: new Date().toISOString(), ingestedAt: new Date().toISOString(),
      measurements: [{ pollutant: 'pm25' as const, value: 105, unit: 'ug/m3', observedAt: timestamp }],
      attribution: 'P', provenance: { licenseOrAttribution: 'P', isModel: false, limitations: [] },
    };

    const result = compareEnvironmentalSources([model, ground], 'pm25');
    // Result schema does not contain uncalibrated confidenceScorePercent
    expect((result as any).confidenceScorePercent).toBeUndefined();
  });

  it('42. High divergence between ground monitor and model grid flags boundary-layer trapping explanation', () => {
    const timestamp = '2026-11-22T08:00:00Z';

    const model = createOpenMeteoModelRecord({ pm25: 80.0, timestamp, latitude: 28.61, longitude: 77.21 });
    const groundTrapped = {
      id: 'g-trapped', providerId: 'p', providerName: 'P', sourceName: 'Surface In-Situ Monitor', sourceKind: 'physical_observation' as const,
      status: 'fresh' as const, latitude: 28.62, longitude: 77.22, distanceKm: 2, observedAt: timestamp,
      retrievedAt: new Date().toISOString(), ingestedAt: new Date().toISOString(),
      measurements: [{ pollutant: 'pm25' as const, value: 175.0, unit: 'ug/m3', observedAt: timestamp }],
      attribution: 'P', provenance: { licenseOrAttribution: 'P', isModel: false, limitations: [] },
    };

    const result = compareEnvironmentalSources([model, groundTrapped], 'pm25');

    expect(result.mode).toBe('mode_c_comparable');
    expect(result.divergenceReason).not.toBeNull();
    expect(result.divergenceReason).toContain('boundary-layer trapping');
  });
});
