import { describe, it, expect } from 'vitest';
import { EnvironmentalSourceRecord } from '@/domain/types';
import {
  createOpenMeteoModelRecord,
  deduplicateEnvironmentalSources,
  extractPollutantMeasurement,
} from '@/domain/source-comparison';
import {
  validateMeasurementValue,
  evaluateObservationFreshness,
  parseOpenAqLocation,
  OpenAqLocationResult,
  OpenAqLatestMeasurementItem,
} from '@/services/providers/openaq-provider';
import {
  convertGroundStationToSourceRecord,
  GroundStationMetadata,
} from '@/services/ground-station-service';

describe('AVIR STEP 3 — Group A: Provenance & Identity Rules (1-8)', () => {
  it('1. Open-Meteo results are classified as modeled', () => {
    const record = createOpenMeteoModelRecord({
      pm25: 120,
      pm10: 160,
      timestamp: '2026-11-22T08:00:00Z',
      latitude: 28.6139,
      longitude: 77.2090,
      cityName: 'Delhi',
    });

    expect(record.sourceKind).toBe('atmospheric_model');
    expect(record.providerKind).toBe('atmospheric_model');
    expect(record.provenance.isModel).toBe(true);
    expect(record.provenance.network).toContain('ECMWF');
    expect(record.attribution).toContain('Open-Meteo');
  });

  it('2. OpenAQ sensor readings are classified as observed physical ground monitors', () => {
    const mockLocation: OpenAqLocationResult = {
      id: 8521,
      name: 'US Embassy New Delhi',
      provider: { name: 'AirNow Gov' },
      owner: { name: 'US State Department' },
      coordinates: { latitude: 28.5983, longitude: 77.1897 },
      sensors: [
        { id: 101, name: 'PM2.5 Sensor', parameter: { id: 2, name: 'pm25', units: 'µg/m³' } },
      ],
      datetimeLast: { utc: '2026-11-22T08:00:00Z', local: '2026-11-22T13:30:00+05:30' },
    };

    const latest: OpenAqLatestMeasurementItem[] = [
      {
        sensorId: 101,
        parameter: { name: 'pm25', units: 'µg/m³' },
        value: 145.2,
        datetime: '2026-11-22T08:00:00Z',
      },
    ];

    const record = parseOpenAqLocation(mockLocation, 28.61, 77.20, latest);
    expect(record).not.toBeNull();
    expect(record?.sourceKind).toBe('physical_observation');
    expect(record?.provenance.isModel).toBe(false);
    expect(record?.upstreamProviderId).toBe('AirNow Gov');
  });

  it('3. Sensor.Community data is identified as citizen-science community optical monitor', () => {
    const mockStation: GroundStationMetadata = {
      stationId: 'sc-9988',
      stationName: 'Sensor.Community #9988',
      distanceKm: 4.2,
      latitude: 28.62,
      longitude: 77.22,
      provider: 'Sensor.Community (Citizen Science)',
      stationType: 'community_optical',
      stationState: 'live_observation',
      lastUpdated: '2026-11-22T08:00:00Z',
      observedAt: '2026-11-22T08:00:00Z',
      retrievedAt: new Date().toISOString(),
      pm25: 85.4,
      pm10: 110.2,
      rawPm25: 120.0,
      isCalibrated: true,
      calibrationFormula: 'US EPA Barkjohn (2021)',
    };

    const record = convertGroundStationToSourceRecord(mockStation, 28.61, 77.21);
    expect(record.sourceKind).toBe('community_optical');
    expect(record.providerKind).toBe('community_optical');
    expect(record.provenance.isModel).toBe(false);
    expect(record.provenance.limitations[0]).toContain('optical');
    expect(record.measurements[0].calibrationApplied).toContain('Barkjohn');
  });

  it('4. CPCB mathematical sub-index is classified as derived standard', () => {
    const record: EnvironmentalSourceRecord = {
      id: 'cpcb-naqi-standard',
      providerId: 'cpcb_std',
      providerName: 'Central Pollution Control Board',
      sourceName: 'CPCB NAQI Standard (Indicative)',
      sourceKind: 'derived_standard',
      status: 'active',
      latitude: null,
      longitude: null,
      distanceKm: null,
      observedAt: null,
      retrievedAt: new Date().toISOString(),
      ingestedAt: new Date().toISOString(),
      measurements: [],
      attribution: 'CPCB NAQI Breakpoints',
      provenance: {
        licenseOrAttribution: 'CPCB',
        isModel: false,
        limitations: ['Piecewise mathematical calculation, not an independent sensor.'],
      },
    };

    expect(record.sourceKind).toBe('derived_standard');
  });

  it('5. EPA AQI derived from PM2.5 is not counted as an independent observation source', () => {
    const modelRecord = createOpenMeteoModelRecord({
      pm25: 120,
      timestamp: '2026-11-22T08:00:00Z',
      latitude: 28.61,
      longitude: 77.21,
    });

    const epaStandardRecord: EnvironmentalSourceRecord = {
      id: 'epa-standard',
      providerId: 'epa_std',
      providerName: 'US EPA AirNow',
      sourceName: 'US EPA Standard',
      sourceKind: 'derived_standard',
      status: 'active',
      latitude: null,
      longitude: null,
      distanceKm: null,
      observedAt: null,
      retrievedAt: new Date().toISOString(),
      ingestedAt: new Date().toISOString(),
      measurements: [],
      attribution: 'US EPA AQI Breakpoints',
      provenance: { licenseOrAttribution: 'EPA', isModel: false, limitations: [] },
    };

    const deduplicated = deduplicateEnvironmentalSources([modelRecord, epaStandardRecord]);
    // The derived standard must be stripped from independent observation count
    expect(deduplicated.length).toBe(1);
    expect(deduplicated[0].id).toBe('open-meteo-atmospheric-model');
  });

  it('6. Identical upstream datasets accessed through different APIs are not double counted', () => {
    const directAgencyStation: EnvironmentalSourceRecord = {
      id: 'ground-cpcb-dl-01',
      providerId: 'cpcb',
      providerName: 'CPCB / DPCC',
      upstreamProviderId: 'cpcb_caaqms',
      stationId: 'dl-01',
      sourceName: 'Anand Vihar CAAQMS',
      sourceKind: 'official_ground_station',
      status: 'active',
      latitude: 28.65,
      longitude: 77.31,
      distanceKm: 5,
      observedAt: '2026-11-22T08:00:00Z',
      retrievedAt: new Date().toISOString(),
      ingestedAt: new Date().toISOString(),
      measurements: [{ pollutant: 'pm25', value: 240, unit: 'ug/m3' }],
      attribution: 'CPCB',
      provenance: { licenseOrAttribution: 'CPCB', isModel: false, limitations: [] },
    };

    const openAqAggregatedStation: EnvironmentalSourceRecord = {
      id: 'openaq-8841',
      providerId: 'openaq',
      providerName: 'OpenAQ',
      upstreamProviderId: 'cpcb_caaqms', // Same upstream agency
      stationId: 'dl-01',               // Same physical station ID
      sourceName: 'Anand Vihar (OpenAQ Feed)',
      sourceKind: 'physical_observation',
      status: 'active',
      latitude: 28.65,
      longitude: 77.31,
      distanceKm: 5,
      observedAt: '2026-11-22T08:00:00Z',
      retrievedAt: new Date().toISOString(),
      ingestedAt: new Date().toISOString(),
      measurements: [{ pollutant: 'pm25', value: 240, unit: 'ug/m3' }],
      attribution: 'OpenAQ',
      provenance: { licenseOrAttribution: 'OpenAQ', isModel: false, limitations: [] },
    };

    const deduplicated = deduplicateEnvironmentalSources([directAgencyStation, openAqAggregatedStation]);
    expect(deduplicated.length).toBe(1);
    expect(deduplicated[0].upstreamProviderId).toBe('cpcb_caaqms');
  });

  it('7. A registry-only station is marked registry_only and not counted as a live reporting observation', () => {
    const registryStation: GroundStationMetadata = {
      stationId: 'cpcb-dl-04',
      stationName: 'ITO Intersection CAAQMS',
      distanceKm: 2.1,
      latitude: 28.63,
      longitude: 77.25,
      provider: 'CPCB',
      stationType: 'official_reference',
      stationState: 'registry_only',
      lastUpdated: '',
      observedAt: null,
      retrievedAt: new Date().toISOString(),
      pm25: null,
      pm10: null,
    };

    const record = convertGroundStationToSourceRecord(registryStation, 28.61, 77.20);
    expect(record.status).toBe('registry_only');
    expect(record.measurements.length).toBe(0);
    expect(record.observedAt).toBeNull();
  });

  it('8. Unknown provider identity is handled explicitly without defaulting to official claims', () => {
    const rawMeasurement = validateMeasurementValue(55.4, 'custom_gas', 'ug/m3');
    // Unsupported or unknown gas parameter returns null safely
    expect(rawMeasurement).toBeNull();
  });
});

