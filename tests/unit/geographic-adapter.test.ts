import { describe, it, expect } from 'vitest';
import {
  latLongToVector3,
  getCpcbCategory,
  getEpaCategory,
  buildGeographicObservations,
} from '@/services/geo/geographic-observation-adapter';
import { AtmosphericMetrics } from '@/domain/types';

describe('Geographic Observation Adapter (PR B)', () => {
  describe('Spherical 3D Projection (latLongToVector3)', () => {
    it('computes correct 3D coordinates for North Pole', () => {
      const radius = 100;
      const v = latLongToVector3(90, 0, radius);
      expect(Math.abs(v.x)).toBeCloseTo(0);
      expect(v.y).toBeCloseTo(100);
      expect(Math.abs(v.z)).toBeCloseTo(0);
    });

    it('computes correct 3D coordinates for Equator at Prime Meridian', () => {
      const radius = 100;
      const v = latLongToVector3(0, 0, radius);
      expect(Math.round(v.y)).toBe(0);
      expect(Math.abs(v.x)).toBeLessThanOrEqual(radius);
      expect(Math.abs(v.z)).toBeLessThanOrEqual(radius);
    });

    it('preserves radius magnitude across arbitrary coordinates', () => {
      const radius = 90;
      const v = latLongToVector3(28.6139, 77.209, radius);
      const mag = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
      expect(Math.round(mag)).toBe(90);
    });
  });

  describe('AQI Category Thresholds & Zero Fabrication', () => {
    it('correctly maps CPCB NAQI boundaries', () => {
      expect(getCpcbCategory(45).category).toBe('good');
      expect(getCpcbCategory(85).category).toBe('moderate'); // Satisfactory
      expect(getCpcbCategory(170).category).toBe('unhealthy-sensitive'); // Moderate
      expect(getCpcbCategory(250).category).toBe('unhealthy'); // Poor
      expect(getCpcbCategory(350).category).toBe('very-unhealthy'); // Very Poor
      expect(getCpcbCategory(450).category).toBe('hazardous'); // Severe
      expect(getCpcbCategory(null).category).toBe('unavailable');
    });

    it('correctly maps EPA AQI boundaries', () => {
      expect(getEpaCategory(30).category).toBe('good');
      expect(getEpaCategory(80).category).toBe('moderate');
      expect(getEpaCategory(130).category).toBe('unhealthy-sensitive');
      expect(getEpaCategory(180).category).toBe('unhealthy');
      expect(getEpaCategory(250).category).toBe('very-unhealthy');
      expect(getEpaCategory(350).category).toBe('hazardous');
      expect(getEpaCategory(null).category).toBe('unavailable');
    });
  });

  describe('buildGeographicObservations Integrity', () => {
    it('never synthesizes fake AQI readings for cities without active feeds', () => {
      const points = buildGeographicObservations({
        standard: 'cpcb',
      });

      expect(points.length).toBeGreaterThan(20);

      // Verify cities with no feed are explicitly marked unavailable
      const unmonitored = points.filter((p) => p.provenance === 'unavailable');
      expect(unmonitored.length).toBeGreaterThan(0);
      for (const p of unmonitored) {
        expect(p.aqi).toBeNull();
        expect(p.category).toBe('unavailable');
      }
    });

    it('hydrates active city when live atmospheric metrics are provided', () => {
      const mockMetrics: AtmosphericMetrics = {
        status: 'success',
        provenance: 'observed',
        timestamp: '2026-11-23T12:00:00Z',
        retrievedAt: '2026-11-23T12:05:00Z',
        timezone: 'Asia/Kolkata',
        usAqi: 185,
        pm25: 120,
        pm10: 210,
        boundaryLayerHeight: 400,
        isThermalInversionActive: true,
        isLive: true,
      };

      const points = buildGeographicObservations({
        standard: 'epa',
        currentMetrics: mockMetrics,
        currentLocation: {
          id: 1,
          name: 'Delhi-NCR',
          latitude: 28.6139,
          longitude: 77.209,
          country: 'India',
          countryCode: 'IN',
        },
      });

      const delhi = points.find((p) => p.name === 'Delhi-NCR');
      expect(delhi).toBeDefined();
      expect(delhi?.aqi).toBe(185);
      expect(delhi?.category).toBe('unhealthy');
      expect(delhi?.pm25).toBe(120);
      expect(delhi?.provenance).toBe('observed');
    });
  });
});
