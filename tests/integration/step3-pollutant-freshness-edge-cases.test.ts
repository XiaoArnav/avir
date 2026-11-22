import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  evaluateMeasurementEligibility,
  getActivePhysicalSources,
  getStalePhysicalSources,
  validateObservationTiming,
} from '@/config/environmental-sources';
import {
  compareEnvironmentalSources,
  createOpenMeteoModelRecord,
  deduplicateEnvironmentalSources,
} from '@/domain/source-comparison';
import {
  parseOpenAqLocation,
  OpenAqLocationResult,
  OpenAqLatestMeasurementItem,
} from '@/services/providers/openaq-provider';
import { EnvironmentalSourceRecord } from '@/domain/types';

describe('AVIR STEP 03 FINAL PRODUCTION CLOSURE — Cross-Pollutant Freshness & Unified Active Counts', () => {
  const getFreshIso = (minutesAgo = 15) => new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
  const getStaleIso = (hoursAgo = 25) => new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString();
  const getFutureIso = (minutesAhead = 20) => new Date(Date.now() + minutesAhead * 60 * 1000).toISOString();

  // =========================================================================
  // CASE A: PM10 fresh, PM2.5 untimed
  // =========================================================================
  it('Case A — PM10 fresh, PM2.5 untimed: PM2.5 active=0, PM10 active=1, PM2.5 comparison eligibility=false', () => {
    const validPm10Time = getFreshIso(10);
    const station: EnvironmentalSourceRecord = {
      id: 'openaq-case-a',
      providerId: 'openaq',
      providerName: 'OpenAQ',
      sourceName: 'Station Case A',
      sourceKind: 'official_ground_station',
      status: 'fresh',
      observedAt: validPm10Time, // Station-level timestamp reflects PM10
      latitude: 28.61,
      longitude: 77.21,
      distanceKm: 4.2,
      measurements: [
        {
          pollutant: 'pm25',
          value: 70,
          unit: 'ug/m3',
          observedAt: null, // PM2.5 has NO timestamp
        },
        {
          pollutant: 'pm10',
          value: 105,
          unit: 'ug/m3',
          observedAt: validPm10Time,
        },
      ],
      retrievedAt: new Date().toISOString(),
      ingestedAt: new Date().toISOString(),
      attribution: 'Agency',
      provenance: { licenseOrAttribution: 'CC BY', isModel: false, limitations: [] },
    };

    // 1. Selector counts
    const activePm25 = getActivePhysicalSources([station], 'pm25');
    const activePm10 = getActivePhysicalSources([station], 'pm10');
    expect(activePm25.length).toBe(0);
    expect(activePm10.length).toBe(1);

    // 2. Canonical eligibility
    const pm25Eligibility = evaluateMeasurementEligibility(station, 'pm25');
    expect(pm25Eligibility.eligible).toBe(false);
    if (!pm25Eligibility.eligible) {
      expect(pm25Eligibility.reason).toBe('missing_timestamp');
      expect(pm25Eligibility.message).toContain('timestamp is missing');
    }

    const pm10Eligibility = evaluateMeasurementEligibility(station, 'pm10');
    expect(pm10Eligibility.eligible).toBe(true);

    // 3. Comparison eligibility
    const model = createOpenMeteoModelRecord({
      pm25: 75,
      pm10: 110,
      timestamp: validPm10Time,
      latitude: 28.61,
      longitude: 77.21,
    });

    const pm25Comparison = compareEnvironmentalSources([model, station], 'pm25');
    expect(pm25Comparison.mode).toBe('mode_b_incompatible');
    expect(pm25Comparison.eligibleSourceIds).not.toContain(station.id);
    expect(pm25Comparison.incompatibilityReasons?.some((r) => r.includes('Missing measurement timestamp'))).toBe(true);

    // PM2.5 measurement timestamp was NOT contaminated by PM10
    expect(station.measurements[0].observedAt).toBeNull();
  });

  // =========================================================================
  // CASE B: PM2.5 fresh, PM10 untimed
  // =========================================================================
  it('Case B — PM2.5 fresh, PM10 untimed: PM2.5 active=1, PM10 active=0, PM10 missing timestamp remains null', () => {
    const validPm25Time = getFreshIso(15);
    const station: EnvironmentalSourceRecord = {
      id: 'openaq-case-b',
      providerId: 'openaq',
      providerName: 'OpenAQ',
      sourceName: 'Station Case B',
      sourceKind: 'physical_observation',
      status: 'fresh',
      observedAt: validPm25Time,
      latitude: 28.61,
      longitude: 77.21,
      distanceKm: 3.5,
      measurements: [
        {
          pollutant: 'pm25',
          value: 62.4,
          unit: 'ug/m3',
          observedAt: validPm25Time,
        },
        {
          pollutant: 'pm10',
          value: 115.0,
          unit: 'ug/m3',
          observedAt: null, // PM10 untimed
        },
      ],
      retrievedAt: new Date().toISOString(),
      ingestedAt: new Date().toISOString(),
      attribution: 'Agency',
      provenance: { licenseOrAttribution: 'CC BY', isModel: false, limitations: [] },
    };

    const activePm25 = getActivePhysicalSources([station], 'pm25');
    const activePm10 = getActivePhysicalSources([station], 'pm10');
    expect(activePm25.length).toBe(1);
    expect(activePm10.length).toBe(0);

    const pm10Eligibility = evaluateMeasurementEligibility(station, 'pm10');
    expect(pm10Eligibility.eligible).toBe(false);
    if (!pm10Eligibility.eligible) {
      expect(pm10Eligibility.reason).toBe('missing_timestamp');
    }

    expect(station.measurements[1].observedAt).toBeNull();
  });

  // =========================================================================
  // CASE C: PM2.5 stale, PM10 fresh
  // =========================================================================
  it('Case C — PM2.5 stale, PM10 fresh: PM2.5 excluded from active, PM2.5 stale=1, PM10 active=1', () => {
    const staleTime = getStaleIso(26); // 26 hours old (>24h threshold)
    const freshTime = getFreshIso(10); // 10 minutes old

    const station: EnvironmentalSourceRecord = {
      id: 'openaq-case-c',
      providerId: 'openaq',
      providerName: 'OpenAQ',
      sourceName: 'Station Case C',
      sourceKind: 'community_optical',
      status: 'fresh', // Overall station status might claim fresh due to PM10
      observedAt: freshTime,
      latitude: 28.61,
      longitude: 77.21,
      distanceKm: 1.8,
      measurements: [
        {
          pollutant: 'pm25',
          value: 88.0,
          unit: 'ug/m3',
          observedAt: staleTime,
        },
        {
          pollutant: 'pm10',
          value: 140.0,
          unit: 'ug/m3',
          observedAt: freshTime,
        },
      ],
      retrievedAt: new Date().toISOString(),
      ingestedAt: new Date().toISOString(),
      attribution: 'Community Network',
      provenance: { licenseOrAttribution: 'ODbL', isModel: false, limitations: [] },
    };

    // PM2.5 must not be active despite station.status === 'fresh'
    const activePm25 = getActivePhysicalSources([station], 'pm25');
    const stalePm25 = getStalePhysicalSources([station], 'pm25');
    expect(activePm25.length).toBe(0);
    expect(stalePm25.length).toBe(1);

    // PM10 must remain active
    const activePm10 = getActivePhysicalSources([station], 'pm10');
    const stalePm10 = getStalePhysicalSources([station], 'pm10');
    expect(activePm10.length).toBe(1);
    expect(stalePm10.length).toBe(0);

    const pm25Eligibility = evaluateMeasurementEligibility(station, 'pm25');
    expect(pm25Eligibility.eligible).toBe(false);
    if (!pm25Eligibility.eligible) {
      expect(pm25Eligibility.reason).toBe('stale');
    }
  });

  // =========================================================================
  // CASE D: PM2.5 invalid, PM10 valid
  // =========================================================================
  it('Case D — PM2.5 invalid (negative or non-finite), PM10 valid: PM2.5 active=0, PM10 active=1, no value substitution', () => {
    const validTime = getFreshIso(20);
    const station: EnvironmentalSourceRecord = {
      id: 'openaq-case-d',
      providerId: 'openaq',
      providerName: 'OpenAQ',
      sourceName: 'Station Case D',
      sourceKind: 'official_ground_station',
      status: 'fresh',
      observedAt: validTime,
      latitude: 28.61,
      longitude: 77.21,
      distanceKm: 5.0,
      measurements: [
        {
          pollutant: 'pm25',
          value: -999, // Instrument error / negative reading
          unit: 'ug/m3',
          observedAt: validTime,
        },
        {
          pollutant: 'pm10',
          value: 95.0,
          unit: 'ug/m3',
          observedAt: validTime,
        },
      ],
      retrievedAt: new Date().toISOString(),
      ingestedAt: new Date().toISOString(),
      attribution: 'Agency',
      provenance: { licenseOrAttribution: 'CC BY', isModel: false, limitations: [] },
    };

    const activePm25 = getActivePhysicalSources([station], 'pm25');
    const activePm10 = getActivePhysicalSources([station], 'pm10');
    expect(activePm25.length).toBe(0);
    expect(activePm10.length).toBe(1);

    const pm25Eligibility = evaluateMeasurementEligibility(station, 'pm25');
    expect(pm25Eligibility.eligible).toBe(false);
    if (!pm25Eligibility.eligible) {
      expect(pm25Eligibility.reason).toBe('invalid_value');
    }

    // Zero substitution from PM10
    expect(station.measurements.find((m) => m.pollutant === 'pm25')?.value).toBe(-999);
  });

  // =========================================================================
  // CASE E: Station-level timestamp exists, PM2.5 has no timestamp
  // =========================================================================
  it('Case E — Station-level timestamp exists, PM2.5 has no timestamp: PM2.5 is freshness-unverifiable, station heartbeat does not qualify it', () => {
    const heartbeatTime = getFreshIso(5);
    const station: EnvironmentalSourceRecord = {
      id: 'openaq-case-e',
      providerId: 'openaq',
      providerName: 'OpenAQ',
      sourceName: 'Station Case E',
      sourceKind: 'official_ground_station',
      status: 'fresh',
      observedAt: heartbeatTime, // Device heartbeat
      latitude: 28.61,
      longitude: 77.21,
      distanceKm: 2.1,
      measurements: [
        {
          pollutant: 'pm25',
          value: 58.2,
          unit: 'ug/m3',
          observedAt: null, // Measurement itself is untimed
        },
      ],
      retrievedAt: new Date().toISOString(),
      ingestedAt: new Date().toISOString(),
      attribution: 'Agency',
      provenance: { licenseOrAttribution: 'CC BY', isModel: false, limitations: [] },
    };

    const active = getActivePhysicalSources([station], 'pm25');
    expect(active.length).toBe(0);

    const eligibility = evaluateMeasurementEligibility(station, 'pm25');
    expect(eligibility.eligible).toBe(false);
    if (!eligibility.eligible) {
      expect(eligibility.reason).toBe('missing_timestamp');
      expect(eligibility.message).toContain('freshness cannot be verified');
    }

    // validateObservationTiming confirms it is marked as isUntimed, not stale
    const timing = validateObservationTiming(station.measurements[0].observedAt);
    expect(timing.isValid).toBe(false);
    expect(timing.isStale).toBe(false);
    expect(timing.isUntimed).toBe(true);
  });

  // =========================================================================
  // CASE F: Two aggregators expose one station
  // =========================================================================
  it('Case F — Two aggregators expose one station (e.g. station 4022): deduplication collapses count to 1', () => {
    const freshTime = getFreshIso(12);

    const openAqRecord: EnvironmentalSourceRecord = {
      id: 'openaq-4022',
      providerId: 'openaq',
      providerName: 'OpenAQ',
      upstreamProviderId: 'cpcb_caaqms',
      stationId: '4022',
      sourceName: 'Anand Vihar (OpenAQ)',
      sourceKind: 'official_ground_station',
      status: 'fresh',
      latitude: 28.65,
      longitude: 77.31,
      distanceKm: 5.0,
      observedAt: freshTime,
      measurements: [{ pollutant: 'pm25', value: 180.0, unit: 'ug/m3', observedAt: freshTime }],
      retrievedAt: new Date().toISOString(),
      ingestedAt: new Date().toISOString(),
      attribution: 'OpenAQ',
      provenance: { licenseOrAttribution: 'CC BY', isModel: false, limitations: [] },
    };

    const directAgencyRecord: EnvironmentalSourceRecord = {
      id: 'ground-4022',
      providerId: 'cpcb',
      providerName: 'CPCB',
      upstreamProviderId: 'cpcb_caaqms',
      stationId: '4022',
      sourceName: 'Anand Vihar CAAQMS',
      sourceKind: 'official_ground_station',
      status: 'fresh',
      latitude: 28.65,
      longitude: 77.31,
      distanceKm: 5.0,
      observedAt: freshTime,
      measurements: [{ pollutant: 'pm25', value: 180.0, unit: 'ug/m3', observedAt: freshTime }],
      retrievedAt: new Date().toISOString(),
      ingestedAt: new Date().toISOString(),
      attribution: 'CPCB',
      provenance: { licenseOrAttribution: 'CPCB NAQI', isModel: false, limitations: [] },
    };

    // 1. Selector deduplication
    const active = getActivePhysicalSources([openAqRecord, directAgencyRecord], 'pm25');
    expect(active.length).toBe(1);

    // 2. Domain deduplication
    const deduplicated = deduplicateEnvironmentalSources([openAqRecord, directAgencyRecord]);
    expect(deduplicated.length).toBe(1);
    expect(deduplicated[0].stationId).toBe('4022');
  });

  // =========================================================================
  // CASE G: Missing PM2.5 value, valid PM10 value
  // =========================================================================
  it('Case G — Missing PM2.5 value, valid PM10 value: PM2.5 remains unavailable, no conversion or substitution', () => {
    const freshTime = getFreshIso(8);
    const station: EnvironmentalSourceRecord = {
      id: 'openaq-case-g',
      providerId: 'openaq',
      providerName: 'OpenAQ',
      sourceName: 'Station Case G',
      sourceKind: 'official_ground_station',
      status: 'fresh',
      observedAt: freshTime,
      latitude: 28.61,
      longitude: 77.21,
      distanceKm: 3.0,
      measurements: [
        {
          pollutant: 'pm10',
          value: 120.0,
          unit: 'ug/m3',
          observedAt: freshTime,
        },
      ],
      retrievedAt: new Date().toISOString(),
      ingestedAt: new Date().toISOString(),
      attribution: 'Agency',
      provenance: { licenseOrAttribution: 'CC BY', isModel: false, limitations: [] },
    };

    const activePm25 = getActivePhysicalSources([station], 'pm25');
    const activePm10 = getActivePhysicalSources([station], 'pm10');
    expect(activePm25.length).toBe(0);
    expect(activePm10.length).toBe(1);

    const pm25Eligibility = evaluateMeasurementEligibility(station, 'pm25');
    expect(pm25Eligibility.eligible).toBe(false);
    if (!pm25Eligibility.eligible) {
      expect(pm25Eligibility.reason).toBe('missing_measurement');
    }
  });

  // =========================================================================
  // CASE H: Valid PM2.5 zero
  // =========================================================================
  it('Case H — Valid PM2.5 zero (0 µg/m³): zero is accepted as clean air reading and not treated as missing', () => {
    const freshTime = getFreshIso(5);
    const station: EnvironmentalSourceRecord = {
      id: 'openaq-case-h',
      providerId: 'openaq',
      providerName: 'OpenAQ',
      sourceName: 'Station Clean Mountain Air',
      sourceKind: 'physical_observation',
      status: 'fresh',
      observedAt: freshTime,
      latitude: 31.10,
      longitude: 77.17,
      distanceKm: 1.0,
      measurements: [
        {
          pollutant: 'pm25',
          value: 0, // Clean air / high-efficiency HEPA / zero concentration
          unit: 'ug/m3',
          observedAt: freshTime,
        },
      ],
      retrievedAt: new Date().toISOString(),
      ingestedAt: new Date().toISOString(),
      attribution: 'Clean Air Research Station',
      provenance: { licenseOrAttribution: 'CC BY', isModel: false, limitations: [] },
    };

    const active = getActivePhysicalSources([station], 'pm25');
    expect(active.length).toBe(1);

    const eligibility = evaluateMeasurementEligibility(station, 'pm25');
    expect(eligibility.eligible).toBe(true);
    if (eligibility.eligible) {
      expect(eligibility.value).toBe(0);
      expect(eligibility.pollutant).toBe('pm25');
    }
  });

  // =========================================================================
  // CASE I: Future-dated PM2.5
  // =========================================================================
  it('Case I — Future-dated PM2.5 (>10m clock skew): rejected from active counts, valid PM10 remains eligible', () => {
    const futureTime = getFutureIso(30); // 30 minutes in the future (>10m clock skew)
    const validTime = getFreshIso(10);   // Authentic fresh time

    const station: EnvironmentalSourceRecord = {
      id: 'openaq-case-i',
      providerId: 'openaq',
      providerName: 'OpenAQ',
      sourceName: 'Station Future Skew',
      sourceKind: 'community_optical',
      status: 'fresh',
      observedAt: validTime,
      latitude: 28.61,
      longitude: 77.21,
      distanceKm: 4.0,
      measurements: [
        {
          pollutant: 'pm25',
          value: 75.0,
          unit: 'ug/m3',
          observedAt: futureTime,
        },
        {
          pollutant: 'pm10',
          value: 125.0,
          unit: 'ug/m3',
          observedAt: validTime,
        },
      ],
      retrievedAt: new Date().toISOString(),
      ingestedAt: new Date().toISOString(),
      attribution: 'Community Network',
      provenance: { licenseOrAttribution: 'ODbL', isModel: false, limitations: [] },
    };

    const activePm25 = getActivePhysicalSources([station], 'pm25');
    const activePm10 = getActivePhysicalSources([station], 'pm10');
    expect(activePm25.length).toBe(0);
    expect(activePm10.length).toBe(1);

    const pm25Eligibility = evaluateMeasurementEligibility(station, 'pm25');
    expect(pm25Eligibility.eligible).toBe(false);
    if (!pm25Eligibility.eligible) {
      expect(pm25Eligibility.reason).toBe('future_timestamp');
      expect(pm25Eligibility.message).toContain('future-dated');
    }
  });

  // =========================================================================
  // CASE J: Provider status fresh, pollutant timestamp missing
  // =========================================================================
  it('Case J — Provider status fresh, pollutant timestamp missing: provider activeCount and inspector activeCount agree (= 0)', () => {
    const loc: OpenAqLocationResult = {
      id: 9901,
      name: 'Delhi Ground Node',
      isMonitor: true,
      coordinates: { latitude: 28.61, longitude: 77.21 },
      sensors: [
        { id: 101, parameter: { id: 2, name: 'pm25', units: 'µg/m³' } },
        { id: 102, parameter: { id: 1, name: 'pm10', units: 'µg/m³' } },
      ],
      datetimeLast: { utc: getFreshIso(5), local: getFreshIso(5) }, // Station heartbeat
    };

    const latestMeasurements: OpenAqLatestMeasurementItem[] = [
      {
        sensorsId: 101,
        value: 65.0,
        // No datetime or period for PM2.5!
      },
      {
        sensorsId: 102,
        value: 110.0,
        datetime: { utc: getFreshIso(10) },
      },
    ];

    const record = parseOpenAqLocation(loc, 28.61, 77.21, latestMeasurements);
    expect(record).not.toBeNull();

    // Check that parseOpenAqLocation preserved null for PM2.5 observedAt
    const pm25Measurement = record!.measurements.find((m) => m.pollutant === 'pm25');
    expect(pm25Measurement?.observedAt).toBeNull();

    // Active PM2.5 sources must be 0
    const activePm25 = getActivePhysicalSources([record!], 'pm25');
    expect(activePm25.length).toBe(0);

    // Active PM10 sources must be 1
    const activePm10 = getActivePhysicalSources([record!], 'pm10');
    expect(activePm10.length).toBe(1);

    // Both provider calculation and UI inspector selector agree on active PM2.5 count = 0
    expect(activePm25.length).toBe(0);
  });
});
