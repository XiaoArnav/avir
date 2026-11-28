import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveSource } from '@/services/source-control/source-resolution';
import { verifySourceDistance } from '@/services/source-control/source-eligibility';
import { toSourceCatalogItem } from '@/services/source-control/source-catalog';
import { SourcePreference } from '@/services/source-control/source-control-types';
import { AtmosphericMetrics, EnvironmentalSourceRecord } from '@/domain/types';
import { normalizeDataGovInRecords, fetchCpcbProviderResult } from '@/services/providers/cpcb-provider';
import { parseOpenAqLocation, fetchOpenAqProviderResult, clearOpenAqCache } from '@/services/providers/openaq-provider';
import { getPhysicalStationDeduplicationKey } from '@/config/environmental-sources';
import { MultiSourceInspectorModal } from '@/components/MultiSourceInspectorModal';
import { EarthCommandCenter } from '@/components/home/EarthCommandCenter';
import { GeocodedLocation } from '@/services/telemetry-service';

const NOW_ISO = '2026-11-28T12:00:00.000Z';
const NOW_MS = Date.parse(NOW_ISO);
const FRESH_OBS = '2026-11-28T11:30:00.000Z';
const STALE_OBS = '2026-11-27T08:00:00.000Z'; // 28h old

const DELHI = { name: 'Delhi-NCR', latitude: 28.6139, longitude: 77.2090 };
const BENGALURU = { name: 'Bengaluru', latitude: 12.9716, longitude: 77.5946 };
const SEATTLE = { name: 'Seattle', latitude: 47.6062, longitude: -122.3321 };
const LONDON = { name: 'London', latitude: 51.5074, longitude: -0.1278 };

function makeCpcb(overrides: Partial<EnvironmentalSourceRecord> = {}): EnvironmentalSourceRecord {
  return {
    id: 'cpcb-delhi-anand-vihar',
    providerId: 'cpcb',
    providerName: 'Central Pollution Control Board (CPCB)',
    upstreamProviderId: 'cpcb_caaqms',
    stationId: 'Anand Vihar',
    sourceName: 'Anand Vihar CAAQMS',
    name: 'Anand Vihar CAAQMS',
    sourceKind: 'official_ground_station',
    status: 'fresh',
    latitude: 28.6508,
    longitude: 77.3152,
    distanceKm: 11.2,
    observedAt: FRESH_OBS,
    measuredAt: FRESH_OBS,
    validAt: null,
    retrievedAt: NOW_ISO,
    measurements: [
      {
        pollutant: 'pm25',
        value: 185,
        unit: 'ug/m3',
        observedAt: FRESH_OBS,
        averagingPeriodMinutes: 60,
        qualityFlag: 'valid',
      },
    ],
    attribution: 'CPCB / DPCC',
    provenance: {
      network: 'DPCC',
      licenseOrAttribution: 'GODL-India',
      isModel: false,
      limitations: [],
    },
    ...overrides,
  };
}

function makeOpenAq(overrides: Partial<EnvironmentalSourceRecord> = {}): EnvironmentalSourceRecord {
  return {
    id: 'openaq-5001',
    providerId: 'openaq',
    providerName: 'OpenAQ',
    upstreamProviderId: 'AirNow',
    stationId: '5001',
    sourceName: 'Chanakyapuri Monitor (OpenAQ)',
    name: 'Chanakyapuri Monitor',
    sourceKind: 'physical_observation',
    status: 'fresh',
    latitude: 28.5983,
    longitude: 77.1897,
    distanceKm: 2.6,
    observedAt: FRESH_OBS,
    measuredAt: FRESH_OBS,
    validAt: null,
    retrievedAt: NOW_ISO,
    measurements: [
      {
        pollutant: 'pm25',
        value: 140,
        unit: 'ug/m3',
        observedAt: FRESH_OBS,
        averagingPeriodMinutes: 60,
        qualityFlag: 'valid',
      },
    ],
    attribution: 'OpenAQ Open Data (CC BY 4.0)',
    provenance: {
      network: 'AirNow',
      licenseOrAttribution: 'CC BY 4.0',
      isModel: false,
      limitations: [],
    },
    ...overrides,
  };
}

function makeCams(city = DELHI, overrides: Partial<EnvironmentalSourceRecord> = {}): EnvironmentalSourceRecord {
  return {
    id: 'open-meteo-atmospheric-model',
    providerId: 'open-meteo',
    providerName: 'Open-Meteo / ECMWF IFS & CAMS',
    sourceName: 'Open-Meteo Atmospheric Chemistry (ECMWF IFS & CAMS)',
    sourceKind: 'atmospheric_model',
    providerKind: 'atmospheric_model',
    status: 'fresh',
    latitude: city.latitude,
    longitude: city.longitude,
    distanceKm: 0,
    observedAt: null,
    validAt: NOW_ISO,
    retrievedAt: NOW_ISO,
    measurements: [
      {
        pollutant: 'pm25',
        value: 82,
        unit: 'ug/m3',
        observedAt: null,
        validAt: NOW_ISO,
        averagingPeriodMinutes: 60,
        qualityFlag: 'valid',
      },
    ],
    attribution: 'ECMWF CAMS',
    provenance: {
      network: 'CAMS-IFS',
      licenseOrAttribution: 'CC BY 4.0',
      isModel: true,
      limitations: [],
    },
    ...overrides,
  };
}

