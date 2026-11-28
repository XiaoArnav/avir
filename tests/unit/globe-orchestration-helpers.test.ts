import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { GeographicObservationPoint } from '@/services/geo/geographic-observation-adapter';
import type { FirmsStatusResponse } from '@/domain/firms-types';
import type { GlobalWindSnapshot, WindForecastResponse } from '@/domain/wind-types';
import * as satelliteImageryService from '@/services/environment/satellite-imagery-service';
import {
  isValidGeographicCoordinate as isValidCoordDirect,
  resolveActiveCityEnvironmentTarget as resolveTargetDirect,
} from '@/components/globe/globe-location-utils';
import {
  buildEnvironmentalLayerStatus,
  mapFirmsStatusToLayerInfo as mapFirmsDirect,
  mapGlobalWindSnapshotToLayerInfo as mapGlobalWindDirect,
  mapWindStatusToLayerInfo as mapWindDirect,
} from '@/components/globe/globe-layer-status';
import {
  fetchActiveCityFirmsLayer as fetchFirmsDirect,
  fetchActiveCityWindLayer as fetchWindDirect,
} from '@/components/globe/globe-layer-fetchers';
import { buildInitialSatelliteComparisonForTarget as buildSatDirect } from '@/components/globe/globe-satellite-comparison';
import {
  buildInitialSatelliteComparisonForTarget,
  fetchActiveCityFirmsLayer,
  fetchActiveCityWindLayer,
  isValidGeographicCoordinate,
  mapFirmsStatusToLayerInfo,
  mapGlobalWindSnapshotToLayerInfo,
  mapWindStatusToLayerInfo,
  resolveActiveCityEnvironmentTarget,
} from '@/components/globe/AvirGlobe';
import * as globeBarrel from '@/components/globe';

const samplePoints: GeographicObservationPoint[] = [
  {
    id: 'pt-delhi',
    name: 'Delhi-NCR',
    country: 'India',
    countryCode: 'IN',
    region: 'Asia',
    latitude: 28.6139,
    longitude: 77.209,
    aqi: 220,
    cpcbAqi: 220,
    usAqi: 185,
    pm25: 100,
    pm10: 160,
    category: 'unhealthy',
    categoryLabel: 'Very Poor',
    categoryColor: '#ef4444',
    primaryPollutant: 'PM2.5',
    provenance: 'modeled_forecast',
    source: 'Open-Meteo',
    timestamp: '2026-11-28T06:00:00Z',
    isOfficialGround: false,
  },
  {
    id: 'pt-invalid',
    name: 'Corrupt Point',
    country: 'Unknown',
    countryCode: 'XX',
    region: 'Global',
    latitude: Number.NaN,
    longitude: 77.2,
    aqi: null,
    cpcbAqi: null,
    usAqi: null,
    pm25: null,
    pm10: null,
    category: 'unavailable',
    categoryLabel: 'Unavailable',
    categoryColor: '#64748B',
    primaryPollutant: 'PM2.5',
    provenance: 'unavailable',
    source: 'None',
    timestamp: '2026-11-28T06:00:00Z',
    isOfficialGround: false,
  },
];

function createWindSnapshot(overrides: Partial<GlobalWindSnapshot> = {}): GlobalWindSnapshot {
  const width = 12;
  const height = 7;
  const count = width * height;
  return {
    manifest: {
      schemaVersion: 2,
      model: 'ifs',
      modelName: 'ECMWF IFS',
      provider: 'ECMWF',
      initTimeUtc: '2026-11-28T00:00:00.000Z',
      validTimeUtc: '2026-11-28T06:00:00.000Z',
      forecastHour: 6,
      retrievedAtUtc: '2026-11-28T06:05:00.000Z',
      grid: {
        width,
        height,
        lo1: 0,
        la1: 90,
        dx: 30,
        dy: 30,
        bounds: { west: -180, south: -90, east: 180, north: 90 },
        resolutionDeg: 30,
        nativeResolutionDeg: 0.25,
      },
      level: '10 m above ground',
      units: 'm/s',
      overlay: 'none',
      scalar: null,
      scalarError: null,
      status: 'available',
      freshness: 'current',
      ageMinutes: 5,
      isAvailable: true,
      isCached: false,
      isStale: false,
      unavailableReason: null,
      attribution: 'ECMWF CAMS',
      license: 'Open Access',
      cycle: { date: '20261128', hour: 0, forecastHour: 6 },
      gridUrl: '/api/environment/wind/global/grid',
    },
    u: new Float32Array(count).fill(5),
    v: new Float32Array(count).fill(5),
    ...overrides,
  };
}

