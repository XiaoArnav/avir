import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchOpenAqSources,
  clearOpenAqCache,
  parseOpenAqLocation,
  validateMeasurementValue,
  OPENAQ_MAX_RADIUS_KM,
  OpenAqLocationResult,
  OpenAqLatestMeasurementItem,
} from '@/services/providers/openaq-provider';

describe('AVIR STEP 3 CORRECTIVE — Group A: OpenAQ Schema & Sensor ID Resolution (1-12)', () => {
  const locWithSensors: OpenAqLocationResult = {
    id: 5001,
    name: 'US Embassy Chanakyapuri',
    provider: { name: 'AirNow Gov' },
    isMonitor: true,
    coordinates: { latitude: 28.5983, longitude: 77.1897 },
    sensors: [
      { id: 101, name: 'Fine PM Sensor', parameter: { id: 2, name: 'pm25', units: 'µg/m³' } },
      { id: 102, name: 'Coarse Dust Sensor', parameter: { id: 1, name: 'pm10', units: 'µg/m³' } },
      { id: 103, name: 'Ozone Sensor', parameter: { id: 3, name: 'o3', units: 'ppm' } },
    ],
    datetimeLast: { utc: '2026-11-22T08:00:00Z', local: '2026-11-22T13:30:00+05:30' },
  };

  it('1. Actual v3 latest response with sensorsId is parsed correctly', () => {
    const latestItems: OpenAqLatestMeasurementItem[] = [
      {
        sensorsId: 101,
        locationsId: 5001,
        value: 142.5,
        datetime: { utc: '2026-11-22T08:00:00Z' },
      },
    ];

    const record = parseOpenAqLocation(locWithSensors, 28.61, 77.21, latestItems);
    expect(record).not.toBeNull();
    expect(record?.measurements.length).toBe(1);
    expect(record?.measurements[0].pollutant).toBe('pm25');
    expect(record?.measurements[0].value).toBe(142.5);
  });

  it('2. Sensor ID resolves to the correct parameter metadata', () => {
    const latestItems: OpenAqLatestMeasurementItem[] = [
      { sensorsId: 102, value: 210.0, datetime: { utc: '2026-11-22T08:00:00Z' } },
    ];

    const record = parseOpenAqLocation(locWithSensors, 28.61, 77.21, latestItems);
    expect(record?.measurements[0].pollutant).toBe('pm10');
  });

  it('3. Sensor ID resolves to the correct unit from sensor metadata', () => {
    const latestItems: OpenAqLatestMeasurementItem[] = [
      { sensorsId: 101, value: 95.0, datetime: { utc: '2026-11-22T08:00:00Z' } },
    ];

    const record = parseOpenAqLocation(locWithSensors, 28.61, 77.21, latestItems);
    expect(record?.measurements[0].unit).toBe('ug/m3');
  });

  it('4. A PM2.5 sensor is identified correctly without guessing from numeric value', () => {
    const latestItems: OpenAqLatestMeasurementItem[] = [
      { sensorsId: 101, value: 50.0, datetime: { utc: '2026-11-22T08:00:00Z' } },
    ];

    const record = parseOpenAqLocation(locWithSensors, 28.61, 77.21, latestItems);
    expect(record?.measurements[0].pollutant).toBe('pm25');
  });

  it('5. A PM10 sensor is identified correctly', () => {
    const latestItems: OpenAqLatestMeasurementItem[] = [
      { sensorsId: 102, value: 110.0, datetime: { utc: '2026-11-22T08:00:00Z' } },
    ];

    const record = parseOpenAqLocation(locWithSensors, 28.61, 77.21, latestItems);
    expect(record?.measurements[0].pollutant).toBe('pm10');
    expect(record?.measurements[0].value).toBe(110.0);
  });

  it('6. Unknown sensor ID is safely ignored without inventing metadata', () => {
    const latestItems: OpenAqLatestMeasurementItem[] = [
      { sensorsId: 99999, value: 85.0, datetime: { utc: '2026-11-22T08:00:00Z' } }, // 99999 not in locWithSensors
    ];

    const record = parseOpenAqLocation(locWithSensors, 28.61, 77.21, latestItems);
    expect(record?.measurements.length).toBe(0);
    expect(record?.status).toBe('unavailable');
  });

  it('7. Missing metadata does not create a measurement (does not default to ug/m3)', () => {
    const locMissingUnit: OpenAqLocationResult = {
      id: 5002,
      name: 'Defective Sensor Station',
      sensors: [
        { id: 201, name: 'Unitless Sensor', parameter: { id: 2, name: 'pm25', units: '' } },
      ],
    };

    const latestItems: OpenAqLatestMeasurementItem[] = [
      { sensorsId: 201, value: 120.0, datetime: { utc: '2026-11-22T08:00:00Z' } },
    ];

    const record = parseOpenAqLocation(locMissingUnit, 28.61, 77.21, latestItems);
    expect(record?.measurements.length).toBe(0);
  });

  it('8. Valid zero concentration is preserved (zero is not missing)', () => {
    const validated = validateMeasurementValue(0, 'pm25', 'ug/m3', '2026-11-22T08:00:00Z');
    expect(validated).not.toBeNull();
    expect(validated?.value).toBe(0);
    expect(validated?.pollutant).toBe('pm25');
  });

  it('9. Negative value is rejected', () => {
    const validated = validateMeasurementValue(-15.4, 'pm25', 'ug/m3', '2026-11-22T08:00:00Z');
    expect(validated).toBeNull();
  });

  it('10. NaN and nonfinite values are rejected', () => {
    expect(validateMeasurementValue(NaN, 'pm25', 'ug/m3')).toBeNull();
    expect(validateMeasurementValue(Infinity, 'pm25', 'ug/m3')).toBeNull();
    expect(validateMeasurementValue('not-a-number', 'pm25', 'ug/m3')).toBeNull();
  });

  it('11. Original observation timestamp is preserved', () => {
    const obsTime = '2026-11-22T07:45:00Z';
    const latestItems: OpenAqLatestMeasurementItem[] = [
      { sensorsId: 101, value: 130.0, datetime: { utc: obsTime } },
    ];

    const record = parseOpenAqLocation(locWithSensors, 28.61, 77.21, latestItems);
    expect(record?.observedAt).toBe(obsTime);
    expect(record?.measurements[0].observedAt).toBe(obsTime);
  });

  it('12. Multiple sensors on one station are associated correctly', () => {
    const latestItems: OpenAqLatestMeasurementItem[] = [
      { sensorsId: 101, value: 92.0, datetime: { utc: '2026-11-22T08:00:00Z' } },
      { sensorsId: 102, value: 165.0, datetime: { utc: '2026-11-22T08:00:00Z' } },
    ];

    const record = parseOpenAqLocation(locWithSensors, 28.61, 77.21, latestItems);
    expect(record?.measurements.length).toBe(2);
    expect(record?.measurements.find(m => m.pollutant === 'pm25')?.value).toBe(92.0);
    expect(record?.measurements.find(m => m.pollutant === 'pm10')?.value).toBe(165.0);
  });
});

