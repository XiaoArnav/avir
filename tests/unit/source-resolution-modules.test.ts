import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AtmosphericMetrics, EnvironmentalSourceRecord } from '@/domain/types';
import { calculateAQIFromPM25 } from '@/domain/air-math';
import { calculateComprehensiveCpcbNaqi } from '@/domain/cpcb-naqi';
import { SourcePreference } from '@/services/source-control/source-control-types';
import {
  hasValidPm25,
  isSourceEligibleForPm25,
  resolveSource,
} from '@/services/source-control/source-resolution';
import {
  hasValidPm25 as hasValidPm25Direct,
  isSourceEligibleForPm25 as isSourceEligibleDirect,
} from '@/services/source-control/source-eligibility';
import {
  resolveAtmosphericModelMode,
  resolveAutomaticMode,
  resolveOfficialGroundMode,
  resolveOpenAqMode,
  resolveSpecificStationMode,
} from '@/services/source-control/source-resolution-modes';
import {
  buildResolvedFromMetrics,
  buildResolvedSourceData,
  createUnavailableResolvedData,
} from '@/services/source-control/source-resolution-results';
import {
  hasValidPm25 as barrelHasValidPm25,
  isSourceEligibleForPm25 as barrelIsSourceEligible,
  resolveSource as barrelResolveSource,
} from '@/services/source-control';

const FIXED_NOW_ISO = '2026-11-28T06:00:00.000Z';
const FIXED_NOW_MS = Date.parse(FIXED_NOW_ISO);

function makeCpcbSource(overrides: Partial<EnvironmentalSourceRecord> = {}): EnvironmentalSourceRecord {
  return {
    id: 'cpcb-anand-vihar',
    providerId: 'cpcb',
    providerName: 'Central Pollution Control Board',
    sourceName: 'Anand Vihar, Delhi - DPCC',
    sourceKind: 'official_ground_station',
    status: 'fresh',
    stationId: 'site_142',
    latitude: 28.65,
    longitude: 77.31,
    distanceKm: 4.5,
    observedAt: '2026-11-28T05:30:00.000Z',
    validAt: null,
    retrievedAt: FIXED_NOW_ISO,
    measurements: [
      {
        pollutant: 'pm25',
        value: 180,
        unit: 'µg/m³',
        observedAt: '2026-11-28T05:30:00.000Z',
        averagingPeriodMinutes: 60,
        qualityFlag: 'valid',
      },
      {
        pollutant: 'pm10',
        value: 260,
        unit: 'µg/m³',
        observedAt: '2026-11-28T05:30:00.000Z',
        averagingPeriodMinutes: 60,
        qualityFlag: 'valid',
      },
    ],
    attribution: 'CPCB / DPCC CAAQMS',
    provenance: {
      network: 'CAAQMS',
      licenseOrAttribution: 'GODL-India',
      isModel: false,
      limitations: ['Local street corridor influence'],
    },
    ...overrides,
  };
}

function makeOpenAqSource(overrides: Partial<EnvironmentalSourceRecord> = {}): EnvironmentalSourceRecord {
  return {
    id: 'openaq-chanakyapuri',
    providerId: 'openaq',
    providerName: 'OpenAQ v3 Network',
    sourceName: 'Chanakyapuri Reference Monitor',
    sourceKind: 'physical_observation',
    status: 'fresh',
    stationId: 'oaq_101',
    latitude: 28.59,
    longitude: 77.19,
    distanceKm: 6.8,
    observedAt: '2026-11-28T05:15:00.000Z',
    validAt: null,
    retrievedAt: FIXED_NOW_ISO,
    measurements: [
      {
        pollutant: 'pm25',
        value: 142,
        unit: 'ug/m3',
        observedAt: '2026-11-28T05:15:00.000Z',
        averagingPeriodMinutes: 60,
        qualityFlag: 'valid',
      },
    ],
    attribution: 'OpenAQ / US Embassy AirNow',
    provenance: {
      network: 'AirNow-DOS',
      licenseOrAttribution: 'CC0',
      isModel: false,
      limitations: ['Single optical monitor'],
    },
    ...overrides,
  };
}

