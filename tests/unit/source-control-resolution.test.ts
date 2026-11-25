import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveSource } from '@/services/source-control/source-resolution';
import { SourcePreference } from '@/services/source-control/source-control-types';
import { AtmosphericMetrics, EnvironmentalSourceRecord } from '@/domain/types';

describe('Avir Source Control — Resolution Engine (Unit)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-24T12:15:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });
  const mockCpcbSource: EnvironmentalSourceRecord = {
    id: 'cpcb-delhi-anand-vihar',
    providerId: 'cpcb',
    providerName: 'Central Pollution Control Board',
    sourceName: 'Anand Vihar, Delhi - DPCC',
    sourceKind: 'official_ground_station',
    status: 'fresh',
    latitude: 28.65,
    longitude: 77.31,
    distanceKm: 8.4,
    observedAt: '2026-11-24T12:00:00Z',
    validAt: null,
    retrievedAt: '2026-11-24T12:05:00Z',
    measurements: [
      {
        pollutant: 'pm25',
        value: 184.2,
        unit: 'µg/m³',
        observedAt: '2026-11-24T12:00:00Z',
      },
      {
        pollutant: 'pm10',
        value: 295.0,
        unit: 'µg/m³',
        observedAt: '2026-11-24T12:00:00Z',
      },
    ],
    attribution: 'CPCB / DPCC Real-Time Continuous CAAQMS',
    provenance: {
      network: 'CAAQMS',
      licenseOrAttribution: 'Government Open Data License - India (GODL)',
      isModel: false,
      limitations: ['Micro-environment proximity effects'],
    },
  };

  const mockOpenAqSource: EnvironmentalSourceRecord = {
    id: 'openaq-station-992',
    providerId: 'openaq',
    providerName: 'OpenAQ Community Network',
    sourceName: 'US Embassy Diplomatic Post - Chanakyapuri',
    sourceKind: 'physical_observation',
    status: 'fresh',
    latitude: 28.60,
    longitude: 77.19,
    distanceKm: 4.2,
    observedAt: '2026-11-24T11:45:00Z',
    validAt: null,
    retrievedAt: '2026-11-24T12:05:00Z',
    measurements: [
      {
        pollutant: 'pm25',
        value: 142.0,
        unit: 'µg/m³',
        observedAt: '2026-11-24T11:45:00Z',
      },
    ],
    attribution: 'OpenAQ Platform / US State Dept Air Quality Monitoring',
    provenance: {
      network: 'AirNow-DOS',
      licenseOrAttribution: 'Public Domain / CC0',
      isModel: false,
      limitations: ['Single optical reference monitor'],
    },
  };

  const mockCamsModelSource: EnvironmentalSourceRecord = {
    id: 'cams-global-model-record',
    providerId: 'open-meteo',
    providerName: 'Open-Meteo Air Quality',
    sourceName: 'Copernicus Atmospheric Monitoring Service (CAMS Global)',
    sourceKind: 'atmospheric_model',
    status: 'fresh',
    latitude: 28.61,
    longitude: 77.21,
    distanceKm: 0,
    observedAt: null,
    validAt: '2026-11-24T12:00:00Z',
    retrievedAt: '2026-11-24T12:05:00Z',
    measurements: [
      {
        pollutant: 'pm25',
        value: 120.5,
        unit: 'µg/m³',
        validAt: '2026-11-24T12:00:00Z',
      },
    ],
    attribution: 'Copernicus Atmosphere Monitoring Service (ECMWF CAMS) / Open-Meteo',
    provenance: {
      network: 'ECMWF Integrated Forecasting System (IFS)',
      licenseOrAttribution: 'Copernicus Open Access License',
      isModel: true,
      limitations: ['11km grid cell regional volume average'],
    },
  };

  const createBaseMetrics = (sources: EnvironmentalSourceRecord[] = []): AtmosphericMetrics => ({
    status: 'success',
    provenance: 'modeled_forecast',
    timestamp: '2026-11-24T12:00:00Z',
    retrievedAt: '2026-11-24T12:05:00Z',
    timezone: 'Asia/Kolkata',
    cityName: 'Delhi-NCR',
    latitude: 28.6139,
    longitude: 77.2090,
    usAqi: 185,
    cpcbAqi: 345,
    pm25: 120.5,
    pm10: 195.0,
    boundaryLayerHeight: 850,
    temperature: 24.5,
    humidity: 55,
    windSpeed: 8.2,
    windDirection: 310,
    isThermalInversionActive: false,
    isLive: true,
    isStale: false,
    freshness: 'fresh',
    sourceAttribution: 'Open-Meteo Air Quality & CPCB',
    availability: { aqi: true, pm25: true, pm10: true, weather: true, blh: true, forecast: true },
    environmentalSources: sources,
  });

  it('1. Mode A (Automatic): deterministically resolves official CPCB ground monitor when within 35km and reporting PM2.5', () => {
    const pref: SourcePreference = { version: 1, mode: 'automatic' };
    const metrics = createBaseMetrics([mockCamsModelSource, mockOpenAqSource, mockCpcbSource]);

    const resolved = resolveSource(pref, metrics, 'cpcb');

    expect(resolved.resolutionStatus).toBe('resolved');
    expect(resolved.stationName).toBe('Anand Vihar, Delhi - DPCC');
    expect(resolved.sourceKind).toBe('official_ground_station');
    expect(resolved.concentration).toBe(184.2);
    expect(resolved.isFallback).toBe(false);
  });

  it('2. Mode A (Automatic): falls back to OpenAQ physical ground station when CPCB is missing', () => {
    const pref: SourcePreference = { version: 1, mode: 'automatic' };
    const metrics = createBaseMetrics([mockCamsModelSource, mockOpenAqSource]);

    const resolved = resolveSource(pref, metrics, 'epa');

    expect(resolved.resolutionStatus).toBe('resolved');
    expect(resolved.stationName).toBe('US Embassy Diplomatic Post - Chanakyapuri');
    expect(resolved.sourceKind).toBe('physical_observation');
    expect(resolved.concentration).toBe(142.0);
    expect(resolved.aqiStandard).toBe('epa');
  });

  it('3. Mode A (Automatic): falls back to CAMS atmospheric model when no physical ground stations report valid PM2.5', () => {
    const pref: SourcePreference = { version: 1, mode: 'automatic' };
    const metrics = createBaseMetrics([mockCamsModelSource]);

    const resolved = resolveSource(pref, metrics, 'cpcb');

    expect(resolved.resolutionStatus).toBe('resolved');
    expect(resolved.stationName).toBe('Copernicus Atmospheric Monitoring Service (CAMS Global)');
    expect(resolved.sourceKind).toBe('atmospheric_model');
    expect(resolved.concentration).toBe(120.5);
  });

  it('4. Mode B (Official Ground): enforces zero silent fallback when CPCB is offline and fallback is false', () => {
    const pref: SourcePreference = {
      version: 1,
      mode: 'official_ground',
      allowFallbackToModel: false,
    };
    // No CPCB station provided, only model
    const metrics = createBaseMetrics([mockCamsModelSource]);

    const resolved = resolveSource(pref, metrics, 'cpcb');

    expect(resolved.resolutionStatus).toBe('unavailable');
    expect(resolved.concentration).toBeNull();
    expect(resolved.displayAqi).toBeNull();
    expect(resolved.isFallback).toBe(false);
    expect(resolved.selectionReason).toContain('No official regulatory stations are located within observation range');
  });

  it('5. Mode B (Official Ground): transparently applies CAMS model fallback when explicit opt-in allowFallbackToModel is true', () => {
    const pref: SourcePreference = {
      version: 1,
      mode: 'official_ground',
      allowFallbackToModel: true,
    };
    const metrics = createBaseMetrics([mockCamsModelSource]);

    const resolved = resolveSource(pref, metrics, 'cpcb');

    expect(resolved.resolutionStatus).toBe('fallback');
    expect(resolved.isFallback).toBe(true);
    expect(resolved.concentration).toBe(120.5);
    expect(resolved.fallbackReason).toContain('Official regulatory stations have no continuous feed at this location');
  });

  it('6. Mode C (OpenAQ): resolves OpenAQ ground station and populates network attribution', () => {
    const pref: SourcePreference = {
      version: 1,
      mode: 'openaq',
      allowFallbackToModel: false,
    };
    const metrics = createBaseMetrics([mockCpcbSource, mockOpenAqSource, mockCamsModelSource]);

    const resolved = resolveSource(pref, metrics, 'epa');

    expect(resolved.resolutionStatus).toBe('resolved');
    expect(resolved.stationName).toBe('US Embassy Diplomatic Post - Chanakyapuri');
    expect(resolved.providerId).toBe('openaq');
    expect(resolved.networkName).toBe('AirNow-DOS');
  });

  it('7. Mode D (Atmospheric Model): explicitly pins to CAMS numerical model even when physical ground monitors are available', () => {
    const pref: SourcePreference = {
      version: 1,
      mode: 'atmospheric_model',
    };
    const metrics = createBaseMetrics([mockCpcbSource, mockOpenAqSource, mockCamsModelSource]);

    const resolved = resolveSource(pref, metrics, 'cpcb');

    expect(resolved.resolutionStatus).toBe('resolved');
    expect(resolved.sourceKind).toBe('atmospheric_model');
    expect(resolved.concentration).toBe(120.5);
    expect(resolved.stationName).toContain('CAMS');
  });

  it('8. Mode E (Specific Station): resolves specified station by ID accurately', () => {
    const pref: SourcePreference = {
      version: 1,
      mode: 'specific_station',
      stationId: 'cpcb-delhi-anand-vihar',
      allowFallbackToModel: false,
    };
    const metrics = createBaseMetrics([mockCpcbSource, mockOpenAqSource, mockCamsModelSource]);

    const resolved = resolveSource(pref, metrics, 'cpcb');

    expect(resolved.resolutionStatus).toBe('resolved');
    expect(resolved.stationId).toBe('cpcb-delhi-anand-vihar');
    expect(resolved.concentration).toBe(184.2);
  });

  it('9. City Switching Invariant: marks station unavailable when switching to a distant city (>100km)', () => {
    const distantStation: EnvironmentalSourceRecord = {
      ...mockCpcbSource,
      id: 'cpcb-bengaluru-bwssb',
      sourceName: 'BWSSB Kadabesanahalli, Bengaluru - KSPCB',
      distanceKm: 1740, // Far from Delhi
    };

    const pref: SourcePreference = {
      version: 1,
      mode: 'specific_station',
      stationId: 'cpcb-bengaluru-bwssb',
      allowFallbackToModel: false,
    };
    const metrics = createBaseMetrics([distantStation, mockCamsModelSource]);

    const resolved = resolveSource(pref, metrics, 'cpcb');

    expect(resolved.resolutionStatus).toBe('unavailable');
    expect(resolved.concentration).toBeNull();
    expect(resolved.selectionReason).toContain('1740 km away');
  });

  it('10. Calculation Integrity: calculates valid CPCB NAQI and US EPA AQI without NaN or cross-contamination', () => {
    const pref: SourcePreference = { version: 1, mode: 'automatic' };
    const metrics = createBaseMetrics([mockCpcbSource]);

    const cpcbResolved = resolveSource(pref, metrics, 'cpcb');
    expect(cpcbResolved.aqiStandard).toBe('cpcb');
    expect(cpcbResolved.displayAqi).toBeGreaterThan(250);
    expect(cpcbResolved.aqiCategory).toBeTruthy();
    expect(cpcbResolved.aqiCategoryColor).toMatch(/^#[0-9A-Fa-f]{6}$/);

    const epaResolved = resolveSource(pref, metrics, 'epa');
    expect(epaResolved.aqiStandard).toBe('epa');
    expect(epaResolved.displayAqi).toBeGreaterThan(150);
    expect(epaResolved.aqiCategory).toBeTruthy();
    expect(epaResolved.aqiCategoryColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});
