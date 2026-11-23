import { describe, it, expect } from 'vitest';
import {
  calculateAQIFromPM25,
  calculateDetailedEpaPm25Aqi,
  getAQICategory,
  calculateCpcbNaqi,
  EPA_PM25_2024_BREAKPOINTS,
  EPA_PM25_HISTORICAL_BREAKPOINTS,
  calculateEpaPm25Aqi,
} from '@/domain/air-math';
import {
  calculateComprehensiveCpcbNaqi,
  calculateSubIndex,
  getCpcbCategory,
} from '@/domain/cpcb-naqi';
import { buildMultiSourceFeeds } from '@/domain/advanced-air-math';
import { GroundStationMetadata } from '@/domain/types';

describe('AVIR Step 7 AQI Blockers — Regression & Corrective Test Suite', () => {
  // ---------------------------------------------------------------------------
  // AQI-01: US EPA PM2.5 Upper Hazardous Breakpoints & Historical Standards
  // ---------------------------------------------------------------------------
  describe('AQI-01: EPA PM2.5 Upper Hazardous Breakpoints & Historical Standards', () => {
    it('1. EPA 2024 revised standard accurately computes Hazardous Tier 1 (225.5 - 325.4 µg/m³ -> AQI 301 - 400)', () => {
      // 225.4 is upper bound of Very Unhealthy (AQI 300)
      expect(calculateAQIFromPM25(225.4)).toBe(300);
      expect(getAQICategory(300)).toBe('VeryUnhealthy');

      // 225.5 enters Hazardous Tier 1 (AQI 301)
      expect(calculateAQIFromPM25(225.5)).toBe(301);
      expect(getAQICategory(301)).toBe('Hazardous');

      // Midpoint: 275.45 -> (99 / 99.9) * (275.4 - 225.5) + 301 = 0.99099 * 49.9 + 301 = 49.45 + 301 = 350.45 -> 350
      expect(calculateAQIFromPM25(275.4)).toBe(350);

      // 325.4 is upper bound of Tier 1 Hazardous (AQI 400)
      expect(calculateAQIFromPM25(325.4)).toBe(400);
      expect(getAQICategory(400)).toBe('Hazardous');
    });

    it('2. EPA 2024 revised standard accurately computes Hazardous Tier 2 (325.5 - 500.4 µg/m³ -> AQI 401 - 500)', () => {
      // 325.5 enters Hazardous Tier 2 (AQI 401)
      expect(calculateAQIFromPM25(325.5)).toBe(401);

      // Midpoint: 412.95 -> (99 / 174.9) * (412.9 - 325.5) + 401 = 0.566037 * 87.4 + 401 = 49.47 + 401 = 450.47 -> 450
      expect(calculateAQIFromPM25(412.9)).toBe(450);

      // 500.4 reaches maximum AQI 500
      expect(calculateAQIFromPM25(500.4)).toBe(500);
      expect(getAQICategory(500)).toBe('Hazardous');
    });

    it('3. Concentrations above 500.4 µg/m³ are capped at AQI 500 and flagged as Beyond AQI in detailed metadata', () => {
      expect(calculateAQIFromPM25(500.5)).toBe(500);
      expect(calculateAQIFromPM25(750.0)).toBe(500);
      expect(calculateAQIFromPM25(999.9)).toBe(500);

      const detailed = calculateDetailedEpaPm25Aqi(650.0);
      expect(detailed.aqi).toBe(500);
      expect(detailed.category).toBe('Hazardous');
      expect(detailed.isBeyondAqi).toBe(true);
      expect(detailed.evidence.notes).toContain('exceeds maximum defined breakpoint (500.4 µg/m³)');
    });

    it('4. Historical EPA standard (1999/2012) calculates distinct breakpoints (e.g. 12.0 µg/m³ Good vs Moderate)', () => {
      expect(EPA_PM25_HISTORICAL_BREAKPOINTS).toBeDefined();
      expect(EPA_PM25_HISTORICAL_BREAKPOINTS.length).toBe(7);

      // Under historical standard: 0.0 - 12.0 is Good (AQI 0 - 50)
      const hist12 = calculateEpaPm25Aqi(12.0, 'historical');
      expect(hist12).toBe(50);

      // Under 2024 standard: 12.0 is Moderate (AQI 56)
      const rev12 = calculateEpaPm25Aqi(12.0, '2024');
      expect(rev12).toBe(56);

      // Under historical standard: 150.4 is Unhealthy (AQI 200)
      const hist150 = calculateEpaPm25Aqi(150.4, 'historical');
      expect(hist150).toBe(200);

      // Under 2024 standard: 150.4 is Very Unhealthy (AQI 226)
      const rev150 = calculateEpaPm25Aqi(150.4, '2024');
      expect(rev150).toBe(226);
    });
  });

  // ---------------------------------------------------------------------------
  // AQI-02: CPCB Official Publication Provenance Verification
  // ---------------------------------------------------------------------------
  describe('AQI-02: CPCB Official Publication Provenance Verification', () => {
    it('5. Setting isOfficialPublished: true without genuine CPCB sourceProvider is rejected', () => {
      // Local calculation or citizen monitor cannot claim official CPCB publication
      const result = calculateComprehensiveCpcbNaqi({
        pm25: 80,
        no2: 40,
        so2: 20,
        averagingPeriods: { pm25: 1440, no2: 1440, so2: 1440 },
        isOfficialPublished: true, // Attempt to set flag without official bulletin provenance
        sourceProvider: 'Local AirGradient Sensor',
      });

      expect(result.isOfficialPublished).toBe(false);
      expect(result.evidence.isOfficialPublished).toBe(false);
      expect(result.evidence.method).not.toBe('cpcb_official_published');
      expect(result.missingRequirements).toContain('Official publication flag rejected: unverified publication provenance.');
    });

    it('6. Verified official CPCB bulletin sourceProvider is approved as isOfficialPublished', () => {
      const result = calculateComprehensiveCpcbNaqi({
        pm25: 120,
        pm10: 200,
        no2: 50,
        averagingPeriods: { pm25: 1440, pm10: 1440, no2: 1440 },
        isOfficialPublished: true,
        sourceProvider: 'CPCB (Central Pollution Control Board) 4 PM Bulletin',
      });

      expect(result.isOfficialPublished).toBe(true);
      expect(result.evidence.isOfficialPublished).toBe(true);
      expect(result.evidence.method).toBe('cpcb_official_published');
    });

    it('7. calculateCpcbNaqi always returns isOfficialPublished: false', () => {
      const sub = calculateCpcbNaqi(90, 160);
      expect(sub.isOfficialPublished).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // AQI-03: CPCB Averaging Evidence and 16-Hour Data Sufficiency
  // ---------------------------------------------------------------------------
  describe('AQI-03: CPCB Averaging Evidence and Data Sufficiency', () => {
    it('8. Legacy boolean is24HourAveraged cannot bypass 8-hr averaging for CO or Ozone', () => {
      const result = calculateComprehensiveCpcbNaqi({
        pm25: 75,
        no2: 35,
        co: 2.5,
        coUnit: 'mg/m3',
        is24HourAveraged: true, // Blanket boolean cannot verify 8-hr CO requirement
      });

      expect(result.classification).toBe('indicative_snapshot');
      expect(result.evidence.averagingVerified).toBe(false);
    });

    it('9. Insufficient hours (< 16 hours out of 24) in averagingPeriods rejects statutory compliance', () => {
      const result = calculateComprehensiveCpcbNaqi({
        pm25: 85,
        no2: 45,
        so2: 15,
        averagingPeriods: {
          pm25: 480, // Only 8 hours of data (less than 16 hours required by CPCB)
          no2: 1440,
          so2: 1440,
        },
      });

      expect(result.classification).toBe('indicative_snapshot');
      expect(result.evidence.averagingVerified).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // AQI-04: EPA vs CPCB Label Conflation in buildMultiSourceFeeds()
  // ---------------------------------------------------------------------------
  describe('AQI-04: EPA vs CPCB Label Conflation in buildMultiSourceFeeds()', () => {
    it('10. Official reference ground station calculates genuine CPCB sub-index for CPCB-NAQI standard', () => {
      // For PM2.5 = 60 µg/m³:
      // US EPA AQI (2024): (49 / 69.9) * (60.0 - 55.5) + 151 = 0.701 * 4.5 + 151 = 154 (Unhealthy)
      // CPCB NAQI sub-index: 60.0 is upper limit of Satisfactory (31-60 -> 51-100), yielding exactly 100!
      const mockStation: GroundStationMetadata = {
        stationId: 'delhi-anand-vihar-cpcb',
        stationName: 'Anand Vihar, Delhi',
        distanceKm: 2.1,
        latitude: 28.65,
        longitude: 77.31,
        provider: 'CPCB (Central Pollution Control Board)',
        stationType: 'official_reference',
        stationState: 'live_observation',
        lastUpdated: '2026-11-23T18:00:00Z',
        pm25: 60.0,
        pm10: null,
      };

      const feeds = buildMultiSourceFeeds({
        pm25: 60.0,
        usAqi: 154,
        cpcbAqi: 100,
        boundaryLayerHeight: 350,
        isThermalInversion: false,
        groundStation: mockStation,
      });

      const groundFeed = feeds.find(f => f.id === 'ground-delhi-anand-vihar-cpcb');
      expect(groundFeed).toBeDefined();
      expect(groundFeed?.standard).toBe('CPCB-NAQI');
      // Crucial assertion: ground feed AQI must be the CPCB sub-index (100), NOT US EPA AQI (154)!
      expect(groundFeed?.aqi).toBe(100);
      expect(groundFeed?.aqi).not.toBe(154);
    });

    it('11. Citizen science ground station calculates US EPA AQI for US-EPA standard', () => {
      const mockCitizenStation: GroundStationMetadata = {
        stationId: 'purpleair-12345',
        stationName: 'South Delhi Citizen Sensor',
        distanceKm: 1.5,
        latitude: 28.55,
        longitude: 77.22,
        provider: 'PurpleAir',
        stationType: 'community_optical',
        stationState: 'live_observation',
        lastUpdated: '2026-11-23T18:00:00Z',
        pm25: 60.0,
        pm10: null,
      };

      const feeds = buildMultiSourceFeeds({
        pm25: 60.0,
        usAqi: 154,
        cpcbAqi: 100,
        boundaryLayerHeight: 350,
        isThermalInversion: false,
        groundStation: mockCitizenStation,
      });

      const citizenFeed = feeds.find(f => f.id === 'ground-purpleair-12345');
      expect(citizenFeed).toBeDefined();
      expect(citizenFeed?.standard).toBe('US-EPA');
      expect(citizenFeed?.aqi).toBe(154);
    });
  });

  // ---------------------------------------------------------------------------
  // AQI-05: Indicative Sub-Index vs Complete Index Differentiation
  // ---------------------------------------------------------------------------
  describe('AQI-05: Indicative Sub-Index vs Complete Index Differentiation', () => {
    it('12. calculateCpcbNaqi returns isCompleteIndex: false and isIndicativeSubIndex: true', () => {
      const result = calculateCpcbNaqi(75, 120);
      expect(result.aqi).toBeDefined();
      expect(result.isIndicativeSubIndex).toBe(true);
      expect(result.isCompleteIndex).toBe(false);
      expect(result.isOfficialPublished).toBe(false);
    });

    it('13. calculateComprehensiveCpcbNaqi with <3 pollutants returns isCompleteIndex: false', () => {
      const result = calculateComprehensiveCpcbNaqi({
        pm25: 65,
        pm10: 110,
        // Only 2 pollutants
      });

      expect(result.isDataSufficient).toBe(false);
      expect(result.isCompleteIndex).toBe(false);
      expect(result.classification).toBe('indicative_subindex');
    });

    it('14. calculateComprehensiveCpcbNaqi with >=3 pollutants returns isCompleteIndex: true', () => {
      const result = calculateComprehensiveCpcbNaqi({
        pm25: 65,
        pm10: 110,
        no2: 45,
      });

      expect(result.isDataSufficient).toBe(true);
      expect(result.isCompleteIndex).toBe(true);
    });
  });
});