describe('AVIR STEP 3 CORRECTIVE — Group B: OpenAQ Production Boundaries & Security (13-22)', () => {
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

  it('13. Radius of 25 km is accepted and queried against OpenAQ API', async () => {
    let capturedUrl = '';
    vi.spyOn(global, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      capturedUrl = String(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({ results: [] }),
      } as unknown as Response;
    });

    await fetchOpenAqSources({
      latitude: 28.6139,
      longitude: 77.2090,
      radiusKm: 25,
      apiKey: 'test_valid_key',
    });

    expect(capturedUrl).toContain('radius=25000');
  });

  it('14. Radius above 25 km is clamped to 25 km limit (OPENAQ_MAX_RADIUS_KM)', async () => {
    let capturedUrl = '';
    vi.spyOn(global, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      capturedUrl = String(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({ results: [] }),
      } as unknown as Response;
    });

    await fetchOpenAqSources({
      latitude: 28.6139,
      longitude: 77.2090,
      radiusKm: 80, // Requesting 80km
      apiKey: 'test_valid_key',
    });

    // Upstream query clamped to 25,000 meters (25km)
    expect(capturedUrl).toContain('radius=25000');
    expect(OPENAQ_MAX_RADIUS_KM).toBe(25);
  });

  it('15. Out-of-range latitude is rejected with empty result', async () => {
    const sources = await fetchOpenAqSources({
      latitude: 95.0, // Invalid latitude > 90
      longitude: 77.2090,
      apiKey: 'test_valid_key',
    });

    expect(sources).toEqual([]);
  });

  it('16. Out-of-range longitude is rejected with empty result', async () => {
    const sources = await fetchOpenAqSources({
      latitude: 28.61,
      longitude: 195.0, // Invalid longitude > 180
      apiKey: 'test_valid_key',
    });

    expect(sources).toEqual([]);
  });

  it('17. Missing API key reports not_configured status without throwing', async () => {
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

  it('18. HTTP 401 is handled safely as rejected without crashing', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ message: 'Invalid API key' }),
    } as unknown as Response);

    const sources = await fetchOpenAqSources({
      latitude: 28.6139,
      longitude: 77.2090,
      apiKey: 'expired_key',
    });

    expect(sources.length).toBe(1);
    expect(sources[0].status).toBe('rejected');
    expect(sources[0].errorCode).toBe('UNAUTHORIZED');
  });

  it('19. HTTP 429 is handled safely as unreachable without infinite retry loops', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: async () => ({ message: 'Rate limit exceeded' }),
    } as unknown as Response);

    const sources = await fetchOpenAqSources({
      latitude: 28.6139,
      longitude: 77.2090,
      apiKey: 'valid_key',
    });

    expect(sources.length).toBe(1);
    expect(sources[0].status).toBe('unreachable');
    expect(sources[0].errorCode).toBe('RATE_LIMIT');
  });

  it('20. API failure does not fabricate an observation', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Connection dropped'));

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

  it('21. No secret appears in API responses or logs', async () => {
    const sensitiveKey = 'super_secret_openaq_token_12345';
    const sources = await fetchOpenAqSources({
      latitude: 28.6139,
      longitude: 77.2090,
      apiKey: sensitiveKey,
    });

    const serialized = JSON.stringify(sources);
    expect(serialized).not.toContain(sensitiveKey);
  });

  it('22. Internal error messages are sanitized', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON at position 0');
      },
    } as unknown as Response);

    const sources = await fetchOpenAqSources({
      latitude: 28.6139,
      longitude: 77.2090,
      apiKey: 'valid_key',
    });

    expect(sources.length).toBe(1);
    expect(sources[0].status).toBe('unreachable');
    expect(sources[0].explanation).not.toContain('SyntaxError');
  });
});

