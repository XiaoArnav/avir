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

    it('calculates CO with explicit units and strictly rejects untyped CO without unit', () => {
      // With explicit unit 'ug/m3': 2000 ug/m3 = 2.0 mg/m3 -> Satisfactory (100)
      expect(calculateSubIndex('co', 2000, 'ug/m3')).toBe(100);
      expect(calculateSubIndex('co', 2.0, 'mg/m3')).toBe(100);
      // Strict invariant: CO without unit must be rejected (return null)
      expect(calculateSubIndex('co', 2000)).toBeNull();
      expect(calculateSubIndex('co', 2.0)).toBeNull();
    });

    it('returns null for negative or non-finite inputs', () => {
      expect(calculateSubIndex('pm25', -5)).toBeNull();
      expect(calculateSubIndex('pm25', NaN)).toBeNull();
    });
  });

  describe('Official Data Sufficiency Criteria (MoEFCC / CPCB Rules)', () => {
    it('approves statutory compliance when at least 3 pollutants are present including PM2.5 with verified averaging', () => {
      const result = calculateComprehensiveCpcbNaqi({
        pm25: 110, // Sub-index: ~266 (Poor)
        no2: 45,   // Sub-index: ~58 (Satisfactory)
        so2: 25,   // Sub-index: ~31 (Good)
        is24HourAveraged: true,
      });

      expect(result.isDataSufficient).toBe(true);
      expect(result.monitoredPollutantCount).toBe(3);
      expect(result.missingRequirements.length).toBe(0);
      expect(result.dominantPollutant).toBe('PM2.5');
      expect(result.aqi).toBeGreaterThanOrEqual(250);
      expect(result.category).toBe('Poor');
      expect(result.classification).toBe('statutory_compliant');
    });

    it('approves statutory compliance when PM10 is monitored with 2 other pollutants with verified averaging', () => {
      const result = calculateComprehensiveCpcbNaqi({
        pm10: 280, // Poor
        no2: 30,
        co: 800,
        coUnit: 'ug/m3',
        is24HourAveraged: true,
      });

      expect(result.isDataSufficient).toBe(true);
      expect(result.dominantPollutant).toBe('PM10');
      expect(result.classification).toBe('statutory_compliant');
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
        coUnit: 'ug/m3',
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
      expect(result.classification).toBe('unavailable');
    });

    it('35 & 36. Insufficient pollutant coverage produces indicative_subindex classification', () => {
      const result = calculateComprehensiveCpcbNaqi({ pm25: 80 }); // Only 1 pollutant
      expect(result.isDataSufficient).toBe(false);
      expect(result.classification).toBe('indicative_subindex');
      expect(result.notes).toContain('Indicative sub-index');
    });

    it('37 & 38. Valid pollutant zeros remain valid and are not treated as missing', () => {
      const result = calculateComprehensiveCpcbNaqi({ pm25: 0, no2: 0, so2: 0, is24HourAveraged: true });
      expect(result.isDataSufficient).toBe(true);
      expect(result.aqi).toBe(0);
      expect(result.category).toBe('Good');
      expect(result.classification).toBe('statutory_compliant');
    });

    it('39. Correct official reference breakpoints pass mathematical tests', () => {
      // PM2.5 = 30 is max for Good (sub-index 50)
      expect(calculateSubIndex('pm25', 30)).toBe(50);
      // PM2.5 = 60 is max for Satisfactory (sub-index 100)
      expect(calculateSubIndex('pm25', 60)).toBe(100);
      // PM2.5 = 90 is max for Moderate (sub-index 200)
      expect(calculateSubIndex('pm25', 90)).toBe(200);
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
