import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { calculateWindUV, getVentilationRating } from '@/domain/wind-types';
import { ThreeWindLayer } from '@/components/globe/three-wind-layer';

describe('Global Wind-Flow Physics, Ventilation & ThreeWindLayer (Phase 3)', () => {
  it('calculates correct U and V Cartesian vector components for cardinal directions', () => {
    // North wind (0° / 360°): blowing FROM north, so vector moves south (u = 0, v < 0)
    const northWind = calculateWindUV(36, 0); // 36 km/h = 10 m/s
    expect(northWind.speedMs).toBe(10);
    expect(northWind.u).toBeCloseTo(0, 2);
    expect(northWind.v).toBeCloseTo(-10, 2);

    const north360 = calculateWindUV(36, 360);
    expect(north360.u).toBe(0);
    expect(north360.v).toBe(-10);

    // East wind (90°): blowing FROM east, so vector moves west (u < 0, v = 0)
    const eastWind = calculateWindUV(36, 90);
    expect(eastWind.speedMs).toBe(10);
    expect(eastWind.u).toBeCloseTo(-10, 2);
    expect(eastWind.v).toBeCloseTo(0, 2);

    // South wind (180°): blowing FROM south, so vector moves north (u = 0, v > 0)
    const southWind = calculateWindUV(36, 180);
    expect(southWind.speedMs).toBe(10);
    expect(southWind.u).toBeCloseTo(0, 2);
    expect(southWind.v).toBeCloseTo(10, 2);

    // West wind (270°): blowing FROM west, so vector moves east (u > 0, v = 0)
    const westWind = calculateWindUV(36, 270);
    expect(westWind.speedMs).toBe(10);
    expect(westWind.u).toBeCloseTo(10, 2);
    expect(westWind.v).toBeCloseTo(0, 2);
  });

  it('handles intercardinal directions, very low wind speeds, and high wind speeds accurately', () => {
    // 45° NE wind: blowing FROM northeast -> southwest (u < 0, v < 0)
    const ne = calculateWindUV(36, 45);
    expect(ne.u).toBeCloseTo(-10 * Math.SQRT1_2, 2);
    expect(ne.v).toBeCloseTo(-10 * Math.SQRT1_2, 2);

    // 225° SW wind: blowing FROM southwest -> northeast (u > 0, v > 0)
    const sw = calculateWindUV(36, 225);
    expect(sw.u).toBeCloseTo(10 * Math.SQRT1_2, 2);
    expect(sw.v).toBeCloseTo(10 * Math.SQRT1_2, 2);

    // Very low wind (0.36 km/h = 0.1 m/s)
    const low = calculateWindUV(0.36, 90);
    expect(low.speedMs).toBeCloseTo(0.1, 3);
    expect(low.u).toBeCloseTo(-0.1, 3);
    expect(low.v).toBe(0);

    // High wind (144 km/h = 40 m/s)
    const high = calculateWindUV(144, 180);
    expect(high.speedMs).toBe(40);
    expect(high.u).toBe(0);
    expect(high.v).toBe(40);
  });

  it('handles calm conditions with genuine zero velocity', () => {
    const calm = calculateWindUV(0, 180);
    expect(calm.speedMs).toBe(0);
    expect(calm.u).toBe(0);
    expect(calm.v).toBe(0);
    expect(Object.is(calm.u, -0)).toBe(false);
    expect(Object.is(calm.v, -0)).toBe(false);
  });

  it('rejects negative speeds, NaN, Infinity, and out-of-range directions explicitly', () => {
    expect(() => calculateWindUV(-5, 180)).toThrow(RangeError);
    expect(() => calculateWindUV(Number.NaN, 180)).toThrow(RangeError);
    expect(() => calculateWindUV(Number.POSITIVE_INFINITY, 180)).toThrow(RangeError);
    expect(() => calculateWindUV(10, Number.NaN)).toThrow(RangeError);
    expect(() => calculateWindUV(10, -1)).toThrow(RangeError);
    expect(() => calculateWindUV(10, 361)).toThrow(RangeError);
  });

  it('evaluates atmospheric ventilation indicator honestly and marks speed-only vs BLH scope', () => {
    const strongWind = getVentilationRating(22);
    expect(strongWind.rating).toBe('good');
    expect(strongWind.scope).toBe('wind_speed_only');
    expect(strongWind.description).toContain('active atmospheric mixing');
    expect(strongWind.description).toContain('Surface wind-speed indicator only');

    const moderateWind = getVentilationRating(12);
    expect(moderateWind.rating).toBe('moderate');
    expect(moderateWind.scope).toBe('wind_speed_only');

    const poorWind = getVentilationRating(6);
    expect(poorWind.rating).toBe('poor');
    expect(poorWind.scope).toBe('wind_speed_only');

    const stagnantWind = getVentilationRating(2);
    expect(stagnantWind.rating).toBe('stagnant');
    expect(stagnantWind.description).toContain('Calm or stagnant atmospheric conditions');

    // Boundary layer height incorporated when valid
    const deepBlh = getVentilationRating(6, 1500);
    expect(deepBlh.rating).toBe('good');
    expect(deepBlh.scope).toBe('wind_and_blh');

    // Unavailable speed returns explicit unavailable state rather than calm/stagnant
    const unavailable = getVentilationRating(null);
    expect(unavailable.rating).toBe('unavailable');
    expect(unavailable.scope).toBe('unavailable');
  });

  it('keeps ThreeWindLayer idle/hidden with zero particles on empty data without inventing fallback flow', () => {
    const group = new THREE.Group();
    const layer = new ThreeWindLayer(group, { particleCount: 24 });

    // Starts with empty vectors -> no particles drawn
    const points = group.children[0] as THREE.Points;
    expect(points).toBeDefined();
    expect(points.visible).toBe(false);
    expect(points.geometry.drawRange.count).toBe(0);

    const initialBuf = new Float32Array((points.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array);
    layer.update(0.016);
    const afterEmptyUpdate = new Float32Array((points.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array);
    expect(Array.from(afterEmptyUpdate)).toEqual(Array.from(initialBuf));

    // Providing validated vectors near international date line & high latitudes enables particles safely
    layer.setWindVectors([
      {
        latitude: 80,
        longitude: 179.5,
        u: 10,
        v: 0,
        speedKmh: 36,
        speedMs: 10,
        directionDeg: 270,
        heightM: 10,
      },
    ]);
    expect(layer.getActiveVectorCount()).toBe(1);
    expect(points.visible).toBe(true);
    expect(points.geometry.drawRange.count).toBe(24);
    layer.update(0.016);

    const posArr = (points.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i < posArr.length; i++) {
      expect(Number.isFinite(posArr[i])).toBe(true);
    }

    // Clearing vectors hides particles cleanly again
    layer.setWindVectors([]);
    expect(points.visible).toBe(false);
    expect(points.geometry.drawRange.count).toBe(0);

    // Safe GPU disposal removes mesh from parentGroup and survives subsequent calls
    layer.dispose();
    expect(group.children).toHaveLength(0);
    expect(() => layer.update(0.016)).not.toThrow();
    expect(() => layer.setWindVectors([])).not.toThrow();
  });
});
