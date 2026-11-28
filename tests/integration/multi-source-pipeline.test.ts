import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchLiveAtmosphericMetrics } from '@/services/telemetry-service';
import { clearOpenAqCache } from '@/services/providers/openaq-provider';
import { telemetryCache } from '@/lib/cache';

describe('AVIR STEP 3 — Group F & G: Multi-Source Pipeline & Location Isolation (45-47, 49, 58-60)', () => {
  beforeEach(() => {
    process.env.OPENAQ_API_KEY = 'test_openaq_key';
    telemetryCache.clear();
    clearOpenAqCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    telemetryCache.clear();
    clearOpenAqCache();
    vi.restoreAllMocks();
  });

  it('45. An OpenAQ outage or timeout does not break Open-Meteo primary telemetry', async () => {
    const mockOpenMeteoAir = {
      current: {
        time: '2026-11-22T08:00',
        pm2_5: 145.0,
        pm10: 180.0,
        us_aqi: 198,
        nitrogen_dioxide: 45.0,
        sulphur_dioxide: 12.0,
        carbon_monoxide: 850.0,
        ozone: 35.0,
      },
      timezone: 'Asia/Kolkata',
    };

    const mockOpenMeteoWeather = {
      current: {
        temperature_2m: 24.5,
        relative_humidity_2m: 55,
        wind_speed_10m: 6.5,
        wind_direction_10m: 290,
      },
      hourly: {
        time: ['2026-11-22T08:00', '2026-11-22T09:00', '2026-11-22T10:00'],
        boundary_layer_height: [450, 500, 600],
      },
    };

    vi.spyOn(global, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.includes('air-quality-api.open-meteo.com')) {
        return { ok: true, status: 200, json: async () => mockOpenMeteoAir } as Response;
      }
      if (urlStr.includes('api.open-meteo.com')) {
        return { ok: true, status: 200, json: async () => mockOpenMeteoWeather } as Response;
      }
      if (urlStr.includes('openaq.org') || urlStr.includes('/api/telemetry/sources')) {
        // Upstream OpenAQ service times out or throws error
        throw new Error('OpenAQ upstream network timeout');
      }
      if (urlStr.includes('sensor.community')) {
        return { ok: true, status: 200, json: async () => [] } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });

    const metrics = await fetchLiveAtmosphericMetrics(28.6139, 77.2090, {
      cityName: 'Delhi-NCR',
      forceRefresh: true,
    });

    // Primary telemetry succeeds completely
    expect(metrics.status).toBe('success');
    expect(metrics.pm25).toBe(145.0);
    expect(metrics.usAqi).toBe(198);
    // Multi-source fallback handles OpenAQ outage cleanly with Mode A single source
    expect(metrics.environmentalSources).toBeDefined();
    expect(metrics.environmentalSources!.length).toBeGreaterThanOrEqual(1);
    expect(metrics.sourceComparison?.mode).toBe('mode_a_single_source');
  });

  it('46. Sensor.Community failure does not remove valid OpenAQ observations', async () => {
    const mockOpenMeteoAir = {
      current: { time: '2026-11-22T08:00', pm2_5: 110.0, pm10: 130.0, us_aqi: 178 },
      timezone: 'Asia/Kolkata',
    };

    const mockOpenAqLocations = {
      results: [
        {
          id: 9101,
          name: 'US Embassy Chanakyapuri',
          provider: { name: 'AirNow' },
          coordinates: { latitude: 28.59, longitude: 77.19 },
          datetimeLast: { utc: '2026-11-22T08:00:00Z', local: '2026-11-22T13:30:00+05:30' },
        },
      ],
    };

    const mockOpenAqLatest = {
      results: [
        {
          sensorId: 1,
          parameter: { name: 'pm25', units: 'ug/m3' },
          value: 125.0,
          datetime: '2026-11-22T08:00:00Z',
        },
      ],
    };

    vi.spyOn(global, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.includes('air-quality-api.open-meteo.com')) {
        return { ok: true, status: 200, json: async () => mockOpenMeteoAir } as Response;
      }
      if (urlStr.includes('api.open-meteo.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            current: { temperature_2m: 25, relative_humidity_2m: 50, wind_speed_10m: 5, wind_direction_10m: 180 },
            hourly: { time: ['2026-11-22T08:00'], boundary_layer_height: [500] },
          }),
        } as Response;
      }
      if (urlStr.includes('sensor.community')) {
        // Sensor.Community fails with 500
        return { ok: false, status: 500 } as Response;
      }
      if (urlStr.includes('/latest')) {
        return { ok: true, status: 200, json: async () => mockOpenAqLatest } as Response;
      }
      if (urlStr.includes('openaq.org')) {
        return { ok: true, status: 200, json: async () => mockOpenAqLocations } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });

    const metrics = await fetchLiveAtmosphericMetrics(28.6139, 77.2090, {
      cityName: 'Delhi-NCR',
      forceRefresh: true,
    });

    expect(metrics.status).toBe('success');
    // OpenAQ station is successfully retained despite Sensor.Community outage
    const openAqSource = metrics.environmentalSources?.find(s => s.id === 'openaq-9101');
    expect(openAqSource).toBeDefined();
    expect(openAqSource?.measurements[0].value).toBe(125.0);
  });

  it('47 & 60. Switching between two locations never mixes or bleeds their source records', async () => {
    // Delhi Response
    const delhiAir = {
      current: { time: '2026-11-22T08:00', pm2_5: 240.0, us_aqi: 290 },
      timezone: 'Asia/Kolkata',
    };

    // Mumbai Response
    const mumbaiAir = {
      current: { time: '2026-11-22T08:00', pm2_5: 65.0, us_aqi: 155 },
      timezone: 'Asia/Kolkata',
    };

    vi.spyOn(global, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.includes('air-quality-api.open-meteo.com')) {
        if (urlStr.includes('latitude=28.6139')) {
          return { ok: true, status: 200, json: async () => delhiAir } as Response;
        } else if (urlStr.includes('latitude=19.076')) {
          return { ok: true, status: 200, json: async () => mumbaiAir } as Response;
        }
      }
      if (urlStr.includes('api.open-meteo.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            current: { temperature_2m: 25, relative_humidity_2m: 50, wind_speed_10m: 5, wind_direction_10m: 180 },
            hourly: { time: ['2026-11-22T08:00'], boundary_layer_height: [500] },
          }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ results: [] }) } as Response;
    });

    // Fetch Delhi
    const delhiMetrics = await fetchLiveAtmosphericMetrics(28.6139, 77.2090, { cityName: 'Delhi-NCR', forceRefresh: true });
    // Fetch Mumbai
    const mumbaiMetrics = await fetchLiveAtmosphericMetrics(19.0760, 72.8777, { cityName: 'Mumbai', forceRefresh: true });

    // Assert complete coordinate & data isolation
    expect(delhiMetrics.cityName).toBe('Delhi-NCR');
    expect(delhiMetrics.pm25).toBe(240.0);
    expect(delhiMetrics.location?.latitude).toBe(28.6139);

    expect(mumbaiMetrics.cityName).toBe('Mumbai');
    expect(mumbaiMetrics.pm25).toBe(65.0);
    expect(mumbaiMetrics.location?.latitude).toBe(19.0760);

    // Delhi records do not bleed into Mumbai
    const mumbaiModel = mumbaiMetrics.environmentalSources?.find(s => s.sourceKind === 'atmospheric_model');
    expect(mumbaiModel?.latitude).toBe(19.0760);
    expect(mumbaiModel?.measurements[0].value).toBe(65.0);
  });

  it('59. A location without nearby ground monitors remains fully usable (Mode A)', async () => {
    const remoteAir = {
      current: { time: '2026-11-22T08:00', pm2_5: 15.0, pm10: 25.0, us_aqi: 50 },
      timezone: 'UTC',
    };

    vi.spyOn(global, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.includes('air-quality-api.open-meteo.com')) {
        return { ok: true, status: 200, json: async () => remoteAir } as Response;
      }
      if (urlStr.includes('api.open-meteo.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            current: { temperature_2m: 20, relative_humidity_2m: 60, wind_speed_10m: 10, wind_direction_10m: 90 },
            hourly: { time: ['2026-11-22T08:00'], boundary_layer_height: [600] },
          }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ results: [] }) } as Response;
    });

    // Remote oceanic coordinate without ground stations
    const metrics = await fetchLiveAtmosphericMetrics(0.0, 0.0, { forceRefresh: true });

    expect(metrics.status).toBe('success');
    expect(metrics.pm25).toBe(15.0);
    expect(metrics.usAqi).toBe(50);
    expect(metrics.sourceComparison?.mode).toBe('mode_a_single_source');
    expect(metrics.sourceComparison?.summary).toContain('1 primary environmental dataset available');
  });
});
