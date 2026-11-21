import { describe, it, expect } from 'vitest';
import {
  calculateAQIFromPM25,
  getAQICategory,
  isThermalInversion,
  calculateInhaledPM25,
  calculateBerkeleyCigarettes,
  calculateCorsiRosenthalBox,
  calculateRoutineShiftSavings,
} from '@/domain/air-math';
import { UserVulnerabilityProfile } from '@/domain/types';

describe('Atmospheric Math & Exposure Toxicology Engine', () => {
  describe('AQI & Breakpoint Calculus', () => {
    it('accurately calculates AQI across standard EPA/CPCB breakpoints', () => {
      expect(calculateAQIFromPM25(0)).toBe(0);
      expect(calculateAQIFromPM25(12.0)).toBe(50);
      expect(calculateAQIFromPM25(35.4)).toBe(100);
      expect(calculateAQIFromPM25(55.4)).toBe(150);
      expect(calculateAQIFromPM25(150.4)).toBe(200);
      expect(calculateAQIFromPM25(250.4)).toBe(300);
      expect(calculateAQIFromPM25(500.0)).toBe(500);
    });

    it('correctly maps AQI values to clinical category labels', () => {
      expect(getAQICategory(30)).toBe('Good');
      expect(getAQICategory(85)).toBe('Moderate');
      expect(getAQICategory(130)).toBe('UnhealthySensitive');
      expect(getAQICategory(175)).toBe('Unhealthy');
      expect(getAQICategory(240)).toBe('VeryUnhealthy');
      expect(getAQICategory(380)).toBe('Hazardous');
    });
  });

  describe('Thermal Inversion Modeling', () => {
    it('identifies winter thermal inversion when boundary layer height is contracted during morning/night', () => {
      // 120m at 7:00 AM -> Inversion trapped
      expect(isThermalInversion(120, 7)).toBe(true);
      // 140m at 11:00 PM -> Inversion trapped
      expect(isThermalInversion(140, 23)).toBe(true);
      // 650m at 2:00 PM -> Solar venting active
      expect(isThermalInversion(650, 14)).toBe(false);
    });
  });

  describe('Inhalation Exposure Toxicology', () => {
    const standardProfile: UserVulnerabilityProfile = {
      ageGroup: 'adult',
      hasAsthmaOrRespiratory: false,
      hasCardiovascularCondition: false,
      isPregnant: false,
      isOutdoorWorker: false,
    };

    const vulnerableChildProfile: UserVulnerabilityProfile = {
      ageGroup: 'child',
      hasAsthmaOrRespiratory: true,
      hasCardiovascularCondition: false,
      isPregnant: false,
      isOutdoorWorker: false,
    };

    it('computes inhaled PM2.5 mass based on ventilation volume and duration', () => {
      // 100 ug/m3 for 1 hour at light walk (ventilation ~ 0.8 m3/hr)
      const exposure = calculateInhaledPM25(100, 1, 'light_walk', standardProfile);
      expect(exposure.inhaledPM25Micrograms).toBeCloseTo(80, 1);
    });

    it('applies vulnerability weighting multiplier for sensitive respiratory groups', () => {
      const normalExposure = calculateInhaledPM25(150, 1, 'moderate_activity', standardProfile);
      const childExposure = calculateInhaledPM25(150, 1, 'moderate_activity', vulnerableChildProfile);

      expect(childExposure.vulnerabilityWeightedExposure).toBeGreaterThan(normalExposure.vulnerabilityWeightedExposure);
      expect(childExposure.respiratoryRiskScore).toBeGreaterThan(normalExposure.respiratoryRiskScore);
    });

    it('converts daily ambient PM2.5 to Berkeley Earth cigarette equivalents', () => {
      // 22 ug/m3 over 24h = 1.0 cigarette
      expect(calculateBerkeleyCigarettes(22)).toBeCloseTo(1.0, 1);
      // 110 ug/m3 over 24h = 5.0 cigarettes
      expect(calculateBerkeleyCigarettes(110)).toBeCloseTo(5.0, 1);
      // 220 ug/m3 (severe Delhi winter episode) = 10.0 cigarettes
      expect(calculateBerkeleyCigarettes(220)).toBeCloseTo(10.0, 1);
    });
  });

  describe('Corsi-Rosenthal Box IAQ Physics', () => {
    it('computes accurate CADR, ACH, and particulate clearance half-life for a given room', () => {
      // 4-filter CR box in a 45 m3 room (approx 180 sq ft with 9ft ceiling)
      const crBox = calculateCorsiRosenthalBox(45, 4);

      expect(crBox.estimatedCADR_CFM).toBeGreaterThanOrEqual(450);
      expect(crBox.estimatedCADR_M3H).toBeGreaterThanOrEqual(750);
      expect(crBox.airChangesPerHour).toBeGreaterThanOrEqual(15);
      expect(crBox.clearingHalfLifeMinutes).toBeLessThan(10);
      expect(crBox.estimatedCostINR).toBeLessThan(3500); // Frugal < ₹3,500 ($40)
    });
  });

  describe('Routine Shift Savings Optimization', () => {
    it('quantifies PM2.5 avoided and percentage reduction when shifting out of peak smog windows', () => {
      // Morning jog at 7 AM (PM2.5 = 250 ug/m3) shifted to 2 PM (PM2.5 = 80 ug/m3)
      const savings = calculateRoutineShiftSavings(250, 80, 1, 'intense_exercise');

      expect(savings.reductionPercentage).toBeCloseTo(68.0, 0);
      expect(savings.avoidedMicrograms).toBeGreaterThan(0);
      expect(savings.avoidedCigarettesMonthly).toBeGreaterThan(0);
    });
  });
});
