import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import {
  FIRMS_SCIENTIFIC_DISCLAIMER,
  filterHotspotsNearCoordinates,
  haversineDistanceKm,
  parseFirmsCsv,
  parseFirmsCsvDetailed,
} from '@/domain/firms-types';
import {
  clearFirmsCache,
  computeFirmsBoundingBoxes,
  fetchFirmsHotspots,
  selectPublicFirmsRegions,
} from '@/services/environment/firms-service';
import { ThreeFireLayer, classifySpotVisualization } from '@/components/globe/three-fire-layer';

describe('NASA FIRMS Active-Fire Hotspots Service, Parser, Physics & Layer (Phase 4)', () => {
  const sampleViirsCsv = `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight\r
28.62,77.21,345.2,0.38,0.36,2026-11-24,0830,2,VIIRS,n,2.0NRT,295.4,14.5,D\r
28.95,76.85,362.8,0.42,0.38,2026-11-24,0830,N20,VIIRS,h,2.0NRT,301.2,42.8,D\r
12.98,77.60,312.0,0.50,0.40,2026-11-24,0830,NOAA-20,VIIRS,l,2.0NRT,290.0,5.2,N\r
`;

  beforeEach(() => {
    clearFirmsCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('parses NASA FIRMS VIIRS CSV with CRLF, trailing newline, satellite normalization, and timestamps', () => {
    const detailed = parseFirmsCsvDetailed(sampleViirsCsv, 'NOAA-20', 'VIIRS', 'VIIRS_NOAA20_NRT');
    expect(detailed.isValidCsv).toBe(true);
    expect(detailed.hotspots).toHaveLength(3);

    const first = detailed.hotspots[0];
    expect(first.latitude).toBe(28.62);
    expect(first.longitude).toBe(77.21);
    expect(first.brightness).toBe(345.2);
    expect(first.scan).toBe(0.38);
    expect(first.track).toBe(0.36);
    expect(first.frp).toBe(14.5);
    expect(first.confidence).toBe('nominal');
    expect(first.satellite).toBe('NOAA-20');
    expect(first.instrument).toBe('VIIRS');
    expect(first.acqDate).toBe('2026-11-24');
    expect(first.acqTime).toBe('0830');
    expect(first.observedAtUtc).toBe('2026-11-24T08:30:00.000Z');
    expect(first.daynight).toBe('D');
    expect(first.sourceDataset).toBe('VIIRS_NOAA20_NRT');
    expect(first.provider).toBe('NASA FIRMS / LANCE / EOSDIS');

    expect(detailed.hotspots[1].confidence).toBe('high');
    expect(detailed.hotspots[2].confidence).toBe('low');
    expect(detailed.hotspots[2].daynight).toBe('N');
  });

  it('parses reordered CSV columns and quoted fields accurately', () => {
    const reorderedCsv = `"daynight","frp","acq_time","longitude","confidence","acq_date","latitude","satellite","bright_ti4"
"N","61.4","1415","77.5946","h","2026-11-24","12.9716","NOAA-20","358.1"`;

    const parsed = parseFirmsCsv(reorderedCsv, 'NOAA-20', 'VIIRS');
    expect(parsed).toHaveLength(1);
    expect(parsed[0].latitude).toBe(12.9716);
    expect(parsed[0].longitude).toBe(77.5946);
    expect(parsed[0].brightness).toBe(358.1);
    expect(parsed[0].frp).toBe(61.4);
    expect(parsed[0].confidence).toBe('high');
    expect(parsed[0].observedAtUtc).toBe('2026-11-24T14:15:00.000Z');
  });

  it('leaves missing or invalid optional fields (brightness, scan, track, frp, confidence) as null without fabricating constants', () => {
    const csvWithMissingOptional = `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,frp,daynight
28.62,77.21,,0.4bad,-1,2026-11-24,0830,NOAA-20,VIIRS,,,
28.63,77.22,330abc,,,2026-11-24,0945,NOAA-20,VIIRS,invalid,,X`;

    const parsed = parseFirmsCsv(csvWithMissingOptional, 'NOAA-20', 'VIIRS');
    expect(parsed).toHaveLength(2);

    // Must never invent brightness=300, scan=1.0, track=1.0, confidence='nominal', daynight='D', or frp=10
    for (const spot of parsed) {
      expect(spot.brightness).toBeNull();
      expect(spot.scan).toBeNull();
      expect(spot.track).toBeNull();
      expect(spot.frp).toBeNull();
      expect(spot.confidence).toBeNull();
      expect(spot.daynight).toBeNull();
    }
  });

  it('rejects rows missing required coordinates/dates/times or with invalid calendar dates/times', () => {
    const badRowsCsv = `latitude,longitude,bright_ti4,acq_date,acq_time
,77.21,340,2026-11-24,0830
28.62,77.21,340,2026-02-30,0830
28.62,77.21,340,2026-11-24,2599
28.62abc,77.21,340,2026-11-24,0830
28.62,77.21,340,2026-11-24,0830`;

    const detailed = parseFirmsCsvDetailed(badRowsCsv);
    expect(detailed.isValidCsv).toBe(true);
    expect(detailed.rejectedRowCount).toBe(4);
    expect(detailed.hotspots).toHaveLength(1);
  });

  it('distinguishes empty valid CSV (zero detections) from malformed CSV responses', () => {
    const emptyValid =
      'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,frp,daynight\n';
    const emptyRes = parseFirmsCsvDetailed(emptyValid);
    expect(emptyRes.isValidCsv).toBe(true);
    expect(emptyRes.hotspots).toHaveLength(0);

    const htmlError = parseFirmsCsvDetailed('<html><body>502 Bad Gateway</body></html>');
    expect(htmlError.isValidCsv).toBe(false);

    const corruptRows = parseFirmsCsvDetailed(
      'latitude,longitude,acq_date,acq_time\nbad,row,only\n200,400,2026-13-45,9999'
    );
    expect(corruptRows.isValidCsv).toBe(false);
  });

  it('computes accurate Haversine great-circle distances including zero distance, boundary, high latitudes, and date line crossings', () => {
    // Zero distance
    expect(haversineDistanceKm(28.6139, 77.209, 28.6139, 77.209)).toBe(0);

    // Equator ~1 deg longitude ≈ 111.2 km
    const eqDist = haversineDistanceKm(0, 0, 0, 1);
    expect(eqDist).toBeGreaterThan(110.5);
    expect(eqDist).toBeLessThan(111.5);

    // Date line crossing: +179.9 to -179.9 at equator (~0.2 deg ≈ 22.24 km, NOT 359.8 deg!)
    const idlDist = haversineDistanceKm(0, 179.9, 0, -179.9);
    expect(idlDist).toBeGreaterThan(21);
    expect(idlDist).toBeLessThan(23);

    // High latitude: 75°N, 1 deg longitude ≈ 111.2 * cos(75°) ≈ 28.8 km
    const arcticDist = haversineDistanceKm(75, 10, 75, 11);
    expect(arcticDist).toBeGreaterThan(28);
    expect(arcticDist).toBeLessThan(30);

    // Exact boundary inclusion check with date-line hotspot
    const spots = parseFirmsCsv(
      `latitude,longitude,bright_ti4,acq_date,acq_time
0,179.9,340,2026-11-24,0100
0,150.0,340,2026-11-24,0100`
    );
    const filtered = filterHotspotsNearCoordinates(spots, 0, -179.9, 50);
    expect(filtered.count).toBe(1);
    expect(filtered.nearestKm).toBeCloseTo(22.2, 0);
  });

  it('constructs latitude-aware spherical bounding boxes and splits international date line queries without duplication', () => {
    // High latitude (75° N, r=200km): longitude span must expand significantly beyond ~1.8° latitude span
    const highLatBoxes = computeFirmsBoundingBoxes(75, 10, 200);
    expect(highLatBoxes).toHaveLength(1);
    const [w, s, e, n] = highLatBoxes[0].split(',').map(Number);
    expect(e - w).toBeGreaterThan((n - s) * 2.5);

    // Date line crossing (0° N, 179.5° E, r=200km): splits cleanly into 2 valid non-wrapping boxes
    const idlBoxes = computeFirmsBoundingBoxes(0, 179.5, 200);
    expect(idlBoxes).toHaveLength(2);
    for (const box of idlBoxes) {
      const [bw, bs, be, bn] = box.split(',').map(Number);
      expect(bw).toBeGreaterThanOrEqual(-180);
      expect(be).toBeLessThanOrEqual(180);
      expect(bw).toBeLessThanOrEqual(be);
      expect(bs).toBeLessThan(bn);
    }
  });

  it('uses official keyless NASA FIRMS 24h regional CSV archive when FIRMS_MAP_KEY is absent, and still returns explicit unconfigured when public fallback is disabled', async () => {
    expect(selectPublicFirmsRegions(28.6139, 77.209, 500)).toEqual(['South_Asia']);
    expect(selectPublicFirmsRegions(39.9042, 116.4074, 500)).toEqual(['Russia_Asia']);
    expect(selectPublicFirmsRegions(51.5074, -0.1278, 300)).toEqual(['Europe']);

    const keylessActive = await fetchFirmsHotspots({
      latitude: 28.6139,
      longitude: 77.209,
      radiusKm: 500,
      apiKey: '',
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => sampleViirsCsv,
      }) as any,
    });
    expect(keylessActive.configured).toBe(false);
    expect(keylessActive.isAvailable).toBe(true);
    expect(keylessActive.status).toBe('active');
    expect(keylessActive.dataset).toBe('VIIRS_NOAA20_C2_24H');
    expect(keylessActive.count).toBe(2);

    const explicitUnconfigured = await fetchFirmsHotspots({
      latitude: 28.61,
      longitude: 77.21,
      apiKey: '',
      allowPublicArchive: false,
    });

    expect(explicitUnconfigured.configured).toBe(false);
    expect(explicitUnconfigured.isAvailable).toBe(false);
    expect(explicitUnconfigured.status).toBe('unconfigured');
    expect(explicitUnconfigured.count).toBe(0);
    expect(explicitUnconfigured.hotspots).toHaveLength(0);
    expect(explicitUnconfigured.message).toContain('FIRMS_MAP_KEY is not configured');
    expect(explicitUnconfigured.disclaimer).toBe(FIRMS_SCIENTIFIC_DISCLAIMER);
  });

  it('preserves ThreeFireLayer unknown-FRP visual distinction, world-space occlusion, and clean GPU disposal', () => {
    // Classification checks without fabricated FRP=10
    expect(classifySpotVisualization(null)).toEqual({
      category: 'unknown_frp',
      color: 0xfbbf24,
      frpMeasured: false,
    });
    expect(classifySpotVisualization(25)).toEqual({
      category: 'measured_frp_visual',
      color: 0xf97316,
      frpMeasured: true,
    });
    expect(classifySpotVisualization(75)).toEqual({
      category: 'elevated_frp_visual',
      color: 0xef4444,
      frpMeasured: true,
    });

    const parent = new THREE.Group();
    const layer = new ThreeFireLayer(parent);
    const hotspots = parseFirmsCsv(`latitude,longitude,bright_ti4,acq_date,acq_time,frp
0,0,340,2026-11-24,0830,
0,10,355,2026-11-24,0830,85`);

    layer.setHotspots(hotspots);
    expect(layer.getHotspotCount()).toBe(2);

    const fireGroup = parent.children[0] as THREE.Group;
    expect(fireGroup.children).toHaveLength(4); // 2 cores + 2 rings
    expect(fireGroup.children[0].userData.frpMeasured).toBe(false);
    expect(fireGroup.children[0].userData.visualCategory).toBe('unknown_frp');
    expect(fireGroup.children[2].userData.frpMeasured).toBe(true);
    expect(fireGroup.children[2].userData.visualCategory).toBe('elevated_frp_visual');

    // Rotate globe group 180 deg so front spots face away from camera (+Z) -> occlusion hides them
    parent.rotation.y = Math.PI;
    parent.updateMatrixWorld(true);
    layer.update(new THREE.Vector3(0, 0, 260), 1.0);
    expect(fireGroup.children.every((c) => !c.visible)).toBe(true);

    // Clear detaches all child meshes properly with zero stale parent refs
    const detachedChild = fireGroup.children[0];
    layer.clear();
    expect(fireGroup.children).toHaveLength(0);
    expect(detachedChild.parent).toBeNull();
    expect(layer.getHotspotCount()).toBe(0);

    // Dispose detaches fireGroup and survives extra calls
    layer.dispose();
    expect(parent.children).toHaveLength(0);
    expect(() => layer.update(new THREE.Vector3(0, 0, 260), 2.0)).not.toThrow();
  });

  it('contains mandatory scientific disclaimer preventing false wildfire or smoke-causality claims', () => {
    expect(FIRMS_SCIENTIFIC_DISCLAIMER).toContain(
      'Satellite thermal detections do not constitute verified wildfire incidents'
    );
    expect(FIRMS_SCIENTIFIC_DISCLAIMER).toContain(
      'proximity alone does not prove smoke transport'
    );
  });
});
