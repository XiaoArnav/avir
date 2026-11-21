import { describe, it, expect, vi } from 'vitest';
import {
  fetchLiveAtmosphericMetrics,
  searchCities,
  PREDEFINED_INDIAN_CITIES,
} from '@/services/telemetry-service';
import { telemetryCache } from '@/lib/cache';

describe('Telemetry & Geocoding Service', () => {
  beforeEach(() => {
    telemetryCache.clear();
  });

  describe('Predefined Indian Cities Registry', () => {
    it('contains major winter smog hotspots including Delhi-NCR, Kanpur, and Patna', () => {
      const cityNames = PREDEFINED_INDIAN_CITIES.map(c => c.name);
      expect(cityNames).toContain('Delhi-NCR');
      expect(cityNames).toContain('Kanpur');
      expect(cityNames).toContain('Patna');
      expect(PREDEFINED_INDIAN_CITIES.length).toBeGreaterThanOrEqual(6);
    });
  });

  describe('City Geocoding Search', () => {
    it('returns geocoded coordinates when searching for a known city', async () => {
      const results = await searchCities('Delhi');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].latitude).toBeCloseTo(28.6, 0);
      expect(results[0].longitude).toBeCloseTo(77.2, 0);
    });

    it('returns empty array when query is too short or empty', async () => {
      const results = await searchCities('');
      expect(results).toEqual([]);
    });

    it('retrieves subsequent identical queries from in-memory cache', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch');
      await searchCities('Mumbai');
      const callCountAfterFirst = fetchSpy.mock.calls.length;

      await searchCities('Mumbai');
      // Second call should hit cache, not triggering new fetch
      expect(fetchSpy.mock.calls.length).toBe(callCountAfterFirst);
      fetchSpy.mockRestore();
    });
  });

  describe('Live Atmospheric Telemetry Stream', () => {
    it('fetches and parses live telemetry metrics for Delhi coordinates', async () => {
      const metrics = await fetchLiveAtmosphericMetrics(28.61, 77.21);

      expect(metrics).toBeDefined();
      expect(metrics.usAqi).toBeGreaterThan(0);
      expect(metrics.pm25).toBeGreaterThan(0);
      expect(metrics.boundaryLayerHeight).toBeGreaterThan(0);
      expect(typeof metrics.isThermalInversionActive).toBe('boolean');
    });

    it('caches telemetry by coordinate key for 10 minutes', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch');
      await fetchLiveAtmosphericMetrics(19.07, 72.87); // Mumbai
      const count = fetchSpy.mock.calls.length;

      // Second identical call
      await fetchLiveAtmosphericMetrics(19.07, 72.87);
      expect(fetchSpy.mock.calls.length).toBe(count);
      fetchSpy.mockRestore();
    });
  });
});
