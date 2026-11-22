import { describe, it, expect } from 'vitest';
import {
  calculateSubIndex,
  calculateComprehensiveCpcbNaqi,
  getCpcbCategory,
} from '@/domain/cpcb-naqi';

describe('Statutory CPCB NAQI 8-Pollutant Calculation Engine', () => {
  describe('Sub-Index Piecewise Interpolation', () => {
    it('calculates PM2.5 sub-index correctly across regulatory categories', () => {
      // Breakpoint: 0-30 -> 0-50 (Good)
      expect(calculateSubIndex('pm25', 15)).toBe(25);
      // Breakpoint: 31-60 -> 51-100 (Satisfactory)
      expect(calculateSubIndex('pm25', 60)).toBe(100);
      // Breakpoint: 61-90 -> 101-200 (Moderate)
      expect(calculateSubIndex('pm25', 90)).toBe(200);
      // Breakpoint: 91-120 -> 201-300 (Poor)
      expect(calculateSubIndex('pm25', 120)).toBe(300);
      // Severe: > 250 -> 401-500
      expect(calculateSubIndex('pm25', 380)).toBeGreaterThan(400);
    });

    it('calculates PM10 sub-index correctly', () => {
      expect(calculateSubIndex('pm10', 50)).toBe(50);
      expect(calculateSubIndex('pm10', 100)).toBe(100);
      expect(calculateSubIndex('pm10', 250)).toBe(200);
    });

    it('auto-converts CO from ug/m3 to mg/m3 when values > 50', () => {
      // 2000 ug/m3 = 2.0 mg/m3 -> Satisfactory (100)
      const subIdx = calculateSubIndex('co', 2000);
      expect(subIdx).toBe(100);
    });

    it('returns null for negative or non-finite inputs', () => {
      expect(calculateSubIndex('pm25', -5)).toBeNull();
      expect(calculateSubIndex('pm25', NaN)).toBeNull();
    });
  });

  describe('Official Data Sufficiency Criteria (MoEFCC / CPCB Rules)', () => {
    it('approves statutory compliance when at least 3 pollutants are present including PM2.5', () => {
      const result = calculateComprehensiveCpcbNaqi({
        pm25: 110, // Sub-index: ~266 (Poor)
        no2: 45,   // Sub-index: ~58 (Satisfactory)
        so2: 25,   // Sub-index: ~31 (Good)
      });

      expect(result.isDataSufficient).toBe(true);
      expect(result.monitoredPollutantCount).toBe(3);
      expect(result.missingRequirements.length).toBe(0);
      expect(result.dominantPollutant).toBe('PM2.5');
      expect(result.aqi).toBeGreaterThanOrEqual(250);
      expect(result.category).toBe('Poor');
    });

    it('approves statutory compliance when PM10 is monitored with 2 other pollutants', () => {
      const result = calculateComprehensiveCpcbNaqi({
        pm10: 280, // Poor
        no2: 30,
        co: 800,
      });

      expect(result.isDataSufficient).toBe(true);
      expect(result.dominantPollutant).toBe('PM10');
    });

    it('flags data insufficiency when fewer than 3 pollutants are available', () => {
      const result = calculateComprehensiveCpcbNaqi({
        pm25: 75,
        no2: 40,
        // Only 2 pollutants
      });

      expect(result.isDataSufficient).toBe(false);
      expect(result.monitoredPollutantCount).toBe(2);
      expect(result.missingRequirements[0]).toContain('At least 3 pollutants required');
      // Still provides an indicative sub-index without fabricating
      expect(result.aqi).not.toBeNull();
      expect(result.notes).toContain('Indicative sub-index');
    });

    it('flags data insufficiency when 3 gaseous pollutants exist but NO particulate (neither PM2.5 nor PM10)', () => {
      const result = calculateComprehensiveCpcbNaqi({
        no2: 50,
        so2: 30,
        co: 1200,
        // No PM2.5 and no PM10!
      });

      expect(result.isDataSufficient).toBe(false);
      expect(result.missingRequirements.some(r => r.includes('Either PM2.5 or PM10 must be monitored'))).toBe(true);
    });

    it('returns null and clean message when 0 pollutants are provided', () => {
      const result = calculateComprehensiveCpcbNaqi({});
      expect(result.aqi).toBeNull();
      expect(result.isDataSufficient).toBe(false);
      expect(result.monitoredPollutantCount).toBe(0);
    });
  });

  describe('Category Mapping', () => {
    it('maps numerical values to official CPCB categories', () => {
      expect(getCpcbCategory(45)).toBe('Good');
      expect(getCpcbCategory(85)).toBe('Satisfactory');
      expect(getCpcbCategory(160)).toBe('Moderate');
      expect(getCpcbCategory(240)).toBe('Poor');
      expect(getCpcbCategory(350)).toBe('Very Poor');
      expect(getCpcbCategory(440)).toBe('Severe');
    });
  });
});
