import { describe, it, expect, vi, beforeEach } from 'vitest';
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

    it('returns typed error state without fabricated numbers when network fails and no cache exists', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network Connection Refused'));
      
      const metrics = await fetchLiveAtmosphericMetrics(12.97, 77.59, { forceRefresh: true }); // Bengaluru
      
      expect(metrics.status).toBe('error');
      expect(metrics.provenance).toBe('unavailable');
      expect(metrics.isLive).toBe(false);
      expect(metrics.usAqi).toBeNull();
      expect(metrics.pm25).toBeNull();
      expect(metrics.boundaryLayerHeight).toBeNull();
      expect(metrics.availability?.aqi).toBe(false);
      expect(metrics.availability?.pm25).toBe(false);
      expect(metrics.errorMessage).toContain('unavailable');
      fetchSpy.mockRestore();
    });

    it('returns stale cached reading preserving original timestamp when network fails but expired cache exists', async () => {
      // Seed cache with a known historical reading
      const originalTimestamp = '2026-11-20T10:00:00Z';
      telemetryCache.set('telemetry:26.85,80.95', {
        status: 'success',
        provenance: 'modeled_forecast',
        timestamp: originalTimestamp,
        retrievedAt: originalTimestamp,
        timezone: 'Asia/Kolkata',
        usAqi: 245,
        pm25: 195.0,
        pm10: 260.0,
        boundaryLayerHeight: 180,
        isThermalInversionActive: true,
        isLive: true,
        sourceAttribution: 'Open-Meteo High-Resolution Ensemble (ECMWF & NOAA GFS)',
      }, -1000); // Expired immediately

      const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Timeout'));
      const staleMetrics = await fetchLiveAtmosphericMetrics(26.85, 80.95); // Lucknow

      expect(staleMetrics.status).toBe('stale');
      expect(staleMetrics.isStale).toBe(true);
      expect(staleMetrics.isLive).toBe(false);
      expect(staleMetrics.usAqi).toBe(245);
      expect(staleMetrics.timestamp).toBe(originalTimestamp);
      expect(staleMetrics.errorMessage).toContain('Network error');
      fetchSpy.mockRestore();
    });

    it('respects AbortSignal during rapid city switching without hanging', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        fetchLiveAtmosphericMetrics(25.59, 85.14, { signal: controller.signal }) // Patna
      ).rejects.toThrow();
    });
  });
});
