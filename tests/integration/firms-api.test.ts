import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GET } from '@/app/api/environment/fires/route';
import { NextRequest } from 'next/server';
import { FIRMS_SCIENTIFIC_DISCLAIMER } from '@/domain/firms-types';
import { clearFirmsCache, fetchFirmsHotspots } from '@/services/environment/firms-service';

const SAMPLE_NOAA20_CSV = `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
28.62,77.21,345.2,0.38,0.36,2026-11-24,0830,2,VIIRS,n,2.0NRT,295.4,14.5,D
28.95,76.85,362.8,0.42,0.38,2026-11-24,0830,N20,VIIRS,h,2.0NRT,301.2,42.8,D`;

describe('NASA FIRMS Active-Fire API Route & Failure Integrity (/api/environment/fires)', () => {
  const originalKey = process.env.FIRMS_MAP_KEY;

  beforeEach(() => {
    clearFirmsCache();
    vi.restoreAllMocks();
    delete process.env.FIRMS_MAP_KEY;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalKey === undefined) {
      delete process.env.FIRMS_MAP_KEY;
    } else {
      process.env.FIRMS_MAP_KEY = originalKey;
    }
  });

  it('rejects missing coordinates instead of defaulting to Bengaluru', async () => {
    const res1 = await GET(new NextRequest('http://localhost:3000/api/environment/fires?radiusKm=200'));
    expect(res1.status).toBe(400);
    expect((await res1.json()).code).toBe('MISSING_COORDINATES');

    const res2 = await GET(new NextRequest('http://localhost:3000/api/environment/fires?lat=28.61'));
    expect(res2.status).toBe(400);
  });

  it('rejects invalid coordinates, invalid radiusKm, and malformed numeric strings with HTTP 400', async () => {
    const badUrls = [
      'http://localhost:3000/api/environment/fires?lat=-100&lng=77.59',
      'http://localhost:3000/api/environment/fires?lat=91&lng=77.59',
      'http://localhost:3000/api/environment/fires?lat=12.97&lng=250',
      'http://localhost:3000/api/environment/fires?lat=12.97&lng=-181',
      'http://localhost:3000/api/environment/fires?lat=12.97&lng=77.59&radiusKm=5000',
      'http://localhost:3000/api/environment/fires?lat=12.97&lng=77.59&radiusKm=0',
      'http://localhost:3000/api/environment/fires?lat=12.97abc&lng=77.59',
      'http://localhost:3000/api/environment/fires?lat=12.97&lng=77.59px',
      'http://localhost:3000/api/environment/fires?lat=12.97&lng=77.59&radiusKm=300km',
    ];

    for (const url of badUrls) {
      const res = await GET(new NextRequest(url));
      expect(res.status).toBe(400);
    }
  });

  it('uses keyless NASA FIRMS 24h regional CSV archive when FIRMS_MAP_KEY is absent, and fails closed cleanly if archive fetch fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => SAMPLE_NOAA20_CSV,
    });
    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest(
      'http://localhost:3000/api/environment/fires?lat=28.6139&lng=77.2090&radiusKm=300',
      { headers: { 'x-forwarded-for': '203.0.113.10' } }
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=900');

    const json = await res.json();
    expect(json.disclaimer).toBe(FIRMS_SCIENTIFIC_DISCLAIMER);
    expect(json.configured).toBe(false);
    expect(json.isAvailable).toBe(true);
    expect(json.status).toBe('active');
    expect(json.dataset).toBe('VIIRS_NOAA20_C2_24H');
    expect(json.count).toBe(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain('J1_VIIRS_C2_South_Asia_24h.csv');

    clearFirmsCache();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Archive offline')));
    const offlineRes = await GET(
      new NextRequest(
        'http://localhost:3000/api/environment/fires?lat=28.6139&lng=77.2090&radiusKm=300',
        { headers: { 'x-forwarded-for': '203.0.113.12' } }
      )
    );
    expect(offlineRes.status).toBe(200);
    expect(offlineRes.headers.get('Cache-Control')).toBe('no-store');
    const offlineJson = await offlineRes.json();
    expect(offlineJson.configured).toBe(false);
    expect(offlineJson.isAvailable).toBe(false);
    expect(offlineJson.hotspots).toEqual([]);
  });

  it('returns active NOAA-20 VIIRS detections via /api/environment/fires without leaking server MAP_KEY', async () => {
    const secretKey = 'MOCK_FIRMS_SECRET_TOKEN_XYZ';
    process.env.FIRMS_MAP_KEY = secretKey;

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => SAMPLE_NOAA20_CSV,
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await GET(
      new NextRequest(
        'http://localhost:3000/api/environment/fires?lat=28.6139&lng=77.2090&radiusKm=300',
        { headers: { 'x-forwarded-for': '203.0.113.11' } }
      )
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=900');

    const json = await res.json();
    expect(json.configured).toBe(true);
    expect(json.isAvailable).toBe(true);
    expect(json.status).toBe('active');
    expect(json.dataset).toBe('VIIRS_NOAA20_NRT');
    expect(json.satellite).toBe('NOAA-20');
    expect(json.instrument).toBe('VIIRS');
    expect(json.count).toBe(2);
    expect(json.latestObservationUtc).toBe('2026-11-24T08:30:00.000Z');
    expect(json.disclaimer).toBe(FIRMS_SCIENTIFIC_DISCLAIMER);
    expect(JSON.stringify(json)).not.toContain(secretKey);
  });

  it('distinguishes valid zero-detection queries, invalid credentials, timeouts, HTTP 429, 5xx, and malformed CSV without credential leakage', async () => {
    const secretKey = 'SECRET_NASA_KEY_NEVER_LEAK';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // 1. Valid empty CSV -> status 'no_detections' (isAvailable: true)
    const emptyRes = await fetchFirmsHotspots({
      latitude: 28.6139,
      longitude: 77.209,
      radiusKm: 100,
      apiKey: secretKey,
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,frp,daynight\n',
      }) as any,
    });
    expect(emptyRes.status).toBe('no_detections');
    expect(emptyRes.isAvailable).toBe(true);
    expect(emptyRes.count).toBe(0);
    expect(emptyRes.message).not.toContain('no fires exist');

    clearFirmsCache();

    // 2. Invalid MAP_KEY (HTTP 401 & 200 body "Invalid MAP_KEY.")
    const authRes = await fetchFirmsHotspots({
      latitude: 28.6139,
      longitude: 77.209,
      apiKey: secretKey,
      fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 401 }) as any,
    });
    expect(authRes.status).toBe('invalid_credentials');
    expect(authRes.isAvailable).toBe(false);
    expect(JSON.stringify(authRes)).not.toContain(secretKey);

    // 3. Upstream timeout
    const timeoutErr = new Error(`Timed out calling https://firms.modaps.eosdis.nasa.gov/api/area/csv/${secretKey}/VIIRS_NOAA20_NRT`);
    timeoutErr.name = 'TimeoutError';
    const timeoutRes = await fetchFirmsHotspots({
      latitude: 28.6139,
      longitude: 77.209,
      apiKey: secretKey,
      fetchImpl: vi.fn().mockRejectedValue(timeoutErr) as any,
    });
    expect(timeoutRes.status).toBe('upstream_timeout');
    expect(timeoutRes.isAvailable).toBe(false);
    expect(JSON.stringify(timeoutRes)).not.toContain(secretKey);

    // 4. Upstream HTTP 429 rate limit
    const rateRes = await fetchFirmsHotspots({
      latitude: 28.6139,
      longitude: 77.209,
      apiKey: secretKey,
      fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 429 }) as any,
    });
    expect(rateRes.status).toBe('quota_exceeded');
    expect(rateRes.isAvailable).toBe(false);

    // 5. Upstream HTTP 503 failure
    const errRes = await fetchFirmsHotspots({
      latitude: 28.6139,
      longitude: 77.209,
      apiKey: secretKey,
      fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 503 }) as any,
    });
    expect(errRes.status).toBe('upstream_error');
    expect(errRes.isAvailable).toBe(false);

    // 6. Malformed CSV payload -> 'malformed_csv' (never mistaken for zero detections)
    const malformedRes = await fetchFirmsHotspots({
      latitude: 28.6139,
      longitude: 77.209,
      apiKey: secretKey,
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '<html>Service Error</html>',
      }) as any,
    });
    expect(malformedRes.status).toBe('malformed_csv');
    expect(malformedRes.isAvailable).toBe(false);

    // 7. Thrown error containing key -> scrubbed in logs & response
    const thrownRes = await fetchFirmsHotspots({
      latitude: 28.6139,
      longitude: 77.209,
      apiKey: secretKey,
      fetchImpl: vi.fn().mockRejectedValue(
        new Error(`ECONNREFUSED https://firms.modaps.eosdis.nasa.gov/api/area/csv/${secretKey}/VIIRS_NOAA20_NRT`)
      ) as any,
    });
    expect(thrownRes.status).toBe('upstream_error');
    expect(JSON.stringify(thrownRes)).not.toContain(secretKey);
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(secretKey);
  });

  it('isolates cache across locations/radii, deduplicates IDL split bboxes, and serves labeled stale cache on outage', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-24T10:00:00Z'));

    // Date-line split query fetches 2 bboxes and deduplicates repeated hotspot
    const idlCsv = `latitude,longitude,bright_ti4,acq_date,acq_time,satellite,instrument,frp
0.0,179.95,350.0,2026-11-24,0200,2,VIIRS,25.0`;
    const idlFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => idlCsv,
    });
    const idlRes = await fetchFirmsHotspots({
      latitude: 0,
      longitude: 179.9,
      radiusKm: 200,
      apiKey: 'TEST_KEY',
      fetchImpl: idlFetch as any,
    });
    expect(idlFetch).toHaveBeenCalledTimes(2);
    expect(idlRes.count).toBe(1); // Deduplicated across split bboxes!

    // Separate radius/location triggers distinct upstream request (zero cross-city leakage)
    const delhiFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => SAMPLE_NOAA20_CSV,
    });
    const delhi200 = await fetchFirmsHotspots({
      latitude: 28.6139,
      longitude: 77.209,
      radiusKm: 200,
      apiKey: 'TEST_KEY',
      fetchImpl: delhiFetch as any,
    });
    expect(delhi200.isCached).toBe(false);
    expect(delhi200.count).toBe(2);

    const delhi500 = await fetchFirmsHotspots({
      latitude: 28.6139,
      longitude: 77.209,
      radiusKm: 500,
      apiKey: 'TEST_KEY',
      fetchImpl: delhiFetch as any,
    });
    expect(delhi500.isCached).toBe(false);
    expect(delhiFetch).toHaveBeenCalledTimes(2);

    // Within 30m TTL -> fresh cache hit preserves original retrievedAt
    const delhi200Cached = await fetchFirmsHotspots({
      latitude: 28.6139,
      longitude: 77.209,
      radiusKm: 200,
      apiKey: 'TEST_KEY',
      fetchImpl: delhiFetch as any,
    });
    expect(delhi200Cached.isCached).toBe(true);
    expect(delhi200Cached.isStale).toBe(false);
    expect(delhi200Cached.retrievedAt).toBe(delhi200.retrievedAt);
    expect(delhiFetch).toHaveBeenCalledTimes(2);

    // Past 30m TTL on HTTP 503 outage -> serves labeled stale cache
    vi.advanceTimersByTime(31 * 60 * 1000);
    const staleOutage = await fetchFirmsHotspots({
      latitude: 28.6139,
      longitude: 77.209,
      radiusKm: 200,
      apiKey: 'TEST_KEY',
      fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 503 }) as any,
    });
    expect(staleOutage.status).toBe('stale_cached');
    expect(staleOutage.isAvailable).toBe(true);
    expect(staleOutage.isCached).toBe(true);
    expect(staleOutage.isStale).toBe(true);
    expect(staleOutage.retrievedAt).toBe(delhi200.retrievedAt);
    expect(staleOutage.count).toBe(2);
  });

  it('enforces API rate limiting on /api/environment/fires to protect MAP_KEY quota', async () => {
    const ip = '198.51.100.77';
    for (let i = 0; i < 30; i++) {
      const res = await GET(
        new NextRequest('http://localhost:3000/api/environment/fires?lat=28.6139&lng=77.2090', {
          headers: { 'x-forwarded-for': ip },
        })
      );
      expect(res.status).toBe(200);
    }

    const blocked = await GET(
      new NextRequest('http://localhost:3000/api/environment/fires?lat=28.6139&lng=77.2090', {
        headers: { 'x-forwarded-for': ip },
      })
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeDefined();
    expect((await blocked.json()).code).toBe('RATE_LIMITED');
  });
});
