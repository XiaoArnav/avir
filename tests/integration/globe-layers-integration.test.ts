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

describe('Phase 7 Integration: Environmental Layers Runtime Behavior & Cleanup', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
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
});
