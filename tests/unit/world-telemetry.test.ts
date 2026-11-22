import { describe, it, expect } from 'vitest';
import { 
  WORLD_METROS, 
  buildBatchCoordinatesUrl, 
  parseBatchTelemetryResponse,
  filterAndSortWorldCities,
  searchAndFetchGlobalCity,
  WorldCityItem,
} from '@/services/world-telemetry-service';

describe('World Telemetry & Global Air Quality Rankings', () => {
  it('contains curated world metros across multiple continents', () => {
    expect(WORLD_METROS.length).toBeGreaterThanOrEqual(25);
    const regions = new Set(WORLD_METROS.map((c) => c.region));
    expect(regions.has('Asia')).toBe(true);
    expect(regions.has('Europe')).toBe(true);
    expect(regions.has('Americas')).toBe(true);
    expect(regions.has('Middle East & Africa')).toBe(true);
  });

  it('builds valid comma-separated multi-coordinate Open-Meteo batch URLs', () => {
    const url = buildBatchCoordinatesUrl(WORLD_METROS.slice(0, 3));
    expect(url).toContain('latitude=');
    expect(url).toContain('longitude=');
    expect(url).toContain('current=us_aqi,pm2_5');
  });

  it('parses batch Open-Meteo responses and assigns AQI rank and category', () => {
    const mockBatchResponse = [
      { latitude: 28.6, longitude: 77.2, current: { us_aqi: 280, pm2_5: 230 } },
      { latitude: 31.5, longitude: 74.3, current: { us_aqi: 320, pm2_5: 290 } },
      { latitude: 51.5, longitude: -0.1, current: { us_aqi: 35, pm2_5: 8 } },
    ];

    const parsed = parseBatchTelemetryResponse(WORLD_METROS.slice(0, 3), mockBatchResponse);
    expect(parsed.length).toBe(3);
    
    // First should be highest AQI after sorting
    const sorted = filterAndSortWorldCities(parsed, '', 'All', 'All', 'most_polluted');
    expect(sorted[0].usAqi).toBe(320);
    expect(sorted[sorted.length - 1].usAqi).toBe(35);
  });

  it('filters world cities by query, region, and severity', () => {
    const testCities: WorldCityItem[] = [
      { id: 1, name: 'Delhi-NCR', country: 'India', region: 'Asia', latitude: 28.6, longitude: 77.2, usAqi: 280, pm25: 230, category: 'VeryUnhealthy', rank: 1 },
      { id: 2, name: 'London', country: 'United Kingdom', region: 'Europe', latitude: 51.5, longitude: -0.1, usAqi: 35, pm25: 8, category: 'Good', rank: 2 },
      { id: 3, name: 'Tokyo', country: 'Japan', region: 'Asia', latitude: 35.6, longitude: 139.6, usAqi: 55, pm25: 14, category: 'Moderate', rank: 3 },
    ];

    // Filter by query
    const byQuery = filterAndSortWorldCities(testCities, 'london', 'All', 'All', 'most_polluted');
    expect(byQuery.length).toBe(1);
    expect(byQuery[0].name).toBe('London');

    // Filter by region
    const byRegion = filterAndSortWorldCities(testCities, '', 'Asia', 'All', 'most_polluted');
    expect(byRegion.length).toBe(2);

    // Filter by clean air
    const cleanAir = filterAndSortWorldCities(testCities, '', 'All', 'clean', 'most_polluted');
    expect(cleanAir.length).toBe(1);
    expect(cleanAir[0].name).toBe('London');

    // Sort by cleanest first
    const cleanestFirst = filterAndSortWorldCities(testCities, '', 'All', 'All', 'cleanest');
    expect(cleanestFirst[0].name).toBe('London');
  });

  describe('Zero-Fabrication Worldwide Data Integrity (Regression Tests 21-29)', () => {
    it('21 & 22. API failure in searchAndFetchGlobalCity never returns synthetic AQI 75 or PM2.5 22', async () => {
      // Mock global fetch failure
      const originalFetch = global.fetch;
      global.fetch = () => Promise.reject(new Error('Network error'));

      try {
        const results = await searchAndFetchGlobalCity('Berlin');
        // If cities geocoded or searched fail atmospheric fetch:
        for (const item of results) {
          expect(item.usAqi).toBeNull();
          expect(item.pm25).toBeNull();
          expect(item.usAqi).not.toBe(75);
          expect(item.pm25).not.toBe(22);
          expect(item.category).toBe('Unavailable');
        }
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('23 & 24. Missing AQI and PM2.5 in batch response remain null rather than defaulting to 0', () => {
      const emptyBatch = [
        { latitude: 28.6, longitude: 77.2, current: {} }, // missing both
      ];

      const parsed = parseBatchTelemetryResponse(WORLD_METROS.slice(0, 1), emptyBatch);
      expect(parsed[0].usAqi).toBeNull();
      expect(parsed[0].pm25).toBeNull();
      expect(parsed[0].category).toBe('Unavailable');
      expect(parsed[0].isLive).toBe(false);
    });

    it('25. Valid zero pollution values are preserved as authentic clean air and not discarded', () => {
      const cleanBatch = [
        { latitude: 35.6, longitude: 139.6, current: { us_aqi: 0, pm2_5: 0, time: '2026-11-22T08:00' } },
      ];

      const parsed = parseBatchTelemetryResponse(WORLD_METROS.slice(0, 1), cleanBatch);
      expect(parsed[0].usAqi).toBe(0);
      expect(parsed[0].pm25).toBe(0);
      expect(parsed[0].category).toBe('Good');
      expect(parsed[0].isLive).toBe(true);
    });

    it('26. Missing timestamps remain null rather than defaulting to current time', () => {
      const noTimeBatch = [
        { latitude: 28.6, longitude: 77.2, current: { us_aqi: 50, pm2_5: 12 } },
      ];

      const parsed = parseBatchTelemetryResponse(WORLD_METROS.slice(0, 1), noTimeBatch);
      expect(parsed[0].lastUpdated).toBeNull();
    });

    it('27. Cities without valid readings are excluded from numeric rankings and placed at end', () => {
      const mixedCities: WorldCityItem[] = [
        { id: 1, name: 'Delhi', country: 'India', region: 'Asia', latitude: 28.6, longitude: 77.2, usAqi: 250, pm25: 200, category: 'VeryUnhealthy' },
        { id: 2, name: 'London', country: 'UK', region: 'Europe', latitude: 51.5, longitude: -0.1, usAqi: null, pm25: null, category: 'Unavailable' },
        { id: 3, name: 'Tokyo', country: 'Japan', region: 'Asia', latitude: 35.6, longitude: 139.6, usAqi: 30, pm25: 7, category: 'Good' },
      ];

      const sortedCleanest = filterAndSortWorldCities(mixedCities, '', 'All', 'All', 'cleanest');
      // London with null AQI must NOT be treated as cleanest
      expect(sortedCleanest[0].name).toBe('Tokyo');
      expect(sortedCleanest[sortedCleanest.length - 1].name).toBe('London');
    });

    it('28. Search results retain correct geographic metadata and region', async () => {
      const results = parseBatchTelemetryResponse([WORLD_METROS[0]], [
        { latitude: 28.6139, longitude: 77.209, current: { us_aqi: 180, pm2_5: 110 } }
      ]);
      expect(results[0].country).toBe('India');
      expect(results[0].region).toBe('Asia');
    });
  });
});