function makeCamsSource(overrides: Partial<EnvironmentalSourceRecord> = {}): EnvironmentalSourceRecord {
  return {
    id: 'cams-global-model',
    providerId: 'open_meteo',
    providerName: 'Open-Meteo Air Quality',
    sourceName: 'ECMWF CAMS Atmospheric Model',
    sourceKind: 'atmospheric_model',
    providerKind: 'atmospheric_model',
    status: 'fresh',
    latitude: 28.6139,
    longitude: 77.209,
    distanceKm: 0,
    observedAt: null,
    validAt: '2026-11-28T06:00:00.000Z',
    retrievedAt: FIXED_NOW_ISO,
    measurements: [
      {
        pollutant: 'pm25',
        value: 95,
        unit: 'ug/m3',
        observedAt: null,
        validAt: '2026-11-28T06:00:00.000Z',
        averagingPeriodMinutes: 60,
        qualityFlag: 'valid',
      },
    ],
    attribution: 'ECMWF Copernicus Atmosphere Monitoring Service',
    provenance: {
      network: 'CAMS-IFS',
      licenseOrAttribution: 'Copernicus Open Access',
      isModel: true,
      limitations: ['~11 km spatial grid average'],
    },
    ...overrides,
  };
}

function makeMetrics(
  sources: EnvironmentalSourceRecord[],
  overrides: Partial<AtmosphericMetrics> = {}
): AtmosphericMetrics {
  return {
    status: 'success',
    provenance: 'modeled_forecast',
    timestamp: '2026-11-28T06:00:00.000Z',
    retrievedAt: FIXED_NOW_ISO,
    timezone: 'Asia/Kolkata',
    cityName: 'Delhi-NCR',
    latitude: 28.6139,
    longitude: 77.209,
    pm25: 95,
    pm10: 150,
    usAqi: 171,
    cpcbAqi: 217,
    boundaryLayerHeight: 650,
    isThermalInversionActive: false,
    isLive: true,
    isStale: false,
    freshness: 'fresh',
    sourceAttribution: 'Open-Meteo CAMS Global',
    environmentalSources: sources,
    ...overrides,
  };
}

