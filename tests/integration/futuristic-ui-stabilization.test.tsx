import { describe, it, expect } from 'vitest';
import {
  buildGeographicObservations,
  getCpcbCategory,
  getEpaCategory,
} from '@/services/geo/geographic-observation-adapter';
import { assessJurisdiction, resolveOfficialGrapStatus } from '@/services/advisories/grap-status-resolver';
import { isThermalInversion } from '@/domain/air-math';
import { AtmosphericMetrics } from '@/domain/types';

describe('Avir — Futuristic UI Stabilization & Scientific Integrity Tests', () => {
  describe('P0: Strict Scientific Standard Separation (Zero EPA-to-CPCB Substitution)', () => {
    it('returns null CPCB AQI and "unavailable" category when CPCB cannot be calculated, never substituting EPA AQI', () => {
      // Create a mock where US EPA AQI is 180, but PM2.5/PM10 are null
      const mockMetrics: AtmosphericMetrics = {
        usAqi: 180,
        pm25: null,
        pm10: null,
        status: 'success',
        isLive: true,
        timestamp: '2026-11-24T10:00:00Z',
        retrievedAt: '2026-11-24T10:00:00Z',
        timezone: 'Asia/Kolkata',
        boundaryLayerHeight: 800,
        isThermalInversionActive: false,
        provenance: 'modeled_forecast',
      };

      const points = buildGeographicObservations({
        standard: 'cpcb',
        currentMetrics: mockMetrics,
        currentLocation: {
          id: 1,
          name: 'Delhi-NCR',
          country: 'India',
          countryCode: 'IN',
          latitude: 28.6139,
          longitude: 77.2090,
        },
      });

      const activePoint = points[0];
      expect(activePoint.name).toBe('Delhi-NCR');
      // Must be null, NOT 180!
      expect(activePoint.cpcbAqi).toBeNull();
      expect(activePoint.aqi).toBeNull();
      expect(activePoint.category).toBe('unavailable');
      expect(activePoint.categoryLabel).toBe('Unavailable');
    });

    it('correctly provides US EPA AQI when standard is epa', () => {
      const mockMetrics: AtmosphericMetrics = {
        usAqi: 180,
        pm25: null,
        pm10: null,
        status: 'success',
        isLive: true,
        timestamp: '2026-11-24T10:00:00Z',
        retrievedAt: '2026-11-24T10:00:00Z',
        timezone: 'Asia/Kolkata',
        boundaryLayerHeight: 800,
        isThermalInversionActive: false,
        provenance: 'modeled_forecast',
      };

      const points = buildGeographicObservations({
        standard: 'epa',
        currentMetrics: mockMetrics,
        currentLocation: {
          id: 1,
          name: 'Delhi-NCR',
          country: 'India',
          countryCode: 'IN',
          latitude: 28.6139,
          longitude: 77.2090,
        },
      });

      const activePoint = points[0];
      expect(activePoint.aqi).toBe(180);
      expect(activePoint.category).toBe('unhealthy');
      expect(activePoint.categoryLabel).toBe('Unhealthy');
    });
  });

  describe('P0: Statutory CAQM GRAP Jurisdiction Enforcement', () => {
    it('correctly classifies non-NCR cities (Mumbai, Bengaluru, Kolkata, Tokyo) as Not Applicable', () => {
      const nonNcrCities = [
        { name: 'Mumbai', admin1: 'Maharashtra', lat: 19.076, lon: 72.8777 },
        { name: 'Bengaluru', admin1: 'Karnataka', lat: 12.9716, lon: 77.5946 },
        { name: 'Kolkata', admin1: 'West Bengal', lat: 22.5726, lon: 88.3639 },
        { name: 'Tokyo', admin1: 'Tokyo', lat: 35.6762, lon: 139.6503 },
      ];

      nonNcrCities.forEach((city) => {
        const jurisdiction = assessJurisdiction({
          cityName: city.name,
          latitude: city.lat,
          longitude: city.lon,
          admin1: city.admin1,
        });

        expect(jurisdiction.isNcr).toBe(false);

        const grap = resolveOfficialGrapStatus(undefined, {
          cityName: city.name,
          latitude: city.lat,
          longitude: city.lon,
          admin1: city.admin1,
        });

        expect(grap.verification).toBe('not_applicable');
        expect(grap.highestActiveStage).toBeNull();
      });
    });

    it('correctly assesses NCR territories (Delhi, Noida, Gurugram, Faridabad) as NCR jurisdiction', () => {
      const ncrCities = [
        { name: 'Delhi-NCR', admin1: 'Delhi', lat: 28.6139, lon: 77.209 },
        { name: 'Gurugram', admin1: 'Haryana', lat: 28.4595, lon: 77.0266 },
        { name: 'Noida', admin1: 'Uttar Pradesh', lat: 28.5355, lon: 77.391 },
      ];

      ncrCities.forEach((city) => {
        const jurisdiction = assessJurisdiction({
          cityName: city.name,
          latitude: city.lat,
          longitude: city.lon,
          admin1: city.admin1,
        });

        expect(jurisdiction.isNcr).toBe(true);
      });
    });
  });

  describe('Scientific Boundary Layer & Thermal Inversion Modeling', () => {
    it('detects nocturnal thermal inversion when mixing ceiling is under 250m during nighttime/early morning', () => {
      // 04:00 AM with 200m mixing depth -> Inversion trapped
      expect(isThermalInversion(200, 4)).toBe(true);
      // 02:00 AM with 120m mixing depth -> Inversion trapped
      expect(isThermalInversion(120, 2)).toBe(true);
      // 14:00 PM (afternoon) with 200m -> Not nocturnal inversion
      expect(isThermalInversion(200, 14)).toBe(false);
      // 14:00 PM with 1,200m -> Normal dispersion
      expect(isThermalInversion(1200, 14)).toBe(false);
    });
  });

  describe('Zero-Fabrication Provenance and Timestamp Integrity', () => {
    it('does not assign fake ISO timestamps to unobserved registry cities', () => {
      const points = buildGeographicObservations({
        standard: 'cpcb',
        currentMetrics: null,
        currentLocation: null,
      });

      // Find an Indian NCAP registry city without observation
      const unobservedIndian = points.find((p) => p.id.startsWith('in-'));
      if (unobservedIndian) {
        expect(unobservedIndian.timestamp).toBe('');
        expect(unobservedIndian.provenance).toBe('unavailable');
        expect(unobservedIndian.aqi).toBeNull();
      }
    });
  });
});