function createWindResponse(overrides: Partial<WindForecastResponse> = {}): WindForecastResponse {
  return {
    status: 'available',
    isAvailable: true,
    isCached: false,
    isStale: false,
    model: 'Open-Meteo GFS',
    modelRunAvailable: true,
    initTimeUtc: '2026-11-28T00:00:00Z',
    validTimeUtc: '2026-11-28T06:00:00Z',
    selectedHour: 12,
    timeResolutionMode: 'utc_instant',
    attribution: 'Open-Meteo',
    units: { speed: 'km/h', vector: 'm/s', direction: 'degrees', height: 'meters' },
    grid: [
      {
        latitude: 28.6139,
        longitude: 77.209,
        u: 3,
        v: 4,
        speedMs: 5,
        speedKmh: 18,
        directionDeg: 217,
        heightM: 10,
      },
    ],
    cityWind: {
      latitude: 28.6139,
      longitude: 77.209,
      u: 3,
      v: 4,
      speedMs: 5,
      speedKmh: 18,
      directionDeg: 217,
      heightM: 10,
    },
    ventilationRating: 'moderate',
    ventilationIndicatorScope: 'wind_speed_only',
    ventilationDescription: 'Moderate',
    uncertaintyDisclosure: 'Uncertainty',
    ...overrides,
  };
}

function createFirmsResponse(overrides: Partial<FirmsStatusResponse> = {}): FirmsStatusResponse {
  return {
    configured: true,
    isAvailable: true,
    isCached: false,
    isStale: false,
    status: 'active',
    message: 'Active detections',
    dataset: 'VIIRS_NOAA20_NRT',
    satellite: 'NOAA-20',
    instrument: 'VIIRS',
    dayRange: 1,
    hotspots: [],
    count: 2,
    retrievedAt: '2026-11-28T06:00:00Z',
    latestObservationUtc: '2026-11-28T05:30:00.000Z',
    disclaimer: 'Disclaimer',
    uncertaintyNotes: 'Notes',
    ...overrides,
  };
}

