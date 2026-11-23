import { describe, it, expect } from 'vitest';
import {
  evaluateCommuteScenarios,
  calculateCommuteModeExposure,
} from '@/services/commute/commute-service';
import { COMMUTE_MODE_PROFILES } from '@/domain/exposure-types';

describe('Step 14 — Commute Intelligence & Scenario Modeling', () => {
  describe('Elimination of B-003: Fixed Commute Reductions', () => {
    it('evaluates modes using distinct microenvironment ratios and physical ventilation rates', () => {
      // 45 min commute at 160 µg/m³ ambient PM2.5
      const report = evaluateCommuteScenarios({
        ambientPM25: 160,
        durationMinutes: 45,
      });

      expect(report.scenarios.length).toBe(7);
      expect(report.ambientPM25).toBe(160);

      // Metro: ratio 0.25, light ventilation 0.012 m³/min
      // Effective PM2.5 = 160 * 0.25 = 40 µg/m³
      // Inhaled mass = 40 * 0.012 * 45 = 21.6 µg
      const metro = report.scenarios.find(s => s.mode === 'metro');
      expect(metro?.effectivePM25).toBe(40);
      expect(metro?.inhaledMassUg).toBe(21.6);

      // Car with recirculation: ratio 0.30, light ventilation 0.012 m³/min
      // Effective PM2.5 = 160 * 0.30 = 48 µg/m³
      // Inhaled mass = 48 * 0.012 * 45 = 25.92 µg
      const carRecirc = report.scenarios.find(s => s.mode === 'car_recirc_on');
      expect(carRecirc?.effectivePM25).toBe(48);
      expect(carRecirc?.inhaledMassUg).toBe(25.92);

      // Cycling: ratio 1.15, vigorous ventilation 0.045 m³/min
      // Effective PM2.5 = 160 * 1.15 = 184 µg/m³
      // Inhaled mass = 184 * 0.045 * 45 = 372.6 µg
      const cycling = report.scenarios.find(s => s.mode === 'cycling');
      expect(cycling?.effectivePM25).toBe(184);
      expect(cycling?.inhaledMassUg).toBe(372.6);

      // Lowest exposure should be metro
      expect(report.lowestExposureMode).toBe('metro');
      // Highest exposure should be cycling (due to intense minute ventilation on roadway)
      expect(report.highestExposureMode).toBe('cycling');
      expect(report.maxAbsoluteDifferenceUg).toBe(351); // 372.6 - 21.6
    });

    it('allows user-customized microenvironment ratios and custom duration', () => {
      // User with HEPA-fitted car cabin overrides car_recirc_on ratio to 0.15
      const customReport = evaluateCommuteScenarios({
        ambientPM25: 200,
        durationMinutes: 30,
        customRatios: {
          car_recirc_on: 0.15,
        },
      });

      const car = customReport.scenarios.find(s => s.mode === 'car_recirc_on');
      expect(car?.microenvironmentRatio).toBe(0.15);
      expect(car?.effectivePM25).toBe(30); // 200 * 0.15
      // Inhaled mass = 30 * 0.012 * 30 = 10.8 µg
      expect(car?.inhaledMassUg).toBe(10.8);
      // With HEPA car at 10.8 µg vs metro (200 * 0.25 * 0.012 * 30 = 18 µg), car is lowest
      expect(customReport.lowestExposureMode).toBe('car_recirc_on');
    });

    it('rejects negative ambient PM2.5 or non-positive durations safely', () => {
      expect(() =>
        evaluateCommuteScenarios({
          ambientPM25: -20,
          durationMinutes: 30,
        })
      ).toThrow(/non-negative/);

      expect(() =>
        evaluateCommuteScenarios({
          ambientPM25: 100,
          durationMinutes: 0,
        })
      ).toThrow(/positive/);
    });

    it('does not calculate or expose cigarette equivalence claims', () => {
      const single = calculateCommuteModeExposure('metro', 150, 40);
      expect((single as any).cigarettes).toBeUndefined();
      expect((single as any).berkeleyCigarettes).toBeUndefined();
      expect(single.inhaledMassUg).toBeGreaterThan(0);
    });
  });
});
