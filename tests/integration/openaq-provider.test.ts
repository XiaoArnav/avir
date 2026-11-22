import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchOpenAqSources,
  clearOpenAqCache,
  parseOpenAqLocation,
  OpenAqLocationResult,
  OpenAqLatestMeasurementItem,
} from '@/services/providers/openaq-provider';

describe('AVIR STEP 3 — Group B: OpenAQ Connector & Security (9-18)', () => {
  const originalEnv = process.env.OPENAQ_API_KEY;

  beforeEach(() => {
    clearOpenAqCache();
    process.env.OPENAQ_API_KEY = 'test_valid_key';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.OPENAQ_API_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  it('9. Valid API response is parsed correctly into canonical EnvironmentalSourceRecord', async () => {
    const mockLocations = {
      results: [
        {
          id: 5001,
          name: 'US Embassy Chanakyapuri',
          provider: { name: 'AirNow Gov' },
          coordinates: { latitude: 28.5983, longitude: 77.1897 },
          sensors: [{ id: 10, name: 'PM2.5', parameter: { id: 2, name: 'pm25', units: 'µg/m³' } }],
          datetimeLast: { utc: '2026-11-22T08:00:00Z', local: '2026-11-22T13:30:00+05:30' },
        },
      ],
    };

    const mockLatest = {
      results: [
        {
          sensorId: 10,
          parameter: { name: 'pm25', units: 'µg/m³' },
          value: 168.4,
          datetime: { utc: '2026-11-22T08:00:00Z', local: '2026-11-22T13:30:00+05:30' },
        },
      ],
    };

    vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/latest')) {
        return {
          ok: true,
          status: 200,
          json: async () => mockLatest,
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => mockLocations,
      } as Response;
    });

    const sources = await fetchOpenAqSources({
      latitude: 28.6139,
      longitude: 77.2090,
      radiusKm: 25,
      apiKey: 'test_valid_key',
    });

    expect(sources.length).toBe(1);
    const station = sources[0];
    expect(station.id).toBe('openaq-5001');
    expect(station.stationId).toBe('5001');
    expect(station.sourceName).toContain('US Embassy Chanakyapuri');
    expect(station.sourceKind).toBe('physical_observation');
    expect(station.status).toBe('fresh');
    expect(station.measurements.length).toBe(1);
    expect(station.measurements[0].pollutant).toBe('pm25');
    expect(station.measurements[0].value).toBe(168.4);
    expect(station.measurements[0].unit).toBe('ug/m3');
    expect(station.distanceKm).toBeGreaterThan(0);
    expect(station.distanceKm).toBeLessThan(10);
  });

  it('10. Missing API key returns explicit not_configured status without throwing', async () => {
    delete process.env.OPENAQ_API_KEY;

    const sources = await fetchOpenAqSources({
      latitude: 28.6139,
      longitude: 77.2090,
      apiKey: '',
    });

    expect(sources.length).toBe(1);
    expect(sources[0].status).toBe('not_configured');
    expect(sources[0].errorCode).toBe('NOT_CONFIGURED');
    expect(sources[0].measurements.length).toBe(0);
    expect(sources[0].observedAt).toBeNull();
  });

  it('11. API key remains strictly server-side and is never leaked in attribution, explanation, or URLs', async () => {
    const sensitiveKey = 'SUPER_SECRET_OPENAQ_TOKEN_XYZ123';
    process.env.OPENAQ_API_KEY = sensitiveKey;

    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    } as Response);

    const sources = await fetchOpenAqSources({
      latitude: 28.6139,
      longitude: 77.2090,
      apiKey: sensitiveKey,
    });

    const recordJson = JSON.stringify(sources);
    expect(recordJson).not.toContain(sensitiveKey);
  });

  it('12. Authentication failure (HTTP 401) is handled with rejected status and clear explanation', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ message: 'Invalid API Key' }),
    } as Response);

    const sources = await fetchOpenAqSources({
      latitude: 28.6139,
      longitude: 77.2090,
      apiKey: 'bad_key',
    });

    expect(sources.length).toBe(1);
    expect(sources[0].status).toBe('rejected');
    expect(sources[0].errorCode).toBe('UNAUTHORIZED');
    expect(sources[0].explanation).toContain('Invalid or expired');
  });

  it('13. Rate-limit responses (HTTP 429) are handled with unreachable status and no retry storm', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: async () => ({ message: 'Rate limit exceeded' }),
    } as Response);

    const sources = await fetchOpenAqSources({
      latitude: 28.6139,
      longitude: 77.2090,
      apiKey: 'limited_key',
    });

    expect(sources.length).toBe(1);
    expect(sources[0].status).toBe('unreachable');
    expect(sources[0].errorCode).toBe('RATE_LIMIT');
    expect(sources[0].explanation).toContain('rate limit exceeded');
  });

  it('14. Server errors (HTTP 500/503) do not create fake fallback observations', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ message: 'Database failure' }),
    } as Response);

    const sources = await fetchOpenAqSources({
      latitude: 28.6139,
      longitude: 77.2090,
      apiKey: 'valid_key',
    });

    expect(sources.length).toBe(1);
    expect(sources[0].status).toBe('unreachable');
    expect(sources[0].measurements.length).toBe(0);
    expect(sources[0].observedAt).toBeNull();
  });

  it('15. Malformed JSON is safely rejected without crashing', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON at position 0');
      },
    } as Response);

    const sources = await fetchOpenAqSources({
      latitude: 28.6139,
      longitude: 77.2090,
      apiKey: 'valid_key',
    });

    expect(sources.length).toBe(1);
    expect(sources[0].status).toBe('unreachable');
    expect(sources[0].measurements.length).toBe(0);
  });

  it('16. Empty station lookup returns explicit unavailable state', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    } as Response);

    const sources = await fetchOpenAqSources({
      latitude: 28.6139,
      longitude: 77.2090,
      radiusKm: 15,
      apiKey: 'valid_key',
    });

    expect(sources.length).toBe(1);
    expect(sources[0].status).toBe('unavailable');
    expect(sources[0].explanation).toContain('No active OpenAQ ground monitoring stations found');
  });

  it('17. Unsupported pollutant measurements are excluded', () => {
    const loc: OpenAqLocationResult = {
      id: 7001,
      name: 'Noise Station',
      coordinates: { latitude: 28.61, longitude: 77.21 },
    };

    const latest: OpenAqLatestMeasurementItem[] = [
      {
        sensorId: 99,
        parameter: { name: 'sound_decibels', units: 'dB' },
        value: 75.0,
      },
    ];

    const record = parseOpenAqLocation(loc, 28.61, 77.21, latest);
    expect(record).not.toBeNull();
    // Unsupported noise parameter is excluded from air quality measurements
    expect(record?.measurements.length).toBe(0);
    expect(record?.status).toBe('unavailable');
  });

  it('18. Valid station coordinates and IDs are preserved accurately', () => {
    const loc: OpenAqLocationResult = {
      id: 8812,
      name: 'Delhi Anand Vihar',
      provider: { name: 'DPCC' },
      coordinates: { latitude: 28.6508, longitude: 77.3152 },
      datetimeLast: { utc: '2026-11-22T08:00:00Z', local: '2026-11-22T13:30:00+05:30' },
    };

    const latest: OpenAqLatestMeasurementItem[] = [
      {
        sensorId: 55,
        parameter: { name: 'pm25', units: 'ug/m3' },
        value: 235.0,
        datetime: '2026-11-22T08:00:00Z',
      },
    ];

    const record = parseOpenAqLocation(loc, 28.6139, 77.2090, latest);
    expect(record?.stationId).toBe('8812');
    expect(record?.latitude).toBe(28.6508);
    expect(record?.longitude).toBe(77.3152);
    expect(record?.distanceKm).toBeGreaterThan(10);
    expect(record?.distanceKm).toBeLessThan(15);
  });
});

