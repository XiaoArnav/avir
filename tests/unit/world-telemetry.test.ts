import { describe, it, expect } from 'vitest';
import { 
  WORLD_METROS, 
  buildBatchCoordinatesUrl, 
  parseBatchTelemetryResponse,
  filterAndSortWorldCities,
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
});
