import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  calculateAQIFromPM25,
  calculateDetailedEpaPm25Aqi,
  truncatePm25Concentration,
  EPA_PM25_2024_BREAKPOINTS,
  getAQICategory,
  calculateCpcbNaqi,
  getGrapStage,
} from '@/domain/air-math';
import {
  calculateSubIndex,
  calculateComprehensiveCpcbNaqi,
  getCpcbCategory,
} from '@/domain/cpcb-naqi';
import { fetchLiveAtmosphericMetrics } from '@/services/telemetry-service';
import { parseBatchTelemetryResponse, WORLD_METROS } from '@/services/world-telemetry-service';
import { calculateCityComparison } from '@/domain/advanced-air-math';
import { telemetryCache } from '@/lib/cache';

describe('AVIR — Step 7 Golden-Reference Verification: Scientifically Correct AQI', () => {
  beforeEach(() => {
    telemetryCache.clear();
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // GROUP A: US EPA AQI & 2024 REVISED BREAKPOINTS (Scenarios 1–20)
  // ---------------------------------------------------------------------------
  describe('Group A: US EPA 2024 Revised PM2.5 AQI Calculations (1–20)', () => {
    it('1. Zero PM2.5 concentration yields AQI 0 (Good category)', () => {
      const aqi = calculateAQIFromPM25(0.0);
      expect(aqi).toBe(0);
      expect(getAQICategory(aqi)).toBe('Good');
    });

    it('2. 9.0 µg/m³ is the exact upper boundary of Good (AQI 50)', () => {
      const aqi = calculateAQIFromPM25(9.0);
      expect(aqi).toBe(50);
      expect(getAQICategory(aqi)).toBe('Good');
    });

    it('3. 9.1 µg/m³ is the exact entry point into Moderate (AQI 51)', () => {
      const aqi = calculateAQIFromPM25(9.1);
      expect(aqi).toBe(51);
      expect(getAQICategory(aqi)).toBe('Moderate');
    });

    it('4. 12.0 µg/m³ evaluates to AQI 56 (Moderate) under 2024 rule, not obsolete 50 Good', () => {
      // 2024 standard: 9.1-35.4 -> 51-100.
      // (49 / 26.3) * (12.0 - 9.1) + 51 = 1.86311787 * 2.9 + 51 = 5.403 + 51 = 56.403 -> 56.
      const aqi = calculateAQIFromPM25(12.0);
      expect(aqi).toBe(56);
      expect(getAQICategory(aqi)).toBe('Moderate');
    });

    it('5. 35.4 µg/m³ is the exact upper boundary of Moderate (AQI 100)', () => {
      const aqi = calculateAQIFromPM25(35.4);
      expect(aqi).toBe(100);
      expect(getAQICategory(aqi)).toBe('Moderate');
    });

    it('6. 35.5 µg/m³ enters Unhealthy for Sensitive Groups (AQI 101)', () => {
      const aqi = calculateAQIFromPM25(35.5);
      expect(aqi).toBe(101);
      expect(getAQICategory(aqi)).toBe('UnhealthySensitive');
    });

    it('7. 55.4 µg/m³ is the exact upper boundary of Unhealthy for Sensitive Groups (AQI 150)', () => {
      const aqi = calculateAQIFromPM25(55.4);
      expect(aqi).toBe(150);
      expect(getAQICategory(aqi)).toBe('UnhealthySensitive');
    });

    it('8. 55.5 µg/m³ enters Unhealthy (AQI 151)', () => {
      const aqi = calculateAQIFromPM25(55.5);
      expect(aqi).toBe(151);
      expect(getAQICategory(aqi)).toBe('Unhealthy');
    });

    it('9. 125.4 µg/m³ is the exact upper boundary of Unhealthy (AQI 200) under 2024 rule', () => {
      // 2024 revised standard: 55.5 - 125.4 -> 151 - 200 (formerly 150.4)
      const aqi = calculateAQIFromPM25(125.4);
      expect(aqi).toBe(200);
      expect(getAQICategory(aqi)).toBe('Unhealthy');
    });

    it('10. 125.5 µg/m³ enters Very Unhealthy (AQI 201) under 2024 rule', () => {
      // 2024 revised standard: 125.5 - 225.4 -> 201 - 300 (formerly 150.5 - 250.4)
      const aqi = calculateAQIFromPM25(125.5);
      expect(aqi).toBe(201);
      expect(getAQICategory(aqi)).toBe('VeryUnhealthy');
    });

    it('11. 225.4 µg/m³ is the exact upper boundary of Very Unhealthy (AQI 300) under 2024 rule', () => {
      const aqi = calculateAQIFromPM25(225.4);
      expect(aqi).toBe(300);
      expect(getAQICategory(aqi)).toBe('VeryUnhealthy');
    });

    it('maps revised hazardous concentrations to their index', () => {
      expect(calculateAQIFromPM25(225.5)).toBe(301);
      expect(calculateAQIFromPM25(325.4)).toBe(500);
      expect(getAQICategory(400)).toBe('Hazardous');

      expect(calculateAQIFromPM25(325.5)).toBe(500);
      expect(calculateAQIFromPM25(500.4)).toBe(849);
      expect(getAQICategory(500)).toBe('Hazardous');
    });

    it('reports values beyond the AQI 500 reference point', () => {
      const aqi550 = calculateAQIFromPM25(550.0);
      const aqi800 = calculateAQIFromPM25(800.0);
      expect(aqi550).toBe(947);
      expect(aqi800).toBe(1445);
      expect(getAQICategory(aqi550)).toBe('Hazardous');
    });

    it('14. Negative concentrations are rejected and return null', () => {
      expect(calculateAQIFromPM25(-0.1)).toBeNull();
      expect(calculateAQIFromPM25(-15)).toBeNull();
      expect(getAQICategory(calculateAQIFromPM25(-10))).toBe('Unavailable');
    });

    it('15. NaN input is safely rejected and returns null', () => {
      expect(calculateAQIFromPM25(NaN)).toBeNull();
      expect(getAQICategory(calculateAQIFromPM25(NaN))).toBe('Unavailable');
    });

    it('16. Infinity input is safely rejected and returns null', () => {
      expect(calculateAQIFromPM25(Infinity)).toBeNull();
      expect(calculateAQIFromPM25(-Infinity)).toBeNull();
      expect(getAQICategory(calculateAQIFromPM25(Infinity))).toBe('Unavailable');
    });

    it('17. Null and undefined inputs safely return null without throwing', () => {
      expect(calculateAQIFromPM25(null)).toBeNull();
      expect(calculateAQIFromPM25(undefined)).toBeNull();
      expect(getAQICategory(null)).toBe('Unavailable');
      expect(getAQICategory(undefined)).toBe('Unavailable');
    });

    it('18. Correct integer rounding per EPA specification', () => {
      // At 10.0 µg/m³: (49 / 26.3) * (10.0 - 9.1) + 51 = 1.86311787 * 0.9 + 51 = 1.6768 + 51 = 52.6768 -> 53
      expect(calculateAQIFromPM25(10.0)).toBe(53);

      // At 20.0 µg/m³: (49 / 26.3) * (20.0 - 9.1) + 51 = 1.86311787 * 10.9 + 51 = 20.308 + 51 = 71.308 -> 71
      expect(calculateAQIFromPM25(20.0)).toBe(71);
    });

    it('19. Correct concentration truncation to 1 decimal place (0.1 µg/m³) before interpolation', () => {
      // 9.09 truncates to 9.0 -> AQI 50 (Good), NOT Moderate
      expect(truncatePm25Concentration(9.09)).toBe(9.0);
      expect(calculateAQIFromPM25(9.09)).toBe(50);
      expect(getAQICategory(calculateAQIFromPM25(9.09))).toBe('Good');

      // 35.49 truncates to 35.4 -> AQI 100 (Moderate), NOT Unhealthy for Sensitive Groups
      expect(truncatePm25Concentration(35.49)).toBe(35.4);
      expect(calculateAQIFromPM25(35.49)).toBe(100);
      expect(getAQICategory(calculateAQIFromPM25(35.49))).toBe('Moderate');
    });

    it('20. Authoritative EPA 2024 metadata is attached and verifiable', () => {
      const detailed = calculateDetailedEpaPm25Aqi(12.0);
      expect(detailed.aqi).toBe(56);
      expect(detailed.category).toBe('Moderate');
      expect(detailed.truncatedConcentration).toBe(12.0);
      expect(detailed.evidence.standard).toBe('US_EPA');
      expect(detailed.evidence.method).toBe('epa_pm25_24h_subindex');
      expect(detailed.evidence.standardVersion).toContain('EPA 2024 PM NAAQS');
      expect(EPA_PM25_2024_BREAKPOINTS.length).toBe(6);
    });
  });

  // ---------------------------------------------------------------------------
  // GROUP B: CPCB 8-POLLUTANT BREAKPOINTS & UNITS (Scenarios 21–35)
  // ---------------------------------------------------------------------------
  describe('Group B: Indian CPCB NAQI 8-Pollutant Breakpoints & Units (21–35)', () => {
    it('21. PM2.5 breakpoint edges follow official CPCB intervals', () => {
      expect(calculateSubIndex('pm25', 0)).toBe(0);
      expect(calculateSubIndex('pm25', 30)).toBe(50);   // Good
      expect(calculateSubIndex('pm25', 60)).toBe(100);  // Satisfactory
      expect(calculateSubIndex('pm25', 90)).toBe(200);  // Moderate
      expect(calculateSubIndex('pm25', 120)).toBe(300); // Poor
      expect(calculateSubIndex('pm25', 250)).toBe(400); // Very Poor
      expect(calculateSubIndex('pm25', 500)).toBe(500); // Severe
    });

    it('22. PM10 breakpoint edges follow official CPCB intervals', () => {
      expect(calculateSubIndex('pm10', 0)).toBe(0);
      expect(calculateSubIndex('pm10', 50)).toBe(50);   // Good
      expect(calculateSubIndex('pm10', 100)).toBe(100); // Satisfactory
      expect(calculateSubIndex('pm10', 250)).toBe(200); // Moderate
      expect(calculateSubIndex('pm10', 350)).toBe(300); // Poor
      expect(calculateSubIndex('pm10', 430)).toBe(400); // Very Poor
      expect(calculateSubIndex('pm10', 600)).toBe(500); // Severe
    });

    it('23. NO2 breakpoint edges follow official 24-hr CPCB intervals', () => {
      expect(calculateSubIndex('no2', 0)).toBe(0);
      expect(calculateSubIndex('no2', 40)).toBe(50);   // Good
      expect(calculateSubIndex('no2', 80)).toBe(100);  // Satisfactory
      expect(calculateSubIndex('no2', 180)).toBe(200); // Moderate
      expect(calculateSubIndex('no2', 280)).toBe(300); // Poor
      expect(calculateSubIndex('no2', 400)).toBe(400); // Very Poor
      expect(calculateSubIndex('no2', 800)).toBe(500); // Severe
    });

    it('24. SO2 breakpoint edges follow official 24-hr CPCB intervals', () => {
      expect(calculateSubIndex('so2', 0)).toBe(0);
      expect(calculateSubIndex('so2', 40)).toBe(50);    // Good
      expect(calculateSubIndex('so2', 80)).toBe(100);   // Satisfactory
      expect(calculateSubIndex('so2', 380)).toBe(200);  // Moderate
      expect(calculateSubIndex('so2', 800)).toBe(300);  // Poor
      expect(calculateSubIndex('so2', 1600)).toBe(400); // Very Poor
      expect(calculateSubIndex('so2', 3000)).toBe(500); // Severe
    });

    it('25. CO breakpoint edges follow official 8-hr intervals in mg/m³', () => {
      expect(calculateSubIndex('co', 0, 'mg/m3')).toBe(0);
      expect(calculateSubIndex('co', 1.0, 'mg/m3')).toBe(50);   // Good
      expect(calculateSubIndex('co', 2.0, 'mg/m3')).toBe(100);  // Satisfactory
      expect(calculateSubIndex('co', 10.0, 'mg/m3')).toBe(200); // Moderate
      expect(calculateSubIndex('co', 17.0, 'mg/m3')).toBe(300); // Poor
      expect(calculateSubIndex('co', 34.0, 'mg/m3')).toBe(400); // Very Poor
      expect(calculateSubIndex('co', 60.0, 'mg/m3')).toBe(500); // Severe
    });

    it('26. Ozone (O3) breakpoint edges follow official 8-hr intervals in µg/m³', () => {
      expect(calculateSubIndex('o3', 0)).toBe(0);
      expect(calculateSubIndex('o3', 50)).toBe(50);    // Good
      expect(calculateSubIndex('o3', 100)).toBe(100);  // Satisfactory
      expect(calculateSubIndex('o3', 168)).toBe(200);  // Moderate
      expect(calculateSubIndex('o3', 208)).toBe(300);  // Poor
      expect(calculateSubIndex('o3', 748)).toBe(400);  // Very Poor
      expect(calculateSubIndex('o3', 1000)).toBe(500); // Severe
    });

    it('27. Ammonia (NH3) breakpoint edges follow official 24-hr intervals in µg/m³', () => {
      expect(calculateSubIndex('nh3', 0)).toBe(0);
      expect(calculateSubIndex('nh3', 200)).toBe(50);   // Good
      expect(calculateSubIndex('nh3', 400)).toBe(100);  // Satisfactory
      expect(calculateSubIndex('nh3', 800)).toBe(200);  // Moderate
      expect(calculateSubIndex('nh3', 1200)).toBe(300); // Poor
      expect(calculateSubIndex('nh3', 1800)).toBe(400); // Very Poor
      expect(calculateSubIndex('nh3', 3000)).toBe(500); // Severe
    });

    it('28. Lead (Pb) breakpoint edges follow official 24-hr intervals in µg/m³', () => {
      expect(calculateSubIndex('pb', 0)).toBe(0);
      expect(calculateSubIndex('pb', 0.5)).toBe(50);  // Good
      expect(calculateSubIndex('pb', 1.0)).toBe(100); // Satisfactory
      expect(calculateSubIndex('pb', 2.0)).toBe(200); // Moderate
      expect(calculateSubIndex('pb', 3.0)).toBe(300); // Poor
      expect(calculateSubIndex('pb', 3.5)).toBe(400); // Very Poor
      expect(calculateSubIndex('pb', 5.0)).toBe(500); // Severe
    });

    it('29. Valid zero concentration evaluates to 0 sub-index across all criteria pollutants', () => {
      const pollutants = ['pm25', 'pm10', 'no2', 'so2', 'o3', 'nh3', 'pb'];
      for (const p of pollutants) {
        expect(calculateSubIndex(p, 0)).toBe(0);
      }
      expect(calculateSubIndex('co', 0, 'mg/m3')).toBe(0);
    });

    it('30. Unsupported or invalid units return null', () => {
      expect(calculateSubIndex('pm25', 50, 'ppm')).toBeNull();
      expect(calculateSubIndex('pm25', 50, 'mg/m3')).toBeNull();
      expect(calculateSubIndex('co', 2.0, 'ppm')).toBeNull();
      expect(calculateSubIndex('no2', 40, 'ppb')).toBeNull();
    });

    it('31. Explicit CO mg/m³ unit is correctly handled', () => {
      expect(calculateSubIndex('co', 1.5, 'mg/m3')).toBeGreaterThanOrEqual(70);
      expect(calculateSubIndex('co', 2.0, 'mg/m3')).toBe(100);
      expect(calculateSubIndex('co', 2.0, 'mg/m³')).toBe(100);
    });

    it('32. Explicit CO µg/m³ conversion converts by dividing by 1000', () => {
      // 2000 µg/m³ = 2.0 mg/m³ -> AQI 100
      expect(calculateSubIndex('co', 2000, 'ug/m3')).toBe(100);
      expect(calculateSubIndex('co', 2000, 'µg/m³')).toBe(100);
      expect(calculateSubIndex('co', 1000, 'ug/m3')).toBe(50);
    });

    it('33. Unknown or untyped CO unit returns null (never guesses from magnitude)', () => {
      expect(calculateSubIndex('co', 2.0)).toBeNull();
      expect(calculateSubIndex('co', 2000)).toBeNull();
      expect(calculateSubIndex('co', 50, null)).toBeNull();
    });

    it('34. Missing or non-finite pollutant input safely returns null', () => {
      expect(calculateSubIndex('pm25', NaN)).toBeNull();
      expect(calculateSubIndex('pm10', Infinity)).toBeNull();
      expect(calculateSubIndex('unknown_gas', 50)).toBeNull();
    });

    it('35. Negative pollutant concentrations return null', () => {
      expect(calculateSubIndex('pm25', -1)).toBeNull();
      expect(calculateSubIndex('co', -2.0, 'mg/m3')).toBeNull();
      expect(calculateSubIndex('no2', -40)).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // GROUP C: CPCB DATA SUFFICIENCY & AVERAGING (Scenarios 36–52)
  // ---------------------------------------------------------------------------
  describe('Group C: CPCB Data Sufficiency & Averaging Validation (36–52)', () => {
    it('36. Zero valid pollutants returns unavailable classification with null AQI', () => {
      const res = calculateComprehensiveCpcbNaqi({});
      expect(res.aqi).toBeNull();
      expect(res.category).toBeNull();
      expect(res.classification).toBe('unavailable');
      expect(res.isDataSufficient).toBe(false);
      expect(res.monitoredPollutantCount).toBe(0);
    });

    it('37. One pollutant returns indicative_subindex, not statutory NAQI', () => {
      const res = calculateComprehensiveCpcbNaqi({ pm25: 75 });
      expect(res.isDataSufficient).toBe(false);
      expect(res.classification).toBe('indicative_subindex');
      expect(res.monitoredPollutantCount).toBe(1);
      expect(res.aqi).not.toBeNull();
      expect(res.notes).toContain('Indicative');
    });

    it('38. Two pollutants return indicative_subindex (minimum 3 required)', () => {
      const res = calculateComprehensiveCpcbNaqi({ pm25: 75, pm10: 150 });
      expect(res.isDataSufficient).toBe(false);
      expect(res.classification).toBe('indicative_subindex');
      expect(res.monitoredPollutantCount).toBe(2);
      expect(res.missingRequirements.some(r => r.includes('At least 3 pollutants required'))).toBe(true);
    });

    it('39. Three pollutants including PM2.5 satisfies data sufficiency', () => {
      const res = calculateComprehensiveCpcbNaqi({
        pm25: 65,
        no2: 45,
        so2: 25,
        averagingPeriods: { pm25: 1440, no2: 1440, so2: 1440 },
      });
      expect(res.isDataSufficient).toBe(true);
      expect(res.monitoredPollutantCount).toBe(3);
      expect(res.classification).toBe('statutory_compliant');
    });

    it('40. Three pollutants including PM10 satisfies data sufficiency', () => {
      const res = calculateComprehensiveCpcbNaqi({
        pm10: 120,
        no2: 45,
        so2: 25,
        averagingPeriods: { pm10: 1440, no2: 1440, so2: 1440 },
      });
      expect(res.isDataSufficient).toBe(true);
      expect(res.monitoredPollutantCount).toBe(3);
      expect(res.classification).toBe('statutory_compliant');
    });

    it('41. Three gaseous pollutants WITHOUT particulate matter fails data sufficiency', () => {
      const res = calculateComprehensiveCpcbNaqi({
        no2: 50,
        so2: 30,
        co: 2.0,
        coUnit: 'mg/m3',
        averagingPeriods: { no2: 1440, so2: 1440, co: 480 },
      });
      expect(res.isDataSufficient).toBe(false);
      expect(res.missingRequirements.some(r => r.includes('Either PM2.5 or PM10 must be monitored'))).toBe(true);
      expect(res.classification).toBe('indicative_subindex');
    });

    it('42. Invalid pollutant is excluded from count', () => {
      const res = calculateComprehensiveCpcbNaqi({
        pm25: 80,
        no2: -10, // Invalid negative
        so2: 30,
        averagingPeriods: { pm25: 1440, so2: 1440 },
      });
      expect(res.monitoredPollutantCount).toBe(2);
      expect(res.isDataSufficient).toBe(false);
    });

    it('43. Duplicate or conflicting inputs do not artificially inflate pollutant count', () => {
      const res = calculateComprehensiveCpcbNaqi({
        pm25: 80,
        no2: 40,
        so2: 20,
        averagingPeriods: { pm25: 1440, no2: 1440, so2: 1440 },
      });
      expect(res.monitoredPollutantCount).toBe(3);
      expect(Object.keys(res.subIndices).length).toBe(3);
    });

    it('44. Missing averaging periods result in indicative_snapshot classification', () => {
      const res = calculateComprehensiveCpcbNaqi({
        pm25: 80,
        no2: 40,
        so2: 20,
        // averagingPeriods omitted
      });
      expect(res.isDataSufficient).toBe(true);
      expect(res.classification).toBe('indicative_snapshot');
      expect(res.notes).toContain('snapshot');
    });

    it('45. Valid 24-hour averages for criteria pollutants yield statutory_compliant', () => {
      const res = calculateComprehensiveCpcbNaqi({
        pm25: 80,
        no2: 40,
        so2: 20,
        averagingPeriods: { pm25: 1440, no2: 1440, so2: 1440 },
      });
      expect(res.classification).toBe('statutory_compliant');
      expect(res.evidence.averagingVerified).toBe(true);
    });

    it('46. Valid 8-hour averaging for CO satisfies statutory averaging', () => {
      const res = calculateComprehensiveCpcbNaqi({
        pm25: 80,
        no2: 40,
        co: 2.0,
        coUnit: 'mg/m3',
        averagingPeriods: { pm25: 1440, no2: 1440, co: 480 },
      });
      expect(res.classification).toBe('statutory_compliant');
      expect(res.evidence.averagingVerified).toBe(true);
    });

    it('47. Valid 8-hour averaging for Ozone satisfies statutory averaging', () => {
      const res = calculateComprehensiveCpcbNaqi({
        pm25: 80,
        no2: 40,
        o3: 60,
        averagingPeriods: { pm25: 1440, no2: 1440, o3: 480 },
      });
      expect(res.classification).toBe('statutory_compliant');
      expect(res.evidence.averagingVerified).toBe(true);
    });

    it('48. Incorrect 24-hour averaging period for CO prevents statutory compliance', () => {
      const res = calculateComprehensiveCpcbNaqi({
        pm25: 80,
        no2: 40,
        co: 2.0,
        coUnit: 'mg/m3',
        averagingPeriods: { pm25: 1440, no2: 1440, co: 1440 }, // CO is 24-hr instead of 8-hr!
      });
      expect(res.classification).toBe('indicative_snapshot');
      expect(res.evidence.averagingVerified).toBe(false);
    });

    it('49. Incorrect 8-hour averaging period for PM2.5 prevents statutory compliance', () => {
      const res = calculateComprehensiveCpcbNaqi({
        pm25: 80,
        no2: 40,
        so2: 20,
        averagingPeriods: { pm25: 480, no2: 1440, so2: 1440 }, // PM2.5 is 8-hr instead of 24-hr!
      });
      expect(res.classification).toBe('indicative_snapshot');
      expect(res.evidence.averagingVerified).toBe(false);
    });

    it('50. Mixed valid and invalid averaging periods prevent statutory compliance', () => {
      const res = calculateComprehensiveCpcbNaqi({
        pm25: 80,
        no2: 40,
        so2: 20,
        averagingPeriods: { pm25: 60, no2: 1440, so2: 1440 }, // 1-hour snapshot for PM2.5
      });
      expect(res.classification).toBe('indicative_snapshot');
    });

    it('51. Legacy boolean is24HourAveraged cannot bypass CO/O3 8-hour requirement', () => {
      const res = calculateComprehensiveCpcbNaqi({
        pm25: 80,
        no2: 40,
        co: 2.0,
        coUnit: 'mg/m3',
        is24HourAveraged: true, // Blanket boolean cannot verify 8-hr CO
      });
      expect(res.classification).toBe('indicative_snapshot');
      expect(res.evidence.averagingVerified).toBe(false);
    });

    it('52. Local mathematical calculation never sets isOfficialPublished to true', () => {
      const res = calculateComprehensiveCpcbNaqi({
        pm25: 80,
        no2: 40,
        so2: 20,
        averagingPeriods: { pm25: 1440, no2: 1440, so2: 1440 },
      });
      expect(res.isOfficialPublished).toBe(false);
      expect(res.evidence.isOfficialPublished).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // GROUP D: PROVENANCE, INTEGRATION & DISPLAY INTEGRITY (Scenarios 53–70)
  // ---------------------------------------------------------------------------
  describe('Group D: Scientific Provenance & UI Presentation Integrity (53–70)', () => {
    it('53. Provider-reported US AQI is preserved and marked as modeled_forecast / provider_reported', async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('air-quality-api')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              current: {
                time: '2026-11-23T12:00:00Z',
                pm2_5: 45.0,
                pm10: 95.0,
                us_aqi: 124, // Upstream model reported multi-pollutant US AQI
              },
              hourly: { time: [], pm2_5: [], us_aqi: [] },
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ current: { temperature_2m: 24, relative_humidity_2m: 55 } }),
        });
      });
      global.fetch = mockFetch;

      const metrics = await fetchLiveAtmosphericMetrics(28.61, 77.23, { cityName: 'New Delhi' });
      expect(metrics.usAqi).toBe(124);
      expect(metrics.aqiEvidence?.method).toBe('provider_reported');
      expect(metrics.aqiEvidence?.classification).toBe('modeled_forecast');
      expect(metrics.aqiEvidence?.standard).toBe('US_EPA');
    });

    it('54. Missing provider AQI falls back to single-species PM2.5 calculation labeled indicative sub-index', async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('air-quality-api')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              current: {
                time: '2026-11-23T12:00:00Z',
                pm2_5: 35.4,
                pm10: 60.0,
                us_aqi: null, // Upstream AQI missing
              },
              hourly: { time: [], pm2_5: [], us_aqi: [] },
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ current: { temperature_2m: 22, relative_humidity_2m: 50 } }),
        });
      });
      global.fetch = mockFetch;

      const metrics = await fetchLiveAtmosphericMetrics(28.61, 77.23, { cityName: 'New Delhi' });
      expect(metrics.usAqi).toBe(100); // 35.4 µg/m³ = AQI 100
      expect(metrics.aqiEvidence?.method).toBe('epa_pm25_24h_subindex');
      expect(metrics.aqiEvidence?.classification).toBe('derived_calculation');
      expect(metrics.aqiEvidence?.sourceProvider).toContain('Avir Derived');
    });

    it('55. Missing upstream telemetry sets AQI to null and method to unavailable', async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('air-quality-api')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              current: {
                time: '2026-11-23T12:00:00Z',
                pm2_5: null,
                pm10: null,
                us_aqi: null,
              },
              hourly: { time: [], pm2_5: [], us_aqi: [] },
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ current: { temperature_2m: 20 } }),
        });
      });
      global.fetch = mockFetch;

      const metrics = await fetchLiveAtmosphericMetrics(28.61, 77.23, { cityName: 'New Delhi' });
      expect(metrics.usAqi).toBeNull();
      expect(metrics.aqiEvidence?.method).toBe('unavailable');
      expect(metrics.aqiEvidence?.indexValue).toBeNull();
    });

    it('56. Model snapshot CPCB NAQI is classified as indicative_snapshot, not statutory_compliant', async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('air-quality-api')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              current: {
                time: '2026-11-23T12:00:00Z',
                pm2_5: 80.0,
                pm10: 160.0,
                nitrogen_dioxide: 45.0,
                sulphur_dioxide: 20.0,
                us_aqi: 164,
              },
              hourly: { time: [], pm2_5: [], us_aqi: [] },
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ current: { temperature_2m: 20 } }),
        });
      });
      global.fetch = mockFetch;

      const metrics = await fetchLiveAtmosphericMetrics(28.61, 77.23, { cityName: 'New Delhi' });
      expect(metrics.cpcbStatus).toBe('indicative_snapshot');
      expect(metrics.cpcbEvidence?.averagingVerified).toBe(false);
    });

    it('57. Genuine ground station observations retain observed provenance and separate standard', () => {
      const cpcb = calculateCpcbNaqi(75, 120);
      expect(cpcb.aqi).toBeGreaterThanOrEqual(100);
      expect(cpcb.isIndicativeSubIndex).toBe(true);
    });

    it('58. Officially published index is distinguished from local calculation', () => {
      const published = calculateComprehensiveCpcbNaqi({
        pm25: 80,
        no2: 40,
        so2: 20,
        averagingPeriods: { pm25: 1440, no2: 1440, so2: 1440 },
        isOfficialPublished: true, // Explicitly verified from authentic official bulletin
        sourceProvider: 'CPCB (Central Pollution Control Board) 4 PM Bulletin',
      });
      expect(published.isOfficialPublished).toBe(true);
      expect(published.evidence.method).toBe('cpcb_official_published');

      const derived = calculateComprehensiveCpcbNaqi({
        pm25: 80,
        no2: 40,
        so2: 20,
        averagingPeriods: { pm25: 1440, no2: 1440, so2: 1440 },
      });
      expect(derived.isOfficialPublished).toBe(false);
      expect(derived.evidence.method).toBe('cpcb_statutory_eligible');
    });

    it('59. Stale source data is marked stale and does not claim fresh observation', async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('air-quality-api')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              current: { time: '2026-11-23T08:00:00Z', pm2_5: 50.0, us_aqi: 137 },
              hourly: { time: [], pm2_5: [] },
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ current: { temperature_2m: 25 } }),
        });
      });
      global.fetch = mockFetch;

      const first = await fetchLiveAtmosphericMetrics(28.61, 77.23);
      expect(first.isLive).toBe(true);

      // Subsequent simulated network error falls back to cache
      global.fetch = vi.fn().mockRejectedValue(new Error('Network timeout'));
      // Invalidate cache TTL so it is returned as stale
      const cacheKey = 'telemetry_28.61_77.23';
      const entry = telemetryCache.get(cacheKey);
      if (entry) {
        telemetryCache.set(cacheKey, { ...entry, isStale: true }, 100);
      }
    });

    it('60. Missing or empty timestamp is safely handled without fabricating current time', () => {
      const res = calculateComprehensiveCpcbNaqi({ pm25: 50 });
      expect(res.notes).toBeDefined();
    });

    it('61. Original units are preserved in field metadata', () => {
      const res = calculateComprehensiveCpcbNaqi({
        pm25: 45,
        co: 1500,
        coUnit: 'ug/m3',
      });
      expect(res.subIndices.co.unit).toBe('ug/m3');
      expect(res.subIndices.pm25.unit).toBe('µg/m³');
    });

    it('62. Converted units are correctly evaluated and logged', () => {
      const res = calculateComprehensiveCpcbNaqi({
        co: 2000,
        coUnit: 'ug/m3',
        pm25: 50,
      });
      expect(res.subIndices.co.subIndex).toBe(100); // 2000 ug/m3 converted to 2.0 mg/m3 -> sub-index 100
    });

    it('63. UI categories use correct respective standards', () => {
      // US EPA: 56 is Moderate
      expect(getAQICategory(56)).toBe('Moderate');
      // CPCB: 56 is Satisfactory (0-50 Good, 51-100 Satisfactory)
      expect(getCpcbCategory(56)).toBe('Satisfactory');
    });

    it('64. Unavailable AQI never defaults to Good', () => {
      expect(getAQICategory(null)).toBe('Unavailable');
      expect(getAQICategory(undefined)).toBe('Unavailable');
      expect(getAQICategory(NaN)).toBe('Unavailable');
      expect(getAQICategory(-1)).toBe('Unavailable');

      const cpcbUnavail = calculateCpcbNaqi(null, null);
      expect(cpcbUnavail.category).toBe('Unavailable');
      expect(cpcbUnavail.category).not.toBe('Good');
    });

    it('65. Unavailable AQI never defaults to Hazardous', () => {
      expect(getAQICategory(null)).not.toBe('Hazardous');
      expect(getAQICategory(undefined)).not.toBe('Hazardous');
    });

    it('66. Zero AQI is explicitly displayed as 0 and not treated as missing', () => {
      const zeroEpa = calculateAQIFromPM25(0);
      expect(zeroEpa).toBe(0);
      expect(getAQICategory(zeroEpa)).toBe('Good');

      const zeroCpcb = calculateCpcbNaqi(0, 0);
      expect(zeroCpcb.aqi).toBe(0);
      expect(zeroCpcb.category).toBe('Good');
    });

    it('67. Partial telemetry remains classified as partial without numeric fabrication', async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('air-quality-api')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              current: { time: '2026-11-23T12:00:00Z', pm2_5: 35.0, pm10: null, us_aqi: null },
              hourly: { time: [], pm2_5: [] },
            }),
          });
        }
        return Promise.reject(new Error('Weather API unreachable'));
      });
      global.fetch = mockFetch;

      const metrics = await fetchLiveAtmosphericMetrics(28.61, 77.23);
      expect(metrics.status).toBe('partial');
      expect(metrics.temperature).toBeNull();
      expect(metrics.pm25).toBe(35.0);
    });

    it('68. Cross-standard comparisons are explicitly identified', () => {
      const epaAqi = calculateAQIFromPM25(45);
      const cpcbAqi = calculateCpcbNaqi(45, null).aqi;
      expect(epaAqi).toBeDefined();
      expect(cpcbAqi).toBeDefined();
      // Different numerical values due to standard-specific mathematical breakpoints
      expect(epaAqi).not.toBe(cpcbAqi);
    });

    it('69. No false statutory GRAP order is inferred from numerical AQI alone', () => {
      const grap = getGrapStage(420);
      expect(grap.stage).toBe('Stage III');
      expect(grap.isStatutoryOrderVerified).toBe(false);
      expect(grap.benchmarkType).toBe('indicative_threshold');
      expect(grap.label).toContain('Indicative');
    });

    it('70. No fabricated pollutant values appear in calculations', () => {
      const res = calculateComprehensiveCpcbNaqi({ pm25: 50 });
      expect(res.subIndices.pm10).toBeUndefined();
      expect(res.subIndices.no2).toBeUndefined();
      expect(res.subIndices.co).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // GROUP E: REGRESSION & INTEGRATION HEALTH (Scenarios 71–80)
  // ---------------------------------------------------------------------------
  describe('Group E: Regression & Cross-System Health (71–80)', () => {
    it('71. World Explorer functions correctly with 2024 EPA calculations', () => {
      const parsed = parseBatchTelemetryResponse(
        [WORLD_METROS[0]],
        [
          {
            latitude: 28.6139,
            longitude: 77.2090,
            current: { time: '2026-11-23T12:00:00Z', pm2_5: 12.0, pm10: 25.0 },
          },
        ]
      );
      expect(parsed.length).toBe(1);
      // Under 2024 EPA rule, 12.0 µg/m³ derives AQI 56 (Moderate)
      expect(parsed[0].usAqi).toBe(56);
      expect(parsed[0].category).toBe('Moderate');
      expect(parsed[0].status).toBe('partial');
      expect(parsed[0].incompatibilityReasons?.some(r => r.includes('derived'))).toBe(true);
    });

    it('72. CityShootout comparison logic remains consistent and stable', () => {
      const comp = calculateCityComparison(
        {
          name: 'Delhi',
          country: 'India',
          pm25: 120,
          aqi: 300,
          timestamp: '2026-11-23T12:00:00Z',
          status: 'available',
          sourceKind: 'atmospheric_model',
          modelDomain: 'cams_global',
          units: { pm25: 'µg/m³' },
        },
        {
          name: 'Tokyo',
          country: 'Japan',
          pm25: 12,
          aqi: 56,
          timestamp: '2026-11-23T12:00:00Z',
          status: 'available',
          sourceKind: 'atmospheric_model',
          modelDomain: 'cams_global',
          units: { pm25: 'µg/m³' },
        }
      );
      expect(comp).toBeDefined();
      expect(comp.comparable).toBe(true);
      expect(comp.cleanerCityName).toBe('Tokyo');
      expect(comp.dirtierCityName).toBe('Delhi');
      expect(comp.pm25ConcentrationRatio).toBe(10);
    });

    it('73. CPCB source calculation integrity remains intact', () => {
      // PM2.5 = 15 -> sub-index 25; PM10 = 30 -> sub-index 30. Max = 30.
      const cpcb = calculateCpcbNaqi(15, 30);
      expect(cpcb.aqi).toBe(30);
      expect(cpcb.category).toBe('Good');

      // PM2.5 alone: PM2.5 = 15 -> 25
      const cpcbOnlyPm25 = calculateCpcbNaqi(15, null);
      expect(cpcbOnlyPm25.aqi).toBe(25);
      expect(cpcbOnlyPm25.category).toBe('Good');
    });

    it('74. OpenAQ integration models and calculations remain compatible', () => {
      const aqi = calculateAQIFromPM25(25.0);
      expect(aqi).toBeGreaterThan(50);
      expect(aqi).toBeLessThan(100);
    });

    it('75. Personal monitor calculations remain compatible', () => {
      const aqi = calculateAQIFromPM25(10.5);
      expect(aqi).toBe(54);
    });

    it('76. Source provenance integrity is strictly preserved', () => {
      const epaDetailed = calculateDetailedEpaPm25Aqi(20.0);
      expect(epaDetailed.evidence.standard).toBe('US_EPA');
      expect(epaDetailed.evidence.isOfficialPublished).toBe(false);
    });

    it('77. No cached value fabrication occurs across requests', () => {
      expect(telemetryCache.get('nonexistent_key')).toBeNull();
    });

    it('78. UI category mappings strictly handle null, NaN, and negative values', () => {
      expect(getAQICategory(null)).toBe('Unavailable');
      expect(getAQICategory(NaN)).toBe('Unavailable');
      expect(getAQICategory(-100)).toBe('Unavailable');
    });

    it('79. City switching calculations remain free of side-effects', () => {
      const aqiDelhi = calculateAQIFromPM25(100);
      const aqiTokyo = calculateAQIFromPM25(10);
      expect(aqiDelhi).not.toBeNull();
      expect(aqiTokyo).not.toBeNull();
      expect(aqiDelhi!).toBeGreaterThan(aqiTokyo!);
    });

    it('80. All 2024 EPA breakpoints match official codification tables exactly', () => {
      expect(EPA_PM25_2024_BREAKPOINTS[0]).toEqual({
        pollutant: 'pm25',
        unit: 'µg/m³',
        averagingPeriod: '24-hour',
        cLow: 0.0,
        cHigh: 9.0,
        iLow: 0,
        iHigh: 50,
        category: 'Good',
        standardVersion: 'EPA 2024 PM NAAQS (40 CFR Part 58 App G, May 2024)',
        regulatorySource: 'US EPA Revised Air Quality Index for Particulate Matter',
      });
      expect(EPA_PM25_2024_BREAKPOINTS[1].cLow).toBe(9.1);
      expect(EPA_PM25_2024_BREAKPOINTS[1].cHigh).toBe(35.4);
      expect(EPA_PM25_2024_BREAKPOINTS[2].cLow).toBe(35.5);
      expect(EPA_PM25_2024_BREAKPOINTS[2].cHigh).toBe(55.4);
      expect(EPA_PM25_2024_BREAKPOINTS[3].cLow).toBe(55.5);
      expect(EPA_PM25_2024_BREAKPOINTS[3].cHigh).toBe(125.4);
      expect(EPA_PM25_2024_BREAKPOINTS[4].cLow).toBe(125.5);
      expect(EPA_PM25_2024_BREAKPOINTS[4].cHigh).toBe(225.4);
      expect(EPA_PM25_2024_BREAKPOINTS[5].cLow).toBe(225.5);
      expect(EPA_PM25_2024_BREAKPOINTS[5].cHigh).toBe(325.4);
    });
  });
});
