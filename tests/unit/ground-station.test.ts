import { describe, it, expect, vi } from 'vitest';
import {
  calculateDistanceKm,
  findNearestCpcbStation,
  calculateGroundModelDelta,
  getNearestGroundStation,
  OFFICIAL_CPCB_STATIONS,
} from '@/services/ground-station-service';

describe('Ground Station Telemetry Service', () => {
  describe('Haversine Distance Calculator', () => {
    it('calculates accurate distance between Delhi coordinates and Anand Vihar', () => {
      // Delhi Center: 28.6139, 77.2090
      // Anand Vihar: 28.6508, 77.3152
      const dist = calculateDistanceKm(28.6139, 77.2090, 28.6508, 77.3152);
      expect(dist).toBeGreaterThan(5);
      expect(dist).toBeLessThan(15);
    });

    it('returns 0 for identical coordinates', () => {
      expect(calculateDistanceKm(28.61, 77.21, 28.61, 77.21)).toBe(0);
    });
  });

  describe('Official CPCB Reference Station Registry', () => {
    it('contains major winter smog monitoring stations across Indian metros', () => {
      const stationNames = OFFICIAL_CPCB_STATIONS.map(s => s.name);
      expect(stationNames).toContain('Anand Vihar CAAQMS');
      expect(stationNames).toContain('Bandra Kurla Complex CAAQMS');
      expect(stationNames).toContain('Victoria Memorial CAAQMS');
      expect(stationNames).toContain('Samanpura CAAQMS');
      expect(OFFICIAL_CPCB_STATIONS.length).toBeGreaterThanOrEqual(10);
    });

    it('finds closest CPCB station for Connaught Place / Delhi coordinates', () => {
      const match = findNearestCpcbStation(28.6315, 77.2167, 25);
      expect(match).not.toBeNull();
      expect(match?.station.city).toBe('Delhi');
      expect(match?.distanceKm).toBeLessThan(10);
    });

    it('returns null when coordinates are beyond maximum radius', () => {
      // Remote point in Arabian Sea
      const match = findNearestCpcbStation(15.0, 65.0, 30);
      expect(match).toBeNull();
    });
  });

  describe('Ground-Model Divergence Delta Calculator', () => {
    it('flags boundary-layer trapping when ground sensor is significantly higher than regional model', () => {
      // Ground monitor: 250 ug/m3, Model: 150 ug/m3 -> +67%
      const delta = calculateGroundModelDelta(250, 150);
      expect(delta).not.toBeNull();
      expect(delta?.deltaPercent).toBe(67);
      expect(delta?.divergenceType).toBe('ground_trapping');
      expect(delta?.narrative).toContain('inversion trapping');
    });

    it('flags model overestimate when ground sensor is significantly lower than satellite model', () => {
      // Ground monitor: 70 ug/m3, Model: 120 ug/m3 -> -42%
      const delta = calculateGroundModelDelta(70, 120);
      expect(delta).not.toBeNull();
      expect(delta?.deltaPercent).toBe(-42);
      expect(delta?.divergenceType).toBe('model_overestimate');
      expect(delta?.narrative).toContain('favorable microclimatic winds');
    });

    it('reports aligned when ground and model are within 25% of each other', () => {
      const delta = calculateGroundModelDelta(110, 100);
      expect(delta?.divergenceType).toBe('aligned');
      expect(delta?.narrative).toContain('closely aligned');
    });

    it('returns null when inputs are missing or non-positive', () => {
      expect(calculateGroundModelDelta(null, 100)).toBeNull();
      expect(calculateGroundModelDelta(100, 0)).toBeNull();
    });
  });

  describe('Nearest Ground Station Retrieval', () => {
    it('retrieves nearest ground station and computes divergence delta', async () => {
      const res = await getNearestGroundStation(28.6139, 77.2090, 55, { modelPm25: 120 });
      expect(res.station).not.toBeNull();
      expect(res.station?.stationType).toBe('official_reference');
      expect(res.station?.distanceKm).toBeLessThan(35);
      expect(res.delta).not.toBeNull();
    });
  });
});