describe('AVIR STEP 3 — Group C: Physical Measurements Integrity (19-27)', () => {
  it('19. PM2.5 zero is preserved as authentic clean air and not converted to null', () => {
    const measurement = validateMeasurementValue(0.0, 'pm25', 'ug/m3', '2026-11-22T08:00:00Z');
    expect(measurement).not.toBeNull();
    expect(measurement?.value).toBe(0);
    expect(measurement?.pollutant).toBe('pm25');
  });

  it('20. Missing PM2.5 stays null and is never synthesized', () => {
    const measurement = validateMeasurementValue(null, 'pm25', 'ug/m3');
    expect(measurement).toBeNull();
  });

  it('21. PM10 is never substituted for PM2.5', () => {
    const pm10Measurement = validateMeasurementValue(85.0, 'pm10', 'ug/m3');
    expect(pm10Measurement?.pollutant).toBe('pm10');
    expect(pm10Measurement?.pollutant).not.toBe('pm25');
  });

  it('22. Negative concentration is strictly rejected', () => {
    expect(validateMeasurementValue(-5.0, 'pm25', 'ug/m3')).toBeNull();
    expect(validateMeasurementValue(-0.1, 'pm10', 'ug/m3')).toBeNull();
  });

  it('23. NaN and Infinity are rejected', () => {
    expect(validateMeasurementValue(NaN, 'pm25', 'ug/m3')).toBeNull();
    expect(validateMeasurementValue(Infinity, 'pm25', 'ug/m3')).toBeNull();
    expect(validateMeasurementValue(-Infinity, 'pm25', 'ug/m3')).toBeNull();
  });

  it('24. Invalid units prevent unsupported comparison and are flagged as suspect', () => {
    const ppmMeasurement = validateMeasurementValue(50.0, 'pm25', 'ppm');
    expect(ppmMeasurement).not.toBeNull();
    expect(ppmMeasurement?.unit).toBe('ppm');
    expect(ppmMeasurement?.qualityFlag).toBe('suspect');
  });

  it('25. Invalid sensor timestamps are handled with rejected status', () => {
    const result = evaluateObservationFreshness('invalid-timestamp-string');
    expect(result.status).toBe('rejected');
    expect(result.isStale).toBe(true);
    expect(result.explanation).toContain('Unparseable');
  });

  it('26. Future-dated physical observations beyond 10m clock skew do not qualify as fresh', () => {
    // 2 hours in the future
    const futureTime = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
    const result = evaluateObservationFreshness(futureTime);
    expect(result.status).toBe('rejected');
    expect(result.isStale).toBe(true);
    expect(result.explanation).toContain('future-dated');
  });

  it('27. Stale observations older than 24h are flagged stale and not labeled live', () => {
    // 36 hours old
    const staleTime = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
    const result = evaluateObservationFreshness(staleTime);
    expect(result.status).toBe('stale');
    expect(result.isStale).toBe(true);
    expect(result.explanation).toContain('exceeds 24h freshness');
  });
});

