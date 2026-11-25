import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GET } from '@/app/api/environment/wind/route';
import { NextRequest } from 'next/server';
import {
  clearWindCache,
  fetchWindForecast,
  GLOBAL_WIND_PROBES,
} from '@/services/environment/wind-service';

function makeHourlyTimesForDate(dateStr = '2026-11-24', hours = 48): string[] {
  const start = Date.parse(`${dateStr}T00:00:00Z`);
  return Array.from({ length: hours }, (_, i) =>
    new Date(start + i * 3600_000).toISOString().slice(0, 16)
  );
}

function buildBatchOpenMeteoPayload(
  lat: number,
  lng: number,
  options?: {
    dateStr?: string;
    activeSpeedAtHour?: Record<number, number | null>;
    activeDirAtHour?: Record<number, number | null>;
    activeCoordsOverride?: { lat: number; lng: number };
    omitActiveCity?: boolean;
    utcOffsetSeconds?: number;
    timeStrings?: string[];
  }
) {
  const probes = [{ lat, lng }, ...GLOBAL_WIND_PROBES];
  const baseTimes = options?.timeStrings ?? makeHourlyTimesForDate(options?.dateStr ?? '2026-11-24');

  return probes
    .map((p, idx) => {
      if (idx === 0 && options?.omitActiveCity) return null;

      const speeds = baseTimes.map((_, h) => {
        if (idx === 0 && options?.activeSpeedAtHour && h in options.activeSpeedAtHour) {
          return options.activeSpeedAtHour[h];
        }
        return idx === 0 ? 18 : 12 + (idx % 5);
      });

      const dirs = baseTimes.map((_, h) => {
        if (idx === 0 && options?.activeDirAtHour && h in options.activeDirAtHour) {
          return options.activeDirAtHour[h];
        }
        return idx === 0 ? 90 : (idx * 30) % 360;
      });

      const respLat = idx === 0 && options?.activeCoordsOverride ? options.activeCoordsOverride.lat : p.lat;
      const respLng = idx === 0 && options?.activeCoordsOverride ? options.activeCoordsOverride.lng : p.lng;

      return {
        latitude: respLat,
        longitude: respLng,
        utc_offset_seconds: options?.utcOffsetSeconds ?? 0,
        timezone: options?.utcOffsetSeconds ? 'Asia/Kolkata' : 'GMT',
        hourly_units: {
          time: 'iso8601',
          wind_speed_10m: 'km/h',
          wind_direction_10m: '°',
        },
        hourly: {
          time: baseTimes,
          wind_speed_10m: speeds,
          wind_direction_10m: dirs,
        },
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

describe('Global Wind-Flow API Route & Service Integrity (/api/environment/wind)', () => {
  beforeEach(() => {
    clearWindCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('rejects missing coordinates instead of assuming Bengaluru', async () => {
    const reqNoCoords = new NextRequest('http://localhost:3000/api/environment/wind?hour=12');
    const res1 = await GET(reqNoCoords);
    expect(res1.status).toBe(400);
    expect((await res1.json()).code).toBe('MISSING_COORDINATES');

    const reqOnlyLng = new NextRequest('http://localhost:3000/api/environment/wind?lng=77.59');
    const res2 = await GET(reqOnlyLng);
    expect(res2.status).toBe(400);
  });

  it('rejects invalid latitude, longitude, hour, and malformed numeric strings with HTTP 400', async () => {
    const cases = [
      'http://localhost:3000/api/environment/wind?lat=95&lng=77.59',
      'http://localhost:3000/api/environment/wind?lat=-91&lng=77.59',
      'http://localhost:3000/api/environment/wind?lat=12.97&lng=200',
      'http://localhost:3000/api/environment/wind?lat=12.97&lng=-181',
      'http://localhost:3000/api/environment/wind?lat=12.97&lng=77.59&hour=25',
      'http://localhost:3000/api/environment/wind?lat=12.97&lng=77.59&hour=-1',
      'http://localhost:3000/api/environment/wind?lat=12.97abc&lng=77.59',
      'http://localhost:3000/api/environment/wind?lat=12.97&lng=77.59px',
      'http://localhost:3000/api/environment/wind?lat=12.97&lng=77.59&hour=14xyz',
      'http://localhost:3000/api/environment/wind?lat=12.97&lng=77.59&hour=14.5',
    ];

    for (const url of cases) {
      const res = await GET(new NextRequest(url));
      expect(res.status).toBe(400);
    }
  });

  it('returns real synchronized UTC wind vectors, active-city coords, and truthful Open-Meteo attribution', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildBatchOpenMeteoPayload(12.9716, 77.5946, { dateStr: '2026-11-24' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest('http://localhost:3000/api/environment/wind?lat=12.9716&lng=77.5946&hour=14');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const requestedUrl = String(fetchMock.mock.calls[0][0]);
    expect(requestedUrl).toContain('timezone=GMT');
    expect(requestedUrl).toContain('models=best_match');
    expect(requestedUrl).toContain('wind_speed_unit=kmh');

    const json = await res.json();
    expect(json.status).toBe('available');
    expect(json.isAvailable).toBe(true);
    expect(json.model).toContain('Open-Meteo Forecast API');
    expect(json.model).not.toContain('NOAA GFS & ECMWF IFS');
    expect(json.modelRunAvailable).toBe(false);
    expect(json.initTimeUtc).toBeNull();
    expect(json.validTimeUtc).toBe('2026-11-24T14:00:00.000Z');
    expect(json.cityWind).toMatchObject({
      latitude: 12.9716,
      longitude: 77.5946,
      speedKmh: 18,
      speedMs: 5,
      directionDeg: 90,
      u: -5,
      v: 0,
      role: 'active_target',
      validTimeUtc: '2026-11-24T14:00:00.000Z',
    });
    expect(json.grid).toHaveLength(GLOBAL_WIND_PROBES.length);
    expect(json.grid.every((pt: any) => pt.validTimeUtc === '2026-11-24T14:00:00.000Z')).toBe(true);
  });

  it('represents legitimate calm wind as zero velocity rather than unavailable', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () =>
        buildBatchOpenMeteoPayload(28.6139, 77.209, {
          activeSpeedAtHour: { 10: 0 },
          activeDirAtHour: { 10: 180 },
        }),
    });

    const data = await fetchWindForecast({
      latitude: 28.6139,
      longitude: 77.209,
      hour: 10,
      fetchImpl: fetchMock as any,
    });

    expect(data.isAvailable).toBe(true);
    expect(data.cityWind?.speedKmh).toBe(0);
    expect(data.cityWind?.speedMs).toBe(0);
    expect(data.cityWind?.u).toBe(0);
    expect(data.cityWind?.v).toBe(0);
    expect(data.ventilationRating).toBe('stagnant');
  });

  it('treats missing speed or direction as unavailable without Number(null) zeroing or fallback 10/180', async () => {
    const missingSpeedRes = await fetchWindForecast({
      latitude: 28.6139,
      longitude: 77.209,
      hour: 10,
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () =>
          buildBatchOpenMeteoPayload(28.6139, 77.209, {
            activeSpeedAtHour: { 10: null },
          }),
      }) as any,
    });

    expect(missingSpeedRes.status).toBe('partial');
    expect(missingSpeedRes.isAvailable).toBe(false);
    expect(missingSpeedRes.cityWind).toBeNull();
    expect(missingSpeedRes.ventilationRating).toBe('unavailable');
    expect(missingSpeedRes.grid.length).toBe(GLOBAL_WIND_PROBES.length);

    clearWindCache();

    const missingDirRes = await fetchWindForecast({
      latitude: 28.6139,
      longitude: 77.209,
      hour: 10,
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () =>
          buildBatchOpenMeteoPayload(28.6139, 77.209, {
            activeDirAtHour: { 10: null },
          }),
      }) as any,
    });

    expect(missingDirRes.cityWind).toBeNull();
    expect(missingDirRes.ventilationRating).toBe('unavailable');
  });

  it('never substitutes another city when active city sample is misaligned or missing', async () => {
    const misalignedRes = await fetchWindForecast({
      latitude: 12.9716,
      longitude: 77.5946,
      hour: 12,
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () =>
          buildBatchOpenMeteoPayload(12.9716, 77.5946, {
            // Upstream returned London coordinates in slot 0 instead of Bengaluru
            activeCoordsOverride: { lat: 51.5074, lng: -0.1278 },
          }),
      }) as any,
    });

    expect(misalignedRes.cityWind).toBeNull();
    expect(misalignedRes.isAvailable).toBe(false);
    expect(misalignedRes.status).toBe('partial');
  });

  it('synchronizes global probes to one UTC instant across non-zero offsets and UTC midnight boundaries', async () => {
    // Active city in UTC+05:30 offset (19800s) starting at local 05:30 (= 00:00Z) through midnight boundary
    const baseUtc = Date.parse('2026-11-24T22:00:00Z');
    const gmtTimes = Array.from({ length: 6 }, (_, i) =>
      new Date(baseUtc + i * 3600_000).toISOString().slice(0, 16)
    );
    const istOffsetSec = 19800;
    const istLocalTimes = Array.from({ length: 6 }, (_, i) =>
      new Date(baseUtc + i * 3600_000 + istOffsetSec * 1000).toISOString().slice(0, 16)
    );

    const payload = buildBatchOpenMeteoPayload(12.9716, 77.5946, { timeStrings: gmtTimes });
    // Active city returns IST wall-clock strings + utc_offset_seconds=19800
    payload[0].utc_offset_seconds = istOffsetSec;
    payload[0].hourly.time = istLocalTimes;
    // Target is 2026-11-25T00:00:00Z (index 2 in both arrays = 05:30 IST on 2026-11-25)
    payload[0].hourly.wind_speed_10m[2] = 25;
    payload[0].hourly.wind_direction_10m[2] = 270;

    const data = await fetchWindForecast({
      latitude: 12.9716,
      longitude: 77.5946,
      hour: 0,
      targetValidTimeUtc: '2026-11-25T00:00:00Z',
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => payload,
      }) as any,
    });

    expect(data.validTimeUtc).toBe('2026-11-25T00:00:00.000Z');
    expect(data.cityWind?.speedKmh).toBe(25);
    expect(data.cityWind?.directionDeg).toBe(270);
    expect(data.grid.every((pt) => pt.validTimeUtc === '2026-11-25T00:00:00.000Z')).toBe(true);
  });

  it('handles upstream timeout, 429 rate limits, and malformed JSON explicitly without fabricated fallback vectors', async () => {
    // 1. Timeout
    const abortErr = new Error('Timeout');
    abortErr.name = 'TimeoutError';
    const timeoutData = await fetchWindForecast({
      latitude: 51.5074,
      longitude: -0.1278,
      hour: 8,
      fetchImpl: vi.fn().mockRejectedValue(abortErr) as any,
    });
    expect(timeoutData.status).toBe('upstream_timeout');
    expect(timeoutData.isAvailable).toBe(false);
    expect(timeoutData.cityWind).toBeNull();
    expect(timeoutData.grid).toEqual([]);
    expect(timeoutData.ventilationRating).toBe('unavailable');

    clearWindCache();

    // 2. HTTP 429 rate limit
    const rateLimited = await fetchWindForecast({
      latitude: 51.5074,
      longitude: -0.1278,
      hour: 8,
      fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 429 }) as any,
    });
    expect(rateLimited.status).toBe('rate_limited');
    expect(rateLimited.isAvailable).toBe(false);
    expect(rateLimited.cityWind).toBeNull();
    expect(rateLimited.grid).toEqual([]);

    clearWindCache();

    // 3. Malformed JSON via route GET handler (must return Cache-Control: no-store)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token');
        },
      })
    );
    const routeRes = await GET(
      new NextRequest('http://localhost:3000/api/environment/wind?lat=51.5074&lng=-0.1278&hour=8')
    );
    expect(routeRes.status).toBe(200);
    expect(routeRes.headers.get('Cache-Control')).toBe('no-store');
    const routeJson = await routeRes.json();
    expect(routeJson.status).toBe('invalid_upstream_response');
    expect(routeJson.isAvailable).toBe(false);
    expect(routeJson.cityWind).toBeNull();
    expect(routeJson.grid).toEqual([]);
  });

  it('isolates cache between locations and forecast hours and discloses stale cache honestly', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-24T09:00:00Z'));

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const firstLat = Number(url.match(/latitude=([^,&]+)/)?.[1]);
      const isTokyo = Math.abs(firstLat - 35.6762) < 0.1;
      const lat = isTokyo ? 35.6762 : 12.9716;
      const lng = isTokyo ? 139.6503 : 77.5946;
      return {
        ok: true,
        status: 200,
        json: async () =>
          buildBatchOpenMeteoPayload(lat, lng, {
            activeSpeedAtHour: isTokyo ? { 10: 30, 14: 22 } : { 10: 14, 14: 19 },
          }),
      };
    });

    // Fetch Bengaluru @ 10Z
    const blr10 = await fetchWindForecast({
      latitude: 12.9716,
      longitude: 77.5946,
      hour: 10,
      fetchImpl: fetchMock as any,
    });
    expect(blr10.isCached).toBe(false);
    expect(blr10.cityWind?.speedKmh).toBe(14);

    // Fetch Bengaluru @ 14Z -> cache miss, different hour
    const blr14 = await fetchWindForecast({
      latitude: 12.9716,
      longitude: 77.5946,
      hour: 14,
      fetchImpl: fetchMock as any,
    });
    expect(blr14.isCached).toBe(false);
    expect(blr14.cityWind?.speedKmh).toBe(19);

    // Fetch Tokyo @ 10Z -> cache miss, different city
    const tyo10 = await fetchWindForecast({
      latitude: 35.6762,
      longitude: 139.6503,
      hour: 10,
      fetchImpl: fetchMock as any,
    });
    expect(tyo10.isCached).toBe(false);
    expect(tyo10.cityWind?.speedKmh).toBe(30);

    // Repeat Bengaluru @ 10Z within 30 min TTL -> fresh cache hit
    const blr10Cached = await fetchWindForecast({
      latitude: 12.9716,
      longitude: 77.5946,
      hour: 10,
      fetchImpl: fetchMock as any,
    });
    expect(blr10Cached.isCached).toBe(true);
    expect(blr10Cached.isStale).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Advance past 30 minute TTL and simulate upstream 503 failure -> genuine stale cache served cleanly
    vi.advanceTimersByTime(31 * 60 * 1000);
    const staleRes = await fetchWindForecast({
      latitude: 12.9716,
      longitude: 77.5946,
      hour: 10,
      fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 503 }) as any,
    });
    expect(staleRes.status).toBe('stale_cached');
    expect(staleRes.isCached).toBe(true);
    expect(staleRes.isStale).toBe(true);
    expect(staleRes.cityWind?.speedKmh).toBe(14);
  });

  it('Fix 2 regression: aligns IST half-hour UTC instants (:30Z) to nearest upstream hourly frame cleanly while rejecting out-of-window timestamps', async () => {
    const payload = buildBatchOpenMeteoPayload(28.6139, 77.209, {
      dateStr: '2026-11-25',
      activeSpeedAtHour: { 3: 11, 4: 17 },
      activeDirAtHour: { 3: 290, 4: 310 },
    });

    // India IST 09:00 (+05:30) = 2026-11-25T03:30:00.000Z (exact 30-min tie between 03:00Z and 04:00Z -> aligns forward to 04:00Z)
    const istHalfHour = await fetchWindForecast({
      latitude: 28.6139,
      longitude: 77.209,
      hour: 3,
      targetValidTimeUtc: '2026-11-25T03:30:00.000Z',
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => payload,
      }) as any,
    });

    expect(istHalfHour.status).toBe('available');
    expect(istHalfHour.isAvailable).toBe(true);
    expect(istHalfHour.validTimeUtc).toBe('2026-11-25T04:00:00.000Z');
    expect(istHalfHour.cityWind?.speedKmh).toBe(17);
    expect(istHalfHour.uncertaintyDisclosure).toContain('Aligned requested UTC instant');

    clearWindCache();

    // Far out-of-window date (> 60 minutes outside upstream time series) -> still unavailable honestly
    const outOfWindow = await fetchWindForecast({
      latitude: 28.6139,
      longitude: 77.209,
      hour: 3,
      targetValidTimeUtc: '2026-12-10T03:30:00.000Z',
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => payload,
      }) as any,
    });

    expect(outOfWindow.status).toBe('invalid_upstream_response');
    expect(outOfWindow.isAvailable).toBe(false);
    expect(outOfWindow.cityWind).toBeNull();
  });

  it('Phase 1 regression: discloses future vs current freshness honestly and selects nearest UTC hour across midnight boundary when hour omitted', async () => {
    vi.useFakeTimers();
    const nowUtc = Date.UTC(2026, 10, 25, 0, 45, 0); // 00:45Z across UTC midnight
    vi.setSystemTime(nowUtc);

    // Simulate Open-Meteo `past_hours=2&forecast_days=2`: starts at 2026-11-24T22:00Z through 2026-11-26T23:00Z
    const startMs = Date.UTC(2026, 10, 24, 22, 0, 0);
    const times = Array.from({ length: 50 }, (_, i) =>
      new Date(startMs + i * 3600_000).toISOString().slice(0, 16)
    );

    const payload = buildBatchOpenMeteoPayload(28.6139, 77.209, {
      timeStrings: times,
      activeSpeedAtHour: { 2: 9, 10: 21 },
    });

    // Omitting both `hour` and `targetValidTimeUtc` prefers current 00:00Z window
    const currentRes = await fetchWindForecast({
      latitude: 28.6139,
      longitude: 77.209,
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => payload,
      }) as any,
    });
    expect(currentRes.isAvailable).toBe(true);
    expect(currentRes.validTimeUtc).toBe('2026-11-25T00:00:00.000Z');
    expect(currentRes.freshness).toBe('current');

    clearWindCache();

    // Future forecast valid time (6 hours ahead) explicitly discloses forecast status
    const futureRes = await fetchWindForecast({
      latitude: 28.6139,
      longitude: 77.209,
      targetValidTimeUtc: '2026-11-25T06:00:00Z',
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => payload,
      }) as any,
    });
    expect(futureRes.isAvailable).toBe(true);
    expect(futureRes.freshness).toBe('forecast');
    expect(futureRes.uncertaintyDisclosure).toMatch(/Forecast data valid/i);
  });
});
