import { describe, it, expect } from 'vitest';
import { calculateWindUV, getVentilationRating } from '@/domain/wind-types';

describe('Global Wind-Flow Physics & Conversions (Phase 3)', () => {
  it('calculates correct U and V Cartesian vector components from meteorological direction', () => {
    // North wind (0° / 360°): blowing FROM north, so vector moves south (u = 0, v < 0)
    const northWind = calculateWindUV(36, 0); // 36 km/h = 10 m/s
    expect(northWind.speedMs).toBe(10);
    expect(northWind.u).toBeCloseTo(0, 1);
    expect(northWind.v).toBeCloseTo(-10, 1);

    // East wind (90°): blowing FROM east, so vector moves west (u < 0, v = 0)
    const eastWind = calculateWindUV(36, 90);
    expect(eastWind.speedMs).toBe(10);
    expect(eastWind.u).toBeCloseTo(-10, 1);
    expect(eastWind.v).toBeCloseTo(0, 1);

    // South wind (180°): blowing FROM south, so vector moves north (u = 0, v > 0)
    const southWind = calculateWindUV(36, 180);
    expect(southWind.speedMs).toBe(10);
    expect(southWind.u).toBeCloseTo(0, 1);
    expect(southWind.v).toBeCloseTo(10, 1);

    // West wind (270°): blowing FROM west, so vector moves east (u > 0, v = 0)
    const westWind = calculateWindUV(36, 270);
    expect(westWind.speedMs).toBe(10);
    expect(westWind.u).toBeCloseTo(10, 1);
    expect(westWind.v).toBeCloseTo(0, 1);
  });

  it('handles calm conditions with zero speed', () => {
    const calm = calculateWindUV(0, 180);
    expect(calm.speedMs).toBe(0);
    expect(calm.u).toBe(0);
    expect(calm.v).toBe(0);
  });

  it('evaluates atmospheric ventilation rating according to dispersion thresholds', () => {
    const strongWind = getVentilationRating(22);
    expect(strongWind.rating).toBe('good');
    expect(strongWind.description).toContain('active atmospheric mixing');

    const moderateWind = getVentilationRating(12);
    expect(moderateWind.rating).toBe('moderate');

    const poorWind = getVentilationRating(6);
    expect(poorWind.rating).toBe('poor');

    const stagnantWind = getVentilationRating(2);
    expect(stagnantWind.rating).toBe('stagnant');
    expect(stagnantWind.description).toContain('Calm or stagnant atmospheric conditions');
  });

  it('considers boundary layer height in ventilation evaluation', () => {
    // Light wind (6 km/h) but deep convective boundary layer (1500m)
    const deepBlh = getVentilationRating(6, 1500);
    expect(deepBlh.rating).toBe('good');
  });
});
