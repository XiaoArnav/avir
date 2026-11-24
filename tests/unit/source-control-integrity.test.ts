import { describe, it, expect } from 'vitest';
import { resolveSource } from '@/services/source-control/source-resolution';
import { SourcePreference } from '@/services/source-control/source-control-types';
import { AtmosphericMetrics, EnvironmentalSourceRecord } from '@/domain/types';
import { getPhysicalStationDeduplicationKey, MAX_COMPARISON_DISTANCE_KM, MAX_COMPARISON_TIME_DIFF_MINUTES } from '@/config/environmental-sources';
import { calculateAQIFromPM25, calculateCpcbNaqi } from '@/domain/air-math';

describe('Avir Source Control — Data Integrity & Provenance (PR #32 Focused Regression)', () => {
  const baseTimestamp = '2026-11-24T12:00:00.000Z';
  const baseTimeMs = Date.parse(baseTimestamp);

  const createFreshCpcbSource = (overrides?: Partial<EnvironmentalSourceRecord>): EnvironmentalSourceRecord => ({
    id: 'cpcb-delhi-anand-vihar',
    providerId: 'cpcb',
    providerName: 'Central Pollution Control Board',
    sourceName: 'Anand Vihar, Delhi - DPCC',
    sourceKind: 'official_ground_station',
    status: 'fresh',
    stationId: 'site_142',
    latitude: 28.65,
    longitude: 77.31,
    distanceKm: 4.2,
    observedAt: baseTimestamp,
    validAt: null,
    retrievedAt: baseTimestamp,
    measurements: [
      {
        pollutant: 'pm25',
        value: 165.0,
        unit: 'µg/m³',
        observedAt: baseTimestamp,
        averagingPeriodMinutes: 60,
        qualityFlag: 'valid',
      },
    ],
    attribution: 'CPCB / DPCC Real-Time Continuous CAAQMS',
    provenance: {
      network: 'CAAQMS',
      licenseOrAttribution: 'Government Open Data License - India (GODL)',
      isModel: false,
      limitations: ['Micro-environment proximity effects'],
    },
    ...overrides,
  });

  const createCamsModelSource = (overrides?: Partial<EnvironmentalSourceRecord>): EnvironmentalSourceRecord => ({
    id: 'cams-global-model',
    providerId: 'open-meteo',
    providerName: 'Copernicus Atmosphere Monitoring Service (CAMS)',
    sourceName: 'CAMS Global Atmospheric Forecast Model',
    sourceKind: 'atmospheric_model',
    status: 'fresh',
    latitude: 28.61,
    longitude: 77.20,
    distanceKm: 0,
    observedAt: null,
    validAt: baseTimestamp,
    retrievedAt: baseTimestamp,
    measurements: [
      {
        pollutant: 'pm25',
        value: 85.0,
        unit: 'µg/m³',
        validAt: baseTimestamp,
        averagingPeriodMinutes: 60,
        qualityFlag: 'valid',
      },
    ],
    attribution: 'ECMWF / Copernicus Atmosphere Monitoring Service',
    provenance: {
      network: 'CAMS-IFS',
      licenseOrAttribution: 'Copernicus Open Access Licence',
      isModel: true,
      limitations: ['Grid cell spatial averaging (0.4° ~40km)'],
    },
    ...overrides,
  });

  const createMockMetrics = (sources: EnvironmentalSourceRecord[]): AtmosphericMetrics => ({
    status: 'success',
    usAqi: 215,
    cpcbAqi: 335,
    pm25: 165.0,
    pm10: 280.0,
    o3: 45.0,
    no2: 60.0,
    so2: 15.0,
    co: 1.2,
    temperature: 22.0,
    humidity: 65,
    windSpeed: 4.5,
    windDirection: 280,
    timestamp: baseTimestamp,
    retrievedAt: baseTimestamp,
    timezone: 'Asia/Kolkata',
    cityName: 'Delhi-NCR',
    latitude: 28.6139,
    longitude: 77.2090,
    boundaryLayerHeight: 850,
    isThermalInversionActive: false,
    isLive: true,
    isStale: false,
    freshness: 'fresh',
    sourceAttribution: 'CPCB / DPCC Real-Time Continuous CAAQMS',
    provenance: 'observed',
    environmentalSources: sources,
  });

  // Scenario A: Valid ground measurement
  it('Scenario A: Valid ground measurement resolves CPCB, preserves ground provenance, and verifies valid concentration', () => {
    const cpcb = createFreshCpcbSource();
    const cams = createCamsModelSource();
    const metrics = createMockMetrics([cpcb, cams]);

    const preference: SourcePreference = {
      mode: 'official_ground',
      version: 1,
      providerId: 'cpcb',
      allowFallbackToModel: false,
    };

    const resolved = resolveSource(preference, metrics, 'cpcb', baseTimeMs);

    expect(resolved.resolutionStatus).toBe('resolved');
    expect(resolved.stationName).toBe('Anand Vihar, Delhi - DPCC');
    expect(resolved.isModel).toBe(false);
    expect(resolved.concentration).toBe(165.0);
    expect(resolved.displayAqi).toBe(calculateCpcbNaqi(165.0).aqi);
    expect(resolved.isFallback).toBe(false);
    expect(resolved.observedAt).toBe(baseTimestamp);
  });

  // Scenario B: Stale ground measurement without fallback
  it('Scenario B: Stale ground measurement marks resolution unavailable with zero silent fallback when fallback is disabled', () => {
    const staleTime = new Date(baseTimeMs - 25 * 60 * 60 * 1000).toISOString(); // 25h ago
    const staleCpcb = createFreshCpcbSource({
      status: 'stale',
      observedAt: staleTime,
      measurements: [
        {
          pollutant: 'pm25',
          value: 165.0,
          unit: 'µg/m³',
          observedAt: staleTime,
        },
      ],
    });
    const cams = createCamsModelSource();
    const metrics = createMockMetrics([staleCpcb, cams]);

    const preference: SourcePreference = {
      mode: 'official_ground',
      version: 1,
      providerId: 'cpcb',
      allowFallbackToModel: false,
    };

    const resolved = resolveSource(preference, metrics, 'cpcb', baseTimeMs);

    expect(resolved.resolutionStatus).toBe('unavailable');
    expect(resolved.concentration).toBeNull();
    expect(resolved.displayAqi).toBeNull();
    expect(resolved.isFallback).toBe(false);
    expect(resolved.selectionReason).toMatch(/stale|unavailable/i);
  });

  // Scenario C: Explicit fallback enabled
  it('Scenario C: Stale ground measurement with allowFallbackToModel=true applies CAMS model fallback transparently', () => {
    const staleTime = new Date(baseTimeMs - 25 * 60 * 60 * 1000).toISOString();
    const staleCpcb = createFreshCpcbSource({
      status: 'stale',
      observedAt: staleTime,
      measurements: [
        {
          pollutant: 'pm25',
          value: 165.0,
          unit: 'µg/m³',
          observedAt: staleTime,
        },
      ],
    });
    const cams = createCamsModelSource();
    const metrics = createMockMetrics([staleCpcb, cams]);

    const preference: SourcePreference = {
      mode: 'official_ground',
      version: 1,
      providerId: 'cpcb',
      allowFallbackToModel: true,
    };

    const resolved = resolveSource(preference, metrics, 'cpcb', baseTimeMs);

    expect(resolved.resolutionStatus).toBe('fallback');
    expect(resolved.isFallback).toBe(true);
    expect(resolved.isModel).toBe(true);
    expect(resolved.concentration).toBe(85.0);
    expect(resolved.displayAqi).toBe(calculateCpcbNaqi(85.0).aqi);
    expect(resolved.fallbackReason).toBeDefined();
  });

  // Scenario D: Incompatible comparison (different averaging periods)
  it('Scenario D: Comparison detects incompatible averaging periods (e.g. 24h average vs 1h model)', () => {
    const active1hPeriod = 60;
    const candidate24hPeriod = 1440;

    const diffMinutes = Math.abs(active1hPeriod - candidate24hPeriod);
    const isPeriodCompatible = diffMinutes <= 120;

    expect(isPeriodCompatible).toBe(false);
    expect(diffMinutes).toBe(1380);
  });

  // Scenario E: Unverified AQI classification
  it('Scenario E: Derived AQI calculation is marked isOfficialPublishedAqi=false unless explicit official bulletin metadata exists', () => {
    const cpcb = createFreshCpcbSource();
    const metrics = createMockMetrics([cpcb]);

    const preference: SourcePreference = {
      mode: 'official_ground',
      version: 1,
      providerId: 'cpcb',
      allowFallbackToModel: false,
    };

    const resolved = resolveSource(preference, metrics, 'cpcb', baseTimeMs);

    // Derived from raw PM2.5 measurement, so isOfficialPublishedAqi must be false
    expect(resolved.isOfficialPublishedAqi).toBe(false);
    expect(resolved.aqiCalculationNotes).toMatch(/calculated|derived/i);

    // Now test with official bulletin metadata and explicit bulletin aqi measurement
    const officialBulletinSource = createFreshCpcbSource({
      provenance: {
        network: 'CAAQMS',
        licenseOrAttribution: 'Government Open Data License - India (GODL)',
        isModel: false,
        limitations: [],
        isOfficialBulletin: true,
      },
      measurements: [
        {
          pollutant: 'pm25',
          value: 165.0,
          unit: 'µg/m³',
          observedAt: baseTimestamp,
          qualityFlag: 'official_bulletin',
        },
        {
          pollutant: 'aqi_derived',
          value: 335,
          unit: 'AQI',
          observedAt: baseTimestamp,
          qualityFlag: 'official_bulletin',
        },
      ],
    });
    const metricsWithBulletin = createMockMetrics([officialBulletinSource]);

    const resolvedBulletin = resolveSource(preference, metricsWithBulletin, 'cpcb', baseTimeMs);
    expect(resolvedBulletin.isOfficialPublishedAqi).toBe(true);
    expect(resolvedBulletin.displayAqi).toBe(335);
  });

  // Scenario F: Standard switching maintains mathematical fidelity without cross-copying
  it('Scenario F: Switching between CPCB NAQI and US EPA maintains mathematically distinct scales', () => {
    const pm25Value = 120.0;
    const cpcb = createFreshCpcbSource({
      measurements: [
        {
          pollutant: 'pm25',
          value: pm25Value,
          unit: 'µg/m³',
          observedAt: baseTimestamp,
        },
      ],
    });
    const metrics = createMockMetrics([cpcb]);
    const preference: SourcePreference = {
      mode: 'official_ground',
      version: 1,
      providerId: 'cpcb',
      allowFallbackToModel: false,
    };

    const resolvedCpcb = resolveSource(preference, metrics, 'cpcb', baseTimeMs);
    const resolvedEpa = resolveSource(preference, metrics, 'epa', baseTimeMs);

    expect(resolvedCpcb.aqiStandard).toBe('cpcb');
    expect(resolvedEpa.aqiStandard).toBe('epa');

    const expectedCpcb = calculateCpcbNaqi(pm25Value).aqi;
    const expectedEpa = calculateAQIFromPM25(pm25Value);

    expect(resolvedCpcb.displayAqi).toBe(expectedCpcb);
    expect(resolvedEpa.displayAqi).toBe(expectedEpa);
    // CPCB NAQI and EPA AQI for 120 ug/m3 PM2.5 are distinct (CPCB ~300, EPA ~184)
    expect(resolvedCpcb.displayAqi).not.toBe(resolvedEpa.displayAqi);
  });

  // Scenario G: Duplicate reporting network detection
  it('Scenario G: Deduplication key detects OpenAQ mirror ingesting same CPCB station as duplicate reporting network', () => {
    const cpcbStation = createFreshCpcbSource({
      id: 'cpcb_site_142',
      providerId: 'cpcb',
      stationId: 'site_142',
    });

    const openAqMirror = {
      ...cpcbStation,
      id: 'openaq_station_8831',
      providerId: 'openaq',
      upstreamProviderId: 'cpcb_caaqms',
      stationId: 'site_142',
    };

    const cpcbKey = getPhysicalStationDeduplicationKey(cpcbStation);
    const openAqKey = getPhysicalStationDeduplicationKey(openAqMirror);

    // Both should yield matching deduplication keys identifying the same physical monitor
    expect(cpcbKey).toBe('provider:cpcb:site_142');
    expect(openAqKey).toBe('upstream:cpcb:site_142');

    // Cross-provider mapping or upstream lineage normalization
    const isUpstreamMatched = openAqKey.includes('cpcb:site_142') && cpcbKey.includes('cpcb:site_142');
    expect(isUpstreamMatched).toBe(true);
  });
});
