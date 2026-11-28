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
      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
        const urlStr = String(url);
        if (urlStr.includes('air-quality')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              current: { time: new Date().toISOString(), pm2_5: 145.2, pm10: 210.5, us_aqi: 215 },
              current_units: { time: 'iso8601', pm2_5: 'μg/m³', pm10: 'μg/m³', us_aqi: 'AQI' },
            }),
          } as unknown as Response;
        }
        if (urlStr.includes('forecast')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              hourly: { time: [new Date().toISOString()], boundary_layer_height: [320.0] },
              hourly_units: { time: 'iso8601', boundary_layer_height: 'm' },
            }),
          } as unknown as Response;
        }
        return { ok: true, status: 200, json: async () => ({ sources: [] }) } as unknown as Response;
      });

      const metrics = await fetchLiveAtmosphericMetrics(28.61, 77.21);

      expect(metrics).toBeDefined();
      expect(metrics.usAqi).toBeGreaterThan(0);
      expect(metrics.pm25).toBeGreaterThan(0);
      expect(metrics.boundaryLayerHeight).toBeGreaterThan(0);
      expect(typeof metrics.isThermalInversionActive).toBe('boolean');
      expect(typeof metrics.isThermalInversionActive).toBe('boolean');

      fetchSpy.mockRestore();
    }, 60000);

    it('caches telemetry by coordinate key for 10 minutes', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
        const urlStr = String(url);
        if (urlStr.includes('air-quality')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              current: { time: new Date().toISOString(), pm2_5: 80.0, pm10: 120.0, us_aqi: 140 },
              current_units: { time: 'iso8601', pm2_5: 'μg/m³', pm10: 'μg/m³', us_aqi: 'AQI' },
            }),
          } as unknown as Response;
        }
        if (urlStr.includes('forecast')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              hourly: { time: [new Date().toISOString()], boundary_layer_height: [400.0] },
              hourly_units: { time: 'iso8601', boundary_layer_height: 'm' },
            }),
          } as unknown as Response;
        }
        return { ok: true, status: 200, json: async () => ({ sources: [] }) } as unknown as Response;
      });

      await fetchLiveAtmosphericMetrics(19.07, 72.87); // Mumbai
      const count = fetchSpy.mock.calls.length;

      // Second identical call
      await fetchLiveAtmosphericMetrics(19.07, 72.87);
      expect(fetchSpy.mock.calls.length).toBe(count);
      fetchSpy.mockRestore();
    }, 60000);

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

  describe('Step 1 Telemetry Contract Integrity — 16 Mandated Scenarios', () => {
    function mockFetch(
      aqData: Record<string, unknown>,
      weatherData: Record<string, unknown> = {},
      aqOk = true,
      weatherOk = true,
      aqStatus = 200
    ) {
      return vi.spyOn(global, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
        const urlStr = String(url);
        if (urlStr.includes('air-quality')) {
          if (!aqOk) {
            return {
              ok: false,
              status: aqStatus,
              statusText: aqStatus === 429 ? 'Too Many Requests' : 'Internal Server Error',
              json: async () => aqData,
            } as unknown as Response;
          }
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => aqData,
          } as unknown as Response;
        }
        if (urlStr.includes('forecast')) {
          if (!weatherOk) {
            return {
              ok: false,
              status: 500,
              statusText: 'Internal Server Error',
              json: async () => weatherData,
            } as unknown as Response;
          }
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => weatherData,
          } as unknown as Response;
        }
        return {
          ok: false,
          status: 404,
          statusText: 'Not Found',
          json: async () => ({}),
        } as unknown as Response;
      });
    }

    it('1. Complete valid provider response produces success status and typed field metadata', async () => {
      const spy = mockFetch(
        {
          current: {
            time: '2026-11-22T08:00',
            pm2_5: 45.2,
            pm10: 82.1,
            us_aqi: 125,
            carbon_monoxide: 450,
            nitrogen_dioxide: 28,
            sulphur_dioxide: 12,
            ozone: 35,
          },
          timezone: 'Asia/Kolkata',
        },
        {
          current: {
            time: '2026-11-22T08:00',
            temperature_2m: 22.4,
            relative_humidity_2m: 55,
            wind_speed_10m: 12.3,
            wind_direction_10m: 290,
          },
          hourly: {
            time: ['2026-11-22T08:00'],
            boundary_layer_height: [600],
          },
          timezone: 'Asia/Kolkata',
        }
      );

      const metrics = await fetchLiveAtmosphericMetrics(28.61, 77.21, { forceRefresh: true });

      expect(metrics.status).toBe('success');
      expect(metrics.pm25).toBe(45.2);
      expect(metrics.pm10).toBe(82.1);
      expect(metrics.usAqi).toBe(125);
      expect(metrics.temperature).toBe(22.4);
      expect(metrics.boundaryLayerHeight).toBe(600);
      expect(metrics.fields?.pm25.status).toBe('valid');
      expect(metrics.fields?.pm10.status).toBe('valid');
      expect(metrics.fields?.usAqi.status).toBe('valid');
      expect(metrics.fields?.boundaryLayerHeight.status).toBe('valid');
      expect(metrics.fields?.temperature?.status).toBe('valid');
      expect(metrics.freshness).toBe('fresh');
      spy.mockRestore();
    });

    it('2. Missing PM2.5 is preserved as null and unavailable status, never fabricated', async () => {
      const spy = mockFetch(
        {
          current: {
            time: '2026-11-22T08:00',
            pm10: 82.1,
            us_aqi: 125,
          },
          timezone: 'Asia/Kolkata',
        },
        {
          current: { temperature_2m: 22 },
          hourly: { boundary_layer_height: [500] },
        }
      );

      const metrics = await fetchLiveAtmosphericMetrics(28.61, 77.21, { forceRefresh: true });

      expect(metrics.pm25).toBeNull();
      expect(metrics.fields?.pm25.status).toBe('unavailable');
      expect(metrics.fields?.pm25.value).toBeNull();
      spy.mockRestore();
    });

    it('3. Missing PM10 is preserved as null and never multiplied from PM2.5', async () => {
      const spy = mockFetch(
        {
          current: {
            time: '2026-11-22T08:00',
            pm2_5: 50.0,
            us_aqi: 137,
          },
          timezone: 'Asia/Kolkata',
        },
        {
          current: { temperature_2m: 22 },
          hourly: { boundary_layer_height: [500] },
        }
      );

      const metrics = await fetchLiveAtmosphericMetrics(28.61, 77.21, { forceRefresh: true });

      expect(metrics.pm10).toBeNull();
      expect(metrics.fields?.pm10.status).toBe('unavailable');
      expect(metrics.fields?.pm10.value).toBeNull();
      expect(metrics.pm10).not.toBe(70); // Never 50 * 1.4!
      spy.mockRestore();
    });

    it('4. Missing US AQI is derived cleanly from PM2.5 and classified as derived_calculation', async () => {
      const spy = mockFetch(
        {
          current: {
            time: '2026-11-22T08:00',
            pm2_5: 35.4, // EPA breakpoint: 35.4 ug/m3 corresponds to 100 AQI
          },
          timezone: 'Asia/Kolkata',
        },
        {
          current: { temperature_2m: 22 },
          hourly: { boundary_layer_height: [500] },
        }
      );

      const metrics = await fetchLiveAtmosphericMetrics(28.61, 77.21, { forceRefresh: true });

      expect(metrics.usAqi).toBe(100);
      expect(metrics.fields?.usAqi.classification).toBe('derived_calculation');
      expect(metrics.fields?.usAqi.provider).toBe('Avir Derived (EPA Breakpoints)');
      expect(metrics.fields?.usAqi.status).toBe('valid');
      spy.mockRestore();
    });

    it('5. Valid zero concentration (0 ug/m3 clean air) is treated as valid, never missing', async () => {
      const spy = mockFetch(
        {
          current: {
            time: '2026-11-22T08:00',
            pm2_5: 0,
            pm10: 0,
            us_aqi: 0,
          },
          timezone: 'Asia/Kolkata',
        },
        {
          current: { temperature_2m: 20 },
          hourly: { boundary_layer_height: [600] },
        }
      );

      const metrics = await fetchLiveAtmosphericMetrics(28.61, 77.21, { forceRefresh: true });

      expect(metrics.pm25).toBe(0);
      expect(metrics.pm10).toBe(0);
      expect(metrics.usAqi).toBe(0);
      expect(metrics.fields?.pm25.status).toBe('valid');
      expect(metrics.fields?.pm25.value).toBe(0);
      spy.mockRestore();
    });

    it('6. Invalid negative concentration is rejected and retains null value', async () => {
      const spy = mockFetch(
        {
          current: {
            time: '2026-11-22T08:00',
            pm2_5: -15,
            pm10: -25,
          },
          timezone: 'Asia/Kolkata',
        },
        {
          current: { temperature_2m: 20 },
        }
      );

      const metrics = await fetchLiveAtmosphericMetrics(28.61, 77.21, { forceRefresh: true });

      expect(metrics.pm25).toBeNull();
      expect(metrics.pm10).toBeNull();
      expect(metrics.fields?.pm25.status).toBe('rejected');
      expect(metrics.fields?.pm25.rejectionReason).toContain('negative');
      expect(metrics.fields?.pm10.status).toBe('rejected');
      spy.mockRestore();
    });

    it('7. NaN and Infinity pollutant values are safely rejected', async () => {
      const spy = mockFetch(
        {
          current: {
            time: '2026-11-22T08:00',
            pm2_5: NaN,
            pm10: Infinity,
          },
          timezone: 'Asia/Kolkata',
        },
        {
          current: { temperature_2m: 20 },
        }
      );

      const metrics = await fetchLiveAtmosphericMetrics(28.61, 77.21, { forceRefresh: true });

      expect(metrics.pm25).toBeNull();
      expect(metrics.pm10).toBeNull();
      expect(metrics.fields?.pm25.status).toBe('rejected');
      expect(metrics.fields?.pm10.status).toBe('rejected');
      spy.mockRestore();
    });

    it('8. Malformed JSON or API error payload produces validation error type', async () => {
      const spy = mockFetch(
        { error: true, reason: 'Invalid parameters requested from provider' },
        {},
        true // returns 200 but error body
      );

      const metrics = await fetchLiveAtmosphericMetrics(28.61, 77.21, { forceRefresh: true });

      expect(metrics.status).toBe('error');
      expect(metrics.errorType).toBe('validation');
      expect(metrics.errorMessage).toContain('Malformed or invalid');
      spy.mockRestore();
    });

    it('9. Provider timeout produces timeout error type', async () => {
      const timeoutError = new Error('Gateway Timeout');
      timeoutError.name = 'TimeoutError';
      const spy = vi.spyOn(global, 'fetch').mockRejectedValue(timeoutError);

      const metrics = await fetchLiveAtmosphericMetrics(28.61, 77.21, { forceRefresh: true });

      expect(metrics.status).toBe('error');
      expect(metrics.errorType).toBe('timeout');
      expect(metrics.errorMessage).toContain('timed out');
      spy.mockRestore();
    });

    it('10. HTTP 429 Rate Limit produces rate_limit error type without infinite retries', async () => {
      const spy = mockFetch(
        { error: 'Rate limit exceeded' },
        {},
        false, // not ok
        false,
        429 // status 429
      );

      const metrics = await fetchLiveAtmosphericMetrics(28.61, 77.21, { forceRefresh: true });

      expect(metrics.status).toBe('error');
      expect(metrics.errorType).toBe('rate_limit');
      expect(metrics.errorMessage).toContain('rate limit');
      spy.mockRestore();
    });

    it('11. Failed optional weather request results in partial response', async () => {
      const spy = mockFetch(
        {
          current: {
            time: '2026-11-22T08:00',
            pm2_5: 45.0,
            pm10: 80.0,
            us_aqi: 124,
          },
          timezone: 'Asia/Kolkata',
        },
        {},
        true, // AQ succeeds
        false // Weather fails (500)
      );

      const metrics = await fetchLiveAtmosphericMetrics(28.61, 77.21, { forceRefresh: true });

      expect(metrics.status).toBe('partial');
      expect(metrics.pm25).toBe(45.0);
      expect(metrics.temperature).toBeNull();
      expect(metrics.boundaryLayerHeight).toBeNull();
      expect(metrics.availability?.weather).toBe(false);
      expect(metrics.availability?.blh).toBe(false);
      spy.mockRestore();
    });

    it('12. Valid cached result retains fresh status and marks isCached: true', async () => {
      const spy = mockFetch({
        current: {
          time: '2026-11-22T08:00',
          pm2_5: 35.0,
          us_aqi: 99,
        },
        timezone: 'Asia/Kolkata',
      });

      // Populate cache
      await fetchLiveAtmosphericMetrics(19.07, 72.87, { forceRefresh: true });

      // Second fetch should read from cache
      const cachedMetrics = await fetchLiveAtmosphericMetrics(19.07, 72.87);

      expect(cachedMetrics.freshness).toBe('fresh');
      expect(cachedMetrics.cacheMetadata?.isCached).toBe(true);
      expect(cachedMetrics.cacheMetadata?.isStale).toBe(false);
      spy.mockRestore();
    });

    it('13. Expired cached result falls back to status stale upon network failure', async () => {
      const originalTimestamp = '2026-11-21T06:00:00Z';
      telemetryCache.set('telemetry:22.57,88.36', {
        status: 'success',
        provenance: 'modeled_forecast',
        timestamp: originalTimestamp,
        retrievedAt: originalTimestamp,
        timezone: 'Asia/Kolkata',
        usAqi: 155,
        pm25: 65.0,
        pm10: 110.0,
        boundaryLayerHeight: 300,
        isThermalInversionActive: false,
        isLive: true,
      }, -1000); // Expired immediately

      const spy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network failure'));
      const staleMetrics = await fetchLiveAtmosphericMetrics(22.57, 88.36); // Kolkata

      expect(staleMetrics.status).toBe('stale');
      expect(staleMetrics.isStale).toBe(true);
      expect(staleMetrics.freshness).toBe('stale');
      expect(staleMetrics.cacheMetadata?.isStale).toBe(true);
      spy.mockRestore();
    });

    it('14. Stale fallback preserves original measurement timestamp rather than current time', async () => {
      const originalTimestamp = '2026-11-20T04:30:00Z';
      telemetryCache.set('telemetry:26.45,80.33', {
        status: 'success',
        provenance: 'modeled_forecast',
        timestamp: originalTimestamp,
        retrievedAt: originalTimestamp,
        timezone: 'Asia/Kolkata',
        usAqi: 210,
        pm25: 160.0,
        pm10: 240.0,
        boundaryLayerHeight: 150,
        isThermalInversionActive: true,
        isLive: true,
      }, -1000);

      const spy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Connection dropped'));
      const staleMetrics = await fetchLiveAtmosphericMetrics(26.45, 80.33); // Kanpur

      expect(staleMetrics.timestamp).toBe(originalTimestamp);
      expect(staleMetrics.cacheMetadata?.originalTimestamp).toBe(originalTimestamp);
      spy.mockRestore();
    });

    it('15. Correct location metadata is populated including coordinates, cityName, and timezone', async () => {
      const spy = mockFetch({
        current: { time: '2026-11-22T08:00', pm2_5: 40, us_aqi: 112 },
        timezone: 'Asia/Kolkata',
      });

      const metrics = await fetchLiveAtmosphericMetrics(28.61, 77.21, {
        forceRefresh: true,
        cityName: 'Delhi-NCR',
      });

      expect(metrics.location?.latitude).toBe(28.61);
      expect(metrics.location?.longitude).toBe(77.21);
      expect(metrics.location?.cityName).toBe('Delhi-NCR');
      expect(metrics.location?.timezone).toBe('Asia/Kolkata');
      spy.mockRestore();
    });

    it('16. Zero-fabrication guarantee: missing PM10 is never fabricated or copied from PM2.5', async () => {
      const spy = mockFetch({
        current: {
          time: '2026-11-22T08:00',
          pm2_5: 85.0,
          // pm10 completely omitted
        },
        timezone: 'Asia/Kolkata',
      });

      const metrics = await fetchLiveAtmosphericMetrics(28.61, 77.21, { forceRefresh: true });

      expect(metrics.pm10).toBeNull();
      expect(metrics.fields?.pm10.status).toBe('unavailable');
      expect(metrics.fields?.pm10.value).toBeNull();
      expect(metrics.pm10).not.toBe(85.0);
      expect(metrics.pm10).not.toBe(85.0 * 1.4);
      spy.mockRestore();
    });

    it('Runtime coordinate validation rejects out-of-bounds latitude and longitude', async () => {
      const invalidLatMetrics = await fetchLiveAtmosphericMetrics(95.0, 77.2);
      expect(invalidLatMetrics.status).toBe('error');
      expect(invalidLatMetrics.errorType).toBe('validation');
      expect(invalidLatMetrics.errorMessage).toContain('Invalid coordinates');

      const invalidLonMetrics = await fetchLiveAtmosphericMetrics(28.6, 200.0);
      expect(invalidLonMetrics.status).toBe('error');
      expect(invalidLonMetrics.errorType).toBe('validation');
    });
  });
});
