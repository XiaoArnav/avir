import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { ThreeWindLayer } from '@/components/globe/three-wind-layer';
import { ThreeFireLayer } from '@/components/globe/three-fire-layer';
import { parseFirmsCsv } from '@/domain/firms-types';
import type { WindVectorPoint } from '@/domain/wind-types';
import {
  buildSatelliteComparison,
  getAvailableImageryDates,
  verifyImageryAvailability,
} from '@/services/environment/satellite-imagery-service';
import {
  buildInitialSatelliteComparisonForTarget,
  fetchActiveCityFirmsLayer,
  fetchActiveCityWindLayer,
  resolveActiveCityEnvironmentTarget,
} from '@/components/globe/AvirGlobe';
import type { GeographicObservationPoint } from '@/services/geo/geographic-observation-adapter';

describe('Phase 7 Integration: Environmental Layers Runtime Behavior & Cleanup', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('drives real ThreeWindLayer particle lifecycle: hidden on init, active on valid vectors, hidden when OFF, zero leaks on dispose', () => {
    const globeGroup = new THREE.Group();
    const windLayer = new ThreeWindLayer(globeGroup, { radius: 90.35, particleCount: 50 });

    const pointsMesh = globeGroup.children[0] as THREE.Points;
    expect(pointsMesh).toBeDefined();
    expect(pointsMesh.visible).toBe(false);
    expect(windLayer.getActiveVectorCount()).toBe(0);

    // Turning ON with valid vectors activates particles and advects them smoothly
    const vectors: WindVectorPoint[] = [
      {
        latitude: 28.6139,
        longitude: 77.209,
        u: 4.5,
        v: 2.0,
        speedMs: 4.92,
        speedKmh: 17.7,
        directionDeg: 246,
        heightM: 10,
      },
    ];
    windLayer.setVisible(true);
    windLayer.setWindVectors(vectors);
    expect(pointsMesh.visible).toBe(true);
    expect(windLayer.getActiveVectorCount()).toBe(1);

    const posAttr = pointsMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const beforeSnapshot = Float32Array.from(posAttr.array as Float32Array);
    windLayer.update(0.05);
    const afterSnapshot = posAttr.array as Float32Array;
    const moved = beforeSnapshot.some((val, idx) => val !== afterSnapshot[idx]);
    expect(moved).toBe(true);

    // Turning OFF clears vectors & hides mesh cleanly
    windLayer.setVisible(false);
    windLayer.setWindVectors([]);
    expect(pointsMesh.visible).toBe(false);
    expect(windLayer.getActiveVectorCount()).toBe(0);

    // Disposing removes mesh from globeGroup with zero leaks
    windLayer.dispose();
    expect(globeGroup.children).toHaveLength(0);
    expect(() => windLayer.update(0.05)).not.toThrow();
  });

  it('drives real ThreeFireLayer lifecycle: displays real FIRMS hotspots only, removes meshes when OFF, cleans up on dispose', () => {
    const globeGroup = new THREE.Group();
    const fireLayer = new ThreeFireLayer(globeGroup, { radius: 90.25 });

    expect(fireLayer.getHotspotCount()).toBe(0);
    const fireGroup = globeGroup.children[0] as THREE.Group;
    expect(fireGroup.children).toHaveLength(0);

    const hotspots = parseFirmsCsv(`latitude,longitude,bright_ti4,acq_date,acq_time,satellite,instrument,frp
28.62,77.21,345.2,2026-11-24,0830,2,VIIRS,14.5
28.95,76.85,362.8,2026-11-24,0830,2,VIIRS,62.0`);

    fireLayer.setVisible(true);
    fireLayer.setHotspots(hotspots);
    expect(fireLayer.getHotspotCount()).toBe(2);
    expect(fireGroup.children).toHaveLength(4); // 2 cores + 2 rings

    // Toggling OFF detaches all rendered hotspots cleanly
    fireLayer.setVisible(false);
    fireLayer.clear();
    expect(fireLayer.getHotspotCount()).toBe(0);
    expect(fireGroup.children).toHaveLength(0);

    // Disposing detaches group completely
    fireLayer.dispose();
    expect(globeGroup.children).toHaveLength(0);
  });

  it('preserves NASA GIBS candidate vs global_date_listed vs regional-unverified distinction without inventing observations', async () => {
    const refNow = new Date('2026-11-25T05:00:00Z');
    const candidates = getAvailableImageryDates(7, { product: 'VIIRS', referenceNow: refNow });
    expect(candidates).toHaveLength(7);
    expect(candidates.every((c) => c.availability === 'unverified')).toBe(true);

    const dateB = candidates[0].date;
    const dateA = candidates[candidates.length - 1].date;
    const initial = buildSatelliteComparison({
      city: 'Delhi-NCR',
      latitude: 28.6139,
      longitude: 77.209,
      dateA,
      dateB,
      productA: 'VIIRS',
      productB: 'VIIRS',
      referenceNow: refNow,
    });
    expect(initial.slotA.availability).toBe('unverified');
    expect(initial.slotA.verifiedAcquisitionDate).toBeNull();

    const gibsCheck = await verifyImageryAvailability({
      product: 'VIIRS',
      date: dateB,
      bbox: initial.coverageExtent,
      referenceNow: refNow,
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          `<DimensionDomain><ows:Identifier>time</ows:Identifier><Domain>2026-01-01/${dateB}/P1D</Domain></DimensionDomain>`,
      }) as any,
    });

    // Global GIBS date listed NEVER promotes verifiedObservationDate or regionalCoverageVerified
    expect(gibsCheck.availability).toBe('global_date_listed');
    expect(gibsCheck.globalDateListed).toBe(true);
    expect(gibsCheck.regionalCoverageVerified).toBe(false);
    expect(gibsCheck.verifiedObservationDate).toBeNull();
  });

  it('sends Wind, FIRMS, and NASA GIBS requests for actual active city coordinates even when absent from points or inspecting another marker', async () => {
    const globePoints: GeographicObservationPoint[] = [
      {
        id: 'pt-beijing',
        name: 'Beijing',
        country: 'China',
        countryCode: 'CN',
        region: 'Asia',
        latitude: 39.9042,
        longitude: 116.4074,
        aqi: 145,
        cpcbAqi: 145,
        usAqi: 135,
        pm25: 50,
        pm10: 85,
        category: 'moderate',
        categoryLabel: 'Moderate',
        categoryColor: '#eab308',
        primaryPollutant: 'PM2.5',
        provenance: 'modeled_forecast',
        source: 'Open-Meteo',
        timestamp: '2026-11-24T12:00:00Z',
        isOfficialGround: false,
      },
    ];

    const target = resolveActiveCityEnvironmentTarget({
      activeCityName: 'Reykjavik',
      activeCityLatitude: 64.1466,
      activeCityLongitude: -21.9426,
      points: globePoints,
    });

    expect(target).toEqual({
      name: 'Reykjavik',
      latitude: 64.1466,
      longitude: -21.9426,
    });

    const requestedUrls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url.startsWith('/api/environment/wind')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              status: 'available',
              isAvailable: true,
              isCached: false,
              isStale: false,
              grid: [
                {
                  latitude: 64.1466,
                  longitude: -21.9426,
                  u: 4.1,
                  v: 1.2,
                  speedMs: 4.27,
                  speedKmh: 15.4,
                  directionDeg: 254,
                  heightM: 10,
                },
              ],
              cityWind: {
                latitude: 64.1466,
                longitude: -21.9426,
                u: 4.1,
                v: 1.2,
                speedMs: 4.27,
                speedKmh: 15.4,
                directionDeg: 254,
                heightM: 10,
              },
            }),
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            configured: true,
            isAvailable: true,
            isCached: false,
            isStale: false,
            status: 'no_detections',
            message: 'No thermal anomalies detected',
            count: 0,
            hotspots: [],
            latestObservationUtc: null,
          }),
        } as Response;
      })
    );

    const windResult = await fetchActiveCityWindLayer({ target, selectedHour: 14 });
    const firmsResult = await fetchActiveCityFirmsLayer({ target });
    const gibsResult = buildInitialSatelliteComparisonForTarget(target);

    expect(requestedUrls).toHaveLength(2);
    const windParams = new URL(requestedUrls[0], 'http://localhost').searchParams;
    const firmsParams = new URL(requestedUrls[1], 'http://localhost').searchParams;

    expect(windParams.get('lat')).toBe('64.1466');
    expect(windParams.get('lng')).toBe('-21.9426');
    expect(windResult.info.state).toBe('live');
    expect(windResult.data).toHaveLength(1);

    expect(firmsParams.get('lat')).toBe('64.1466');
    expect(firmsParams.get('lng')).toBe('-21.9426');
    expect(firmsParams.get('radiusKm')).toBe('500');
    expect(firmsResult.info.state).toBe('no_detections');

    expect(gibsResult.comparison?.city).toBe('Reykjavik');
    expect(gibsResult.comparison?.coordinates.lat).toBe(64.1466);
    expect(gibsResult.comparison?.coordinates.lng).toBe(-21.9426);
    expect(gibsResult.error).toBeNull();
  });

  it('aborts with honest unavailable state and sends zero Wind, FIRMS, or GIBS requests when valid active-city coordinates are missing or invalid', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const invalidTarget = resolveActiveCityEnvironmentTarget({
      activeCityName: 'Delhi-NCR',
      activeCityLatitude: Number.NaN,
      activeCityLongitude: 77.209,
      points: [
        {
          id: 'pt-delhi',
          name: 'Delhi-NCR',
          country: 'India',
          countryCode: 'IN',
          region: 'Asia',
          latitude: 28.6139,
          longitude: 77.209,
          aqi: 200,
          cpcbAqi: 200,
          usAqi: 170,
          pm25: 90,
          pm10: 135,
          category: 'unhealthy',
          categoryLabel: 'Unhealthy',
          categoryColor: '#ef4444',
          primaryPollutant: 'PM2.5',
          provenance: 'modeled_forecast',
          source: 'Open-Meteo',
          timestamp: '2026-11-24T12:00:00Z',
          isOfficialGround: false,
        },
      ],
    });

    expect(invalidTarget).toBeNull();

    const windResult = await fetchActiveCityWindLayer({ target: invalidTarget });
    const firmsResult = await fetchActiveCityFirmsLayer({ target: invalidTarget });
    const gibsResult = buildInitialSatelliteComparisonForTarget(invalidTarget);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(windResult).toEqual({
      data: [],
      info: { state: 'unavailable', detail: 'Active city coordinates unavailable' },
    });
    expect(firmsResult).toEqual({
      data: [],
      info: { state: 'unavailable', detail: 'Active city coordinates unavailable' },
    });
    expect(gibsResult).toEqual({
      comparison: null,
      error: 'Satellite imagery comparison requires valid active city coordinates.',
      info: { state: 'unavailable', detail: 'Active city coordinates unavailable' },
    });
  });
});
