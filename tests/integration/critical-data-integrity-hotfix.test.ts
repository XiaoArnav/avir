import { describe, it, expect } from 'vitest';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import {
  getNearestGroundStation,
  calculateGroundModelDelta,
  OFFICIAL_CPCB_STATIONS,
} from '@/services/ground-station-service';
import {
  applyEpaBarkjohnCalibration,
  calibrateCommunitySensorReading,
} from '@/domain/calibration-math';
import {
  buildMultiSourceFeeds,
  calculateMultiSourceConsensus,
} from '@/domain/advanced-air-math';
import {
  parseBatchTelemetryResponse,
  filterAndSortWorldCities,
  searchAndFetchGlobalCity,
  WORLD_METROS,
  WorldCityItem,
} from '@/services/world-telemetry-service';
import { getGrapStage, getAQICategory } from '@/domain/air-math';
import { calculateComprehensiveCpcbNaqi } from '@/domain/cpcb-naqi';
import { GroundStationBadge } from '@/components/GroundStationBadge';
import { MultiSourceInspectorModal } from '@/components/MultiSourceInspectorModal';
import { TopNav } from '@/components/TopNav';
import { AtmosphericMetrics } from '@/domain/types';

describe('AVIR CRITICAL PRODUCTION DATA INTEGRITY HOTFIX — Regression Verification', () => {
  describe('Group A: Ground-Station Truth & Zero-Multiplication Rules (1-8)', () => {
    it('1. A known registered CPCB station with no live feed returns no pollutant observation', async () => {
      const match = await getNearestGroundStation(28.6508, 77.3152, 50, { modelPm25: 180 });
      expect(match.station).not.toBeNull();
      expect(match.station?.stationType).toBe('official_reference');
      expect(match.station?.stationState).toBe('registry_only');
      expect(match.station?.pm25).toBeNull();
      expect(match.station?.pm10).toBeNull();
    });

    it('2 & 3. Model PM2.5 cannot create official station PM2.5 or PM10 via fixed multipliers (1.15x / 1.6x)', async () => {
      const modelPm25 = 160;
      const match = await getNearestGroundStation(28.6139, 77.2090, 50, { modelPm25 });
      // 160 * 1.15 = 184; 160 * 1.6 = 256. These must NEVER be generated!
      expect(match.station?.pm25).not.toBe(184);
      expect(match.station?.pm10).not.toBe(256);
      expect(match.station?.pm25).toBeNull();
      expect(match.station?.pm10).toBeNull();
    });

    it('4. Registry-only stations do not receive fake observation timestamps', async () => {
      const match = await getNearestGroundStation(28.6139, 77.2090, 50);
      expect(match.station?.observedAt).toBeNull();
    });

    it('5. Registry-only stations do not display live-observation badges (render honest unavailable state)', () => {
      const station = {
        stationId: 'cpcb-dl-01',
        stationName: 'Anand Vihar CAAQMS',
        distanceKm: 8.2,
        latitude: 28.65,
        longitude: 77.31,
        provider: 'CPCB / DPCC',
        stationType: 'official_reference' as const,
        stationState: 'registry_only' as const,
        lastUpdated: '',
        observedAt: null,
        pm25: null,
        pm10: null,
      };

      const html = ReactDOMServer.renderToString(
        React.createElement(GroundStationBadge, { station, delta: null })
      );

      // Must not render pulsing green live beacon
      expect(html).not.toContain('animate-ping');
      // Must display honest indication that live readings are unavailable
      expect(html).toContain('Live Readings Unavailable');
      expect(html).toContain('Nearest registered station: Anand Vihar CAAQMS');
    });

    it('6. Ground-versus-model delta is unavailable without an authentic ground reading', async () => {
      const match = await getNearestGroundStation(28.6139, 77.2090, 50, { modelPm25: 150 });
      expect(match.delta).toBeNull();
    });

    it('7. Genuine independent ground readings produce a valid comparison when timestamps and units are compatible', () => {
      const delta = calculateGroundModelDelta(125, 100);
      expect(delta).not.toBeNull();
      expect(delta?.deltaPercent).toBe(25);
      expect(delta?.divergenceType).toBe('ground_trapping');
    });

    it('8. Missing station data does not crash calculations and returns null safely', () => {
      expect(calculateGroundModelDelta(null, 100)).toBeNull();
      expect(calculateGroundModelDelta(100, null)).toBeNull();
      expect(calculateGroundModelDelta(-5, 100)).toBeNull();
    });
  });

  describe('Group B: Sensor Calibration Safeguards (9-14)', () => {
    it('9. Missing humidity never silently becomes measured 50% RH', () => {
      const calNull = applyEpaBarkjohnCalibration(100, null);
      expect(calNull?.rhPercent).toBeNull();
      expect(calNull?.applied).toBe(false);

      const calUndefined = applyEpaBarkjohnCalibration(100, undefined);
      expect(calUndefined?.rhPercent).toBeNull();
      expect(calUndefined?.applied).toBe(false);
    });

    it('10. Calibration is disabled or qualified when required RH input is missing', () => {
      const cal = calibrateCommunitySensorReading(80, null, 'sds011');
      expect(cal.isCalibrated).toBe(false);
      expect(cal.calibratedPm25).toBe(80); // Preserves raw measurement
      expect(cal.formula).toContain('Uncalibrated');
    });

    it('11. Appropriate raw sensor values remain distinguishable from calibrated values', () => {
      const rawVal = 100.0;
      const calibrated = calibrateCommunitySensorReading(rawVal, 65, 'sds011');
      const uncalibrated = calibrateCommunitySensorReading(rawVal, null, 'sds011');

      expect(calibrated.isCalibrated).toBe(true);
      expect(calibrated.calibratedPm25).not.toBe(rawVal);
      expect(uncalibrated.isCalibrated).toBe(false);
      expect(uncalibrated.calibratedPm25).toBe(rawVal);
    });

    it('12. Invalid sensor readings (negative, NaN, Infinity) are rejected safely', () => {
      expect(applyEpaBarkjohnCalibration(-10, 60)).toBeNull();
      expect(applyEpaBarkjohnCalibration(NaN, 60)).toBeNull();
      expect(applyEpaBarkjohnCalibration(Infinity, 60)).toBeNull();
    });

    it('13 & 14. Citizen-science nodes are visually distinguishable from official CPCB monitors', () => {
      const citizenNode = {
        stationId: 'sc-1234',
        stationName: 'Sensor.Community #1234',
        distanceKm: 2.1,
        latitude: 28.6,
        longitude: 77.2,
        provider: 'Sensor.Community',
        stationType: 'community_optical' as const,
        stationState: 'live_observation' as const,
        lastUpdated: '2026-11-22T08:00:00Z',
        observedAt: '2026-11-22T08:00:00Z',
        pm25: 95,
        pm10: 140,
        isCalibrated: false,
      };

      const html = ReactDOMServer.renderToString(
        React.createElement(GroundStationBadge, { station: citizenNode, delta: null })
      );

      expect(html).toContain('Citizen Node (Uncalibrated)');
      expect(html).not.toContain('CPCB Ground Reference');
    });
  });

  describe('Group C: Multi-Source Truth & Provenance (15-20)', () => {
    it('15. One provider is not counted as five independent sources', () => {
      const feeds = buildMultiSourceFeeds({
        pm25: 150,
        usAqi: 200,
        cpcbAqi: 200,
        boundaryLayerHeight: 300,
        isThermalInversion: false,
      });

      // Distinct independent models: exactly 1 (Open-Meteo)
      const independent = feeds.filter(f => f.provenance === 'modeled_forecast' || f.provenance === 'observed');
      expect(independent.length).toBe(1);
    });

    it('16 & 17. Repeated identical values under different labels do not create artificial consensus or confidence', () => {
      const feeds = buildMultiSourceFeeds({
        pm25: 120,
        usAqi: 185,
        cpcbAqi: 185,
        boundaryLayerHeight: 250,
        isThermalInversion: false,
      });

      const consensus = calculateMultiSourceConsensus(feeds);
      // No fake confidence score generated from 1 independent source
      expect(consensus.confidenceScorePercent).toBeNull();
      expect(consensus.deviationSpread).toBeNull();
      expect(consensus.agreementLevel).toBe('Single Primary Provider');
    });

    it('18. Different AQI calculations from the same PM2.5 are classified as derived_calculation', () => {
      const feeds = buildMultiSourceFeeds({
        pm25: 100,
        usAqi: 174,
        cpcbAqi: 220,
        boundaryLayerHeight: 200,
        isThermalInversion: false,
      });

      const derived = feeds.filter(f => f.provenance === 'derived_calculation');
      expect(derived.length).toBeGreaterThanOrEqual(2);
      expect(derived.some(f => f.standard === 'CPCB-NAQI')).toBe(true);
      expect(derived.some(f => f.standard === 'US-EPA')).toBe(true);
    });

    it('19. Insufficient source data produces an explicit unavailable consensus state', () => {
      const consensus = calculateMultiSourceConsensus([]);
      expect(consensus.isUnavailable).toBe(true);
      expect(consensus.consensusAqi).toBeNull();
      expect(consensus.confidenceScorePercent).toBeNull();
    });

    it('20. TopNav displays truthful "Data Sources & Quality" rather than misleading "Compare 5 Sources"', () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(TopNav, {
          onOpenSettings: () => {},
          onOpenExplainer: () => {},
          onOpenRwa: () => {},
          onOpenMultiSource: () => {},
          hasCustomKey: false,
        })
      );

      expect(html).toContain('Data Sources &amp; Quality');
      expect(html).not.toContain('Compare 5 Sources');
    });
  });

  describe('Group D: Worldwide Data Integrity (21-29)', () => {
    it('21 & 22. Network search failure never returns synthetic AQI 75 or PM2.5 22', async () => {
      const originalFetch = global.fetch;
      global.fetch = () => Promise.reject(new Error('Provider timeout'));

      try {
        const results = await searchAndFetchGlobalCity('Madrid');
        for (const city of results) {
          expect(city.usAqi).toBeNull();
          expect(city.pm25).toBeNull();
          expect(city.usAqi).not.toBe(75);
          expect(city.pm25).not.toBe(22);
          expect(city.category).toBe('Unavailable');
        }
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('23 & 24. Missing AQI and PM2.5 in batch response remain null rather than defaulting to zero', () => {
      const responseWithEmpty = [{ latitude: 48.8, longitude: 2.3, current: {} }];
      const parsed = parseBatchTelemetryResponse([WORLD_METROS[0]], responseWithEmpty);

      expect(parsed[0].usAqi).toBeNull();
      expect(parsed[0].pm25).toBeNull();
      expect(parsed[0].category).toBe('Unavailable');
    });

    it('25. Valid zero pollution values are preserved as authentic clean air and not discarded', () => {
      const cleanResponse = [{ latitude: 35.6, longitude: 139.6, current: { us_aqi: 0, pm2_5: 0, time: '2026-11-22T08:00' } }];
      const parsed = parseBatchTelemetryResponse([WORLD_METROS[0]], cleanResponse);

      expect(parsed[0].usAqi).toBe(0);
      expect(parsed[0].pm25).toBe(0);
      expect(parsed[0].category).toBe('Good');
    });

    it('26. Missing timestamps remain null rather than defaulting to current time', () => {
      const responseNoTime = [{ latitude: 40.7, longitude: -74.0, current: { us_aqi: 45, pm2_5: 10 } }];
      const parsed = parseBatchTelemetryResponse([WORLD_METROS[0]], responseNoTime);

      expect(parsed[0].lastUpdated).toBeNull();
    });

    it('27. Cities without valid readings are excluded from numeric rankings', () => {
      const cities: WorldCityItem[] = [
        { id: 1, name: 'CityA', country: 'A', region: 'Asia', latitude: 10, longitude: 10, usAqi: 120, pm25: 45, category: 'Moderate' },
        { id: 2, name: 'CityB', country: 'B', region: 'Europe', latitude: 20, longitude: 20, usAqi: null, pm25: null, category: 'Unavailable' },
        { id: 3, name: 'CityC', country: 'C', region: 'Americas', latitude: 30, longitude: 30, usAqi: 25, pm25: 6, category: 'Good' },
      ];

      const sortedCleanest = filterAndSortWorldCities(cities, '', 'All', 'All', 'cleanest');
      // CityB with null AQI must be at the very bottom, not top
      expect(sortedCleanest[0].name).toBe('CityC');
      expect(sortedCleanest[sortedCleanest.length - 1].name).toBe('CityB');
    });
  });

  describe('Group E: Regulatory & GRAP Truthfulness (30-34)', () => {
    it('30 & 31. High AQI threshold is labeled indicative benchmark and never claims statutory order', () => {
      const grap = getGrapStage(460);
      expect(grap.stage).toBe('Stage IV');
      expect(grap.isStatutoryOrderVerified).toBe(false);
      expect(grap.benchmarkType).toBe('indicative_threshold');
      expect(grap.label).toContain('Indicative');
      expect(grap.advisory).toContain('CAQM');
    });

    it('33. Missing AQI produces unverified regulatory status', () => {
      const unverified = getGrapStage(null);
      expect(unverified.stage).toBe('Unavailable');
      expect(unverified.isStatutoryOrderVerified).toBe(false);
      expect(unverified.benchmarkType).toBe('unverified');
      expect(unverified.label).toContain('Unverified');
    });
  });

  describe('Group F: CPCB NAQI Presentation & Sufficiency (35-40)', () => {
    it('35 & 36. Insufficient pollutant coverage (<3 pollutants) produces indicative_subindex classification', () => {
      const res = calculateComprehensiveCpcbNaqi({ pm25: 110 }); // only 1 pollutant
      expect(res.isDataSufficient).toBe(false);
      expect(res.classification).toBe('indicative_subindex');
      expect(res.notes).toContain('Indicative');
    });

    it('37 & 38. Valid pollutant zeros are preserved and count toward monitored pollutants', () => {
      const res = calculateComprehensiveCpcbNaqi({ pm25: 0, no2: 0, so2: 0 });
      expect(res.isDataSufficient).toBe(true);
      expect(res.aqi).toBe(0);
      expect(res.category).toBe('Good');
      expect(res.classification).toBe('statutory_compliant');
    });

    it('39. Statutory compliance achieved when at least 3 pollutants are monitored including particulate', () => {
      const res = calculateComprehensiveCpcbNaqi({ pm25: 90, no2: 50, so2: 30 });
      expect(res.isDataSufficient).toBe(true);
      expect(res.classification).toBe('statutory_compliant');
      expect(res.dominantPollutant).toBe('PM2.5');
    });
  });

  describe('Group G: Integration End-to-End Truth (41-46)', () => {
    it('41. A location with registered station but no readings renders honest unavailable states', () => {
      const registeredStation = {
        stationId: 'cpcb-dl-02',
        stationName: 'R K Puram CAAQMS',
        distanceKm: 5.4,
        latitude: 28.56,
        longitude: 77.18,
        provider: 'CPCB / DPCC',
        stationType: 'official_reference' as const,
        stationState: 'registry_only' as const,
        lastUpdated: '',
        observedAt: null,
        pm25: null,
        pm10: null,
      };

      const html = ReactDOMServer.renderToString(
        React.createElement(GroundStationBadge, { station: registeredStation, delta: null })
      );

      expect(html).toContain('Live Readings Unavailable');
      expect(html).toContain('Nearest registered station: R K Puram CAAQMS');
    });

    it('44. Source inspector and consensus reflect single primary model accurately', () => {
      const feeds = buildMultiSourceFeeds({
        pm25: 110,
        usAqi: 179,
        cpcbAqi: 266,
        boundaryLayerHeight: 400,
        isThermalInversion: false,
      });

      const consensus = calculateMultiSourceConsensus(feeds);
      expect(consensus.agreementLevel).toBe('Single Primary Provider');
      expect(consensus.confidenceScorePercent).toBeNull();

      const modalHtml = ReactDOMServer.renderToString(
        React.createElement(MultiSourceInspectorModal, {
          isOpen: true,
          onClose: () => {},
          cityName: 'Delhi',
          ensemble: consensus,
        })
      );

      expect(modalHtml).toContain('Single Primary Provider');
      expect(modalHtml).toContain('Open-Meteo Atmospheric Chemistry');
    });

    it('45. World rankings never interpret missing pollution as exceptionally clean air', () => {
      const dataset: WorldCityItem[] = [
        { id: 101, name: 'CleanCity', country: 'C', region: 'Europe', latitude: 50, longitude: 10, usAqi: 15, pm25: 3, category: 'Good' },
        { id: 102, name: 'OfflineCity', country: 'O', region: 'Asia', latitude: 20, longitude: 80, usAqi: null, pm25: null, category: 'Unavailable' },
      ];

      const cleanest = filterAndSortWorldCities(dataset, '', 'All', 'All', 'cleanest');
      expect(cleanest[0].name).toBe('CleanCity');
      expect(cleanest[1].name).toBe('OfflineCity');
    });
  });
});