describe('Source Control Resolution Engine — Eligibility & Scenarios A–T Characterization', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_NOW_ISO));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Phase 4: PM2.5 Eligibility Verification (isSourceEligibleForPm25 / hasValidPm25)', () => {
    it('accepts fresh PM2.5 physical observations including zero concentrations and supported units', () => {
      const freshCpcb = makeCpcbSource();
      expect(isSourceEligibleForPm25(freshCpcb, FIXED_NOW_MS)).toEqual({ isEligible: true });
      expect(hasValidPm25(freshCpcb, FIXED_NOW_MS)).toBe(true);

      const zeroCleanAir = makeOpenAqSource({
        measurements: [
          {
            pollutant: 'pm25',
            value: 0,
            unit: 'micrograms/m3',
            observedAt: '2026-11-28T05:50:00.000Z',
          },
        ],
      });
      expect(isSourceEligibleForPm25(zeroCleanAir, FIXED_NOW_MS)).toEqual({ isEligible: true });
    });

    it('rejects stale physical PM2.5 (>24h) and stale model validAt (>24h)', () => {
      const staleIso = new Date(FIXED_NOW_MS - 25 * 3600 * 1000).toISOString();
      const staleStation = makeCpcbSource({
        status: 'active',
        observedAt: staleIso,
        measurements: [
          { pollutant: 'pm25', value: 110, unit: 'µg/m³', observedAt: staleIso },
        ],
      });
      const resPhysical = isSourceEligibleForPm25(staleStation, FIXED_NOW_MS);
      expect(resPhysical.isEligible).toBe(false);
      expect(resPhysical.reason).toMatch(/25 hours old|24h freshness policy/);

      const staleStatus = makeCpcbSource({ status: 'stale' });
      expect(isSourceEligibleForPm25(staleStatus, FIXED_NOW_MS)).toEqual({
        isEligible: false,
        reason: 'Source status is stale',
      });

      const staleModel = makeCamsSource({
        validAt: staleIso,
        measurements: [{ pollutant: 'pm25', value: 60, unit: 'ug/m3', validAt: staleIso }],
      });
      expect(isSourceEligibleForPm25(staleModel, FIXED_NOW_MS)).toEqual({
        isEligible: false,
        reason: 'Model forecast valid time is older than 24h',
      });
    });

    it('rejects missing PM2.5 values, missing measurements array, and rejected quality flags', () => {
      const nullPm25 = makeCpcbSource({
        measurements: [{ pollutant: 'pm25', value: null, unit: 'µg/m³', observedAt: '2026-11-28T05:30:00.000Z' }],
      });
      expect(isSourceEligibleForPm25(nullPm25, FIXED_NOW_MS).isEligible).toBe(false);

      const onlyPm10 = makeCpcbSource({
        measurements: [{ pollutant: 'pm10', value: 120, unit: 'µg/m³', observedAt: '2026-11-28T05:30:00.000Z' }],
      });
      expect(isSourceEligibleForPm25(onlyPm10, FIXED_NOW_MS)).toEqual({
        isEligible: false,
        reason: 'No PM25 measurement present in source records.',
      });

      const rejectedModel = makeCamsSource({
        measurements: [
          { pollutant: 'pm25', value: 70, unit: 'ug/m3', validAt: FIXED_NOW_ISO, qualityFlag: 'rejected' },
        ],
      });
      expect(isSourceEligibleForPm25(rejectedModel, FIXED_NOW_MS)).toEqual({
        isEligible: false,
        reason: 'Invalid or negative PM2.5 value in model',
      });
    });

    it('rejects unsupported pollutant units on physical and modeled records', () => {
      const badPhysicalUnit = makeCpcbSource({
        measurements: [{ pollutant: 'pm25', value: 50, unit: 'ppb', observedAt: FIXED_NOW_ISO }],
      });
      expect(isSourceEligibleForPm25(badPhysicalUnit, FIXED_NOW_MS)).toEqual({
        isEligible: false,
        reason: 'Unsupported concentration unit "ppb". Only µg/m³ is valid for physical particulate measurements.',
      });

      const badModelUnit = makeCamsSource({
        measurements: [{ pollutant: 'pm25', value: 50, unit: 'mg/m3', validAt: FIXED_NOW_ISO }],
      });
      expect(isSourceEligibleForPm25(badModelUnit, FIXED_NOW_MS)).toEqual({
        isEligible: false,
        reason: 'Unsupported unit "mg/m3". Only µg/m³ is valid.',
      });
    });

    it('rejects invalid timestamps, missing observation timestamps, missing source IDs, and future physical timestamps', () => {
      expect(isSourceEligibleForPm25(null, FIXED_NOW_MS)).toEqual({
        isEligible: false,
        reason: 'Source record is null or missing an identifier',
      });
      expect(isSourceEligibleForPm25(makeCpcbSource({ id: '' }), FIXED_NOW_MS).isEligible).toBe(false);

      const unparseable = makeCpcbSource({
        measurements: [{ pollutant: 'pm25', value: 50, unit: 'µg/m³', observedAt: 'not-a-timestamp' }],
      });
      expect(isSourceEligibleForPm25(unparseable, FIXED_NOW_MS)).toEqual({
        isEligible: false,
        reason: 'Unparseable timestamp',
      });

      const untimed = makeCpcbSource({
        measurements: [{ pollutant: 'pm25', value: 50, unit: 'µg/m³', observedAt: null }],
      });
      expect(isSourceEligibleForPm25(untimed, FIXED_NOW_MS)).toEqual({
        isEligible: false,
        reason: 'PM25 observation timestamp is missing; freshness cannot be verified.',
      });

      const futurePhysical = makeCpcbSource({
        measurements: [
          {
            pollutant: 'pm25',
            value: 50,
            unit: 'µg/m³',
            observedAt: new Date(FIXED_NOW_MS + 20 * 60 * 1000).toISOString(),
          },
        ],
      });
      expect(isSourceEligibleForPm25(futurePhysical, FIXED_NOW_MS)).toEqual({
        isEligible: false,
        reason: 'Suspicious future-dated physical observation timestamp',
      });
    });

    it('handles model valid-time fallback and future forecast hours cleanly', () => {
      const modelMissingValidTime = makeCamsSource({
        validAt: null,
        measurements: [{ pollutant: 'pm25', value: 65, unit: 'ug/m3', validAt: null }],
      });
      expect(isSourceEligibleForPm25(modelMissingValidTime, FIXED_NOW_MS)).toEqual({
        isEligible: false,
        reason: 'Missing model valid time',
      });

      const modelUnparseable = makeCamsSource({
        validAt: 'invalid-date',
        measurements: [{ pollutant: 'pm25', value: 65, unit: 'ug/m3', validAt: 'invalid-date' }],
      });
      expect(isSourceEligibleForPm25(modelUnparseable, FIXED_NOW_MS)).toEqual({
        isEligible: false,
        reason: 'Unparseable model valid time',
      });

      const modelFallbackSrcValidAt = makeCamsSource({
        validAt: new Date(FIXED_NOW_MS + 2 * 3600 * 1000).toISOString(),
        measurements: [{ pollutant: 'pm25', value: 65, unit: 'ug/m3' }],
      });
      expect(isSourceEligibleForPm25(modelFallbackSrcValidAt, FIXED_NOW_MS)).toEqual({ isEligible: true });
    });
  });

  describe('Phase 8: Scenarios A–T Resolution Contracts', () => {
    it('Scenario A: resolves fresh official ground station when available', () => {
      const metrics = makeMetrics([makeCamsSource(), makeOpenAqSource(), makeCpcbSource()]);
      const resolved = resolveSource({ version: 1, mode: 'automatic' }, metrics, 'cpcb', FIXED_NOW_MS);

      expect(resolved.resolutionStatus).toBe('resolved');
      expect(resolved.stationId).toBe('cpcb-anand-vihar');
      expect(resolved.sourceKind).toBe('official_ground_station');
      expect(resolved.isModel).toBe(false);
      expect(resolved.concentration).toBe(180);
      expect(resolved.observedAt).toBe('2026-11-28T05:30:00.000Z');
      expect(resolved.retrievedAt).toBe(FIXED_NOW_ISO);
    });

    it('Scenario B: selects valid OpenAQ station when no eligible official station exists', () => {
      const metrics = makeMetrics([makeCamsSource(), makeOpenAqSource()]);
      const resolved = resolveSource({ version: 1, mode: 'automatic' }, metrics, 'epa', FIXED_NOW_MS);

      expect(resolved.resolutionStatus).toBe('resolved');
      expect(resolved.providerId).toBe('openaq');
      expect(resolved.stationId).toBe('openaq-chanakyapuri');
      expect(resolved.networkName).toBe('AirNow-DOS');
      expect(resolved.concentration).toBe(142);
    });

    it('Scenario C: selects CAMS model when no eligible ground stations exist', () => {
      const metrics = makeMetrics([makeCamsSource()]);
      const resolved = resolveSource({ version: 1, mode: 'automatic' }, metrics, 'cpcb', FIXED_NOW_MS);

      expect(resolved.resolutionStatus).toBe('resolved');
      expect(resolved.sourceKind).toBe('atmospheric_model');
      expect(resolved.isModel).toBe(true);
      expect(resolved.selectionReason).toContain('no fresh ground stations are reporting within 35 km');
    });

    it('Scenario D: returns unavailable when all sources and fallback metrics are unavailable', () => {
      const metrics = makeMetrics([], { status: 'error', pm25: null, usAqi: null, cpcbAqi: null });
      const resolved = resolveSource({ version: 1, mode: 'automatic' }, metrics, 'cpcb', FIXED_NOW_MS);

      expect(resolved.resolutionStatus).toBe('unavailable');
      expect(resolved.concentration).toBeNull();
      expect(resolved.displayAqi).toBeNull();
      expect(resolved.aqiCategory).toBe('Unavailable');
    });

    it('Scenario E: handles selected specific station unavailable (not found or >100km)', () => {
      const metrics = makeMetrics([
        makeCpcbSource({ id: 'cpcb-far', latitude: 29.9629, longitude: 77.209, distanceKm: 150 }),
        makeCamsSource(),
      ]);
      const prefNoFallback: SourcePreference = {
        version: 1,
        mode: 'specific_station',
        stationId: 'cpcb-far',
        stationName: 'Far Station',
        allowFallbackToModel: false,
      };
      const tooFar = resolveSource(prefNoFallback, metrics, 'cpcb', FIXED_NOW_MS);
      expect(tooFar.resolutionStatus).toBe('unavailable');
      expect(tooFar.selectionReason).toContain('150 km away');

      const notFound = resolveSource(
        { version: 1, mode: 'specific_station', stationId: 'missing-id', allowFallbackToModel: false },
        makeMetrics([makeCamsSource()]),
        'cpcb',
        FIXED_NOW_MS
      );
      expect(notFound.resolutionStatus).toBe('unavailable');
      expect(notFound.selectionReason).toContain('not available for this city');
    });

    it('Scenario F: handles selected specific station stale without silent fallback, or explicit fallback when enabled', () => {
      const staleIso = new Date(FIXED_NOW_MS - 28 * 3600 * 1000).toISOString();
      const staleStation = makeCpcbSource({
        id: 'cpcb-stale-1',
        observedAt: staleIso,
        measurements: [{ pollutant: 'pm25', value: 190, unit: 'µg/m³', observedAt: staleIso }],
      });
      const metrics = makeMetrics([staleStation, makeCamsSource()]);

      const noFallback = resolveSource(
        { version: 1, mode: 'specific_station', stationId: 'cpcb-stale-1', allowFallbackToModel: false },
        metrics,
        'cpcb',
        FIXED_NOW_MS
      );
      expect(noFallback.resolutionStatus).toBe('unavailable');
      expect(noFallback.isFallback).toBe(false);
      expect(noFallback.observedAt).toBe(staleIso);
      expect(noFallback.aqiCalculationNotes).toMatch(/28 hours old/);

      const withFallback = resolveSource(
        { version: 1, mode: 'specific_station', stationId: 'cpcb-stale-1', allowFallbackToModel: true },
        metrics,
        'cpcb',
        FIXED_NOW_MS
      );
      expect(withFallback.resolutionStatus).toBe('fallback');
      expect(withFallback.isFallback).toBe(true);
      expect(withFallback.stationId).toBe('cams-global-model');
    });

    it('Scenario G: skips official ground stations beyond 35 km in automatic mode', () => {
      const farOfficial = makeCpcbSource({ id: 'cpcb-40km', latitude: 28.9736, longitude: 77.209, distanceKm: 40 });
      const nearOpenAq = makeOpenAqSource({ distanceKm: 12 });
      const metrics = makeMetrics([farOfficial, nearOpenAq, makeCamsSource()]);

      const autoResolved = resolveSource({ version: 1, mode: 'automatic' }, metrics, 'epa', FIXED_NOW_MS);
      expect(autoResolved.stationId).toBe('openaq-chanakyapuri');
      expect(autoResolved.providerId).toBe('openaq');

      const exactBoundaryOfficial = makeCpcbSource({ id: 'cpcb-35km', latitude: 28.9287, longitude: 77.209, distanceKm: 35 });
      const boundaryResolved = resolveSource(
        { version: 1, mode: 'automatic' },
        makeMetrics([exactBoundaryOfficial, nearOpenAq]),
        'cpcb',
        FIXED_NOW_MS
      );
      expect(boundaryResolved.stationId).toBe('cpcb-35km');
    });

    it('Scenario H: ranks multiple eligible stations by shortest distance first', () => {
      const farther = makeCpcbSource({ id: 'cpcb-farther', sourceName: 'Farther Site', latitude: 28.7776, longitude: 77.209, distanceKm: 18.2 });
      const closer = makeCpcbSource({ id: 'cpcb-closer', sourceName: 'Closer Site', latitude: 28.631, longitude: 77.209, distanceKm: 1.9 });
      const unknownDist = makeCpcbSource({ id: 'cpcb-nodist', sourceName: 'Unknown Dist Site', latitude: null, longitude: null, distanceKm: null });

      const resolved = resolveSource(
        { version: 1, mode: 'automatic' },
        makeMetrics([unknownDist, farther, closer]),
        'cpcb',
        FIXED_NOW_MS
      );
      expect(resolved.stationId).toBe('cpcb-closer');
      expect(resolved.distanceKm).toBe(1.9);
    });

    it('Scenario I & P: ignores invalid, missing, or untimed PM2.5 measurements across sources and metrics', () => {
      const badOfficial = makeCpcbSource({
        measurements: [{ pollutant: 'pm25', value: -5, unit: 'µg/m³', observedAt: '2026-11-28T05:30:00.000Z' }],
      });
      const untimedOpenAq = makeOpenAqSource({
        measurements: [{ pollutant: 'pm25', value: 75, unit: 'ug/m3', observedAt: null }],
      });
      const metrics = makeMetrics([badOfficial, untimedOpenAq], { pm25: -1, status: 'success' });

      const openAqRes = resolveSource({ version: 1, mode: 'openaq' }, metrics, 'epa', FIXED_NOW_MS);
      expect(openAqRes.resolutionStatus).toBe('unavailable');
      // Untimed measurement must not be mislabeled as stale (>24h)
      expect(openAqRes.selectionReason).not.toContain('stale');

      const autoNoValidMetrics = resolveSource({ version: 1, mode: 'automatic' }, metrics, 'cpcb', FIXED_NOW_MS);
      expect(autoNoValidMetrics.resolutionStatus).toBe('unavailable');
    });

    it('Scenario J & R: handles atmospheric model mode via unbundled metrics and missing telemetry', () => {
      const unbundledMetrics = makeMetrics([], { pm25: 112, cpcbAqi: 273, usAqi: 180 });
      const resolvedModelFromMetrics = resolveSource(
        { version: 1, mode: 'atmospheric_model' },
        unbundledMetrics,
        'cpcb',
        FIXED_NOW_MS
      );
      expect(resolvedModelFromMetrics.resolutionStatus).toBe('resolved');
      expect(resolvedModelFromMetrics.stationId).toBe('cams_global');
      expect(resolvedModelFromMetrics.concentration).toBe(112);
      expect(resolvedModelFromMetrics.displayAqi).toBe(273);
      expect(resolvedModelFromMetrics.observedAt).toBeNull();

      const missingTelemetry = resolveSource({ version: 1, mode: 'automatic' }, null, 'cpcb', FIXED_NOW_MS);
      expect(missingTelemetry.resolutionStatus).toBe('unavailable');
      expect(missingTelemetry.availableAlternatives).toEqual([]);
      expect(missingTelemetry.selectionReason).toContain('Environmental telemetry is currently unavailable');
    });

    it('Scenario K: identifies registry-only official stations with distinct waiting status message', () => {
      const registryOnly = makeCpcbSource({ status: 'registry_only', measurements: [] });
      const resolved = resolveSource(
        { version: 1, mode: 'official_ground', allowFallbackToModel: false },
        makeMetrics([registryOnly, makeCamsSource()]),
        'cpcb',
        FIXED_NOW_MS
      );
      expect(resolved.resolutionStatus).toBe('unavailable');
      expect(resolved.selectionReason).toContain('awaiting continuous live telemetry');
    });

    it('Scenario L & M: distinguishes verified official regulatory bulletins from derived AQI calculations', () => {
      const verifiedBulletin = makeCpcbSource({
        provenance: {
          network: 'CAAQMS',
          licenseOrAttribution: 'GODL-India',
          isModel: false,
          limitations: [],
          isOfficialBulletin: true,
        },
        measurements: [
          { pollutant: 'pm25', value: 180, unit: 'µg/m³', observedAt: '2026-11-28T05:30:00.000Z' },
          {
            pollutant: 'aqi_derived',
            value: 344,
            unit: 'AQI',
            observedAt: '2026-11-28T05:30:00.000Z',
            qualityFlag: 'official_bulletin',
          },
        ],
      });
      const resOfficial = resolveSource(
        { version: 1, mode: 'official_ground' },
        makeMetrics([verifiedBulletin]),
        'cpcb',
        FIXED_NOW_MS
      );
      expect(resOfficial.isOfficialPublishedAqi).toBe(true);
      expect(resOfficial.displayAqi).toBe(344);

      const unverifiedBulletin = makeCpcbSource({
        measurements: [
          { pollutant: 'pm25', value: 180, unit: 'µg/m³', observedAt: '2026-11-28T05:30:00.000Z' },
          {
            pollutant: 'aqi_derived',
            value: 999,
            unit: 'AQI',
            observedAt: '2026-11-28T05:30:00.000Z',
            qualityFlag: 'valid',
          },
        ],
      });
      const resDerived = resolveSource(
        { version: 1, mode: 'official_ground' },
        makeMetrics([unverifiedBulletin]),
        'cpcb',
        FIXED_NOW_MS
      );
      expect(resDerived.isOfficialPublishedAqi).toBe(false);
      expect(resDerived.displayAqi).toBe(calculateComprehensiveCpcbNaqi({ pm25: 180, pm10: null, is24HourAveraged: false }).aqi);
    });

    it('Scenario N & O: applies CPCB NAQI statutory/indicative and US EPA sub-index rules cleanly', () => {
      const station24h = makeCpcbSource({
        measurements: [
          {
            pollutant: 'pm25',
            value: 90,
            unit: 'µg/m³',
            observedAt: '2026-11-28T05:30:00.000Z',
            averagingPeriodMinutes: 1440,
          },
        ],
      });
      const cpcb24 = resolveSource(
        { version: 1, mode: 'official_ground' },
        makeMetrics([station24h]),
        'cpcb',
        FIXED_NOW_MS
      );
      expect(cpcb24.aqiStandard).toBe('cpcb');
      expect(cpcb24.aqiCalculationNotes).toBe(
        'Indicative CPCB sub-index derived from in-situ measurements. Not an officially published bulletin.'
      );
      expect(cpcb24.displayAqi).toBe(
        calculateComprehensiveCpcbNaqi({ pm25: 90, pm10: null, is24HourAveraged: true }).aqi
      );

      const epa = resolveSource(
        { version: 1, mode: 'official_ground' },
        makeMetrics([station24h]),
        'epa',
        FIXED_NOW_MS
      );
      expect(epa.aqiStandard).toBe('epa');
      expect(epa.displayAqi).toBe(calculateAQIFromPM25(90));
      expect(epa.aqiCalculationNotes).toBe(
        'Derived US EPA PM2.5 sub-index (40 CFR Part 58, 2024 standard). Not an officially published AQI.'
      );
    });

    it('Scenario Q, S & T: enforces explicit unavailable responses, different model/station valid times, and alternatives/fallback disclosure', () => {
      const staleIso = new Date(FIXED_NOW_MS - 30 * 3600 * 1000).toISOString();
      const staleOfficial = makeCpcbSource({
        observedAt: staleIso,
        measurements: [{ pollutant: 'pm25', value: 200, unit: 'µg/m³', observedAt: staleIso }],
      });
      const freshCams = makeCamsSource({
        validAt: '2026-11-28T07:00:00.000Z',
        measurements: [
          { pollutant: 'pm25', value: 88, unit: 'ug/m3', observedAt: null, validAt: '2026-11-28T07:00:00.000Z' },
        ],
      });
      const metrics = makeMetrics([staleOfficial, freshCams]);

      const strictOfficial = resolveSource(
        { version: 1, mode: 'official_ground', allowFallbackToModel: false },
        metrics,
        'cpcb',
        FIXED_NOW_MS
      );
      expect(strictOfficial.resolutionStatus).toBe('unavailable');
      expect(strictOfficial.isFallback).toBe(false);
      expect(strictOfficial.availableAlternatives).toEqual([
        { mode: 'atmospheric_model', label: 'Open-Meteo CAMS Model', sourceId: 'cams-global-model' },
      ]);

      const fallbackOfficial = resolveSource(
        { version: 1, mode: 'official_ground', allowFallbackToModel: true },
        metrics,
        'cpcb',
        FIXED_NOW_MS
      );
      expect(fallbackOfficial.resolutionStatus).toBe('fallback');
      expect(fallbackOfficial.isFallback).toBe(true);
      expect(fallbackOfficial.validAt).toBe('2026-11-28T07:00:00.000Z');
      expect(fallbackOfficial.observedAt).toBeNull();
      expect(fallbackOfficial.fallbackReason).toBe('Official regulatory stations have no continuous feed at this location.');
    });
  });

  describe('Phase 4–7: Extracted Module Direct Contracts & Backward-Compatible Exports', () => {
    it('preserves identical function references through source-resolution and barrel exports', () => {
      expect(isSourceEligibleForPm25).toBe(isSourceEligibleDirect);
      expect(hasValidPm25).toBe(hasValidPm25Direct);
      expect(barrelIsSourceEligible).toBe(isSourceEligibleDirect);
      expect(barrelHasValidPm25).toBe(hasValidPm25Direct);
      expect(barrelResolveSource).toBe(resolveSource);
    });

    it('invokes extracted mode resolvers and result builders independently with identical contracts', () => {
      const cpcb = makeCpcbSource();
      const openAq = makeOpenAqSource();
      const cams = makeCamsSource();
      const metrics = makeMetrics([cpcb, openAq, cams]);
      const alts = [{ mode: 'atmospheric_model' as const, label: 'Open-Meteo CAMS Model', sourceId: cams.id }];

      const autoDirect = resolveAutomaticMode(
        { version: 1, mode: 'automatic' },
        [cpcb, openAq, cams],
        cams,
        'cpcb',
        FIXED_NOW_ISO,
        alts,
        metrics,
        FIXED_NOW_MS
      );
      expect(autoDirect.stationId).toBe('cpcb-anand-vihar');

      const officialDirect = resolveOfficialGroundMode(
        { version: 1, mode: 'official_ground' },
        [cpcb],
        cams,
        'cpcb',
        FIXED_NOW_ISO,
        alts,
        metrics,
        FIXED_NOW_MS
      );
      expect(officialDirect.resolutionStatus).toBe('resolved');

      const openAqDirect = resolveOpenAqMode(
        { version: 1, mode: 'openaq' },
        [openAq],
        cams,
        'epa',
        FIXED_NOW_ISO,
        alts,
        metrics,
        FIXED_NOW_MS
      );
      expect(openAqDirect.providerId).toBe('openaq');

      const modelDirect = resolveAtmosphericModelMode(
        { version: 1, mode: 'atmospheric_model' },
        cams,
        'cpcb',
        FIXED_NOW_ISO,
        alts,
        metrics,
        FIXED_NOW_MS
      );
      expect(modelDirect.sourceKind).toBe('atmospheric_model');

      const specificFallbackAuto = resolveSpecificStationMode(
        { version: 1, mode: 'specific_station' },
        [openAq],
        cams,
        'epa',
        FIXED_NOW_ISO,
        alts,
        metrics,
        FIXED_NOW_MS
      );
      expect(specificFallbackAuto.stationId).toBe('openaq-chanakyapuri');

      const builtFromSource = buildResolvedSourceData({
        preference: { version: 1, mode: 'official_ground' },
        resolvedSource: cpcb,
        resolutionStatus: 'resolved',
        selectionReason: 'Direct builder check',
        isFallback: false,
        aqiStandard: 'cpcb',
        retrievedAt: FIXED_NOW_ISO,
        alternatives: alts,
      });
      expect(builtFromSource.concentration).toBe(180);

      const builtFromMetrics = buildResolvedFromMetrics(
        { version: 1, mode: 'atmospheric_model' },
        metrics,
        'epa',
        FIXED_NOW_ISO,
        'Metrics builder check',
        alts
      );
      expect(builtFromMetrics.displayAqi).toBe(171);

      const unavailable = createUnavailableResolvedData(
        { version: 1, mode: 'automatic' },
        'Offline',
        FIXED_NOW_ISO,
        'cpcb'
      );
      expect(unavailable.resolutionStatus).toBe('unavailable');
      expect(unavailable.availableAlternatives).toEqual([]);
    });
  });
});
