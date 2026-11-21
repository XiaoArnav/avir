import { describe, it, expect } from 'vitest';
import {
  analyzeDiurnalWindows,
  calculateCityComparison,
  calculateCommuteExposure,
  estimateMaskLifespan,
  estimateHepaLifespan,
  analyzeWindVector,
  getSchoolSportsAdvisory,
  formatWhatsAppBulletin,
} from '@/domain/advanced-air-math';
import { HourlyAtmosphericPoint } from '@/domain/types';

describe('Advanced Air Quality & Exposure Features', () => {
  describe('1. Diurnal Safe Hours Forecast Timeline', () => {
    it('analyzes diurnal cycle identifying midday solar expansion and nighttime inversion', () => {
      const mockPoints: HourlyAtmosphericPoint[] = Array.from({ length: 24 }, (_, hour) => {
        const isDaytime = hour >= 12 && hour <= 16;
        return {
          time: `${hour}:00`,
          hour,
          pm25: isDaytime ? 65 : 220,
          usAqi: isDaytime ? 140 : 270,
          boundaryLayerHeight: isDaytime ? 1200 : 180,
          isSafeVentingWindow: isDaytime,
          isThermalInversionTrap: !isDaytime,
        };
      });

      const analysis = analyzeDiurnalWindows(mockPoints);
      expect(analysis.bestVentingWindow.startHour).toBe(12);
      expect(analysis.bestVentingWindow.endHour).toBe(16);
      expect(analysis.bestVentingWindow.averageAqi).toBeLessThan(analysis.worstInversionWindow.averageAqi);
      expect(analysis.bestVentingWindow.averageBlh).toBeGreaterThan(analysis.worstInversionWindow.averageBlh);
      expect(analysis.worstInversionWindow.warning).toContain('inversion');
    });

    it('handles empty hourly data gracefully with fallback physics baseline', () => {
      const analysis = analyzeDiurnalWindows([]);
      expect(analysis.bestVentingWindow.startHour).toBe(12);
      expect(analysis.bestVentingWindow.averageBlh).toBe(850);
      expect(analysis.worstInversionWindow.averageBlh).toBe(150);
    });
  });

  describe('2. City vs. City Smog Shootout', () => {
    it('computes toxicity multiplier and cigarette differential correctly', () => {
      const delhi = { name: 'Delhi', country: 'India', aqi: 280, pm25: 220 };
      const tokyo = { name: 'Tokyo', country: 'Japan', aqi: 28, pm25: 11 };

      const result = calculateCityComparison(delhi, tokyo);
      expect(result.dirtierCityName).toBe('Delhi');
      expect(result.cleanerCityName).toBe('Tokyo');
      expect(result.toxicityMultiplier).toBe(10); // 280 / 28 = 10x
      expect(result.cityA.cigarettes).toBe(10); // 220 / 22 = 10
      expect(result.cityB.cigarettes).toBe(0.5); // 11 / 22 = 0.5
      expect(result.cigaretteDifferential).toBe(9.5);
      expect(result.verdict).toContain('10× more polluted');
    });

    it('identifies comparable air quality when multiplier is within 15%', () => {
      const city1 = { name: 'Munich', country: 'Germany', aqi: 40, pm25: 10 };
      const city2 = { name: 'Vienna', country: 'Austria', aqi: 42, pm25: 11 };

      const result = calculateCityComparison(city1, city2);
      expect(result.verdict).toContain('comparable atmospheric quality');
    });
  });

  describe('3. Commute Exposure & Transit Mode Calculator', () => {
    it('verifies metro delivers ~85% dose reduction vs open two-wheeler', () => {
      const ambientPm25 = 200; // ug/m3
      const duration = 45; // minutes

      const metroExposure = calculateCommuteExposure(ambientPm25, duration, 'metro');
      const bikeExposure = calculateCommuteExposure(ambientPm25, duration, 'two_wheeler_walk');

      expect(metroExposure.reductionPercentage).toBe(85);
      expect(bikeExposure.reductionPercentage).toBe(0);
      expect(metroExposure.inhaledMicrograms).toBeLessThan(bikeExposure.inhaledMicrograms);
      expect(metroExposure.protocolRecommendation).toContain('Underground transit');
    });

    it('verifies car with cabin recirculation delivers ~75% reduction', () => {
      const carExposure = calculateCommuteExposure(180, 60, 'ac_car_recirc');
      expect(carExposure.reductionPercentage).toBe(75);
      expect(carExposure.protocolRecommendation).toContain('recirculation ON');
    });
  });

  describe('4. Mask & HEPA Filter Lifespan Estimator', () => {
    it('estimates N95 mask lifespan and alerts when air is hazardous', () => {
      const estimate = estimateMaskLifespan(250, 3, 'n95');
      expect(estimate.maskLabel).toContain('N95');
      expect(estimate.filtrationEfficiencyPercent).toBe(95);
      expect(estimate.recommendedUsableDays).toBeGreaterThanOrEqual(1);
      expect(estimate.warningNote).toContain('accelerates');
    });

    it('warns that cloth masks provide inadequate particulate protection', () => {
      const clothEstimate = estimateMaskLifespan(150, 2, 'cloth');
      expect(clothEstimate.filtrationEfficiencyPercent).toBe(20);
      expect(clothEstimate.warningNote).toContain('Inadequate protection');
    });

    it('calculates HEPA pre-filter vacuuming schedule in heavy smog', () => {
      const severeSmog = estimateHepaLifespan(300, 24);
      expect(severeSmog.preFilterCleanDays).toBe(7); // weekly cleaning in severe smog
      expect(severeSmog.mainHepaReplaceMonths).toBeLessThanOrEqual(4);
    });
  });

  describe('5. Wind Direction & Biomass Smoke Vector', () => {
    it('flags North-Westerly wind in Indo-Gangetic basin as active smoke corridor', () => {
      const vector = analyzeWindVector(315, 8, 'Delhi-NCR');
      expect(vector.compassPoint).toBe('NW');
      expect(vector.isSmokeCorridor).toBe(true);
      expect(vector.meteorologicalImpact).toContain('transboundary agricultural biomass smoke');
    });

    it('flags calm surface wind (< 5 km/h) as a stagnant dispersion trap', () => {
      const vector = analyzeWindVector(180, 3, 'Kanpur');
      expect(vector.isStagnantTrap).toBe(true);
      expect(vector.meteorologicalImpact).toContain('stagnant');
    });
  });

  describe('6. School & Child Outdoor Sports Advisory', () => {
    it('triggers hazardous protocol when AQI > 250', () => {
      const advisory = getSchoolSportsAdvisory(320, 240);
      expect(advisory.status).toBe('hazardous');
      expect(advisory.morningAssemblyAction).toBe('Move Indoors / Cancel');
      expect(advisory.highExertionSportsAction).toBe('Strictly Prohibited Outdoors');
      expect(advisory.pediatricVulnerabilityNote).toContain('bronchospasm');
    });

    it('triggers restricted protocol when AQI is between 151 and 250', () => {
      const advisory = getSchoolSportsAdvisory(200, 150);
      expect(advisory.status).toBe('restricted');
      expect(advisory.pediatricVulnerabilityNote).toContain('alveolar tissue');
    });

    it('permits outdoor activity when air is clean', () => {
      const advisory = getSchoolSportsAdvisory(35, 8);
      expect(advisory.status).toBe('safe');
      expect(advisory.morningAssemblyAction).toBe('Permitted Outdoors');
      expect(advisory.highExertionSportsAction).toBe('Permitted');
    });
  });

  describe('7. Instant WhatsApp / Telegram Smog Bulletin Formatter', () => {
    it('formats a structured, high-engagement bulletin with emojis and live URL', () => {
      const text = formatWhatsAppBulletin({
        cityName: 'Delhi-NCR',
        usAqi: 245,
        pm25: 195,
        cigarettes: 8.8,
        bestWindow: '12:30 PM - 3:30 PM (Boundary layer peaked at 1100m)',
        worstInversion: '5:00 AM - 9:00 AM (Boundary layer collapsed to 180m)',
      });

      expect(text).toContain('Avir Daily Atmospheric Intelligence — Delhi-NCR');
      expect(text).toContain('245 US AQI');
      expect(text).toContain('~8.8 cigs/day');
      expect(text).toContain('https://avir-blue.vercel.app');
    });
  });
});
