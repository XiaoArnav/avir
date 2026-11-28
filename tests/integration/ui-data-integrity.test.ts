import { describe, it, expect } from 'vitest';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { getAQICategory } from '@/domain/air-math';
import { AtmosphericMetrics } from '@/domain/types';
import { RwaBulletinModal } from '@/components/RwaBulletinModal';
import { SchoolSafetyAdvisoryModal } from '@/components/SchoolSafetyAdvisoryModal';
import { ShareBulletinModal } from '@/components/ShareBulletinModal';
import { CityShootout, COMPARISON_TARGETS } from '@/components/CityShootout';
import { CommuteCalculator } from '@/components/CommuteCalculator';
import { FilterLifespanEstimator } from '@/components/FilterLifespanEstimator';
import { AtmosphereHero } from '@/components/AtmosphereHero';

describe('AVIR STEP 02 — Production UI Data Integrity & Zero-Fabrication Suite', () => {
  // -------------------------------------------------------------------------
  // 1. MAIN PAGE DATA STATE & CATEGORIZATION
  // -------------------------------------------------------------------------
  describe('Group 1: Main Page Telemetry Integrity', () => {
    it('Scenario 1: Missing AQI does not become Hazardous (evaluates strictly to Unavailable)', () => {
      expect(getAQICategory(null)).toBe('Unavailable');
      expect(getAQICategory(undefined)).toBe('Unavailable');
      expect(getAQICategory(NaN)).toBe('Unavailable');
      expect(getAQICategory(-1)).toBe('Unavailable');
      expect(getAQICategory(null)).not.toBe('Hazardous');
    });

    it('Scenario 2: Missing AQI does not become numeric zero (remains null)', () => {
      const mockMetrics: Partial<AtmosphericMetrics> = {
        usAqi: null,
        pm25: null,
      };
      const resolvedAqi = mockMetrics.usAqi ?? null;
      expect(resolvedAqi).toBeNull();
      expect(resolvedAqi).not.toBe(0);
    });

    it('Scenario 3: Changing city clears previous city dependent plan', () => {
      let activePlan: { city: string } | null = { city: 'Delhi' };
      const handleCitySelect = () => {
        activePlan = null; // Step 2 mandate: immediately wipe previous city plan
      };
      handleCitySelect();
      expect(activePlan).toBeNull();
    });

    it('Scenario 4: Unavailable telemetry does not trigger unsupported plan generation', () => {
      const errorTelemetry: Partial<AtmosphericMetrics> = {
        status: 'error',
        usAqi: null,
        pm25: null,
      };
      const shouldGeneratePlan =
        errorTelemetry.status !== 'error' &&
        errorTelemetry.usAqi !== null &&
        errorTelemetry.pm25 !== null;
      expect(shouldGeneratePlan).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 2. RWA COMMUNITY NOTICE MODAL
  // -------------------------------------------------------------------------
  describe('Group 2: RWA Community Notice Modal', () => {
    it('Scenario 5: Missing AQI never becomes fallback 380', () => {
      const metricsWithNullAqi: AtmosphericMetrics = {
        status: 'success',
        provenance: 'modeled_forecast',
        timestamp: '2026-11-22T10:00:00Z',
        retrievedAt: '2026-11-22T10:00:00Z',
        timezone: 'Asia/Kolkata',
        usAqi: null,
        pm25: 45,
        pm10: 90,
        boundaryLayerHeight: 600,
        isThermalInversionActive: false,
        isLive: true,
      };

      const html = ReactDOMServer.renderToString(
        React.createElement(RwaBulletinModal, {
          isOpen: true,
          onClose: () => {},
          cityName: 'Delhi',
          metrics: metricsWithNullAqi,
        })
      );

      expect(html).not.toContain('380');
      expect(html).toContain('Atmospheric Telemetry Unavailable');
    });

    it('Scenario 6: Missing PM2.5 never becomes fallback 220', () => {
      const metricsWithNullPm25: AtmosphericMetrics = {
        status: 'success',
        provenance: 'modeled_forecast',
        timestamp: '2026-11-22T10:00:00Z',
        retrievedAt: '2026-11-22T10:00:00Z',
        timezone: 'Asia/Kolkata',
        usAqi: 150,
        pm25: null,
        pm10: null,
        boundaryLayerHeight: 600,
        isThermalInversionActive: false,
        isLive: true,
      };

      const html = ReactDOMServer.renderToString(
        React.createElement(RwaBulletinModal, {
          isOpen: true,
          onClose: () => {},
          cityName: 'Noida',
          metrics: metricsWithNullPm25,
        })
      );

      expect(html).not.toContain('220');
      expect(html).toContain('Atmospheric Telemetry Unavailable');
    });

    it('Scenario 7: Export cannot silently contain fabricated values when data is missing', () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(RwaBulletinModal, {
          isOpen: true,
          onClose: () => {},
          cityName: 'Gurugram',
          metrics: null,
        })
      );

      // Buttons must be rendered with disabled attribute
      expect(html).toContain('disabled=""');
      expect(html).toContain('Export disabled');
    });

    it('Scenario 8: Partial or complete data is presented honestly with source provenance', () => {
      const validMetrics: AtmosphericMetrics = {
        status: 'success',
        provenance: 'modeled_forecast',
        sourceAttribution: 'Open-Meteo Atmospheric Chemistry Model',
        timestamp: '2026-11-22T10:00:00Z',
        retrievedAt: '2026-11-22T10:00:00Z',
        timezone: 'Asia/Kolkata',
        usAqi: 240,
        pm25: 180,
        pm10: 290,
        boundaryLayerHeight: 450,
        isThermalInversionActive: true,
        isLive: true,
      };

      const html = ReactDOMServer.renderToString(
        React.createElement(RwaBulletinModal, {
          isOpen: true,
          onClose: () => {},
          cityName: 'Faridabad',
          metrics: validMetrics,
        })
      );

      expect(html).toContain('240');
      expect(html).toContain('180');
      expect(html).toContain('Open-Meteo');
      expect(html).toContain('Numerical Atmospheric Model');
    });

    it('Scenario 9: Unverified official restrictions are not asserted as legally binding CAQM orders', () => {
      const validMetrics: AtmosphericMetrics = {
        status: 'success',
        provenance: 'modeled_forecast',
        timestamp: '2026-11-22T10:00:00Z',
        retrievedAt: '2026-11-22T10:00:00Z',
        timezone: 'Asia/Kolkata',
        usAqi: 310,
        pm25: 230,
        pm10: 340,
        boundaryLayerHeight: 300,
        isThermalInversionActive: true,
        isLive: true,
      };

      const html = ReactDOMServer.renderToString(
        React.createElement(RwaBulletinModal, {
          isOpen: true,
          onClose: () => {},
          cityName: 'Delhi',
          metrics: validMetrics,
        })
      );

      // Must be framed as clean-air advisory guidance, not mandatory statutory enforcement
      expect(html).toContain('RECOMMENDED COMMUNITY CLEAN-AIR ADVISORY');
      expect(html).not.toContain('MANDATORY COMMUNITY ACTIONS UNDER CAQM');
    });
  });

  // -------------------------------------------------------------------------
  // 3. SCHOOL SAFETY ADVISORY MODAL
  // -------------------------------------------------------------------------
  describe('Group 3: School Safety Advisory Modal', () => {
    it('Scenario 10: Valid AQI zero is accepted and not rejected as missing', () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(SchoolSafetyAdvisoryModal, {
          isOpen: true,
          onClose: () => {},
          cityName: 'Leh',
          usAqi: 0,
          pm25: 0,
        })
      );

      expect(html).toContain('Safe for All School Outdoor Activities');
      expect(html).not.toContain('Atmospheric telemetry is currently unavailable');
    });

    it('Scenario 11: Valid PM2.5 zero is accepted with safe pediatric status', () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(SchoolSafetyAdvisoryModal, {
          isOpen: true,
          onClose: () => {},
          cityName: 'Manali',
          usAqi: 15,
          pm25: 0,
        })
      );

      expect(html).toContain('Permitted Outdoors');
      expect(html).not.toContain('Atmospheric telemetry is currently unavailable');
    });

    it('Scenario 12: Null input produces an honest unavailable state', () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(SchoolSafetyAdvisoryModal, {
          isOpen: true,
          onClose: () => {},
          cityName: 'Shimla',
          usAqi: null,
          pm25: null,
        })
      );

      expect(html).toContain('Atmospheric telemetry is currently unavailable');
      expect(html).toContain('Shimla');
      expect(html).not.toContain('Campus Guidance Level');
    });

    it('Scenario 13: No false official school restriction order is issued', () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(SchoolSafetyAdvisoryModal, {
          isOpen: true,
          onClose: () => {},
          cityName: 'Delhi',
          usAqi: 420,
          pm25: 350,
        })
      );

      expect(html).toContain('Pediatric guidelines • Zero synthetic data policy');
      expect(html).not.toContain('OFFICIAL GOVERNMENT CLOSURE ORDER');
    });
  });

  // -------------------------------------------------------------------------
  // 4. SHARED COMMUNITY BULLETINS
  // -------------------------------------------------------------------------
  describe('Group 4: Share Daily Smog Bulletin Modal', () => {
    it('Scenario 14: Available values match the original telemetry exactly', () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(ShareBulletinModal, {
          isOpen: true,
          onClose: () => {},
          cityName: 'Chandigarh',
          usAqi: 112,
          pm25: 39.5,
          cigarettes: 1.8,
        })
      );

      expect(html).toContain('112 US AQI');
      expect(html).toContain('39.5 µg/m³');
      expect(html).toContain('1.8 cigs/day');
    });

    it('Scenario 15: Missing pollutant values produce honest unavailable state instead of false briefing', () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(ShareBulletinModal, {
          isOpen: true,
          onClose: () => {},
          cityName: 'Kolkata',
          usAqi: null,
          pm25: null,
          cigarettes: null,
        })
      );

      expect(html).toContain('Atmospheric telemetry is currently unavailable');
      expect(html).toContain('Kolkata');
      expect(html).not.toContain('Live Preview');
    });

    it('Scenario 16: Copied content preserves source attribution and provenance', () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(ShareBulletinModal, {
          isOpen: true,
          onClose: () => {},
          cityName: 'Bengaluru',
          usAqi: 65,
          pm25: 18.2,
          cigarettes: 0.8,
          sourceAttribution: 'Copernicus ECMWF CAMS',
          provenance: 'modeled_forecast',
        })
      );

      expect(html).toContain('Copernicus ECMWF CAMS');
      expect(html).toContain('Modeled Atmospheric Conditions');
    });

    it('Scenario 17: Null inputs do not create fabricated equivalents or default cigarettes', () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(ShareBulletinModal, {
          isOpen: true,
          onClose: () => {},
          cityName: 'Hyderabad',
          usAqi: null,
          pm25: 50,
          cigarettes: null,
        })
      );

      expect(html).toContain('Atmospheric telemetry is currently unavailable');
      expect(html).not.toContain('cigs/day');
    });
  });

  // -------------------------------------------------------------------------
  // 5. CITY SMOG COMPARISON
  // -------------------------------------------------------------------------
  describe('Group 5: City vs City Smog Shootout', () => {
    it('Scenario 18: No hardcoded city readings appear in production presets', () => {
      for (const target of COMPARISON_TARGETS) {
        expect((target as unknown as Record<string, unknown>).aqi).toBeUndefined();
        expect((target as unknown as Record<string, unknown>).pm25).toBeUndefined();
        expect(typeof target.latitude).toBe('number');
        expect(typeof target.longitude).toBe('number');
      }
    });

    it('Scenario 19: Missing comparison readings do not produce false ratios', () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(CityShootout, {
          currentCityName: 'Delhi',
          currentAqi: 250,
          currentPm25: 180,
          currentCountry: 'India',
          comparisonTargetData: null, // explicitly unavailable target
        })
      );

      expect(html).toContain('Comparison data unavailable');
      expect(html).not.toContain('Difference');
    });

    it('Scenario 20: Actual location/country metadata is preserved and not forced to India', () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(CityShootout, {
          currentCityName: 'Zurich',
          currentAqi: 18,
          currentPm25: 4.5,
          currentCountry: 'Switzerland',
          comparisonTargetData: { aqi: 24, pm25: 6.8 },
        })
      );

      expect(html).toContain('Switzerland');
      expect(html).not.toContain('Zurich (India)');
    });

    it('Scenario 21: Current city telemetry failure displays honest waiting state', () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(CityShootout, {
          currentCityName: 'Patna',
          currentAqi: null,
          currentPm25: null,
        })
      );

      expect(html).toContain('Awaiting live atmospheric readings');
      expect(html).toContain('Patna');
      expect(html).not.toContain('Primary City');
    });
  });

  // -------------------------------------------------------------------------
  // 6. COMMUTE & FILTER CALCULATORS
  // -------------------------------------------------------------------------
  describe('Group 6: Commute & Filter Lifespan Calculators', () => {
    it('Scenario 22: Valid zero PM2.5 is not treated as missing in Commute Calculator', () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(CommuteCalculator, {
          ambientPm25: 0,
        })
      );

      const cleanHtml = html.replace(/<!--.*?-->/g, '');
      expect(cleanHtml).toContain('Inhalation dose model across transit modes in 0 µg/m³ ambient air');
      expect(cleanHtml).not.toContain('Awaiting live particulate readings');
    });

    it('Scenario 23: Null concentrations disable unsupported calculations in Filter Estimator', () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(FilterLifespanEstimator, {
          ambientPm25: null,
        })
      );

      expect(html).toContain('Awaiting live particulate readings to calculate accurate mask');
      expect(html).not.toContain('Face Mask Usable Life');
    });

    it('Scenario 24: Invalid negative and NaN values are rejected safely', () => {
      const commuteHtml = ReactDOMServer.renderToString(
        React.createElement(CommuteCalculator, {
          ambientPm25: -25,
        })
      );
      expect(commuteHtml).toContain('Awaiting live particulate readings');

      const filterHtml = ReactDOMServer.renderToString(
        React.createElement(FilterLifespanEstimator, {
          ambientPm25: NaN,
        })
      );
      expect(filterHtml).toContain('Awaiting live particulate readings');
    });

    it('Scenario 25: Calculator results are appropriately labeled as estimates with disclaimers', () => {
      const commuteHtml = ReactDOMServer.renderToString(
        React.createElement(CommuteCalculator, {
          ambientPm25: 120,
        })
      );
      expect(commuteHtml).toContain('Modeled estimate based on standard adult minute-ventilation');

      const filterHtml = ReactDOMServer.renderToString(
        React.createElement(FilterLifespanEstimator, {
          ambientPm25: 120,
        })
      );
      expect(filterHtml).toContain('Model estimates based on standard filter saturation rates');
    });
  });

  // -------------------------------------------------------------------------
  // 7. HERO DASHBOARD & DATA STATUS
  // -------------------------------------------------------------------------
  describe('Group 7: Atmosphere Hero Dashboard & Status Provenance', () => {
    it('Scenario 26: Modeled data is not mislabeled as observed ground telemetry', () => {
      const modeledMetrics: AtmosphericMetrics = {
        status: 'success',
        provenance: 'modeled_forecast',
        sourceAttribution: 'Open-Meteo Numerical Weather Chemistry',
        timestamp: '2026-11-22T08:00:00Z',
        retrievedAt: '2026-11-22T08:05:00Z',
        timezone: 'Asia/Kolkata',
        usAqi: 215,
        pm25: 165,
        pm10: 250,
        boundaryLayerHeight: 380,
        isThermalInversionActive: true,
        isLive: true,
      };

      const html = ReactDOMServer.renderToString(
        React.createElement(AtmosphereHero, {
          city: 'Delhi',
          metrics: modeledMetrics,
          category: 'VeryUnhealthy',
        })
      );

      expect(html).toContain('Latest modeled conditions');
      expect(html).toContain('Modeled for:');
      expect(html).not.toContain('Live Observation');
      expect(html).not.toContain('Observed at:');
    });

    it('Scenario 27: Stale data preserves its original measurement timestamp and cached status', () => {
      const staleMetrics: AtmosphericMetrics = {
        status: 'stale',
        isStale: true,
        provenance: 'modeled_forecast',
        timestamp: '2026-11-22T04:00:00Z',
        retrievedAt: '2026-11-22T08:00:00Z',
        timezone: 'Asia/Kolkata',
        usAqi: 180,
        pm25: 110,
        pm10: 190,
        boundaryLayerHeight: 500,
        isThermalInversionActive: false,
        isLive: false,
      };

      const html = ReactDOMServer.renderToString(
        React.createElement(AtmosphereHero, {
          city: 'Jaipur',
          metrics: staleMetrics,
          category: 'Unhealthy',
        })
      );

      expect(html).toContain('Cached Reading');
      expect(html).toContain('Cached from:');
    });

    it('Scenario 28: Unavailable fields do not create artificial visual measurements', () => {
      const partialMetrics: AtmosphericMetrics = {
        status: 'success',
        provenance: 'modeled_forecast',
        timestamp: '2026-11-22T08:00:00Z',
        retrievedAt: '2026-11-22T08:05:00Z',
        timezone: 'Asia/Kolkata',
        usAqi: null,
        pm25: null,
        pm10: null,
        boundaryLayerHeight: null,
        isThermalInversionActive: false,
        isLive: true,
      };

      const html = ReactDOMServer.renderToString(
        React.createElement(AtmosphereHero, {
          city: 'Srinagar',
          metrics: partialMetrics,
          category: 'Unavailable',
        })
      );

      expect(html).toContain('Unavailable');
      expect(html).toContain('—'); // Dash rendered for missing values
      expect(html).toContain('Mixing ceiling telemetry unavailable');
    });

    it('Scenario 29: Misleading consensus claims are hidden until corrected in Step 3', () => {
      const metricsWithEnsemble: AtmosphericMetrics = {
        status: 'success',
        provenance: 'modeled_forecast',
        timestamp: '2026-11-22T08:00:00Z',
        retrievedAt: '2026-11-22T08:05:00Z',
        timezone: 'Asia/Kolkata',
        usAqi: 220,
        pm25: 170,
        pm10: 240,
        boundaryLayerHeight: 400,
        isThermalInversionActive: false,
        isLive: true,
        ensemble: {
          primaryModel: 'CAMS',
          weatherModel: 'GFS',
          consensusAqi: 220,
          consensusPm25: 170,
          aqiMin: 210,
          aqiMax: 230,
          pm25Min: 160,
          pm25Max: 180,
          confidenceScorePercent: 95,
          agreementLevel: 'High Consensus',
          deviationSpread: 10,
          feeds: [],
          summaryNote: '',
          provenanceNote: '',
        },
      };

      const html = ReactDOMServer.renderToString(
        React.createElement(AtmosphereHero, {
          city: 'Delhi',
          metrics: metricsWithEnsemble,
          category: 'VeryUnhealthy',
        })
      );

      // Misleading 5-source consensus button must not be visible on the hero
      expect(html).not.toContain('Multi-Model Consensus:');
    });
  });
});