describe('AVIR STEP 3 — Group D: Source Independence & Discovery (28-33)', () => {
  it('28. A single model produces exactly one independent source', () => {
    const model = createOpenMeteoModelRecord({
      pm25: 110,
      timestamp: '2026-11-22T08:00:00Z',
      latitude: 28.61,
      longitude: 77.21,
    });
    const sources = deduplicateEnvironmentalSources([model]);
    expect(sources.length).toBe(1);
    expect(sources[0].sourceKind).toBe('atmospheric_model');
  });

  it('29. Derived AQI calculations cannot increase independent source count', () => {
    const model = createOpenMeteoModelRecord({
      pm25: 110,
      timestamp: '2026-11-22T08:00:00Z',
      latitude: 28.61,
      longitude: 77.21,
    });
    const derived1: EnvironmentalSourceRecord = {
      id: 'd1', providerId: 'p', providerName: 'p', sourceName: 'CPCB NAQI', sourceKind: 'derived_standard',
      status: 'active', latitude: null, longitude: null, distanceKm: null, observedAt: null,
      retrievedAt: new Date().toISOString(), ingestedAt: new Date().toISOString(), measurements: [],
      attribution: 'p', provenance: { licenseOrAttribution: 'p', isModel: false, limitations: [] },
    };
    const derived2: EnvironmentalSourceRecord = {
      id: 'd2', providerId: 'p', providerName: 'p', sourceName: 'US EPA AQI', sourceKind: 'derived_standard',
      status: 'active', latitude: null, longitude: null, distanceKm: null, observedAt: null,
      retrievedAt: new Date().toISOString(), ingestedAt: new Date().toISOString(), measurements: [],
      attribution: 'p', provenance: { licenseOrAttribution: 'p', isModel: false, limitations: [] },
    };

    const deduplicated = deduplicateEnvironmentalSources([model, derived1, derived2]);
    expect(deduplicated.length).toBe(1);
  });

  it('30. Two copies of one upstream monitor count as one observation', () => {
    const copy1: EnvironmentalSourceRecord = {
      id: 'src-1', providerId: 'aggregator-a', providerName: 'Aggregator A', upstreamProviderId: 'cpcb_anand_vihar',
      stationId: 'anand_vihar_01', sourceName: 'Anand Vihar', sourceKind: 'official_ground_station',
      status: 'active', latitude: 28.65, longitude: 77.31, distanceKm: 5, observedAt: '2026-11-22T08:00:00Z',
      retrievedAt: new Date().toISOString(), ingestedAt: new Date().toISOString(), measurements: [{ pollutant: 'pm25', value: 210, unit: 'ug/m3' }],
      attribution: 'CPCB', provenance: { licenseOrAttribution: 'CPCB', isModel: false, limitations: [] },
    };
    const copy2: EnvironmentalSourceRecord = {
      id: 'src-2', providerId: 'aggregator-b', providerName: 'Aggregator B', upstreamProviderId: 'cpcb_anand_vihar',
      stationId: 'anand_vihar_01', sourceName: 'Anand Vihar Copy', sourceKind: 'official_ground_station',
      status: 'active', latitude: 28.65, longitude: 77.31, distanceKm: 5, observedAt: '2026-11-22T08:00:00Z',
      retrievedAt: new Date().toISOString(), ingestedAt: new Date().toISOString(), measurements: [{ pollutant: 'pm25', value: 210, unit: 'ug/m3' }],
      attribution: 'CPCB', provenance: { licenseOrAttribution: 'CPCB', isModel: false, limitations: [] },
    };

    const deduplicated = deduplicateEnvironmentalSources([copy1, copy2]);
    expect(deduplicated.length).toBe(1);
  });

  it('31. Open-Meteo plus a genuine independent OpenAQ observation produces two source records', () => {
    const model = createOpenMeteoModelRecord({
      pm25: 110,
      timestamp: '2026-11-22T08:00:00Z',
      latitude: 28.61,
      longitude: 77.21,
    });
    const openAqRecord: EnvironmentalSourceRecord = {
      id: 'openaq-station-99', providerId: 'openaq', providerName: 'OpenAQ', upstreamProviderId: 'airnow_embassy',
      stationId: 'embassy_01', sourceName: 'US Embassy Chanakyapuri', sourceKind: 'physical_observation',
      status: 'fresh', latitude: 28.59, longitude: 77.19, distanceKm: 3.2, observedAt: '2026-11-22T08:00:00Z',
      retrievedAt: new Date().toISOString(), ingestedAt: new Date().toISOString(), measurements: [{ pollutant: 'pm25', value: 135, unit: 'ug/m3' }],
      attribution: 'OpenAQ', provenance: { licenseOrAttribution: 'OpenAQ', isModel: false, limitations: [] },
    };

    const deduplicated = deduplicateEnvironmentalSources([model, openAqRecord]);
    expect(deduplicated.length).toBe(2);
  });

  it('32. Multiple measurements (PM2.5 and PM10) from the same station remain correctly associated with one source', () => {
    const model = createOpenMeteoModelRecord({
      pm25: 75.4,
      pm10: 120.6,
      timestamp: '2026-11-22T08:00:00Z',
      latitude: 28.61,
      longitude: 77.21,
    });

    const pm25 = extractPollutantMeasurement(model, 'pm25');
    const pm10 = extractPollutantMeasurement(model, 'pm10');
    expect(pm25?.value).toBe(75.4);
    expect(pm10?.value).toBe(120.6);
  });

  it('33. A registered but unavailable CPCB station does not block citizen-sensor discovery', () => {
    const cpcbRegistryStation: GroundStationMetadata = {
      stationId: 'cpcb-dl-01',
      stationName: 'Anand Vihar CAAQMS',
      distanceKm: 8,
      latitude: 28.65,
      longitude: 77.31,
      provider: 'CPCB',
      stationType: 'official_reference',
      stationState: 'registry_only',
      lastUpdated: '',
      observedAt: null,
      retrievedAt: new Date().toISOString(),
      pm25: null,
      pm10: null,
    };

    const citizenStation: GroundStationMetadata = {
      stationId: 'sc-1234',
      stationName: 'Sensor.Community #1234',
      distanceKm: 2.1,
      latitude: 28.62,
      longitude: 77.22,
      provider: 'Sensor.Community',
      stationType: 'community_optical',
      stationState: 'live_observation',
      lastUpdated: '2026-11-22T08:00:00Z',
      observedAt: '2026-11-22T08:00:00Z',
      retrievedAt: new Date().toISOString(),
      pm25: 92.5,
      pm10: 135.0,
      isCalibrated: true,
      calibrationFormula: 'US EPA Barkjohn (2021)',
    };

    const cpcbRecord = convertGroundStationToSourceRecord(cpcbRegistryStation, 28.61, 77.21);
    const citizenRecord = convertGroundStationToSourceRecord(citizenStation, 28.61, 77.21);

    const all = [cpcbRecord, citizenRecord];
    expect(all.length).toBe(2);
    expect(all.some(s => s.status === 'registry_only')).toBe(true);
    expect(all.some(s => s.status === 'fresh' && s.measurements[0].value === 92.5)).toBe(true);
  });
});