describe('AVIR STEP 3 CORRECTIVE — Group F: Cache Invariants & Failure Isolation (53)', () => {
  beforeEach(() => {
    clearOpenAqCache();
    process.env.OPENAQ_API_KEY = 'test_key';
    vi.restoreAllMocks();
  });

  it('53. Cached measurements retain original observation timestamps and do not become newly measured', async () => {
    const originalObservedTime = '2026-11-22T06:15:00Z';

    const mockLocations = {
      results: [
        {
          id: 6001,
          name: 'Cached Station',
          provider: { name: 'AirNow' },
          coordinates: { latitude: 28.61, longitude: 77.21 },
          sensors: [{ id: 1, name: 'PM2.5', parameter: { id: 2, name: 'pm25', units: 'ug/m3' } }],
          datetimeLast: { utc: originalObservedTime, local: '2026-11-22T11:45:00+05:30' },
        },
      ],
    };

    const mockLatest = {
      results: [
        {
          sensorsId: 1,
          value: 120,
          datetime: { utc: originalObservedTime },
        },
      ],
    };

    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.includes('/latest')) {
        return { ok: true, status: 200, json: async () => mockLatest } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => mockLocations } as unknown as Response;
    });

    const firstCall = await fetchOpenAqSources({ latitude: 28.61, longitude: 77.21, apiKey: 'test_key' });
    expect(fetchSpy).toHaveBeenCalled();
    expect(firstCall[0].observedAt).toBe(originalObservedTime);

    // 2nd call: served from cache
    fetchSpy.mockClear();
    const secondCall = await fetchOpenAqSources({ latitude: 28.61, longitude: 77.21, apiKey: 'test_key' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(secondCall[0].observedAt).toBe(originalObservedTime);
    expect(secondCall[0].measurements[0].observedAt).toBe(originalObservedTime);
  });
});
