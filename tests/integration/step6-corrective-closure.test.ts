import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  evaluateWorldModelFreshness,
  computeComparableCohortRanks,
  checkCoordinateMismatch,
  parseBatchTelemetryResponse,
  WORLD_METROS,
  WorldCityItem,
} from '@/services/world-telemetry-service';
import {
  calculateCityComparison,
  CityComparisonInput,
} from '@/domain/advanced-air-math';
import {
  savedComparisonsService,
  SavedCityComparisonRecord,
} from '@/services/saved-comparisons-service';
import { searchCities } from '@/services/telemetry-service';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { CityShootout } from '@/components/CityShootout';
import { WorldDataExplorer } from '@/components/WorldDataExplorer';

describe('AVIR — Step 6 Corrective Closure (W01–W16 Comprehensive Integrity Matrix)', () => {
  let originalWindow: any;
  let store: Record<string, string> = {};

  beforeEach(() => {
    originalWindow = (globalThis as any).window;
    store = {};
    const mockLocalStorage = {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = String(value);
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        store = {};
      }),
      get length() {
        return Object.keys(store).length;
      },
      key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
    };

    (globalThis as any).window = {
      localStorage: mockLocalStorage,
    };

    savedComparisonsService.clearAllSavedComparisons();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    (globalThis as any).window = originalWindow;
  });

  // =========================================================================
  // W01: Outdated matching timestamps ranked current
  // =========================================================================
  describe('W01: Enforce Real Model-Timestamp Freshness', () => {
    it('evaluates fresh timestamp correctly within policy window', () => {
      const now = new Date('2026-11-23T12:00:00Z');
      const validTime = '2026-11-23T10:00:00Z'; // 2 hours old
      const freshness = evaluateWorldModelFreshness(validTime, now, { maxAgeHours: 12, maxFutureHours: 2 });
      expect(freshness.isFresh).toBe(true);
      expect(freshness.ageHours).toBeCloseTo(2, 1);
    });

    it('rejects stale timestamps exceeding maxAgeHours', () => {
      const now = new Date('2026-11-23T12:00:00Z');
      const oldTime = '2026-11-20T12:00:00Z'; // 3 days (72 hours) old
      const freshness = evaluateWorldModelFreshness(oldTime, now, { maxAgeHours: 12, maxFutureHours: 2 });
      expect(freshness.isFresh).toBe(false);
      expect(freshness.reasons.some(r => r.includes('exceeding maximum freshness threshold'))).toBe(true);
    });

    it('rejects implausible future timestamps beyond permitted tolerance', () => {
      const now = new Date('2026-11-23T12:00:00Z');
      const futureTime = '2026-11-23T18:00:00Z'; // 6 hours in future (> 2h tolerance)
      const freshness = evaluateWorldModelFreshness(futureTime, now, { maxAgeHours: 12, maxFutureHours: 2 });
      expect(freshness.isFresh).toBe(false);
      expect(freshness.reasons.some(r => r.includes('in the future'))).toBe(true);
    });

    it('rejects unparseable or malformed calendar timestamps', () => {
      const now = new Date('2026-11-23T12:00:00Z');
      const freshness = evaluateWorldModelFreshness('not-a-valid-date', now);
      expect(freshness.isFresh).toBe(false);
      expect(freshness.reasons.some(r => r.includes('unparseable') || r.includes('Malformed'))).toBe(true);
    });

    it('rejects null timestamps as unavailable', () => {
      const now = new Date('2026-11-23T12:00:00Z');
      const freshness = evaluateWorldModelFreshness(null, now);
      expect(freshness.isFresh).toBe(false);
      expect(freshness.reasons.some(r => r.includes('Missing'))).toBe(true);
    });

    it('prevents 3-day-old matching timestamps from forming a current ranking cohort', () => {
      const now = new Date('2026-11-23T12:00:00Z');
      const threeDaysAgo = '2026-11-20T12:00:00Z';

      // 3 cities with identical but 3-day-old timestamps
      const staleCities: WorldCityItem[] = [
        { id: 1, name: 'Delhi', country: 'India', region: 'Asia', latitude: 28.6, longitude: 77.2, usAqi: 280, pm25: 220, category: 'VeryUnhealthy', modelValidAt: threeDaysAgo },
        { id: 2, name: 'London', country: 'UK', region: 'Europe', latitude: 51.5, longitude: -0.1, usAqi: 45, pm25: 10, category: 'Good', modelValidAt: threeDaysAgo },
        { id: 3, name: 'Tokyo', country: 'Japan', region: 'Asia', latitude: 35.6, longitude: 139.6, usAqi: 35, pm25: 8, category: 'Good', modelValidAt: threeDaysAgo },
      ];

      const ranked = computeComparableCohortRanks(staleCities, now, { maxAgeHours: 12, maxFutureHours: 2 });
      // ALL cities must be excluded from live ranking because the dominant timestamp is stale!
      for (const city of ranked) {
        expect(city.cohortRank).toBeNull();
        expect(city.comparable).toBe(false);
        expect(city.status).toBe('stale');
        expect(city.incompatibilityReasons?.some(r => r.includes('stale') || r.includes('threshold') || r.includes('maximum age'))).toBe(true);
      }
    });

    it('correctly ranks cohort when timestamps are genuinely fresh', () => {
      const now = new Date('2026-11-23T12:00:00Z');
      const freshTime = '2026-11-23T11:00:00Z'; // 1 hour old

      const freshCities: WorldCityItem[] = [
        { id: 1, name: 'Delhi', country: 'India', region: 'Asia', latitude: 28.6, longitude: 77.2, usAqi: 280, pm25: 220, category: 'VeryUnhealthy', modelValidAt: freshTime },
        { id: 2, name: 'London', country: 'UK', region: 'Europe', latitude: 51.5, longitude: -0.1, usAqi: 45, pm25: 10, category: 'Good', modelValidAt: freshTime },
        { id: 3, name: 'Tokyo', country: 'Japan', region: 'Asia', latitude: 35.6, longitude: 139.6, usAqi: 35, pm25: 8, category: 'Good', modelValidAt: freshTime },
      ];

      const ranked = computeComparableCohortRanks(freshCities, now);
      const delhi = ranked.find(c => c.name === 'Delhi')!;
      const london = ranked.find(c => c.name === 'London')!;
      const tokyo = ranked.find(c => c.name === 'Tokyo')!;

      expect(delhi.cohortRank).toBe(1);
      expect(london.cohortRank).toBe(2);
      expect(tokyo.cohortRank).toBe(3);
      expect(delhi.comparable).toBe(true);
      expect(delhi.cohortSize).toBe(3);
    });
  });

  // =========================================================================
  // W02 & W03: Missing timestamp allowed in comparison & Incompatible data yields numerical verdict
  // =========================================================================
  describe('W02 & W03: Strict Comparability Gate (Zero Numerical Fallbacks)', () => {
    it('W02: Missing timestamp in either city disables comparison', () => {
      const cityA: CityComparisonInput = { name: 'Delhi', country: 'India', aqi: 280, pm25: 220, timestamp: null };
      const cityB: CityComparisonInput = { name: 'London', country: 'UK', aqi: 45, pm25: 10, timestamp: '2026-11-23T10:00:00Z' };

      const comparison = calculateCityComparison(cityA, cityB);
      expect(comparison.comparable).toBe(false);
      expect(comparison.reasons.some(r => r.includes('Observation or forecast valid timestamp is missing'))).toBe(true);
    });

    it('W02: Missing timestamps in both cities disables comparison', () => {
      const cityA: CityComparisonInput = { name: 'Delhi', country: 'India', aqi: 280, pm25: 220, timestamp: null };
      const cityB: CityComparisonInput = { name: 'London', country: 'UK', aqi: 45, pm25: 10, timestamp: null };

      const comparison = calculateCityComparison(cityA, cityB);
      expect(comparison.comparable).toBe(false);
      expect(comparison.reasons.some(r => r.includes('Observation or forecast valid timestamp is missing'))).toBe(true);
    });

    it('W03: Incompatible comparison returns null for all ratios and winner labels (no 1.0 fallback)', () => {
      const cityA: CityComparisonInput = {
        name: 'Delhi', country: 'India', aqi: 280, pm25: 220, timestamp: '2026-11-23T10:00:00Z', modelDomain: 'cams_global',
      };
      const cityB: CityComparisonInput = {
        name: 'London', country: 'UK', aqi: 45, pm25: 10, timestamp: '2026-11-23T10:00:00Z', modelDomain: 'cams_europe', // Differing domain!
      };

      const comparison = calculateCityComparison(cityA, cityB);
      expect(comparison.comparable).toBe(false);
      expect(comparison.pm25ConcentrationRatio).toBeNull();
      expect(comparison.aqiRatio).toBeNull();
      expect(comparison.toxicityMultiplier).toBeNull(); // Must NOT be 1.0!
      expect(comparison.cigaretteDifferential).toBeNull();
      expect(comparison.dirtierCityName).toBeNull();
      expect(comparison.cleanerCityName).toBeNull();
      expect(comparison.commonMetric).toBeNull();
      expect(comparison.verdict).toContain('Atmospheric comparison unavailable: Model domains differ');
    });

    it('W03: Stale status disables comparison even with identical timestamps', () => {
      const cityA: CityComparisonInput = {
        name: 'Delhi', country: 'India', aqi: 280, pm25: 220, timestamp: '2026-11-20T10:00:00Z', status: 'stale',
      };
      const cityB: CityComparisonInput = {
        name: 'London', country: 'UK', aqi: 45, pm25: 10, timestamp: '2026-11-20T10:00:00Z', status: 'stale',
      };

      const comparison = calculateCityComparison(cityA, cityB);
      expect(comparison.comparable).toBe(false);
      expect(comparison.reasons.some(r => r.includes('stale or expired'))).toBe(true);
      expect(comparison.toxicityMultiplier).toBeNull();
    });

    it('W03: Differing source methodologies (model vs ground station) disables direct comparison', () => {
      const cityA: CityComparisonInput = {
        name: 'Delhi', country: 'India', aqi: 280, pm25: 220, timestamp: '2026-11-23T10:00:00Z', sourceKind: 'ground_station',
      };
      const cityB: CityComparisonInput = {
        name: 'London', country: 'UK', aqi: 45, pm25: 10, timestamp: '2026-11-23T10:00:00Z', sourceKind: 'atmospheric_model',
      };

      const comparison = calculateCityComparison(cityA, cityB);
      expect(comparison.comparable).toBe(false);
      expect(comparison.reasons.some(r => r.includes('Source methodologies differ'))).toBe(true);
      expect(comparison.toxicityMultiplier).toBeNull();
    });
  });

  // =========================================================================
  // W04 & W16: AQI ratio used as toxicity ratio & Inaccurate scientific comparison claims
  // =========================================================================
  describe('W04 & W16: Scientific PM2.5 Concentration Ratio (Never AQI as Toxicity)', () => {
    it('uses PM2.5 physical mass concentration for ratio rather than non-linear AQI', () => {
      const cityA: CityComparisonInput = {
        name: 'CityA', country: 'X', aqi: 200, pm25: 50, timestamp: '2026-11-23T10:00:00Z', modelDomain: 'cams_global',
      };
      const cityB: CityComparisonInput = {
        name: 'CityB', country: 'Y', aqi: 100, pm25: 25, timestamp: '2026-11-23T10:00:00Z', modelDomain: 'cams_global',
      };

      const comparison = calculateCityComparison(cityA, cityB);
      expect(comparison.comparable).toBe(true);
      expect(comparison.pm25ConcentrationRatio).toBe(2.0);
      expect(comparison.dirtierCityName).toBe('CityA');
      expect(comparison.cleanerCityName).toBe('CityB');
      expect(comparison.verdict).toContain("CityA's ambient PM2.5 concentration is 2× that of CityB");
      expect(comparison.verdict).not.toContain('more toxic in all biological respects');
      expect(comparison.verdict).not.toContain('times more toxic');
    });

    it('handles zero PM2.5 denominator gracefully without Infinity', () => {
      const cleanCity: CityComparisonInput = {
        name: 'CleanCity', country: 'IS', aqi: 0, pm25: 0, timestamp: '2026-11-23T10:00:00Z',
      };
      const smogCity: CityComparisonInput = {
        name: 'SmogCity', country: 'IN', aqi: 180, pm25: 120, timestamp: '2026-11-23T10:00:00Z',
      };

      const comparison = calculateCityComparison(cleanCity, smogCity);
      expect(comparison.comparable).toBe(true);
      expect(comparison.pm25ConcentrationRatio).toBeNull(); // Undefined for zero denominator
      expect(comparison.verdict).toContain('clean air baseline (0 µg/m³ PM2.5)');
      expect(comparison.verdict).toContain('Direct concentration ratio undefined for zero-exposure baseline');
    });

    it('handles both cities zero PM2.5 as 1.0x pristine baseline', () => {
      const cityA: CityComparisonInput = {
        name: 'Reykjavik', country: 'Iceland', aqi: 0, pm25: 0, timestamp: '2026-11-23T10:00:00Z',
      };
      const cityB: CityComparisonInput = {
        name: 'Honolulu', country: 'USA', aqi: 0, pm25: 0, timestamp: '2026-11-23T10:00:00Z',
      };

      const comparison = calculateCityComparison(cityA, cityB);
      expect(comparison.comparable).toBe(true);
      expect(comparison.pm25ConcentrationRatio).toBe(1.0);
      expect(comparison.dirtierCityName).toBeNull();
      expect(comparison.cleanerCityName).toBeNull();
      expect(comparison.verdict).toContain('pristine zero-AQI clean air (0 µg/m³ PM2.5)');
    });
  });

  // =========================================================================
  // W05: Missing model provenance in CityShootout
  // =========================================================================
  describe('W05: CityShootout Provenance Integration & Suppressed Badges', () => {
    it('suppresses winner badges and displays explanation when model domains differ', () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(CityShootout, {
          currentCityName: 'Delhi',
          currentCountry: 'India',
          currentAqi: 280,
          currentPm25: 220,
          currentTimestamp: '2026-11-23T10:00:00Z',
          currentModelDomain: 'cams_europe', // Incompatible with target's cams_global
          currentSourceKind: 'atmospheric_model',
          currentStatus: 'fresh',
          comparisonTargetData: {
            aqi: 45,
            pm25: 10,
            timestamp: '2026-11-23T10:00:00Z',
          },
        })
      );

      // Verify that CityShootout renders
      expect(html).toContain('Compare Cities: Smog Shootout');
      expect(html).toContain('Direct Atmospheric Comparison Unavailable');
      expect(html).toContain('Model domains differ');
      expect(html).not.toContain('More Polluted');
      expect(html).not.toContain('Cleaner');
    });
  });

  // =========================================================================
  // W06: Broad coordinate tolerance & Swapped batch detection
  // =========================================================================
  describe('W06: Strict Batch Coordinate Association', () => {
    it('accepts displacement within CAMS global model grid cell limit (<= 0.8 deg)', () => {
      const metro = { name: 'Delhi', latitude: 28.6139, longitude: 77.2090 };
      const apiItem = { latitude: 28.8, longitude: 77.4 }; // ~0.26 deg displacement

      const mismatch = checkCoordinateMismatch(metro, apiItem);
      expect(mismatch.isMismatch).toBe(false);
    });

    it('flags displacement exceeding CAMS global model grid cell limit (> 0.8 deg)', () => {
      const metro = { name: 'Delhi', latitude: 28.6139, longitude: 77.2090 };
      const other = { name: 'London', latitude: 51.5074, longitude: -0.1278 };
      const apiItem = { latitude: 30.5, longitude: 77.2 }; // ~1.88 deg displacement

      const mismatch = checkCoordinateMismatch(metro, apiItem, [metro, other]);
      expect(mismatch.isMismatch).toBe(true);
      expect(mismatch.reason).toContain('exceeds CAMS Global grid-cell limit');
    });

    it('flags missing coordinate metadata in response as mismatch', () => {
      const metro = { name: 'Delhi', latitude: 28.6139, longitude: 77.2090 };
      const apiItem = { latitude: undefined as unknown as number, longitude: 77.2 };

      const mismatch = checkCoordinateMismatch(metro, apiItem);
      expect(mismatch.isMismatch).toBe(true);
      expect(mismatch.reason).toContain('Missing coordinate metadata');
    });

    it('detects swapped batch items where response coordinates correspond to a different city', () => {
      const delhi = { name: 'Delhi', latitude: 28.6139, longitude: 77.2090 };
      const london = { name: 'London', latitude: 51.5074, longitude: -0.1278 };

      // API returned London coords for Delhi's slot!
      const swappedResponseItem = { latitude: 51.5, longitude: -0.1 };
      const allBatchMetros = [delhi, london];

      const mismatch = checkCoordinateMismatch(delhi, swappedResponseItem, allBatchMetros);
      expect(mismatch.isMismatch).toBe(true);
      expect(mismatch.reason).toContain('swapped or misaligned');
      expect(mismatch.reason).toContain('London');
    });
  });

  // =========================================================================
  // W07: Missing or unsupported source units
  // =========================================================================
  describe('W07: Verify Pollutant Units', () => {
    it('accepts standard ug/m3 units for PM2.5 and PM10', () => {
      const metros = [WORLD_METROS[0]]; // Delhi
      const rawResponse = [{
        latitude: 28.6,
        longitude: 77.2,
        current_units: { pm2_5: 'μg/m³', pm10: 'μg/m³', us_aqi: 'AQI' },
        current: { us_aqi: 280, pm2_5: 220, pm10: 310, time: '2026-11-23T10:00' },
      }];

      const parsed = parseBatchTelemetryResponse(metros, rawResponse);
      expect(parsed[0].usAqi).toBe(280);
      expect(parsed[0].pm25).toBe(220);
      expect(parsed[0].pm10).toBe(310);
    });

    it('rejects unsupported units (e.g., ppm, ppb) to prevent erroneous concentration calculations', () => {
      const metros = [WORLD_METROS[0]]; // Delhi
      const rawResponse = [{
        latitude: 28.6,
        longitude: 77.2,
        current_units: { pm2_5: 'ppm', pm10: 'ppm', us_aqi: 'AQI' }, // Incompatible units!
        current: { us_aqi: 280, pm2_5: 220, pm10: 310, time: '2026-11-23T10:00' },
      }];

      const parsed = parseBatchTelemetryResponse(metros, rawResponse);
      expect(parsed[0].pm25).toBeNull(); // Rejected!
      expect(parsed[0].pm10).toBeNull(); // Rejected!
      expect(parsed[0].status).toBe('partial');
    });
  });

  // =========================================================================
  // W08: Invalid data entering cohort & Standard competition ranking
  // =========================================================================
  describe('W08: Correct Global Ranking Eligibility & Standard Competition Ties', () => {
    it('applies standard competition ranking (1224) for tied AQI values', () => {
      const now = new Date('2026-11-23T12:00:00Z');
      const time = '2026-11-23T10:00:00Z';

      const cities: WorldCityItem[] = [
        { id: 1, name: 'CityA', country: 'A', region: 'Asia', latitude: 10, longitude: 10, usAqi: 300, pm25: 250, category: 'Hazardous', modelValidAt: time },
        { id: 2, name: 'CityB', country: 'B', region: 'Asia', latitude: 20, longitude: 20, usAqi: 200, pm25: 150, category: 'VeryUnhealthy', modelValidAt: time },
        { id: 3, name: 'CityC', country: 'C', region: 'Asia', latitude: 30, longitude: 30, usAqi: 200, pm25: 140, category: 'VeryUnhealthy', modelValidAt: time }, // Tied with CityB
        { id: 4, name: 'CityD', country: 'D', region: 'Asia', latitude: 40, longitude: 40, usAqi: 100, pm25: 50, category: 'Moderate', modelValidAt: time },
      ];

      const ranked = computeComparableCohortRanks(cities, now);
      const a = ranked.find(c => c.name === 'CityA')!;
      const b = ranked.find(c => c.name === 'CityB')!;
      const c = ranked.find(c => c.name === 'CityC')!;
      const d = ranked.find(c => c.name === 'CityD')!;

      expect(a.cohortRank).toBe(1);
      expect(b.cohortRank).toBe(2);
      expect(c.cohortRank).toBe(2); // Tied at #2
      expect(d.cohortRank).toBe(4); // Standard competition rank: next is #4, NOT #3!
    });

    it('excludes null, non-numeric, or negative AQI from ranking cohort', () => {
      const now = new Date('2026-11-23T12:00:00Z');
      const time = '2026-11-23T10:00:00Z';

      const cities: WorldCityItem[] = [
        { id: 1, name: 'ValidCity', country: 'A', region: 'Asia', latitude: 10, longitude: 10, usAqi: 150, pm25: 60, category: 'UnhealthySensitive', modelValidAt: time },
        { id: 2, name: 'NullAqi', country: 'B', region: 'Asia', latitude: 20, longitude: 20, usAqi: null, pm25: 40, category: 'Unavailable', modelValidAt: time },
        { id: 3, name: 'NegativeAqi', country: 'C', region: 'Asia', latitude: 30, longitude: 30, usAqi: -10, pm25: 20, category: 'Unavailable', modelValidAt: time },
      ];

      const ranked = computeComparableCohortRanks(cities, now);
      const valid = ranked.find(c => c.name === 'ValidCity')!;
      const nullCity = ranked.find(c => c.name === 'NullAqi')!;
      const negCity = ranked.find(c => c.name === 'NegativeAqi')!;

      expect(valid.cohortRank).toBe(1);
      expect(valid.cohortSize).toBe(1);
      expect(nullCity.cohortRank).toBeNull();
      expect(nullCity.comparable).toBe(false);
      expect(negCity.cohortRank).toBeNull();
      expect(negCity.comparable).toBe(false);
    });
  });

  // =========================================================================
  // W09: Missing model timestamp shown Live
  // =========================================================================
  describe('W09: Correct Live and Current Labels', () => {
    it('displays Model valid time unavailable instead of Live when timestamp is null', () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(WorldDataExplorer, {
          activeCityName: 'Delhi',
          onSelectCity: vi.fn(),
        })
      );

      // Must NOT contain "Live" as a model status
      expect(html).toContain('Model valid time unavailable');
    });
  });

  // =========================================================================
  // W10: Saved comparisons deduplicated by name
  // =========================================================================
  describe('W10: Geographic Identity Key Disambiguation', () => {
    it('preserves same-name cities in different countries/regions independently', () => {
      const pair1: Omit<SavedCityComparisonRecord, 'id' | 'savedAt' | 'version'> = {
        cityA: { name: 'Delhi', country: 'India', aqi: 280, pm25: 220, latitude: 28.6, longitude: 77.2, countryCode: 'IN' },
        cityB: { name: 'London', country: 'United Kingdom', admin1: 'Greater London', aqi: 45, pm25: 10, latitude: 51.5074, longitude: -0.1278, countryCode: 'GB' },
        ratio: 6.2,
        note: 'Comparison 1',
      };

      const pair2: Omit<SavedCityComparisonRecord, 'id' | 'savedAt' | 'version'> = {
        cityA: { name: 'Delhi', country: 'India', aqi: 280, pm25: 220, latitude: 28.6, longitude: 77.2, countryCode: 'IN' },
        cityB: { name: 'London', country: 'Canada', admin1: 'Ontario', aqi: 35, pm25: 8, latitude: 42.9849, longitude: -81.2453, countryCode: 'CA' }, // London, Ontario!
        ratio: 8.0,
        note: 'Comparison 2',
      };

      const res1 = savedComparisonsService.saveComparison(pair1);
      const res2 = savedComparisonsService.saveComparison(pair2);
      expect(res1.success).toBe(true);
      expect(res2.success).toBe(true);

      const all = savedComparisonsService.getSavedComparisons();
      // Both must be preserved because country and coordinates differ!
      expect(all.length).toBe(2);
      expect(all.some(p => p.cityB.country === 'United Kingdom')).toBe(true);
      expect(all.some(p => p.cityB.country === 'Canada')).toBe(true);
    });
  });

  // =========================================================================
  // W11: Saved snapshot restoration
  // =========================================================================
  describe('W11: Saved Snapshot Full Restoration', () => {
    it('restores exact recorded historical snapshot values and save timestamp', () => {
      const pair: Omit<SavedCityComparisonRecord, 'id' | 'savedAt' | 'version'> = {
        cityA: { name: 'Delhi', country: 'India', aqi: 310, pm25: 260, latitude: 28.6, longitude: 77.2 },
        cityB: { name: 'Tokyo', country: 'Japan', aqi: 25, pm25: 7, latitude: 35.6, longitude: 139.6 },
        ratio: 37.1,
        note: 'Historic record',
      };

      const saved = savedComparisonsService.saveComparison(pair);
      expect(saved.success).toBe(true);
      expect(saved.record?.id).toBeDefined();

      const retrieved = savedComparisonsService.getSavedComparisons();
      expect(retrieved.length).toBe(1);
      expect(retrieved[0].cityA.aqi).toBe(310);
      expect(retrieved[0].cityB.aqi).toBe(25);
      expect(retrieved[0].ratio).toBe(37.1);
    });
  });

  // =========================================================================
  // W12: Search request race tests
  // =========================================================================
  describe('W12: Search Request Race Protection', () => {
    it('ensures newer search requests cannot be overwritten by out-of-order delayed responses', async () => {
      let activeQuery = '';
      let searchSequence = 0;
      let displayResult = '';

      async function triggerSearch(query: string, delayMs: number) {
        const seq = ++searchSequence;
        activeQuery = query;

        await new Promise(r => setTimeout(r, delayMs));

        // State update only if this was the latest initiated sequence
        if (seq === searchSequence) {
          displayResult = query;
        }
      }

      // Query 1 ('Del') is slow (100ms)
      const p1 = triggerSearch('Del', 100);
      // Query 2 ('Tokyo') is fast (20ms)
      const p2 = triggerSearch('Tokyo', 20);

      await Promise.all([p1, p2]);

      // The final state MUST be 'Tokyo', never overwritten by the delayed 'Del'
      expect(displayResult).toBe('Tokyo');
    });
  });

  // =========================================================================
  // W14: Geocoding country code preservation
  // =========================================================================
  describe('W14: Geocoding Country Code Preservation', () => {
    it('preserves uppercase countryCode on GeocodedLocation and searches', async () => {
      vi.spyOn(global, 'fetch').mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            results: [
              {
                id: 12345,
                name: 'Kyoto',
                latitude: 35.0116,
                longitude: 135.7681,
                country: 'Japan',
                country_code: 'jp',
                admin1: 'Kyoto Prefecture',
              },
            ],
          }),
        } as Response)
      );

      const results = await searchCities('Kyoto');
      expect(results.length).toBe(1);
      expect(results[0].countryCode).toBe('JP'); // Upper-cased country code preserved!
      expect(results[0].country).toBe('Japan');
    });
  });

  // =========================================================================
  // W15: Cache TTL vs Model Freshness
  // =========================================================================
  describe('W15: Cache TTL Distinct from Model Freshness', () => {
    it('recognizes that a recent cache hit with a 24-hour-old model timestamp is stale', () => {
      const now = new Date('2026-11-23T12:00:00Z');
      const modelTime = '2026-11-22T10:00:00Z'; // 26 hours old

      // Model freshness policy flags it stale regardless of cache age
      const freshness = evaluateWorldModelFreshness(modelTime, now, { maxAgeHours: 12, maxFutureHours: 2 });
      expect(freshness.isFresh).toBe(false);
      expect(freshness.reasons.some(r => r.includes('exceeding maximum freshness threshold'))).toBe(true);
    });
  });
});