function makeMetrics(
  sources: EnvironmentalSourceRecord[],
  city = DELHI,
  overrides: Partial<AtmosphericMetrics> = {}
): AtmosphericMetrics {
  return {
    status: 'success',
    provenance: 'modeled_forecast',
    timestamp: NOW_ISO,
    retrievedAt: NOW_ISO,
    timezone: 'Asia/Kolkata',
    cityName: city.name,
    latitude: city.latitude,
    longitude: city.longitude,
    usAqi: 165,
    cpcbAqi: 173,
    pm25: 82,
    pm10: 130,
    boundaryLayerHeight: 800,
    isThermalInversionActive: false,
    isLive: true,
    isStale: false,
    freshness: 'fresh',
    environmentalSources: sources,
    ...overrides,
  };
}

describe('Stage 2 — CPCB / OpenAQ Source Distance Integrity & Provenance', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_ISO));
    clearOpenAqCache();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('1. Geographic Radius Policies (CPCB 35 km, OpenAQ 25 km)', () => {
    it('accepts CPCB station at 34.9 km and rejects CPCB station at 35.1 km in automatic and official_ground modes', () => {
      // Coordinates intentionally within Delhi NCR (~28.9277 N = ~34.9 km north of 28.6139)
      const cpcbInside = makeCpcb({
        id: 'cpcb-34-9',
        latitude: 28.9277,
        longitude: 77.2090,
        distanceKm: 34.9,
      });
      // ~35.1 km away (28.9295 N)
      const cpcbOutside = makeCpcb({
        id: 'cpcb-35-1',
        latitude: 28.9295,
        longitude: 77.2090,
        distanceKm: 35.1,
      });
      const cams = makeCams();

      const autoInside = resolveSource({ version: 1, mode: 'automatic' }, makeMetrics([cpcbInside, cams]), 'cpcb', NOW_MS);
      expect(autoInside.stationId).toBe('cpcb-34-9');
      expect(autoInside.isModel).toBe(false);

      const autoOutside = resolveSource({ version: 1, mode: 'automatic' }, makeMetrics([cpcbOutside, cams]), 'cpcb', NOW_MS);
      expect(autoOutside.sourceKind).toBe('atmospheric_model');

      const officialOutside = resolveSource(
        { version: 1, mode: 'official_ground', allowFallbackToModel: false },
        makeMetrics([cpcbOutside, cams]),
        'cpcb',
        NOW_MS
      );
      expect(officialOutside.resolutionStatus).toBe('unavailable');
      expect(officialOutside.concentration).toBeNull();
    });

    it('accepts OpenAQ station at 24.9 km and rejects OpenAQ station at 25.1 km and 28 km (even if isMonitor is true)', () => {
      // ~24.9 km north of Delhi center
      const openAqInside = makeOpenAq({
        id: 'openaq-24-9',
        latitude: 28.8378,
        longitude: 77.2090,
        distanceKm: 24.9,
      });
      // ~25.1 km north
      const openAqOutside = makeOpenAq({
        id: 'openaq-25-1',
        sourceKind: 'official_ground_station', // Reference-grade monitor in OpenAQ must still respect OpenAQ 25km limit!
        latitude: 28.8396,
        longitude: 77.2090,
        distanceKm: 25.1,
      });
      // 28 km OpenAQ monitor
      const openAq28km = makeOpenAq({
        id: 'openaq-28-0',
        sourceKind: 'official_ground_station',
        latitude: 28.8657,
        longitude: 77.2090,
        distanceKm: 28.0,
      });
      const cams = makeCams();

      const autoInside = resolveSource({ version: 1, mode: 'automatic' }, makeMetrics([openAqInside, cams]), 'epa', NOW_MS);
      expect(autoInside.stationId).toBe('openaq-24-9');

      const autoOutside = resolveSource({ version: 1, mode: 'automatic' }, makeMetrics([openAqOutside, cams]), 'epa', NOW_MS);
      expect(autoOutside.sourceKind).toBe('atmospheric_model');

      const openAqMode28 = resolveSource(
        { version: 1, mode: 'openaq', allowFallbackToModel: false },
        makeMetrics([openAq28km, cams]),
        'epa',
        NOW_MS
      );
      expect(openAqMode28.resolutionStatus).toBe('unavailable');
      expect(openAqMode28.concentration).toBeNull();

      // An OpenAQ station must NEVER be selected under Official CPCB Ground mode even if isMonitor === true
      const officialModeWithOpenAq = resolveSource(
        { version: 1, mode: 'official_ground', allowFallbackToModel: false },
        makeMetrics([openAqInside, openAq28km, cams]),
        'cpcb',
        NOW_MS
      );
      expect(officialModeWithOpenAq.resolutionStatus).toBe('unavailable');
    });
  });

  describe('2. Unknown Distance, Invalid Coordinates, and Coordinate-vs-Distance Conflicts', () => {
    it('rejects unknown-distance (distanceKm: null with missing coords) stations across automatic, official_ground, and openaq modes', () => {
      const unknownCpcb = makeCpcb({
        id: 'cpcb-unknown-dist',
        latitude: null,
        longitude: null,
        distanceKm: null,
        coordinates: null,
      });
      const unknownOpenAq = makeOpenAq({
        id: 'openaq-unknown-dist',
        latitude: null,
        longitude: null,
        distanceKm: null,
        coordinates: null,
      });
      const cams = makeCams();
      const metrics = makeMetrics([unknownCpcb, unknownOpenAq, cams]);

      const autoRes = resolveSource({ version: 1, mode: 'automatic' }, metrics, 'cpcb', NOW_MS);
      expect(autoRes.sourceKind).toBe('atmospheric_model');
      expect(autoRes.isModel).toBe(true);

      const officialRes = resolveSource(
        { version: 1, mode: 'official_ground', allowFallbackToModel: false },
        metrics,
        'cpcb',
        NOW_MS
      );
      expect(officialRes.resolutionStatus).toBe('unavailable');

      const openAqRes = resolveSource(
        { version: 1, mode: 'openaq', allowFallbackToModel: false },
        metrics,
        'epa',
        NOW_MS
      );
      expect(openAqRes.resolutionStatus).toBe('unavailable');
    });

    it('rejects missing coordinates and invalid coordinates even when a nominal distanceKm is claimed', () => {
      const missingCoords = makeCpcb({
        id: 'cpcb-missing-coords',
        latitude: null,
        longitude: null,
        distanceKm: 3.2,
        coordinates: null,
      });
      const outOfBoundsCoords = makeOpenAq({
        id: 'openaq-bad-coords',
        latitude: 95.4,
        longitude: 77.2,
        distanceKm: 2.1,
      });
      const partialCoords = makeCpcb({
        id: 'cpcb-partial-coords',
        latitude: 28.61,
        longitude: null,
        distanceKm: 1.5,
      });
      const cams = makeCams();
      const metrics = makeMetrics([missingCoords, outOfBoundsCoords, partialCoords, cams]);

      const autoRes = resolveSource({ version: 1, mode: 'automatic' }, metrics, 'cpcb', NOW_MS);
      expect(autoRes.sourceKind).toBe('atmospheric_model');
    });

    it('detects stale stored distanceKm conflicting with station coordinates and active city across Delhi, Bengaluru, Seattle, and London', () => {
      // Real Bengaluru station carrying stale distanceKm: 4.5 while active city is Delhi!
      const bengaluruStationInDelhi = makeCpcb({
        id: 'cpcb-ka-btm',
        sourceName: 'BTM Layout CAAQMS',
        latitude: BENGALURU.latitude,
        longitude: BENGALURU.longitude,
        distanceKm: 4.5, // Stale distance from earlier Bengaluru load!
      });
      const camsDelhi = makeCams(DELHI);

      const autoDelhi = resolveSource(
        { version: 1, mode: 'automatic' },
        makeMetrics([bengaluruStationInDelhi, camsDelhi], DELHI),
        'cpcb',
        NOW_MS
      );
      expect(autoDelhi.sourceKind).toBe('atmospheric_model');

      // Specific station mode must compute real 1740 km distance instead of trusting stale 4.5 km!
      const specificBengaluruInDelhi = resolveSource(
        { version: 1, mode: 'specific_station', stationId: 'cpcb-ka-btm', allowFallbackToModel: false },
        makeMetrics([bengaluruStationInDelhi, camsDelhi], DELHI),
        'cpcb',
        NOW_MS
      );
      expect(specificBengaluruInDelhi.resolutionStatus).toBe('unavailable');
      expect(specificBengaluruInDelhi.distanceKm).toBeGreaterThan(1500);
      expect(specificBengaluruInDelhi.selectionReason).toContain('km away');

      // Same protection for Seattle and London against Delhi/Bengaluru stations claiming small stored distance
      for (const city of [SEATTLE, LONDON, BENGALURU]) {
        const distantDelhiStation = makeOpenAq({
          id: 'openaq-delhi-stale-dist',
          latitude: DELHI.latitude,
          longitude: DELHI.longitude,
          distanceKm: 3.0,
        });
        const res = resolveSource(
          { version: 1, mode: 'automatic' },
          makeMetrics([distantDelhiStation, makeCams(city)], city),
          'epa',
          NOW_MS
        );
        expect(res.sourceKind).toBe('atmospheric_model');
      }
    });

    it('computes distance from valid active location and station coordinates when stored distanceKm is null', () => {
      // Real local Anand Vihar station (~11.1 km from Delhi center), stored distanceKm omitted
      const validCoordsNoDist = makeCpcb({
        id: 'cpcb-computed-local',
        latitude: 28.6508,
        longitude: 77.3152,
        distanceKm: null,
        coordinates: { latitude: 28.6508, longitude: 77.3152, distanceKm: null },
      });
      const resLocal = resolveSource(
        { version: 1, mode: 'automatic' },
        makeMetrics([validCoordsNoDist, makeCams(DELHI)], DELHI),
        'cpcb',
        NOW_MS
      );
      expect(resLocal.stationId).toBe('cpcb-computed-local');
      expect(resLocal.distanceKm).toBeGreaterThan(5);
      expect(resLocal.distanceKm).toBeLessThan(20);

      // Far station (~1740 km away) with distanceKm: null MUST still be rejected
      const validCoordsFarNoDist = makeCpcb({
        id: 'cpcb-computed-far',
        latitude: BENGALURU.latitude,
        longitude: BENGALURU.longitude,
        distanceKm: null,
      });
      const resFar = resolveSource(
        { version: 1, mode: 'automatic' },
        makeMetrics([validCoordsFarNoDist, makeCams(DELHI)], DELHI),
        'cpcb',
        NOW_MS
      );
      expect(resFar.sourceKind).toBe('atmospheric_model');
    });

    it('prefers a farther fresh eligible station over a nearer stale station', () => {
      const nearerStale = makeCpcb({
        id: 'cpcb-near-stale',
        distanceKm: 2.0,
        status: 'active',
        observedAt: STALE_OBS,
        measurements: [{ pollutant: 'pm25', value: 310, unit: 'ug/m3', observedAt: STALE_OBS }],
      });
      const fartherFresh = makeCpcb({
        id: 'cpcb-far-fresh',
        latitude: 28.78,
        longitude: 77.21,
        distanceKm: 18.5,
        status: 'fresh',
      });

      const resolved = resolveSource(
        { version: 1, mode: 'automatic' },
        makeMetrics([nearerStale, fartherFresh, makeCams()]),
        'cpcb',
        NOW_MS
      );
      expect(resolved.stationId).toBe('cpcb-far-fresh');
      expect(resolved.distanceKm).toBe(18.5);
    });
  });

  describe('3. Source Quality, Provenance, Empty CPCB Coordinates & Source Catalog', () => {
    it('does not treat empty string CPCB coordinates as Null Island (0, 0)', () => {
      const sources = normalizeDataGovInRecords(
        [
          {
            country: 'India',
            state: 'Delhi',
            city: 'Delhi',
            station: 'Missing Coords Station',
            last_update: '28-11-2026 17:00:00',
            pollutant_id: 'PM2.5',
            pollutant_avg: '140',
            latitude: '',
            longitude: '   ',
          },
        ],
        DELHI.latitude,
        DELHI.longitude,
        35
      );
      expect(sources).toHaveLength(1);
      expect(sources[0].latitude).toBeNull();
      expect(sources[0].longitude).toBeNull();
      expect(sources[0].distanceKm).toBeNull();
    });

    it('rejects out-of-range coordinates in parseOpenAqLocation without producing false distances', () => {
      const badLoc = parseOpenAqLocation(
        {
          id: 9001,
          name: 'Corrupt Coords Station',
          coordinates: { latitude: 120.0, longitude: 210.0 },
          sensors: [{ id: 1, parameter: { id: 2, name: 'pm25', units: 'ug/m3' } }],
        },
        DELHI.latitude,
        DELHI.longitude,
        [{ sensorsId: 1, value: 80, datetime: { utc: FRESH_OBS } }]
      );
      expect(badLoc).not.toBeNull();
      expect(badLoc?.latitude).toBeNull();
      expect(badLoc?.longitude).toBeNull();
      expect(badLoc?.distanceKm).toBeNull();
    });

    it('preserves valid 0 µg/m³ PM2.5 and rejects missing PM2.5, bad units, and future timestamps', () => {
      const zeroStation = makeOpenAq({
        id: 'openaq-zero',
        measurements: [{ pollutant: 'pm25', value: 0, unit: 'µg/m³', observedAt: FRESH_OBS }],
      });
      const zeroRes = resolveSource({ version: 1, mode: 'openaq' }, makeMetrics([zeroStation]), 'epa', NOW_MS);
      expect(zeroRes.resolutionStatus).toBe('resolved');
      expect(zeroRes.concentration).toBe(0);

      const futureTime = new Date(NOW_MS + 30 * 60 * 1000).toISOString();
      const futureStation = makeOpenAq({
        id: 'openaq-future',
        measurements: [{ pollutant: 'pm25', value: 90, unit: 'ug/m3', observedAt: futureTime }],
      });
      const futureRes = resolveSource(
        { version: 1, mode: 'openaq', allowFallbackToModel: false },
        makeMetrics([futureStation, makeCams()]),
        'epa',
        NOW_MS
      );
      expect(futureRes.resolutionStatus).toBe('unavailable');
    });

    it('marks stale, untimed, and error sources as isAvailable=false in toSourceCatalogItem', () => {
      const staleWithValue = makeCpcb({
        status: 'stale',
        observedAt: STALE_OBS,
        measurements: [{ pollutant: 'pm25', value: 195, unit: 'ug/m3', observedAt: STALE_OBS }],
      });
      const activeButOld = makeCpcb({
        status: 'active',
        observedAt: STALE_OBS,
        measurements: [{ pollutant: 'pm25', value: 195, unit: 'ug/m3', observedAt: STALE_OBS }],
      });
      const untimedActive = makeCpcb({
        status: 'active',
        observedAt: null,
        measurements: [{ pollutant: 'pm25', value: 195, unit: 'ug/m3', observedAt: null }],
      });

      expect(toSourceCatalogItem(staleWithValue).isAvailable).toBe(false);
      expect(toSourceCatalogItem(staleWithValue).isStale).toBe(true);
      expect(toSourceCatalogItem(activeButOld).isAvailable).toBe(false);
      expect(toSourceCatalogItem(activeButOld).isStale).toBe(true);
      expect(toSourceCatalogItem(untimedActive).isAvailable).toBe(false);
    });

    it('never merges stations across different networks that share the same numeric ID or similar name', () => {
      const openAq101 = makeOpenAq({ id: 'openaq-101', providerId: 'openaq', stationId: '101', sourceName: 'Civil Lines' });
      const sensor101 = makeOpenAq({
        id: 'sc-101',
        providerId: 'sensor_community',
        upstreamProviderId: undefined,
        stationId: '101',
        sourceName: 'Civil Lines',
        sourceKind: 'community_optical',
      });
      expect(getPhysicalStationDeduplicationKey(openAq101)).not.toBe(getPhysicalStationDeduplicationKey(sensor101));
    });

    it('discloses missing API key clearly in OpenAQ mode when only unconfigured placeholder is present', async () => {
      const res = await fetchOpenAqProviderResult({
        latitude: DELHI.latitude,
        longitude: DELHI.longitude,
        apiKey: '',
      });
      expect(res.status).toBe('not_configured');

      const pref: SourcePreference = { version: 1, mode: 'openaq', allowFallbackToModel: false };
      const resolved = resolveSource(pref, makeMetrics(res.sources), 'epa', NOW_MS);
      expect(resolved.resolutionStatus).toBe('unavailable');
      expect(resolved.selectionReason).toContain('OPENAQ_API_KEY');
    });

    it('keeps DATA_GOV_IN_API_KEY server-side and discloses missing CPCB key without throwing', async () => {
      const prev = process.env.DATA_GOV_IN_API_KEY;
      delete process.env.DATA_GOV_IN_API_KEY;
      try {
        const res = await fetchCpcbProviderResult({ latitude: DELHI.latitude, longitude: DELHI.longitude });
        expect(res.status).toBe('not_configured');
        expect(res.sources).toEqual([]);
      } finally {
        if (prev !== undefined) process.env.DATA_GOV_IN_API_KEY = prev;
      }
    });
  });

  describe('4. UI & Explanation Consistency (No fake 0 km / Local labels or stale model timestamp leakage)', () => {
    it('renders unverified distance instead of "0 km" or "Local" in MultiSourceInspectorModal', () => {
      const unknownStation = makeCpcb({
        id: 'cpcb-unknown-ui',
        sourceName: 'Unverified Station',
        latitude: null,
        longitude: null,
        distanceKm: null,
        coordinates: null,
      });

      const html = ReactDOMServer.renderToString(
        <MultiSourceInspectorModal
          isOpen={true}
          onClose={() => {}}
          cityName="Delhi-NCR"
          environmentalSources={[makeCams(), unknownStation]}
          sourcePreference={{ version: 1, mode: 'specific_station', stationId: 'cpcb-unknown-ui' }}
        />
      );

      expect(html).not.toContain('>0 km<');
      expect(html).not.toContain('— Local (');
      expect(html).toContain('Unverified');
    });

    it('displays active ground station observed timestamp on CompactCityCard rather than model metrics.timestamp, and marks unavailable freshness honestly', () => {
      const threeHoursAgo = new Date(NOW_MS - 3 * 3600 * 1000).toISOString();
      const station = makeCpcb({
        observedAt: threeHoursAgo,
        measuredAt: threeHoursAgo,
        measurements: [{ pollutant: 'pm25', value: 185, unit: 'ug/m3', observedAt: threeHoursAgo }],
      });
      const delhiLoc: GeocodedLocation = {
        id: 1,
        name: 'Delhi-NCR',
        country: 'India',
        countryCode: 'IN',
        latitude: DELHI.latitude,
        longitude: DELHI.longitude,
      };

      const htmlResolved = ReactDOMServer.renderToString(
        <EarthCommandCenter
          currentCity={delhiLoc}
          metrics={makeMetrics([station, makeCams()], DELHI, { timestamp: NOW_ISO, isLive: true })}
          isLoading={false}
          onSelectCity={vi.fn()}
          onRefreshTelemetry={vi.fn()}
          onOpenExplainer={vi.fn()}
          onOpenShare={vi.fn()}
          onOpenMultiSource={vi.fn()}
          onOpenDailyPlan={vi.fn()}
          sourcePreference={{ version: 1, mode: 'official_ground', allowFallbackToModel: false }}
        />
      );
      expect(htmlResolved).toContain('3h ago');
      expect(htmlResolved).not.toContain('Observed:</span><span class="telemetry-mono">Just now');

      const htmlUnavailable = ReactDOMServer.renderToString(
        <EarthCommandCenter
          currentCity={delhiLoc}
          metrics={makeMetrics([makeCams()], DELHI, { timestamp: NOW_ISO, isLive: true })}
          isLoading={false}
          onSelectCity={vi.fn()}
          onRefreshTelemetry={vi.fn()}
          onOpenExplainer={vi.fn()}
          onOpenShare={vi.fn()}
          onOpenMultiSource={vi.fn()}
          onOpenDailyPlan={vi.fn()}
          sourcePreference={{ version: 1, mode: 'official_ground', allowFallbackToModel: false }}
        />
      );
      expect(htmlUnavailable).toContain('Offline / Data Unavailable');
      expect(htmlUnavailable).toContain('Unavailable');
    });
  });

  describe('5. Symmetric Calculated Distance Authority & Missing Active Coordinates (Stage 2 Final Correction)', () => {
    // Exact Haversine constants computed against DELHI (28.6139, 77.2090) and BENGALURU (12.9716, 77.5946)
    const BLR_5KM = { latitude: 13.0166, longitude: 77.5946 }; // 5.0 km from BENGALURU
    const DEL_5KM = { latitude: 28.6589, longitude: 77.2090 }; // 5.0 km from DELHI
    const DEL_25KM = { latitude: 28.8387, longitude: 77.2090 }; // 25.0 km from DELHI
    const DEL_35KM = { latitude: 28.9287, longitude: 77.2090 }; // 35.0 km from DELHI
    const DEL_80KM = { latitude: 29.3334, longitude: 77.2090 }; // 80.0 km from DELHI

    it('Example A: treats calculated 5 km as authoritative when stored distanceKm is an erroneously large 80 km', () => {
      const cpcbStation = makeCpcb({
        id: 'cpcb-blr-5km-stale80',
        sourceName: 'Hebbal CAAQMS',
        ...BLR_5KM,
        distanceKm: 80,
      });
      const metrics = makeMetrics([cpcbStation, makeCams(BENGALURU)], BENGALURU);

      const helperRes = verifySourceDistance(cpcbStation, metrics, 35);
      expect(helperRes).toEqual({
        isWithinRange: true,
        distanceKm: 5,
        isVerified: true,
        reason: 'valid',
      });

      const autoRes = resolveSource({ version: 1, mode: 'automatic' }, metrics, 'cpcb', NOW_MS);
      expect(autoRes.stationId).toBe('cpcb-blr-5km-stale80');
      expect(autoRes.distanceKm).toBe(5);
      expect(autoRes.selectionReason).toContain('(5 km away)');

      const officialRes = resolveSource(
        { version: 1, mode: 'official_ground', allowFallbackToModel: false },
        metrics,
        'cpcb',
        NOW_MS
      );
      expect(officialRes.resolutionStatus).toBe('resolved');
      expect(officialRes.distanceKm).toBe(5);
    });

    it('Example B: uses and displays calculated 5 km instead of stale stored 20 km across resolvers and MultiSourceInspectorModal', () => {
      const openAqStation = makeOpenAq({
        id: 'openaq-del-5km-stale20',
        sourceName: 'Mandir Marg Reference Monitor',
        ...DEL_5KM,
        distanceKm: 20,
      });
      const cpcbStation = makeCpcb({
        id: 'cpcb-del-5km-stale20',
        sourceName: 'Pusa CAAQMS',
        ...DEL_5KM,
        distanceKm: 20,
      });

      const openAqMetrics = makeMetrics([openAqStation, makeCams(DELHI)], DELHI);
      const openAqAuto = resolveSource({ version: 1, mode: 'automatic' }, openAqMetrics, 'epa', NOW_MS);
      expect(openAqAuto.stationId).toBe('openaq-del-5km-stale20');
      expect(openAqAuto.distanceKm).toBe(5);
      expect(openAqAuto.selectionReason).toContain('(5 km away)');

      const openAqExplicit = resolveSource({ version: 1, mode: 'openaq', allowFallbackToModel: false }, openAqMetrics, 'epa', NOW_MS);
      expect(openAqExplicit.resolutionStatus).toBe('resolved');
      expect(openAqExplicit.distanceKm).toBe(5);

      const specificRes = resolveSource(
        { version: 1, mode: 'specific_station', stationId: 'openaq-del-5km-stale20', allowFallbackToModel: false },
        openAqMetrics,
        'epa',
        NOW_MS
      );
      expect(specificRes.resolutionStatus).toBe('resolved');
      expect(specificRes.distanceKm).toBe(5);

      const modalHtml = ReactDOMServer.renderToString(
        <MultiSourceInspectorModal
          isOpen={true}
          onClose={() => {}}
          cityName="Delhi-NCR"
          environmentalSources={[cpcbStation, makeCams(DELHI)]}
          metrics={makeMetrics([cpcbStation, makeCams(DELHI)], DELHI)}
          sourcePreference={{ version: 1, mode: 'specific_station', stationId: 'cpcb-del-5km-stale20' }}
        />
      ).replace(/<!--.*?-->/g, '');
      expect(modalHtml).toContain('>5 km<');
      expect(modalHtml).toContain('— 5 km');
      expect(modalHtml).not.toContain('20 km');
    });

    it('Example C: uses calculated 80 km when stored distanceKm is understated (5 km) and rejects from nearby selection', () => {
      const understatedCpcb = makeCpcb({
        id: 'cpcb-del-80km-stale5',
        ...DEL_80KM,
        distanceKm: 5,
      });
      const understatedOpenAq = makeOpenAq({
        id: 'openaq-del-80km-stale5',
        ...DEL_80KM,
        distanceKm: 5,
      });
      const metrics = makeMetrics([understatedCpcb, understatedOpenAq, makeCams(DELHI)], DELHI);

      expect(verifySourceDistance(understatedCpcb, metrics, 35)).toEqual({
        isWithinRange: false,
        distanceKm: 80,
        isVerified: true,
        reason: 'out_of_range',
      });

      const autoRes = resolveSource({ version: 1, mode: 'automatic' }, metrics, 'cpcb', NOW_MS);
      expect(autoRes.sourceKind).toBe('atmospheric_model');

      const officialRes = resolveSource(
        { version: 1, mode: 'official_ground', allowFallbackToModel: false },
        metrics,
        'cpcb',
        NOW_MS
      );
      expect(officialRes.resolutionStatus).toBe('unavailable');

      const openAqRes = resolveSource(
        { version: 1, mode: 'openaq', allowFallbackToModel: false },
        metrics,
        'epa',
        NOW_MS
      );
      expect(openAqRes.resolutionStatus).toBe('unavailable');
    });

    it('Example D & Rule 2/5: rejects unverified stored 5 km in nearby modes when active coordinates are missing, while preserving specific_station with unverified disclosure', () => {
      const validStationWithStored5 = makeCpcb({
        id: 'cpcb-stored-5-no-active-coords',
        sourceName: 'Anand Vihar CAAQMS',
        ...DEL_5KM,
        distanceKm: 5,
      });
      const openAqWithStored5 = makeOpenAq({
        id: 'openaq-stored-5-no-active-coords',
        ...DEL_5KM,
        distanceKm: 5,
      });
      const metricsWithoutActiveCoords = makeMetrics(
        [validStationWithStored5, openAqWithStored5, makeCams(DELHI)],
        DELHI,
        {
          latitude: undefined as unknown as number,
          longitude: undefined as unknown as number,
          location: undefined,
        }
      );

      expect(verifySourceDistance(validStationWithStored5, metricsWithoutActiveCoords, 35)).toEqual({
        isWithinRange: false,
        distanceKm: null,
        isVerified: false,
        reason: 'unknown_distance',
      });

      const autoRes = resolveSource({ version: 1, mode: 'automatic' }, metricsWithoutActiveCoords, 'cpcb', NOW_MS);
      expect(autoRes.sourceKind).toBe('atmospheric_model');

      const officialRes = resolveSource(
        { version: 1, mode: 'official_ground', allowFallbackToModel: false },
        metricsWithoutActiveCoords,
        'cpcb',
        NOW_MS
      );
      expect(officialRes.resolutionStatus).toBe('unavailable');

      const openAqRes = resolveSource(
        { version: 1, mode: 'openaq', allowFallbackToModel: false },
        metricsWithoutActiveCoords,
        'epa',
        NOW_MS
      );
      expect(openAqRes.resolutionStatus).toBe('unavailable');

      const specificRes = resolveSource(
        {
          version: 1,
          mode: 'specific_station',
          stationId: 'cpcb-stored-5-no-active-coords',
          allowFallbackToModel: false,
        },
        metricsWithoutActiveCoords,
        'cpcb',
        NOW_MS
      );
      expect(specificRes.resolutionStatus).toBe('resolved');
      expect(specificRes.stationId).toBe('cpcb-stored-5-no-active-coords');
      expect(specificRes.distanceKm).toBeNull();
      expect(specificRes.selectionReason).toContain('station distance is unverified');
      expect(specificRes.limitations.join(' ')).toContain('could not be verified');
      expect(specificRes.isFallback).toBe(false);

      const staleNoActiveCoords = makeCpcb({
        ...validStationWithStored5,
        status: 'stale',
        observedAt: STALE_OBS,
        measurements: [{ pollutant: 'pm25', value: 185, unit: 'ug/m3', observedAt: STALE_OBS }],
      });
      const specificStaleWithFallback = resolveSource(
        {
          version: 1,
          mode: 'specific_station',
          stationId: 'cpcb-stored-5-no-active-coords',
          allowFallbackToModel: true,
        },
        makeMetrics([staleNoActiveCoords, makeCams(DELHI)], DELHI, {
          latitude: undefined as unknown as number,
          longitude: undefined as unknown as number,
          location: undefined,
        }),
        'cpcb',
        NOW_MS
      );
      expect(specificStaleWithFallback.resolutionStatus).toBe('fallback');
      expect(specificStaleWithFallback.isFallback).toBe(true);

      const modalHtml = ReactDOMServer.renderToString(
        <MultiSourceInspectorModal
          isOpen={true}
          onClose={() => {}}
          cityName="Delhi-NCR"
          environmentalSources={[validStationWithStored5, makeCams(DELHI)]}
          metrics={metricsWithoutActiveCoords}
          sourcePreference={{ version: 1, mode: 'specific_station', stationId: 'cpcb-stored-5-no-active-coords' }}
        />
      ).replace(/<!--.*?-->/g, '');
      expect(modalHtml).toContain('Unverified');
      expect(modalHtml).toContain('Distance unverified');
      expect(modalHtml).not.toContain('>5 km<');
      expect(modalHtml).not.toContain('— 5 km');
    });

    it('Rule 1/3/4: handles stored distanceKm=null, zero coordinates (0, 0), invalid coordinates, and exact 35 km / 25 km boundaries', () => {
      // Zero coordinates (Gulf of Guinea equator/prime meridian 0, 0) must remain valid
      const equatorCity = { name: 'Equator', latitude: 0, longitude: 0 };
      const equatorStation = makeCpcb({
        id: 'equator-cpcb',
        latitude: 0,
        longitude: 0,
        distanceKm: 99, // stale stored
      });
      const equatorCheck = verifySourceDistance(
        equatorStation,
        makeMetrics([equatorStation], equatorCity),
        35
      );
      expect(equatorCheck).toEqual({
        isWithinRange: true,
        distanceKm: 0,
        isVerified: true,
        reason: 'valid',
      });

      // Null stored distance uses computed 5 km
      const cpcbNullStored = makeCpcb({ id: 'cpcb-null-dist', ...DEL_5KM, distanceKm: null });
      const resNullStored = resolveSource(
        { version: 1, mode: 'official_ground', allowFallbackToModel: false },
        makeMetrics([cpcbNullStored], DELHI),
        'cpcb',
        NOW_MS
      );
      expect(resNullStored.resolutionStatus).toBe('resolved');
      expect(resNullStored.distanceKm).toBe(5);

      // Invalid station coordinates fail verification cleanly
      expect(verifySourceDistance(makeCpcb({ latitude: NaN, longitude: 77.2 }), makeMetrics([], DELHI), 35).isVerified).toBe(false);
      expect(verifySourceDistance(makeCpcb({ latitude: -91, longitude: 77.2 }), makeMetrics([], DELHI), 35).reason).toBe('invalid_coordinates');
      expect(verifySourceDistance(makeCpcb({ latitude: 28.6, longitude: 181 }), makeMetrics([], DELHI), 35).reason).toBe('invalid_coordinates');

      // Exact boundary inclusion: CPCB 35.0 km and OpenAQ 25.0 km
      const cpcbExact35 = makeCpcb({ id: 'cpcb-exact-35', ...DEL_35KM, distanceKm: 50 }); // stale stored 50 overridden by 35.0!
      const openAqExact25 = makeOpenAq({ id: 'openaq-exact-25', ...DEL_25KM, distanceKm: 40 }); // stale stored 40 overridden by 25.0!

      const cpcbBoundaryRes = resolveSource(
        { version: 1, mode: 'official_ground', allowFallbackToModel: false },
        makeMetrics([cpcbExact35], DELHI),
        'cpcb',
        NOW_MS
      );
      expect(cpcbBoundaryRes.resolutionStatus).toBe('resolved');
      expect(cpcbBoundaryRes.distanceKm).toBe(35);

      const openAqBoundaryRes = resolveSource(
        { version: 1, mode: 'openaq', allowFallbackToModel: false },
        makeMetrics([openAqExact25], DELHI),
        'epa',
        NOW_MS
      );
      expect(openAqBoundaryRes.resolutionStatus).toBe('resolved');
      expect(openAqBoundaryRes.distanceKm).toBe(25);
    });
  });
});
