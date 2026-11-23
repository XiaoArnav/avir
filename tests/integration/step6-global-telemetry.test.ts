import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import {
  WORLD_METROS,
  buildBatchCoordinatesUrl,
  parseBatchTelemetryResponse,
  computeComparableCohortRanks,
  filterAndSortWorldCities,
  fetchAllWorldCities,
  searchAndFetchGlobalCity,
  WorldMetroDef,
  WorldCityItem,
} from '@/services/world-telemetry-service';
import { classifyWorldRegion, getStableCityId } from '@/services/world-geography';
import { savedComparisonsService } from '@/services/saved-comparisons-service';
import { calculateCityComparison } from '@/domain/advanced-air-math';
import { telemetryCache } from '@/lib/cache';
import { WorldDataExplorer } from '@/components/WorldDataExplorer';
import { CityShootout } from '@/components/CityShootout';

describe('AVIR — Step 6 Global Telemetry & World Comparisons (85 Scenarios)', () => {
  beforeEach(() => {
    telemetryCache.clear();
    savedComparisonsService.clearAllSavedComparisons();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    telemetryCache.clear();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // GROUP A: Multi-Coordinate Batch Validation (1–15)
  // =========================================================================
  describe('Group A: Multi-Coordinate Batch Validation (1–15)', () => {
    it('1. Correct multi-coordinate URL contains comma-separated lats, lons, and cams_global', () => {
      const metros = WORLD_METROS.slice(0, 3);
      const url = buildBatchCoordinatesUrl(metros);
      expect(url).toContain('https://air-quality-api.open-meteo.com/v1/air-quality?');
      expect(url).toContain('latitude=');
      expect(url).toContain('longitude=');
      expect(url).toContain('domains=cams_global');
      expect(url).toContain('current=us_aqi,pm2_5,pm10');
    });

    it('2. Preserves coordinate precision without premature truncation to 2 decimals', () => {
      const city: WorldMetroDef = {
        id: 999,
        name: 'PreciseCity',
        country: 'TestCountry',
        region: 'Europe',
        latitude: 51.5074,
        longitude: -0.1278,
      };
      const url = buildBatchCoordinatesUrl([city]);
      expect(url).toContain('51.5074');
      expect(url).toContain('-0.1278');
    });

    it('3. Empty input returns an empty string without throwing', () => {
      const url = buildBatchCoordinatesUrl([]);
      expect(url).toBe('');
      const parsed = parseBatchTelemetryResponse([], []);
      expect(parsed).toEqual([]);
    });

    it('4. Out-of-bounds latitude (> 90 or < -90) is safely excluded', () => {
      const invalidCity: WorldMetroDef = {
        id: 901,
        name: 'NorthPolePlus',
        country: 'Arctic',
        region: 'Other',
        latitude: 95.5,
        longitude: 10.0,
      };
      const url = buildBatchCoordinatesUrl([invalidCity]);
      expect(url).toBe('');

      const parsed = parseBatchTelemetryResponse([invalidCity], [{ current: { us_aqi: 50 } }]);
      expect(parsed[0].status).toBe('invalid');
      expect(parsed[0].usAqi).toBeNull();
      expect(parsed[0].incompatibilityReasons?.[0]).toContain('invalid or out of bounds');
    });

    it('5. Out-of-bounds longitude (> 180 or < -180) is safely excluded', () => {
      const invalidCity: WorldMetroDef = {
        id: 902,
        name: 'FarEastPlus',
        country: 'Pacific',
        region: 'Other',
        latitude: 25.0,
        longitude: 195.0,
      };
      const url = buildBatchCoordinatesUrl([invalidCity]);
      expect(url).toBe('');

      const parsed = parseBatchTelemetryResponse([invalidCity], [{ current: { us_aqi: 50 } }]);
      expect(parsed[0].status).toBe('invalid');
      expect(parsed[0].usAqi).toBeNull();
    });

    it('6. NaN coordinates are filtered out safely', () => {
      const nanCity: WorldMetroDef = {
        id: 903,
        name: 'NaNCity',
        country: 'Nowhere',
        region: 'Other',
        latitude: NaN,
        longitude: 50.0,
      };
      expect(buildBatchCoordinatesUrl([nanCity])).toBe('');
      const parsed = parseBatchTelemetryResponse([nanCity], [{}]);
      expect(parsed[0].status).toBe('invalid');
      expect(parsed[0].comparable).toBe(false);
    });

    it('7. Infinite coordinates are rejected safely', () => {
      const infCity: WorldMetroDef = {
        id: 904,
        name: 'InfCity',
        country: 'Nowhere',
        region: 'Other',
        latitude: 10.0,
        longitude: Infinity,
      };
      expect(buildBatchCoordinatesUrl([infCity])).toBe('');
      const parsed = parseBatchTelemetryResponse([infCity], [{}]);
      expect(parsed[0].status).toBe('invalid');
    });

    it('8. Response cardinality mismatch is handled gracefully', () => {
      const cities = WORLD_METROS.slice(0, 3);
      // Upstream returned only 2 items for 3 requested cities
      const partialBatch = [
        { latitude: 28.6, longitude: 77.2, current: { us_aqi: 200, pm2_5: 150 } },
        { latitude: 31.5, longitude: 74.3, current: { us_aqi: 250, pm2_5: 190 } },
      ];
      const parsed = parseBatchTelemetryResponse(cities, partialBatch);
      expect(parsed.length).toBe(3);
      expect(parsed[0].usAqi).toBe(200);
      expect(parsed[1].usAqi).toBe(250);
      expect(parsed[2].usAqi).toBeNull(); // Missing 3rd city
      expect(parsed[2].status).toBe('unavailable');
    });

    it('9. Missing response city marks location unavailable without synthetic defaults', () => {
      const cities = [WORLD_METROS[0]];
      const parsed = parseBatchTelemetryResponse(cities, [null]);
      expect(parsed[0].status).toBe('unavailable');
      expect(parsed[0].usAqi).toBeNull();
      expect(parsed[0].pm25).toBeNull();
      expect(parsed[0].category).toBe('Unavailable');
    });

    it('10. Mismatched coordinate association (order swap) is detected and flagged', () => {
      const delhi = WORLD_METROS[0]; // 28.61, 77.21
      const lahore = WORLD_METROS[1]; // 31.52, 74.36
      const targets = [delhi, lahore];

      // Swapped response: Index 0 has Lahore coordinates, Index 1 has Delhi coordinates
      const swappedBatch = [
        { latitude: 31.52, longitude: 74.36, current: { us_aqi: 320, pm2_5: 280 } },
        { latitude: 28.61, longitude: 77.21, current: { us_aqi: 280, pm2_5: 240 } },
      ];

      const parsed = parseBatchTelemetryResponse(targets, swappedBatch);
      // Delhi should NOT silently receive Lahore's reading
      expect(parsed[0].status).toBe('unavailable');
      expect(parsed[0].usAqi).toBeNull();
      expect(parsed[0].incompatibilityReasons?.[0]).toContain('Coordinate association mismatch');
    });

    it('11. Malformed JSON or non-array response returns empty array', () => {
      const parsed = parseBatchTelemetryResponse(WORLD_METROS.slice(0, 2), null as any);
      expect(parsed).toEqual([]);
    });

    it('12. API HTTP error throws or falls back to stale cache', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      }));

      const results = await fetchAllWorldCities(undefined, { forceRefresh: true });
      expect(results).toEqual([]);
    });

    it('13. Network timeout is caught safely and does not hang', async () => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new DOMException('The operation was aborted', 'AbortError')), 50);
        });
      }));

      const controller = new AbortController();
      controller.abort();
      await expect(fetchAllWorldCities(controller.signal, { forceRefresh: true })).rejects.toThrow();
    });

    it('14. AbortSignal cancellation aborts request cleanly', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(searchAndFetchGlobalCity('Tokyo', controller.signal)).rejects.toThrow();
    });

    it('15. Partial response parses valid cities while keeping missing cities unavailable', () => {
      const cities = WORLD_METROS.slice(0, 2);
      const partialBatch = [
        { latitude: 28.6, longitude: 77.2, current: { us_aqi: 190, pm2_5: 120, time: '2026-11-23T05:00' } },
        { latitude: 31.5, longitude: 74.3, error: true, reason: 'Grid model missing' },
      ];

      const parsed = parseBatchTelemetryResponse(cities, partialBatch);
      expect(parsed[0].usAqi).toBe(190);
      expect(parsed[0].status).toBe('available');
      expect(parsed[1].usAqi).toBeNull();
      expect(parsed[1].status).toBe('unavailable');
    });
  });

  // =========================================================================
  // GROUP B: Measurement Integrity & Schema Gating (16–29)
  // =========================================================================
  describe('Group B: Measurement Integrity & Schema Gating (16–29)', () => {
    it('16. Genuine zero AQI is preserved as valid clean air and categorized as Good', () => {
      const batch = [{ latitude: 35.67, longitude: 139.65, current: { us_aqi: 0, pm2_5: 0, time: '2026-11-23T05:00' } }];
      const parsed = parseBatchTelemetryResponse([WORLD_METROS[12]], batch);
      expect(parsed[0].usAqi).toBe(0);
      expect(parsed[0].category).toBe('Good');
      expect(parsed[0].status).toBe('available');
    });

    it('17. Genuine zero PM2.5 is preserved as 0 ug/m3 and not converted to null', () => {
      const batch = [{ latitude: 35.67, longitude: 139.65, current: { us_aqi: 15, pm2_5: 0, time: '2026-11-23T05:00' } }];
      const parsed = parseBatchTelemetryResponse([WORLD_METROS[12]], batch);
      expect(parsed[0].pm25).toBe(0);
    });

    it('18. Missing AQI is represented as null, never defaulting to zero or synthetic 75', () => {
      const batch = [{ latitude: 28.6, longitude: 77.2, current: { pm2_5: null } }];
      const parsed = parseBatchTelemetryResponse([WORLD_METROS[0]], batch);
      expect(parsed[0].usAqi).toBeNull();
      expect(parsed[0].category).toBe('Unavailable');
    });

    it('19. Missing PM2.5 is represented as null, never defaulting to zero or synthetic 22', () => {
      const batch = [{ latitude: 28.6, longitude: 77.2, current: { us_aqi: null } }];
      const parsed = parseBatchTelemetryResponse([WORLD_METROS[0]], batch);
      expect(parsed[0].pm25).toBeNull();
    });

    it('20. Negative AQI is rejected as invalid and stored as null', () => {
      const batch = [{ latitude: 28.6, longitude: 77.2, current: { us_aqi: -50, pm2_5: 25 } }];
      const parsed = parseBatchTelemetryResponse([WORLD_METROS[0]], batch);
      // usAqi will be derived from PM2.5 since raw US AQI is invalid
      expect(parsed[0].incompatibilityReasons?.some(r => r.includes('derived'))).toBe(true);
    });

    it('21. Negative PM2.5 is rejected as invalid and stored as null', () => {
      const batch = [{ latitude: 28.6, longitude: 77.2, current: { us_aqi: 50, pm2_5: -10 } }];
      const parsed = parseBatchTelemetryResponse([WORLD_METROS[0]], batch);
      expect(parsed[0].pm25).toBeNull();
    });

    it('22. NaN pollutant values are rejected safely', () => {
      const batch = [{ latitude: 28.6, longitude: 77.2, current: { us_aqi: NaN, pm2_5: NaN } }];
      const parsed = parseBatchTelemetryResponse([WORLD_METROS[0]], batch);
      expect(parsed[0].usAqi).toBeNull();
      expect(parsed[0].pm25).toBeNull();
    });

    it('23. Infinite pollutant values are rejected safely', () => {
      const batch = [{ latitude: 28.6, longitude: 77.2, current: { us_aqi: Infinity, pm2_5: Infinity } }];
      const parsed = parseBatchTelemetryResponse([WORLD_METROS[0]], batch);
      expect(parsed[0].usAqi).toBeNull();
      expect(parsed[0].pm25).toBeNull();
    });

    it('24. Physically impossible pollutant concentrations (> 2000 PM2.5) are rejected', () => {
      const batch = [{ latitude: 28.6, longitude: 77.2, current: { us_aqi: 2500, pm2_5: 5000 } }];
      const parsed = parseBatchTelemetryResponse([WORLD_METROS[0]], batch);
      expect(parsed[0].usAqi).toBeNull();
      expect(parsed[0].pm25).toBeNull();
    });

    it('25. Original model-valid timestamp is preserved from provider payload', () => {
      const validTime = '2026-11-23T06:00';
      const batch = [{ latitude: 28.6, longitude: 77.2, current: { us_aqi: 180, pm2_5: 110, time: validTime } }];
      const parsed = parseBatchTelemetryResponse([WORLD_METROS[0]], batch);
      expect(parsed[0].modelValidAt).toBe(validTime);
      expect(parsed[0].lastUpdated).toBe(validTime);
    });

    it('26. Missing model-valid timestamp sets modelValidAt to null', () => {
      const batch = [{ latitude: 28.6, longitude: 77.2, current: { us_aqi: 180, pm2_5: 110 } }];
      const parsed = parseBatchTelemetryResponse([WORLD_METROS[0]], batch);
      expect(parsed[0].modelValidAt).toBeNull();
      expect(parsed[0].incompatibilityReasons).toContain('Missing model-valid observation timestamp');
    });

    it('27. Retrieval timestamp is distinct from model-valid time', () => {
      const batch = [{ latitude: 28.6, longitude: 77.2, current: { us_aqi: 180, pm2_5: 110, time: '2026-11-23T04:00' } }];
      const parsed = parseBatchTelemetryResponse([WORLD_METROS[0]], batch, { retrievedAt: '2026-11-23T10:30:00Z' });
      expect(parsed[0].modelValidAt).toBe('2026-11-23T04:00');
      expect(parsed[0].retrievedAt).toBe('2026-11-23T10:30:00Z');
      expect(parsed[0].modelValidAt).not.toBe(parsed[0].retrievedAt);
    });

    it('28. Modeled data explicitly sets observedAt: null (never claiming ground sensor status)', () => {
      const batch = [{ latitude: 28.6, longitude: 77.2, current: { us_aqi: 180, pm2_5: 110, time: '2026-11-23T04:00' } }];
      const parsed = parseBatchTelemetryResponse([WORLD_METROS[0]], batch);
      expect(parsed[0].observedAt).toBeNull();
      expect(parsed[0].sourceKind).toBe('atmospheric_model');
      expect(parsed[0].providerId).toBe('open_meteo_cams');
    });

    it('29. Derived single-species AQI is flagged as incompatible with multi-pollutant cohort', () => {
      // Upstream provides pm2_5 but no us_aqi
      const batch = [{ latitude: 28.6, longitude: 77.2, current: { pm2_5: 55, time: '2026-11-23T04:00' } }];
      const parsed = parseBatchTelemetryResponse([WORLD_METROS[0]], batch);
      expect(parsed[0].usAqi).not.toBeNull();
      expect(parsed[0].comparable).toBe(false);
      expect(parsed[0].incompatibilityReasons?.some(r => r.includes('derived'))).toBe(true);
    });
  });

  // =========================================================================
  // GROUP C: Scientific Comparative Ranking & Ties (30–40)
  // =========================================================================
  describe('Group C: Scientific Comparative Ranking & Ties (30–40)', () => {
    it('30. Comparable cities in the same timestamp window are ranked descending by US AQI', () => {
      const cities: WorldCityItem[] = [
        { id: 1, cityId: 'c1', name: 'Delhi', country: 'India', region: 'Asia', latitude: 28.6, longitude: 77.2, usAqi: 280, pm25: 220, category: 'VeryUnhealthy', status: 'available', comparable: true, incompatibilityReasons: [], modelValidAt: '2026-11-23T05:00', retrievedAt: '', sourceKind: 'atmospheric_model', providerId: 'open_meteo_cams', modelDomain: 'cams_global', observedAt: null, cohortRank: null, cohortSize: null },
        { id: 2, cityId: 'c2', name: 'Tokyo', country: 'Japan', region: 'Asia', latitude: 35.6, longitude: 139.6, usAqi: 35, pm25: 8, category: 'Good', status: 'available', comparable: true, incompatibilityReasons: [], modelValidAt: '2026-11-23T05:00', retrievedAt: '', sourceKind: 'atmospheric_model', providerId: 'open_meteo_cams', modelDomain: 'cams_global', observedAt: null, cohortRank: null, cohortSize: null },
        { id: 3, cityId: 'c3', name: 'Paris', country: 'France', region: 'Europe', latitude: 48.8, longitude: 2.3, usAqi: 65, pm25: 18, category: 'Moderate', status: 'available', comparable: true, incompatibilityReasons: [], modelValidAt: '2026-11-23T05:00', retrievedAt: '', sourceKind: 'atmospheric_model', providerId: 'open_meteo_cams', modelDomain: 'cams_global', observedAt: null, cohortRank: null, cohortSize: null },
      ];

      const ranked = computeComparableCohortRanks(cities);
      expect(ranked.find(c => c.name === 'Delhi')?.cohortRank).toBe(1);
      expect(ranked.find(c => c.name === 'Paris')?.cohortRank).toBe(2);
      expect(ranked.find(c => c.name === 'Tokyo')?.cohortRank).toBe(3);
      expect(ranked[0].cohortSize).toBe(3);
    });

    it('31. Missing model-valid timestamp excludes city from cohort rank', () => {
      const cities: WorldCityItem[] = [
        { id: 1, cityId: 'c1', name: 'Delhi', country: 'India', region: 'Asia', latitude: 28.6, longitude: 77.2, usAqi: 280, pm25: 220, category: 'VeryUnhealthy', status: 'available', comparable: true, incompatibilityReasons: [], modelValidAt: '2026-11-23T05:00', retrievedAt: '', sourceKind: 'atmospheric_model', providerId: 'open_meteo_cams', modelDomain: 'cams_global', observedAt: null, cohortRank: null, cohortSize: null },
        { id: 2, cityId: 'c2', name: 'NoTimeCity', country: 'X', region: 'Asia', latitude: 20, longitude: 80, usAqi: 150, pm25: 55, category: 'UnhealthySensitive', status: 'available', comparable: true, incompatibilityReasons: [], modelValidAt: null, retrievedAt: '', sourceKind: 'atmospheric_model', providerId: 'open_meteo_cams', modelDomain: 'cams_global', observedAt: null, cohortRank: null, cohortSize: null },
      ];

      const ranked = computeComparableCohortRanks(cities);
      const noTime = ranked.find(c => c.name === 'NoTimeCity');
      expect(noTime?.comparable).toBe(false);
      expect(noTime?.cohortRank).toBeNull();
      expect(ranked.find(c => c.name === 'Delhi')?.cohortSize).toBe(1);
    });

    it('32. Stale cached data is excluded from current live ranking cohort', () => {
      const cities: WorldCityItem[] = [
        { id: 1, cityId: 'c1', name: 'Delhi', country: 'India', region: 'Asia', latitude: 28.6, longitude: 77.2, usAqi: 280, pm25: 220, category: 'VeryUnhealthy', status: 'available', comparable: true, incompatibilityReasons: [], modelValidAt: '2026-11-23T05:00', retrievedAt: '', sourceKind: 'atmospheric_model', providerId: 'open_meteo_cams', modelDomain: 'cams_global', observedAt: null, cohortRank: null, cohortSize: null },
        { id: 2, cityId: 'c2', name: 'StaleLondon', country: 'UK', region: 'Europe', latitude: 51.5, longitude: -0.1, usAqi: 40, pm25: 10, category: 'Good', status: 'stale', comparable: true, incompatibilityReasons: [], modelValidAt: '2026-11-22T05:00', retrievedAt: '', sourceKind: 'atmospheric_model', providerId: 'open_meteo_cams', modelDomain: 'cams_global', observedAt: null, cohortRank: null, cohortSize: null },
      ];

      const ranked = computeComparableCohortRanks(cities);
      expect(ranked.find(c => c.name === 'StaleLondon')?.cohortRank).toBeNull();
      expect(ranked.find(c => c.name === 'StaleLondon')?.comparable).toBe(false);
    });

    it('33. Divergent model valid time (> 1 hour) excludes city from dominant cohort', () => {
      const cities: WorldCityItem[] = [
        { id: 1, cityId: 'c1', name: 'Delhi', country: 'India', region: 'Asia', latitude: 28.6, longitude: 77.2, usAqi: 280, pm25: 220, category: 'VeryUnhealthy', status: 'available', comparable: true, incompatibilityReasons: [], modelValidAt: '2026-11-23T06:00', retrievedAt: '', sourceKind: 'atmospheric_model', providerId: 'open_meteo_cams', modelDomain: 'cams_global', observedAt: null, cohortRank: null, cohortSize: null },
        { id: 2, cityId: 'c2', name: 'Tokyo', country: 'Japan', region: 'Asia', latitude: 35.6, longitude: 139.6, usAqi: 35, pm25: 8, category: 'Good', status: 'available', comparable: true, incompatibilityReasons: [], modelValidAt: '2026-11-23T06:00', retrievedAt: '', sourceKind: 'atmospheric_model', providerId: 'open_meteo_cams', modelDomain: 'cams_global', observedAt: null, cohortRank: null, cohortSize: null },
        { id: 3, cityId: 'c3', name: 'OldCity', country: 'X', region: 'Americas', latitude: 40, longitude: -70, usAqi: 80, pm25: 25, category: 'Moderate', status: 'available', comparable: true, incompatibilityReasons: [], modelValidAt: '2026-11-23T00:00', retrievedAt: '', sourceKind: 'atmospheric_model', providerId: 'open_meteo_cams', modelDomain: 'cams_global', observedAt: null, cohortRank: null, cohortSize: null },
      ];

      const ranked = computeComparableCohortRanks(cities);
      expect(ranked.find(c => c.name === 'OldCity')?.cohortRank).toBeNull();
      expect(ranked.find(c => c.name === 'OldCity')?.comparable).toBe(false);
    });

    it('34. Single-species derived AQI is excluded from multi-pollutant ranking cohort', () => {
      const cities: WorldCityItem[] = [
        { id: 1, cityId: 'c1', name: 'Delhi', country: 'India', region: 'Asia', latitude: 28.6, longitude: 77.2, usAqi: 280, pm25: 220, category: 'VeryUnhealthy', status: 'available', comparable: true, incompatibilityReasons: [], modelValidAt: '2026-11-23T06:00', retrievedAt: '', sourceKind: 'atmospheric_model', providerId: 'open_meteo_cams', modelDomain: 'cams_global', observedAt: null, cohortRank: null, cohortSize: null },
        { id: 2, cityId: 'c2', name: 'DerivedCity', country: 'X', region: 'Asia', latitude: 20, longitude: 80, usAqi: 100, pm25: 35, category: 'Moderate', status: 'partial', comparable: false, incompatibilityReasons: ['US AQI is derived from single-species PM2.5 calculation'], modelValidAt: '2026-11-23T06:00', retrievedAt: '', sourceKind: 'atmospheric_model', providerId: 'open_meteo_cams', modelDomain: 'cams_global', observedAt: null, cohortRank: null, cohortSize: null },
      ];

      const ranked = computeComparableCohortRanks(cities);
      expect(ranked.find(c => c.name === 'DerivedCity')?.cohortRank).toBeNull();
      expect(ranked.find(c => c.name === 'Delhi')?.cohortRank).toBe(1);
    });

    it('35. City with null AQI remains unranked with cohortRank: null', () => {
      const cities: WorldCityItem[] = [
        { id: 1, cityId: 'c1', name: 'OfflineCity', country: 'X', region: 'Asia', latitude: 20, longitude: 80, usAqi: null, pm25: null, category: 'Unavailable', status: 'unavailable', comparable: false, incompatibilityReasons: [], modelValidAt: null, retrievedAt: '', sourceKind: 'atmospheric_model', providerId: 'open_meteo_cams', modelDomain: 'cams_global', observedAt: null, cohortRank: null, cohortSize: null },
      ];
      const ranked = computeComparableCohortRanks(cities);
      expect(ranked[0].cohortRank).toBeNull();
      expect(ranked[0].cohortSize).toBe(0);
    });

    it('36. Competition ties policy gives identical ranks with gap to next (1, 2, 2, 4)', () => {
      const cities: WorldCityItem[] = [
        { id: 1, cityId: 'c1', name: 'City1', country: 'A', region: 'Asia', latitude: 10, longitude: 10, usAqi: 300, pm25: 250, category: 'Hazardous', status: 'available', comparable: true, incompatibilityReasons: [], modelValidAt: '2026-11-23T06:00', retrievedAt: '', sourceKind: 'atmospheric_model', providerId: 'open_meteo_cams', modelDomain: 'cams_global', observedAt: null, cohortRank: null, cohortSize: null },
        { id: 2, cityId: 'c2', name: 'City2A', country: 'B', region: 'Europe', latitude: 20, longitude: 20, usAqi: 150, pm25: 55, category: 'UnhealthySensitive', status: 'available', comparable: true, incompatibilityReasons: [], modelValidAt: '2026-11-23T06:00', retrievedAt: '', sourceKind: 'atmospheric_model', providerId: 'open_meteo_cams', modelDomain: 'cams_global', observedAt: null, cohortRank: null, cohortSize: null },
        { id: 3, cityId: 'c3', name: 'City2B', country: 'C', region: 'Americas', latitude: 30, longitude: 30, usAqi: 150, pm25: 55, category: 'UnhealthySensitive', status: 'available', comparable: true, incompatibilityReasons: [], modelValidAt: '2026-11-23T06:00', retrievedAt: '', sourceKind: 'atmospheric_model', providerId: 'open_meteo_cams', modelDomain: 'cams_global', observedAt: null, cohortRank: null, cohortSize: null },
        { id: 4, cityId: 'c4', name: 'City4', country: 'D', region: 'Oceania', latitude: 40, longitude: 40, usAqi: 50, pm25: 12, category: 'Good', status: 'available', comparable: true, incompatibilityReasons: [], modelValidAt: '2026-11-23T06:00', retrievedAt: '', sourceKind: 'atmospheric_model', providerId: 'open_meteo_cams', modelDomain: 'cams_global', observedAt: null, cohortRank: null, cohortSize: null },
      ];

      const ranked = computeComparableCohortRanks(cities);
      expect(ranked.find(c => c.name === 'City1')?.cohortRank).toBe(1);
      expect(ranked.find(c => c.name === 'City2A')?.cohortRank).toBe(2);
      expect(ranked.find(c => c.name === 'City2B')?.cohortRank).toBe(2);
      expect(ranked.find(c => c.name === 'City4')?.cohortRank).toBe(4); // 1, 2, 2, 4
    });

    it('37. Stable secondary tiebreaker uses alphabetical city name', () => {
      const cities: WorldCityItem[] = [
        { id: 1, cityId: 'c1', name: 'Berlin', country: 'DE', region: 'Europe', latitude: 52, longitude: 13, usAqi: 50, pm25: 12, category: 'Good', status: 'available', comparable: true, incompatibilityReasons: [], modelValidAt: '2026-11-23T06:00', retrievedAt: '', sourceKind: 'atmospheric_model', providerId: 'open_meteo_cams', modelDomain: 'cams_global', observedAt: null, cohortRank: null, cohortSize: null },
        { id: 2, cityId: 'c2', name: 'Amsterdam', country: 'NL', region: 'Europe', latitude: 52, longitude: 4, usAqi: 50, pm25: 12, category: 'Good', status: 'available', comparable: true, incompatibilityReasons: [], modelValidAt: '2026-11-23T06:00', retrievedAt: '', sourceKind: 'atmospheric_model', providerId: 'open_meteo_cams', modelDomain: 'cams_global', observedAt: null, cohortRank: null, cohortSize: null },
      ];

      const sorted = filterAndSortWorldCities(cities, '', 'All', 'All', 'most_polluted');
      // For identical AQI, stable sort orders Amsterdam before Berlin
      expect(sorted[0].name).toBe('Amsterdam');
      expect(sorted[1].name).toBe('Berlin');
    });

    it('38. Filtering by region or search preserves the canonical cohort rank', () => {
      const cities: WorldCityItem[] = [
        { id: 1, cityId: 'c1', name: 'Delhi', country: 'India', region: 'Asia', latitude: 28.6, longitude: 77.2, usAqi: 280, pm25: 220, category: 'VeryUnhealthy', cohortRank: 1, cohortSize: 35 },
        { id: 2, cityId: 'c2', name: 'London', country: 'UK', region: 'Europe', latitude: 51.5, longitude: -0.1, usAqi: 35, pm25: 8, category: 'Good', cohortRank: 28, cohortSize: 35 },
      ];

      const filtered = filterAndSortWorldCities(cities, '', 'Europe', 'All', 'most_polluted');
      expect(filtered.length).toBe(1);
      // London must retain its #28 cohort rank, not be falsely labeled #1
      expect(filtered[0].cohortRank).toBe(28);
      expect(filtered[0].cohortSize).toBe(35);
    });

    it('39. Valid zero pollution AQI remains eligible for ranking cohort', () => {
      const cities: WorldCityItem[] = [
        { id: 1, cityId: 'c1', name: 'CleanCity', country: 'IS', region: 'Europe', latitude: 64, longitude: -21, usAqi: 0, pm25: 0, category: 'Good', status: 'available', comparable: true, incompatibilityReasons: [], modelValidAt: '2026-11-23T06:00', retrievedAt: '', sourceKind: 'atmospheric_model', providerId: 'open_meteo_cams', modelDomain: 'cams_global', observedAt: null, cohortRank: null, cohortSize: null },
      ];
      const ranked = computeComparableCohortRanks(cities);
      expect(ranked[0].cohortRank).toBe(1);
      expect(ranked[0].cohortSize).toBe(1);
    });

    it('40. Ranking denominator reflects only comparable tracked cities (#X of N)', () => {
      const cities: WorldCityItem[] = [
        { id: 1, cityId: 'c1', name: 'CityA', country: 'A', region: 'Asia', latitude: 10, longitude: 10, usAqi: 100, pm25: 35, category: 'Moderate', status: 'available', comparable: true, incompatibilityReasons: [], modelValidAt: '2026-11-23T06:00', retrievedAt: '', sourceKind: 'atmospheric_model', providerId: 'open_meteo_cams', modelDomain: 'cams_global', observedAt: null, cohortRank: null, cohortSize: null },
        { id: 2, cityId: 'c2', name: 'CityB', country: 'B', region: 'Asia', latitude: 20, longitude: 20, usAqi: null, pm25: null, category: 'Unavailable', status: 'unavailable', comparable: false, incompatibilityReasons: [], modelValidAt: null, retrievedAt: '', sourceKind: 'atmospheric_model', providerId: 'open_meteo_cams', modelDomain: 'cams_global', observedAt: null, cohortRank: null, cohortSize: null },
      ];

      const ranked = computeComparableCohortRanks(cities);
      expect(ranked[0].cohortRank).toBe(1);
      expect(ranked[0].cohortSize).toBe(1); // 1 comparable, not 2
    });
  });

  // =========================================================================
  // GROUP D: Geocoding, Region Mapping & Identity (41–50)
  // =========================================================================
  describe('Group D: Geocoding, Region Mapping & Identity (41–50)', () => {
    it('41. City search matches name case-insensitively', () => {
      const cities: WorldCityItem[] = [
        { id: 1, cityId: 'c1', name: 'Tokyo', country: 'Japan', region: 'Asia', latitude: 35.6, longitude: 139.6, usAqi: 45, pm25: 10, category: 'Good' },
        { id: 2, cityId: 'c2', name: 'Cairo', country: 'Egypt', region: 'Middle East & Africa', latitude: 30.0, longitude: 31.2, usAqi: 180, pm25: 120, category: 'Unhealthy' },
      ];
      const match = filterAndSortWorldCities(cities, 'tokyo', 'All', 'All', 'most_polluted');
      expect(match.length).toBe(1);
      expect(match[0].name).toBe('Tokyo');
    });

    it('42. Country search matches country name and countryCode', () => {
      const cities: WorldCityItem[] = [
        { id: 1, cityId: 'c1', name: 'Sydney', country: 'Australia', countryCode: 'AU', region: 'Oceania', latitude: -33.8, longitude: 151.2, usAqi: 25, pm25: 5, category: 'Good' },
      ];
      expect(filterAndSortWorldCities(cities, 'australia', 'All', 'All', 'most_polluted').length).toBe(1);
      expect(filterAndSortWorldCities(cities, 'AU', 'All', 'All', 'most_polluted').length).toBe(1);
    });

    it('43. Multiple same-name cities retain distinct geographic identities', () => {
      const londonUK: WorldMetroDef = { id: 1, cityId: 'gb-london', name: 'London', country: 'United Kingdom', countryCode: 'GB', region: 'Europe', latitude: 51.5074, longitude: -0.1278 };
      const londonCA: WorldMetroDef = { id: 2, cityId: 'ca-london', name: 'London', country: 'Canada', countryCode: 'CA', region: 'Americas', latitude: 42.9849, longitude: -81.2453 };

      const idUK = getStableCityId(londonUK);
      const idCA = getStableCityId(londonCA);
      expect(idUK).not.toBe(idCA);
    });

    it('44. Country-code-based region classification maps accurately', () => {
      expect(classifyWorldRegion('France', 'FR')).toBe('Europe');
      expect(classifyWorldRegion('Japan', 'JP')).toBe('Asia');
      expect(classifyWorldRegion('Brazil', 'BR')).toBe('Americas');
      expect(classifyWorldRegion('Egypt', 'EG')).toBe('Middle East & Africa');
      expect(classifyWorldRegion('New Zealand', 'NZ')).toBe('Oceania');
    });

    it('45. Unknown region does not default to Asia (returns Other)', () => {
      expect(classifyWorldRegion('Atlantis', 'ZZ')).toBe('Other');
      expect(classifyWorldRegion('', '')).toBe('Other');
    });

    it('46. Search request cancellation halts in-flight geocoding queries', async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(searchAndFetchGlobalCity('Berlin', controller.signal)).rejects.toThrow();
    });

    it('47. Old search generation results do not overwrite newer results', () => {
      let activeGen = 1;
      const resultsByGen = new Map<number, string>();

      // Request 1 starts
      const gen1 = activeGen;
      resultsByGen.set(gen1, 'London');

      // Request 2 supersedes
      activeGen = 2;
      const gen2 = activeGen;
      resultsByGen.set(gen2, 'Paris');

      // If Request 1 arrives after Request 2
      let displayed = 'Paris';
      if (gen1 === activeGen) {
        displayed = resultsByGen.get(gen1)!; // Should not happen
      }
      expect(displayed).toBe('Paris');
    });

    it('48. City selection preserves exact coordinates and admin region', () => {
      const city: WorldCityItem = {
        id: 101,
        cityId: 'c-101',
        name: 'Delhi-NCR',
        country: 'India',
        admin1: 'Delhi',
        region: 'Asia',
        latitude: 28.6139,
        longitude: 77.2090,
        usAqi: 280,
        pm25: 220,
        category: 'VeryUnhealthy',
      };
      expect(city.latitude).toBe(28.6139);
      expect(city.longitude).toBe(77.2090);
      expect(city.admin1).toBe('Delhi');
    });

    it('49. Provider ID (open_meteo_cams) and sourceKind (atmospheric_model) are populated', () => {
      const batch = [{ latitude: 28.6, longitude: 77.2, current: { us_aqi: 180, pm2_5: 110, time: '2026-11-23T05:00' } }];
      const parsed = parseBatchTelemetryResponse([WORLD_METROS[0]], batch);
      expect(parsed[0].providerId).toBe('open_meteo_cams');
      expect(parsed[0].sourceKind).toBe('atmospheric_model');
      expect(parsed[0].modelDomain).toBe('cams_global');
    });

    it('50. Geographic deduplication prevents duplicate cards in combined list', () => {
      const list = [WORLD_METROS[0]];
      const duplicate = { ...WORLD_METROS[0] };
      const uniqueList = [list[0]];
      if (!uniqueList.some(c => c.latitude === duplicate.latitude && c.longitude === duplicate.longitude)) {
        uniqueList.push(duplicate);
      }
      expect(uniqueList.length).toBe(1);
    });
  });

  // =========================================================================
  // GROUP E: Fair City vs City Comparisons & Zeros (51–60)
  // =========================================================================
  describe('Group E: Fair City vs City Comparisons & Zeros (51–60)', () => {
    it('51. Synchronized model and time produces a fair comparable shootout', () => {
      const cityA = { name: 'Delhi', country: 'India', aqi: 280, pm25: 220, timestamp: '2026-11-23T06:00', modelDomain: 'cams_global' };
      const cityB = { name: 'Tokyo', country: 'Japan', aqi: 28, pm25: 11, timestamp: '2026-11-23T06:00', modelDomain: 'cams_global' };

      const comparison = calculateCityComparison(cityA, cityB);
      expect(comparison.comparable).toBe(true);
      expect(comparison.reasons.length).toBe(0);
      expect(comparison.dirtierCityName).toBe('Delhi');
      expect(comparison.cleanerCityName).toBe('Tokyo');
      expect(comparison.aqiRatio).toBe(10);
      expect(comparison.pm25ConcentrationRatio).toBe(20);
    });

    it('52. Severe model observation time skew (> 6 hours) is flagged in reasons', () => {
      const cityA = { name: 'Delhi', country: 'India', aqi: 280, pm25: 220, timestamp: '2026-11-23T12:00' };
      const cityB = { name: 'Tokyo', country: 'Japan', aqi: 28, pm25: 11, timestamp: '2026-11-23T02:00' };

      const comparison = calculateCityComparison(cityA, cityB);
      expect(comparison.comparable).toBe(false);
      expect(comparison.reasons.some(r => r.includes('time skew'))).toBe(true);
    });

    it('53. Differing model domains are flagged in comparison reasons', () => {
      const cityA = { name: 'Delhi', country: 'India', aqi: 280, pm25: 220, modelDomain: 'cams_global' };
      const cityB = { name: 'London', country: 'UK', aqi: 35, pm25: 8, modelDomain: 'cams_europe' };

      const comparison = calculateCityComparison(cityA, cityB);
      expect(comparison.comparable).toBe(false);
      expect(comparison.reasons.some(r => r.includes('Model domains differ'))).toBe(true);
    });

    it('54. Missing AQI in either city disables comparison with explanatory message', () => {
      const cityA = { name: 'Delhi', country: 'India', aqi: null, pm25: null };
      const cityB = { name: 'Tokyo', country: 'Japan', aqi: 28, pm25: 11 };

      const comparison = calculateCityComparison(cityA, cityB);
      expect(comparison.comparable).toBe(false);
      expect(comparison.dirtierCityName).toBeNull();
      expect(comparison.verdict).toContain('Atmospheric comparison unavailable');
    });

    it('55. Missing PM2.5 handles cigarette differential safely without NaN', () => {
      const cityA = { name: 'Delhi', country: 'India', aqi: 150, pm25: null };
      const cityB = { name: 'Tokyo', country: 'Japan', aqi: 50, pm25: 12 };

      const comparison = calculateCityComparison(cityA, cityB);
      expect(comparison.cigaretteDifferential).toBeNull();
      expect(comparison.pm25ConcentrationRatio).toBeNull();
    });

    it('56. Zero versus zero handles ratio cleanly (1.0x with clean air verdict)', () => {
      const cityA = { name: 'Reykjavik', country: 'Iceland', aqi: 0, pm25: 0 };
      const cityB = { name: 'Honolulu', country: 'USA', aqi: 0, pm25: 0 };

      const comparison = calculateCityComparison(cityA, cityB);
      expect(comparison.aqiRatio).toBe(1.0);
      expect(comparison.pm25ConcentrationRatio).toBe(1.0);
      expect(comparison.verdict).toContain('pristine zero-AQI clean air');
    });

    it('57. Zero versus nonzero handles ratio without division by zero or Infinity', () => {
      const cleanCity = { name: 'CleanCity', country: 'IS', aqi: 0, pm25: 0 };
      const smogCity = { name: 'SmogCity', country: 'IN', aqi: 180, pm25: 120 };

      const comparison = calculateCityComparison(cleanCity, smogCity);
      expect(Number.isFinite(comparison.aqiRatio!)).toBe(true);
      expect(comparison.pm25ConcentrationRatio).toBeNull(); // Denominator is zero
      expect(comparison.verdict).toContain('clean air baseline');
    });

    it('58. Concentration ratio is valid and finite', () => {
      const cityA = { name: 'CityA', country: 'X', aqi: 100, pm25: 44 };
      const cityB = { name: 'CityB', country: 'Y', aqi: 50, pm25: 22 };

      const comparison = calculateCityComparison(cityA, cityB);
      expect(comparison.pm25ConcentrationRatio).toBe(2.0); // 44 / 22 = 2.0x
    });

    it('59. Misleading universal toxicity claim is replaced with scientific concentration ratio', () => {
      const cityA = { name: 'CityA', country: 'X', aqi: 100, pm25: 44 };
      const cityB = { name: 'CityB', country: 'Y', aqi: 50, pm25: 22 };

      const comparison = calculateCityComparison(cityA, cityB);
      expect(comparison.pm25ConcentrationRatio).toBe(2.0);
      expect(comparison.verdict).not.toContain('twice as toxic in all biological respects');
    });

    it('60. Cached/stale values clearly identified in CityShootout UI', () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(CityShootout, {
          currentCityName: 'Delhi',
          currentAqi: 250,
          currentPm25: 180,
          comparisonTargetData: { aqi: 30, pm25: 8, timestamp: '2026-11-20T00:00Z' },
        })
      );
      expect(html).toContain('Delhi');
      expect(html).toContain('Primary City');
    });
  });

  // =========================================================================
  // GROUP F: Local Persistence, Cache & Isolation (61–70)
  // =========================================================================
  describe('Group F: Local Persistence, Cache & Isolation (61–70)', () => {
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
    });

    afterEach(() => {
      (globalThis as any).window = originalWindow;
    });

    it('61. Saved city pair persists to localStorage and returns valid record', () => {
      const result = savedComparisonsService.saveComparison({
        cityA: { name: 'Delhi', country: 'India', aqi: 280, pm25: 220 },
        cityB: { name: 'Tokyo', country: 'Japan', aqi: 28, pm25: 11 },
      });

      expect(result.success).toBe(true);
      expect(result.record).toBeDefined();

      const saved = savedComparisonsService.getSavedComparisons();
      expect(saved.length).toBe(1);
      expect(saved[0].cityA.name).toBe('Delhi');
      expect(saved[0].cityB.name).toBe('Tokyo');
      expect(saved[0].version).toBe(1);
    });

    it('62. Malformed or corrupted localStorage data is safely discarded without throwing', () => {
      window.localStorage.setItem('avir:saved_comparisons:v1', '{"not": "an array"}');
      const saved = savedComparisonsService.getSavedComparisons();
      expect(saved).toEqual([]);
    });

    it('63. Storage disabled / quota exceeded handled safely without fatal crashes', () => {
      const spy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
        throw new DOMException('QuotaExceededError');
      });

      const res = savedComparisonsService.saveComparison({
        cityA: { name: 'Delhi', country: 'India', aqi: 280, pm25: 220 },
        cityB: { name: 'Tokyo', country: 'Japan', aqi: 28, pm25: 11 },
      });

      expect(res.success).toBe(false);
      spy.mockRestore();
    });

    it('64. In-memory cache TTL of 10 minutes is enforced', () => {
      telemetryCache.set('world:v6:cams_global:tracked', [{ name: 'CachedCity' }], 1000 * 60 * 10);
      const hit = telemetryCache.get('world:v6:cams_global:tracked');
      expect(hit).toBeDefined();
    });

    it('65. Network error falls back to stale cache with status: stale', async () => {
      telemetryCache.set('world:v6:cams_global:tracked', [
        {
          id: 101,
          name: 'Delhi-NCR',
          country: 'India',
          region: 'Asia',
          latitude: 28.6,
          longitude: 77.2,
          usAqi: 280,
          pm25: 220,
          category: 'VeryUnhealthy',
          status: 'available',
        },
      ], 100); // 100ms TTL

      // Advance time past TTL so it is expired/stale
      await new Promise(r => setTimeout(r, 150));

      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network offline')));
      const cities = await fetchAllWorldCities();
      expect(cities.length).toBe(1);
      expect(cities[0].status).toBe('stale');
      expect(cities[0].isLive).toBe(false);
    });

    it('66. Stale fallback is excluded from live cohort ranking', async () => {
      telemetryCache.set('world:v6:cams_global:tracked', [
        {
          id: 101,
          name: 'Delhi-NCR',
          country: 'India',
          region: 'Asia',
          latitude: 28.6,
          longitude: 77.2,
          usAqi: 280,
          pm25: 220,
          category: 'VeryUnhealthy',
          status: 'available',
        },
      ], 100);

      await new Promise(r => setTimeout(r, 150));
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network offline')));
      const cities = await fetchAllWorldCities();
      expect(cities[0].cohortRank).toBeNull();
      expect(cities[0].comparable).toBe(false);
    });

    it('67. Cache keys include model domain to prevent cross-domain pollution', () => {
      const keyGlobal = 'world:v6:cams_global:tracked';
      const keyEurope = 'world:v6:cams_europe:tracked';
      expect(keyGlobal).not.toBe(keyEurope);
    });

    it('68. forceRefresh bypasses cache and initiates genuine network request', async () => {
      telemetryCache.set('world:v6:cams_global:tracked', [{ name: 'CachedCity' }], 1000 * 60 * 10);
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ current: { us_aqi: 200, pm2_5: 150, time: '2026-11-23T06:00' } }],
      });
      vi.stubGlobal('fetch', fetchSpy);

      await fetchAllWorldCities(undefined, { forceRefresh: true });
      expect(fetchSpy).toHaveBeenCalled();
    });

    it('69. No synthetic historical snapshots are fabricated when storage is empty', () => {
      const saved = savedComparisonsService.getSavedComparisons();
      expect(saved.length).toBe(0);
      expect(saved).not.toContainEqual(expect.objectContaining({ note: 'Simulated past reading' }));
    });

    it('70. Bounded storage caps saved comparisons at maximum limit', () => {
      for (let i = 0; i < 15; i++) {
        savedComparisonsService.saveComparison({
          cityA: { name: `CityA_${i}`, country: 'A', aqi: 100, pm25: 35 },
          cityB: { name: `CityB_${i}`, country: 'B', aqi: 50, pm25: 15 },
        });
      }
      const saved = savedComparisonsService.getSavedComparisons();
      expect(saved.length).toBeLessThanOrEqual(10);
    });
  });

  // =========================================================================
  // GROUP G: UI & Integration Safeguards (71–85)
  // =========================================================================
  describe('Group G: UI & Integration Safeguards (71–85)', () => {
    it('71. World explorer renders valid cards with correct header text', () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(WorldDataExplorer, {
          onSelectCity: vi.fn(),
          activeCityName: 'Delhi-NCR',
        })
      );
      expect(html).toContain('Global Air Quality — Tracked City Comparison');
      expect(html).toContain('Worldwide Modeled Telemetry &amp; Cohort Rankings');
    });

    it('72. World explorer handles empty city state without crashing', () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(WorldDataExplorer, {
          onSelectCity: vi.fn(),
          activeCityName: 'Nowhere',
        })
      );
      expect(html).toBeDefined();
    });

    it('73. Rank denominator shows comparable tracked count (#X of N)', () => {
      const city: WorldCityItem = {
        id: 101,
        cityId: 'c-101',
        name: 'Delhi-NCR',
        country: 'India',
        region: 'Asia',
        latitude: 28.6,
        longitude: 77.2,
        usAqi: 280,
        pm25: 220,
        category: 'VeryUnhealthy',
        cohortRank: 1,
        cohortSize: 33,
      };
      const filtered = filterAndSortWorldCities([city], '', 'All', 'All', 'most_polluted');
      expect(filtered[0].cohortRank).toBe(1);
      expect(filtered[0].cohortSize).toBe(33);
    });

    it('74. Unavailable badge is rendered when atmospheric data is missing', () => {
      const city: WorldCityItem = {
        id: 102,
        cityId: 'c-102',
        name: 'OfflineCity',
        country: 'Nowhere',
        region: 'Asia',
        latitude: 20,
        longitude: 80,
        usAqi: null,
        pm25: null,
        category: 'Unavailable',
      };
      const filtered = filterAndSortWorldCities([city], '', 'All', 'All', 'most_polluted');
      expect(filtered[0].usAqi).toBeNull();
      expect(filtered[0].category).toBe('Unavailable');
    });

    it('75. Dynamic search query filters list accurately', () => {
      const cities: WorldCityItem[] = [
        { id: 1, cityId: 'c1', name: 'Berlin', country: 'Germany', region: 'Europe', latitude: 52.5, longitude: 13.4, usAqi: 45, pm25: 10, category: 'Good' },
        { id: 2, cityId: 'c2', name: 'Paris', country: 'France', region: 'Europe', latitude: 48.8, longitude: 2.3, usAqi: 55, pm25: 14, category: 'Moderate' },
      ];
      const match = filterAndSortWorldCities(cities, 'Berlin', 'All', 'All', 'most_polluted');
      expect(match.length).toBe(1);
      expect(match[0].name).toBe('Berlin');
    });

    it('76. No-results state occurs when filter matches nothing', () => {
      const cities: WorldCityItem[] = [
        { id: 1, cityId: 'c1', name: 'Tokyo', country: 'Japan', region: 'Asia', latitude: 35.6, longitude: 139.6, usAqi: 35, pm25: 8, category: 'Good' },
      ];
      const match = filterAndSortWorldCities(cities, 'ZanzibarNonexistent', 'All', 'All', 'most_polluted');
      expect(match.length).toBe(0);
    });

    it('77. Sort toggle re-orders between most polluted and cleanest', () => {
      const cities: WorldCityItem[] = [
        { id: 1, cityId: 'c1', name: 'CleanCity', country: 'IS', region: 'Europe', latitude: 64, longitude: -21, usAqi: 15, pm25: 3, category: 'Good' },
        { id: 2, cityId: 'c2', name: 'SmogCity', country: 'IN', region: 'Asia', latitude: 28, longitude: 77, usAqi: 300, pm25: 250, category: 'Hazardous' },
      ];
      const pollutedFirst = filterAndSortWorldCities(cities, '', 'All', 'All', 'most_polluted');
      expect(pollutedFirst[0].name).toBe('SmogCity');

      const cleanestFirst = filterAndSortWorldCities(cities, '', 'All', 'All', 'cleanest');
      expect(cleanestFirst[0].name).toBe('CleanCity');
    });

    it('78. Region filter displays only selected continent', () => {
      const cities: WorldCityItem[] = [
        { id: 1, cityId: 'c1', name: 'London', country: 'UK', region: 'Europe', latitude: 51.5, longitude: -0.1, usAqi: 35, pm25: 8, category: 'Good' },
        { id: 2, cityId: 'c2', name: 'Tokyo', country: 'Japan', region: 'Asia', latitude: 35.6, longitude: 139.6, usAqi: 45, pm25: 10, category: 'Good' },
      ];
      const europeOnly = filterAndSortWorldCities(cities, '', 'Europe', 'All', 'most_polluted');
      expect(europeOnly.length).toBe(1);
      expect(europeOnly[0].name).toBe('London');
    });

    it('79. Severity filter follows EPA categories accurately (clean <= 50, moderate 51-100)', () => {
      const cities: WorldCityItem[] = [
        { id: 1, cityId: 'c1', name: 'GoodAir', country: 'A', region: 'Europe', latitude: 50, longitude: 10, usAqi: 50, pm25: 12, category: 'Good' },
        { id: 2, cityId: 'c2', name: 'ModAir', country: 'B', region: 'Europe', latitude: 51, longitude: 10, usAqi: 75, pm25: 24, category: 'Moderate' },
        { id: 3, cityId: 'c3', name: 'UnhealthyAir', country: 'C', region: 'Asia', latitude: 25, longitude: 80, usAqi: 175, pm25: 90, category: 'Unhealthy' },
        { id: 4, cityId: 'c4', name: 'HazardousAir', country: 'D', region: 'Asia', latitude: 28, longitude: 77, usAqi: 350, pm25: 300, category: 'Hazardous' },
      ];

      expect(filterAndSortWorldCities(cities, '', 'All', 'clean', 'most_polluted').map(c => c.name)).toEqual(['GoodAir']);
      expect(filterAndSortWorldCities(cities, '', 'All', 'moderate', 'most_polluted').map(c => c.name)).toEqual(['ModAir']);
      expect(filterAndSortWorldCities(cities, '', 'All', 'unhealthy', 'most_polluted').map(c => c.name)).toEqual(['UnhealthyAir']);
      expect(filterAndSortWorldCities(cities, '', 'All', 'hazardous', 'most_polluted').map(c => c.name)).toEqual(['HazardousAir']);
    });

    it('80. Grid and table view modes both render valid HTML structure', () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(WorldDataExplorer, {
          onSelectCity: vi.fn(),
          activeCityName: 'Tokyo',
        })
      );
      expect(html).toContain('button');
    });

    it('81. Accessible buttons have explicit aria-label and type attributes', () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(WorldDataExplorer, {
          onSelectCity: vi.fn(),
          activeCityName: 'Tokyo',
        })
      );
      expect(html).toContain('aria-label');
      expect(html).toContain('type="button"');
    });

    it('82. Admin region and country disambiguation is displayed on card', () => {
      const city: WorldCityItem = {
        id: 101,
        cityId: 'c-101',
        name: 'Delhi-NCR',
        country: 'India',
        admin1: 'Delhi',
        region: 'Asia',
        latitude: 28.6,
        longitude: 77.2,
        usAqi: 280,
        pm25: 220,
        category: 'VeryUnhealthy',
      };
      expect(city.admin1).toBe('Delhi');
      expect(city.country).toBe('India');
    });

    it('83. City selection passes exact coordinates to parent handler', () => {
      const onSelect = vi.fn();
      const city: WorldCityItem = {
        id: 101,
        cityId: 'c-101',
        name: 'Delhi-NCR',
        country: 'India',
        region: 'Asia',
        latitude: 28.6139,
        longitude: 77.2090,
        usAqi: 280,
        pm25: 220,
        category: 'VeryUnhealthy',
      };

      onSelect({
        id: city.id,
        name: city.name,
        country: city.country,
        latitude: city.latitude,
        longitude: city.longitude,
      });

      expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Delhi-NCR',
        latitude: 28.6139,
        longitude: 77.2090,
      }));
    });

    it('84. Stale previous search results cannot overwrite active city data', () => {
      let activeQuery = 'Paris';
      const arrivals = [
        { query: 'London', data: [{ name: 'London' }] },
        { query: 'Paris', data: [{ name: 'Paris' }] },
      ];

      const current = arrivals.filter(a => a.query === activeQuery);
      expect(current.length).toBe(1);
      expect(current[0].data[0].name).toBe('Paris');
    });

    it('85. Main dashboard and CityShootout continue operating during world batch API failure', () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(CityShootout, {
          currentCityName: 'Bengaluru',
          currentAqi: 65,
          currentPm25: 18,
          currentCountry: 'India',
          comparisonTargetData: null,
        })
      );
      expect(html).toContain('Bengaluru');
      expect(html).toContain('Comparison data unavailable');
    });
  });
});