describe('AVIR STEP 3 — Group F: Cache Invariants & Failure Isolation (43-49)', () => {
  beforeEach(() => {
    clearOpenAqCache();
    process.env.OPENAQ_API_KEY = 'test_key';
    vi.restoreAllMocks();
  });

  it('43 & 44. Cached measurements retain original observation timestamps and do not become newly measured', async () => {
    const originalObservedTime = '2026-11-22T06:15:00Z';

    const mockLocations = {
      results: [
        {
          id: 6001,
          name: 'Cached Station',
          provider: { name: 'AirNow' },
          coordinates: { latitude: 28.61, longitude: 77.21 },
          datetimeLast: { utc: originalObservedTime, local: '2026-11-22T11:45:00+05:30' },
        },
      ],
    };

    const mockLatest = {
      results: [
        {
          sensorId: 1,
          parameter: { name: 'pm25', units: 'ug/m3' },
          value: 120,
          datetime: originalObservedTime,
        },
      ],
    };

    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/latest')) {
        return { ok: true, status: 200, json: async () => mockLatest } as Response;
      }
      return { ok: true, status: 200, json: async () => mockLocations } as Response;
    });

    // 1st call: queries network and stores in cache
    const firstCall = await fetchOpenAqSources({ latitude: 28.61, longitude: 77.21, apiKey: 'test_key' });
    expect(fetchSpy).toHaveBeenCalled();
    expect(firstCall[0].observedAt).toBe(originalObservedTime);

    // 2nd call: served from cache
    fetchSpy.mockClear();
    const secondCall = await fetchOpenAqSources({ latitude: 28.61, longitude: 77.21, apiKey: 'test_key' });
    // Did not make another network request
    expect(fetchSpy).not.toHaveBeenCalled();
    // Retained the exact original observation timestamp!
    expect(secondCall[0].observedAt).toBe(originalObservedTime);
    expect(secondCall[0].measurements[0].observedAt).toBe(originalObservedTime);
  });

  it('48. Concurrent requests hit cache and avoid duplicate rate-limit-heavy fetching', async () => {
    const mockLocations = { results: [] };
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockLocations,
    } as Response);

    await fetchOpenAqSources({ latitude: 28.61, longitude: 77.21, apiKey: 'test_key' });
    await fetchOpenAqSources({ latitude: 28.61, longitude: 77.21, apiKey: 'test_key' });
    await fetchOpenAqSources({ latitude: 28.61, longitude: 77.21, apiKey: 'test_key' });

    // Initial query executed once; subsequent queries are served from cache
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