describe('AvirGlobe Extracted Orchestration Helpers (Step 4)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('preserves exact backward-compatible named re-exports on AvirGlobe and barrel index', () => {
    expect(isValidGeographicCoordinate).toBe(isValidCoordDirect);
    expect(resolveActiveCityEnvironmentTarget).toBe(resolveTargetDirect);
    expect(mapFirmsStatusToLayerInfo).toBe(mapFirmsDirect);
    expect(mapGlobalWindSnapshotToLayerInfo).toBe(mapGlobalWindDirect);
    expect(mapWindStatusToLayerInfo).toBe(mapWindDirect);
    expect(fetchActiveCityWindLayer).toBe(fetchWindDirect);
    expect(fetchActiveCityFirmsLayer).toBe(fetchFirmsDirect);
    expect(buildInitialSatelliteComparisonForTarget).toBe(buildSatDirect);

    expect(globeBarrel.isValidGeographicCoordinate).toBe(isValidCoordDirect);
    expect(globeBarrel.resolveActiveCityEnvironmentTarget).toBe(resolveTargetDirect);
    expect(globeBarrel.mapFirmsStatusToLayerInfo).toBe(mapFirmsDirect);
    expect(globeBarrel.mapGlobalWindSnapshotToLayerInfo).toBe(mapGlobalWindDirect);
    expect(globeBarrel.mapWindStatusToLayerInfo).toBe(mapWindDirect);
    expect(globeBarrel.fetchActiveCityWindLayer).toBe(fetchWindDirect);
    expect(globeBarrel.fetchActiveCityFirmsLayer).toBe(fetchFirmsDirect);
    expect(globeBarrel.buildInitialSatelliteComparisonForTarget).toBe(buildSatDirect);
  });

  describe('Phase 2: Geographic Utilities (globe-location-utils)', () => {
    it('validates boundary coordinates and rejects out-of-range, NaN, infinite, and missing coordinates', () => {
      expect(isValidCoordDirect(0, 0)).toBe(true);
      expect(isValidCoordDirect(-90, 180)).toBe(true);
      expect(isValidCoordDirect(90, -180)).toBe(true);

      expect(isValidCoordDirect(90.01, 0)).toBe(false);
      expect(isValidCoordDirect(-90.01, 0)).toBe(false);
      expect(isValidCoordDirect(0, 180.01)).toBe(false);
      expect(isValidCoordDirect(0, -180.01)).toBe(false);
      expect(isValidCoordDirect(Number.NaN, 77)).toBe(false);
      expect(isValidCoordDirect(28, Number.POSITIVE_INFINITY)).toBe(false);
      expect(isValidCoordDirect(28, Number.NEGATIVE_INFINITY)).toBe(false);
      expect(isValidCoordDirect(undefined, 77)).toBe(false);
      expect(isValidCoordDirect(28, null)).toBe(false);
    });

    it('resolves explicit coordinates first, normalizes whitespace, and returns null instead of guessing', () => {
      expect(
        resolveTargetDirect({
          activeCityName: '  Reykjavik  ',
          activeCityLatitude: 64.1466,
          activeCityLongitude: -21.9426,
          points: samplePoints,
        })
      ).toEqual({ name: 'Reykjavik', latitude: 64.1466, longitude: -21.9426 });

      // Empty city name with valid explicit coordinates resolves to 'Active City'
      expect(
        resolveTargetDirect({
          activeCityName: '   ',
          activeCityLatitude: 12.9716,
          activeCityLongitude: 77.5946,
          points: samplePoints,
        })
      ).toEqual({ name: 'Active City', latitude: 12.9716, longitude: 77.5946 });

      // Matches active-city point case-insensitively with whitespace trimmed
      expect(
        resolveTargetDirect({
          activeCityName: ' delhi-ncr ',
          points: samplePoints,
        })
      ).toEqual({ name: 'delhi-ncr', latitude: 28.6139, longitude: 77.209 });

      // Missing city observation, blank name, partial explicit coords, or corrupt point coords return null
      expect(resolveTargetDirect({ activeCityName: 'Oslo', points: samplePoints })).toBeNull();
      expect(resolveTargetDirect({ activeCityName: '   ', points: samplePoints })).toBeNull();
      expect(
        resolveTargetDirect({ activeCityName: 'Delhi-NCR', activeCityLatitude: 28.6, points: samplePoints })
      ).toBeNull();
      expect(resolveTargetDirect({ activeCityName: 'Corrupt Point', points: samplePoints })).toBeNull();
    });
  });

  describe('Phase 3: Environmental Layer Status (globe-layer-status)', () => {
    it('maps wind, snapshot, and FIRMS statuses accurately', () => {
      const target = { name: 'Delhi-NCR', latitude: 28.6139, longitude: 77.209 };

      expect(mapWindDirect(createWindResponse())).toEqual({
        state: 'live',
        detail: '~18 km/h • 1 GFS/Open-Meteo probes',
      });
      expect(
        mapWindDirect(createWindResponse({ isAvailable: false, unavailableReason: 'Wind offline', grid: [] }))
      ).toEqual({
        state: 'unavailable',
        detail: 'Wind offline',
      });

      const snapshot = createWindSnapshot();
      expect(mapGlobalWindDirect(snapshot, target, 'mph')).toEqual({
        state: 'live',
        detail: '~16 mph • ECMWF IFS 1° forecast',
      });
      expect(
        mapGlobalWindDirect(
          createWindSnapshot({
            u: new Float32Array(0),
            manifest: { ...snapshot.manifest, isAvailable: false, unavailableReason: 'Grid empty' },
          }),
          target
        )
      ).toEqual({
        state: 'unavailable',
        detail: 'Grid empty',
      });

      expect(mapFirmsDirect(createFirmsResponse({ count: 1 }))).toEqual({
        state: 'live',
        detail: '1 thermal anomaly • UTC 05:30',
      });
      expect(
        mapFirmsDirect(createFirmsResponse({ isAvailable: false, status: 'invalid_credentials', count: 0 }))
      ).toEqual({
        state: 'unavailable',
        detail: 'NASA FIRMS credential rejected',
      });
      expect(
        mapFirmsDirect(createFirmsResponse({ isAvailable: false, status: 'upstream_error', message: '', count: 0 }))
      ).toEqual({
        state: 'unavailable',
        detail: 'NASA FIRMS telemetry unavailable',
      });
    });

    it('computes complete EnvironmentalLayersStatusMap across all terrain, engine, wind, fires, and satellite states', () => {
      const windLoading = { state: 'loading' as const, detail: 'Fetching NOAA GFS global wind grid...' };
      const windAvail = { state: 'live' as const, detail: '~18 km/h • NOAA GFS 1° forecast' };
      const windFail = { state: 'unavailable' as const, detail: 'Wind telemetry network error' };
      const firesLive = { state: 'live' as const, detail: '2 thermal anomalies • UTC 05:30' };
      const firesUnavail = { state: 'unavailable' as const, detail: 'NASA FIRMS network error' };
      const satSwath = { state: 'live' as const, detail: '2026-11-22 vs 2026-11-28 • Swath Verified' };

      // 1-4, 7-9, 12, 13: CesiumJS + terrain disabled -> loading -> active + wind/fires/satellite propagation
      expect(
        buildEnvironmentalLayerStatus({
          is3D: true,
          engineMode: 'cesium',
          isTerrainEnabled: false,
          terrainLoadState: 'off',
          windInfo: windLoading,
          firesInfo: firesLive,
          satelliteInfo: satSwath,
        })
      ).toEqual({
        wind: windLoading,
        fires: firesLive,
        terrain: { state: 'off', detail: 'Re:Earth Quantized Mesh' },
        satelliteComparison: satSwath,
      });

      expect(
        buildEnvironmentalLayerStatus({
          is3D: true,
          engineMode: 'cesium',
          isTerrainEnabled: true,
          terrainLoadState: 'loading',
          windInfo: windAvail,
          firesInfo: firesLive,
          satelliteInfo: satSwath,
        }).terrain
      ).toEqual({ state: 'loading', detail: 'Loading Re:Earth terrain...' });

      expect(
        buildEnvironmentalLayerStatus({
          is3D: true,
          engineMode: 'cesium',
          isTerrainEnabled: true,
          terrainLoadState: 'active',
          windInfo: windAvail,
          firesInfo: firesUnavail,
          satelliteInfo: satSwath,
        })
      ).toEqual({
        wind: windAvail,
        fires: firesUnavail,
        terrain: { state: 'live', detail: 'Re:Earth Quantized Mesh active' },
        satelliteComparison: satSwath,
      });

      // 10: CesiumJS terrain fallback
      expect(
        buildEnvironmentalLayerStatus({
          is3D: true,
          engineMode: 'cesium',
          isTerrainEnabled: true,
          terrainLoadState: 'fallback',
          windInfo: windFail,
          firesInfo: firesUnavail,
          satelliteInfo: { state: 'unavailable', detail: 'Imagery unavailable' },
        }).terrain
      ).toEqual({ state: 'unavailable', detail: 'Terrain failed — ellipsoid active' });

      // 11: Three.js mode (terrain always unsupported, even if terrainLoadState/isTerrainEnabled are set)
      expect(
        buildEnvironmentalLayerStatus({
          is3D: true,
          engineMode: 'three',
          isTerrainEnabled: true,
          terrainLoadState: 'active',
          windInfo: windAvail,
          firesInfo: firesLive,
          satelliteInfo: { state: 'off', detail: 'NASA GIBS Reflectance' },
        }).terrain
      ).toEqual({ state: 'unsupported', detail: 'Cesium Engine Only' });

      // 2D Accessible fallback (!is3D)
      expect(
        buildEnvironmentalLayerStatus({
          is3D: false,
          engineMode: 'cesium',
          isTerrainEnabled: true,
          terrainLoadState: 'active',
          windInfo: { state: 'unsupported', detail: 'Available in 3D Globe Mode' },
          firesInfo: { state: 'unsupported', detail: 'Available in 3D Globe Mode' },
          satelliteInfo: { state: 'global_date_listed', detail: 'Global GIBS dates listed (local swath unverified)' },
        })
      ).toEqual({
        wind: { state: 'unsupported', detail: 'Available in 3D Globe Mode' },
        fires: { state: 'unsupported', detail: 'Available in 3D Globe Mode' },
        terrain: { state: 'unsupported', detail: 'Cesium Engine Only' },
        satelliteComparison: {
          state: 'global_date_listed',
          detail: 'Global GIBS dates listed (local swath unverified)',
        },
      });
    });
  });

  describe('Phase 4: Environmental Fetch Helpers (globe-layer-fetchers)', () => {
    const target = { name: 'Delhi-NCR', latitude: 28.6139, longitude: 77.209 };

    it('handles valid Wind and FIRMS responses, empty payloads, HTTP errors, rate limits, aborts, network errors, and missing target', async () => {
      const requestedUrls: string[] = [];
      const mockWind = createWindResponse();
      const mockFirms = createFirmsResponse({
        hotspots: [
          {
            id: 'firms-1',
            latitude: 28.7,
            longitude: 77.2,
            brightness: 345,
            scan: 0.4,
            track: 0.4,
            acqDate: '2026-11-28',
            acqTime: '0530',
            observedAtUtc: '2026-11-28T05:30:00.000Z',
            satellite: 'NOAA-20',
            instrument: 'VIIRS',
            confidence: 'nominal',
            version: '2.0NRT',
            frp: 15,
            daynight: 'D',
            sourceDataset: 'VIIRS_NOAA20_NRT',
            provider: 'NASA FIRMS / LANCE / EOSDIS',
          },
        ],
      });

      vi.stubGlobal(
        'fetch',
        vi
          .fn(async (input: RequestInfo | URL) => {
            requestedUrls.push(String(input));
            return new Response(JSON.stringify(mockWind), { status: 200 });
          })
          .mockImplementationOnce(async (input: RequestInfo | URL) => {
            requestedUrls.push(String(input));
            return new Response(JSON.stringify(mockWind), { status: 200 });
          })
          .mockImplementationOnce(async () => new Response(JSON.stringify({ ...mockWind, grid: [] }), { status: 200 }))
          .mockImplementationOnce(async () => new Response('HTTP Error', { status: 502 }))
          .mockImplementationOnce(async () => new Response('Rate Limited', { status: 429 }))
          .mockImplementationOnce(async () => new Response('not-json', { status: 200 }))
          .mockImplementationOnce(async () => {
            throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
          })
          .mockImplementationOnce(async (input: RequestInfo | URL) => {
            requestedUrls.push(String(input));
            return new Response(JSON.stringify(mockFirms), { status: 200 });
          })
          .mockImplementationOnce(async () =>
            new Response(JSON.stringify({ ...mockFirms, status: 'no_detections', hotspots: [], count: 0 }), {
              status: 200,
            })
          )
          .mockImplementationOnce(async () => new Response('Rate Limited', { status: 429 }))
          .mockImplementationOnce(async () => new Response('Gateway Timeout', { status: 504 }))
          .mockImplementationOnce(async () => {
            throw new Error('ECONNRESET');
          })
          .mockImplementationOnce(async () => {
            throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
          })
      );

      // Missing target makes zero network requests
      expect(await fetchWindDirect({ target: null })).toEqual({
        data: [],
        info: { state: 'unavailable', detail: 'Active city coordinates unavailable' },
      });
      expect(await fetchFirmsDirect({ target: null })).toEqual({
        data: [],
        info: { state: 'unavailable', detail: 'Active city coordinates unavailable' },
      });

      const windOk = await fetchWindDirect({ target, validAtUtc: '2026-11-28T06:00:00Z' });
      expect(requestedUrls[0]).toContain('/api/environment/wind?lat=28.6139&lng=77.209');
      expect(requestedUrls[0]).toContain('validTimeUtc=2026-11-28T06%3A00%3A00.000Z');
      expect(requestedUrls[0]).toContain('hour=6');
      expect(windOk.info).toEqual({ state: 'live', detail: '~18 km/h • 1 GFS/Open-Meteo probes' });
      expect(windOk.data).toHaveLength(1);

      expect(await fetchWindDirect({ target, selectedHour: 14 })).toEqual({
        data: [],
        info: { state: 'unavailable', detail: 'Wind vector telemetry unavailable' },
      });
      expect(await fetchWindDirect({ target })).toEqual({
        data: [],
        info: { state: 'unavailable', detail: 'Wind API returned HTTP 502' },
      });
      expect(await fetchWindDirect({ target })).toEqual({
        data: [],
        info: { state: 'rate_limited', detail: 'Wind forecast rate limited' },
      });
      expect(await fetchWindDirect({ target })).toEqual({
        data: [],
        info: { state: 'unavailable', detail: 'Wind telemetry network error' },
      });
      expect(await fetchWindDirect({ target })).toEqual({
        aborted: true,
        data: [],
        info: { state: 'loading', detail: 'Aborted' },
      });

      const firmsOk = await fetchFirmsDirect({ target, radiusKm: 300 });
      expect(requestedUrls[1]).toBe('/api/environment/fires?lat=28.6139&lng=77.209&radiusKm=300');
      expect(firmsOk.info).toEqual({ state: 'live', detail: '2 thermal anomalies • UTC 05:30' });
      expect(firmsOk.data).toHaveLength(1);

      expect(await fetchFirmsDirect({ target })).toEqual({
        data: [],
        info: {
          state: 'no_detections',
          detail: '0 detections within 500 km (clouds/off-pass not excluded)',
        },
      });
      expect(await fetchFirmsDirect({ target })).toEqual({
        data: [],
        info: { state: 'rate_limited', detail: 'Fires API rate limit exceeded' },
      });
      expect(await fetchFirmsDirect({ target })).toEqual({
        data: [],
        info: { state: 'unavailable', detail: 'FIRMS API returned HTTP 504' },
      });
      expect(await fetchFirmsDirect({ target })).toEqual({
        data: [],
        info: { state: 'unavailable', detail: 'NASA FIRMS network error' },
      });
      expect(await fetchFirmsDirect({ target })).toEqual({
        aborted: true,
        data: [],
        info: { state: 'loading', detail: 'Aborted' },
      });
    });

    it('detects pre-aborted AbortSignal immediately after fetch resolves', async () => {
      const controller = new AbortController();
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          controller.abort();
          return new Response(JSON.stringify(createWindResponse()), { status: 200 });
        })
      );

      expect(
        await fetchWindDirect({
          target: { name: 'Delhi', latitude: 28.61, longitude: 77.21 },
          signal: controller.signal,
        })
      ).toEqual({
        aborted: true,
        data: [],
        info: { state: 'loading', detail: 'Aborted' },
      });
    });
  });

  describe('Phase 5: Satellite Comparison Preparation (globe-satellite-comparison)', () => {
    it('constructs initial unverified VIIRS comparison for valid target and rejects invalid/missing dates', () => {
      const target = { name: 'Delhi-NCR', latitude: 28.6139, longitude: 77.209 };
      const valid = buildSatDirect(target);
      expect(valid.error).toBeNull();
      expect(valid.comparison?.city).toBe('Delhi-NCR');
      expect(valid.comparison?.slotA.productId).toBe('VIIRS');
      expect(valid.comparison?.slotB.productId).toBe('VIIRS');
      expect(valid.info.state).toBe('unverified');
      expect(valid.dateA).toBeTruthy();
      expect(valid.dateB).toBeTruthy();

      expect(buildSatDirect(null)).toEqual({
        comparison: null,
        error: 'Satellite imagery comparison requires valid active city coordinates.',
        info: { state: 'unavailable', detail: 'Active city coordinates unavailable' },
      });

      vi.spyOn(satelliteImageryService, 'getAvailableImageryDates').mockReturnValueOnce([]);
      expect(buildSatDirect(target)).toEqual({
        comparison: null,
        error: 'No candidate NASA GIBS dates available.',
        info: { state: 'unavailable', detail: 'No candidate dates' },
      });

      vi.spyOn(satelliteImageryService, 'getAvailableImageryDates').mockImplementationOnce(() => {
        throw new Error('Malformed GIBS date range');
      });
      expect(buildSatDirect(target)).toEqual({
        comparison: null,
        error: 'Malformed GIBS date range',
        info: { state: 'unavailable', detail: 'Malformed GIBS date range' },
      });
    });
  });
});
