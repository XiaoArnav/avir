import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { decodeWindGrib2Message } from '@/services/environment/grib2-decoder';
import {
  assertSafeWindUpstreamUrl,
  clearGlobalWindCache,
  encodeGlobalWindBinaryGrid,
  fetchGlobalWindBinaryByCycle,
  fetchGlobalWindSnapshot,
  getGlobalWindCacheStats,
  GLOBAL_WIND_CACHE_MAX_ALIASES,
  GLOBAL_WIND_CACHE_MAX_SNAPSHOTS,
  GLOBAL_WIND_CACHE_MAX_STALE_MS,
  GLOBAL_WIND_FAILURE_CACHE_MAX_ENTRIES,
  nearestGfsStep,
  nearestIfsStep,
  parseGfsIdx,
  parseIfsIndex,
  pruneExpiredGlobalWindCache,
  selectLatestGfsCycle,
  selectLatestIfsCycle,
  validateForecastTargetTime,
  WindForecastRangeError,
} from '@/services/environment/global-wind-service';
import {
  clearGlobalWindClientCache,
  fetchClientGlobalWindSnapshot,
  isValidWindManifest,
} from '@/services/environment/global-wind-client';
import { GET as getGlobalManifest } from '@/app/api/environment/wind/global/route';
import { GET as getGlobalGrid } from '@/app/api/environment/wind/global/grid/route';

class BitWriter {
  private bytes: number[] = [];
  private curByte = 0;
  private bitPos = 0;

  writeBits(val: number, n: number) {
    for (let b = n - 1; b >= 0; b--) {
      this.curByte = (this.curByte << 1) | ((val >>> b) & 1);
      this.bitPos++;
      if (this.bitPos === 8) {
        this.bytes.push(this.curByte);
        this.curByte = 0;
        this.bitPos = 0;
      }
    }
  }

  alignToByte() {
    if (this.bitPos > 0) {
      this.curByte <<= 8 - this.bitPos;
      this.bytes.push(this.curByte);
      this.curByte = 0;
      this.bitPos = 0;
    }
  }

  toUint8Array(): Uint8Array {
    this.alignToByte();
    return Uint8Array.from(this.bytes);
  }
}

function writeSignMag16(val: number): [number, number] {
  const neg = val < 0;
  const mag = Math.abs(val) & 0x7fff;
  const raw = (neg ? 0x8000 : 0) | mag;
  return [(raw >> 8) & 0xff, raw & 0xff];
}

function writeSignMag32(val: number): [number, number, number, number] {
  const neg = val < 0;
  const mag = Math.abs(val);
  return [
    (neg ? 0x80 : 0) | ((mag >>> 24) & 0x7f),
    (mag >>> 16) & 0xff,
    (mag >>> 8) & 0xff,
    mag & 0xff,
  ];
}

function buildSyntheticGrib2Message(opts: {
  template: 0 | 3 | 42;
  ni?: number;
  nj?: number;
  lo1Deg?: number;
  la1Deg?: number;
  diDeg?: number;
  djDeg?: number;
  initYear?: number;
  initMonth?: number;
  initDay?: number;
  initHour?: number;
  forecastHours?: number;
  values: number[];
  bitmap?: boolean[];
}): Uint8Array {
  const ni = opts.ni ?? 4;
  const nj = opts.nj ?? 2;
  const lo1 = Math.round((opts.lo1Deg ?? 0) * 1e6);
  const la1 = Math.round((opts.la1Deg ?? 90) * 1e6);
  const di = Math.round((opts.diDeg ?? 90) * 1e6);
  const dj = Math.round((opts.djDeg ?? 180) * 1e6);

  // Section 1 (21 bytes)
  const sec1 = new Uint8Array(21);
  new DataView(sec1.buffer).setUint32(0, 21, false);
  sec1[4] = 1;
  new DataView(sec1.buffer).setUint16(12, opts.initYear ?? 2026, false);
  sec1[14] = opts.initMonth ?? 11;
  sec1[15] = opts.initDay ?? 25;
  sec1[16] = opts.initHour ?? 0;

  // Section 3 (72 bytes, Template 3.0)
  const sec3 = new Uint8Array(72);
  const dv3 = new DataView(sec3.buffer);
  dv3.setUint32(0, 72, false);
  sec3[4] = 3;
  dv3.setUint32(30, ni, false);
  dv3.setUint32(34, nj, false);
  sec3.set(writeSignMag32(la1), 46);
  sec3.set(writeSignMag32(lo1), 50);
  dv3.setUint32(63, di, false);
  dv3.setUint32(67, dj, false);
  sec3[71] = 0;

  // Section 4 (34 bytes, Template 4.0)
  const sec4 = new Uint8Array(34);
  const dv4 = new DataView(sec4.buffer);
  dv4.setUint32(0, 34, false);
  sec4[4] = 4;
  dv4.setUint16(7, 0, false);
  sec4[9] = 2; // momentum category
  sec4[10] = 2; // U-component
  sec4[17] = 1; // hour unit
  dv4.setInt32(18, opts.forecastHours ?? 6, false);
  sec4[22] = 103;
  dv4.setUint32(24, 10, false);

  // Optional Section 6 Bitmap
  let packedInput = opts.values;
  let sec6: Uint8Array;
  if (opts.bitmap) {
    packedInput = opts.values.filter((_, idx) => opts.bitmap![idx]);
    const bLen = 6 + Math.ceil(opts.bitmap.length / 8);
    sec6 = new Uint8Array(bLen);
    new DataView(sec6.buffer).setUint32(0, bLen, false);
    sec6[4] = 6;
    sec6[5] = 0;
    opts.bitmap.forEach((present, idx) => {
      if (present) sec6[6 + (idx >> 3)] |= 0x80 >> (idx & 7);
    });
  } else {
    sec6 = new Uint8Array([0, 0, 0, 6, 6, 255]);
  }

  // Integer scale factors (E=0, D=0, R=minVal)
  const refVal = Math.min(...packedInput);
  const rawInts = packedInput.map((v) => Math.round(v - refVal));

  let sec5: Uint8Array;
  let sec7Payload: Uint8Array;

  if (opts.template === 0) {
    sec5 = new Uint8Array(21);
    const dv5 = new DataView(sec5.buffer);
    dv5.setUint32(0, 21, false);
    sec5[4] = 5;
    dv5.setUint32(5, packedInput.length, false);
    dv5.setUint16(9, 0, false);
    dv5.setFloat32(11, refVal, false);
    sec5.set(writeSignMag16(0), 15);
    sec5.set(writeSignMag16(0), 17);
    sec5[19] = 10;

    const bw = new BitWriter();
    for (const r of rawInts) bw.writeBits(r, 10);
    sec7Payload = bw.toUint8Array();
  } else if (opts.template === 3) {
    // Second-order spatial difference inside 1 group with extraOctets = 2
    const init0 = rawInts[0];
    const init1 = rawInts[1];
    const diffs = rawInts.map((_, idx) =>
      idx < 2 ? 0 : rawInts[idx] - 2 * rawInts[idx - 1] + rawInts[idx - 2]
    );
    const hMin = Math.min(...diffs);
    const shifted = diffs.map((d) => d - hMin);
    const bitsWidth = 8;

    sec5 = new Uint8Array(49);
    const dv5 = new DataView(sec5.buffer);
    dv5.setUint32(0, 49, false);
    sec5[4] = 5;
    dv5.setUint32(5, packedInput.length, false);
    dv5.setUint16(9, 3, false);
    dv5.setFloat32(11, refVal, false);
    sec5.set(writeSignMag16(0), 15);
    sec5.set(writeSignMag16(0), 17);
    sec5[19] = 10; // bpv for group ref
    dv5.setUint32(31, 1, false); // ng = 1
    sec5[35] = 0; // refGroupWidth
    sec5[36] = 4; // bitsGroupWidth
    dv5.setUint32(37, 0, false);
    sec5[41] = 1;
    dv5.setUint32(42, packedInput.length, false);
    sec5[46] = 4; // bitsGroupLength
    sec5[47] = 2; // order 2
    sec5[48] = 2; // 2 extra octets

    const extra = new Uint8Array(6);
    extra.set(writeSignMag16(init0), 0);
    extra.set(writeSignMag16(init1), 2);
    extra.set(writeSignMag16(hMin), 4);

    const bw = new BitWriter();
    bw.writeBits(0, 10); // group ref = 0
    bw.alignToByte();
    bw.writeBits(bitsWidth, 4); // group width = 8
    bw.alignToByte();
    bw.writeBits(0, 4); // group len (last group uses lastGroupLength)
    bw.alignToByte();
    for (const v of shifted) bw.writeBits(v, bitsWidth);
    const packedBits = bw.toUint8Array();

    sec7Payload = new Uint8Array(extra.length + packedBits.length);
    sec7Payload.set(extra, 0);
    sec7Payload.set(packedBits, extra.length);
  } else {
    // Template 42 CCSDS uncoded block (id = 15 for bpv=10)
    sec5 = new Uint8Array(25);
    const dv5 = new DataView(sec5.buffer);
    dv5.setUint32(0, 25, false);
    sec5[4] = 5;
    dv5.setUint32(5, packedInput.length, false);
    dv5.setUint16(9, 42, false);
    dv5.setFloat32(11, refVal, false);
    sec5.set(writeSignMag16(0), 15);
    sec5.set(writeSignMag16(0), 17);
    sec5[19] = 10;
    sec5[21] = 0x0a; // MSB + RESTRICTED, preprocess = false (raw blocks)
    sec5[22] = 32; // blockSize
    dv5.setUint16(23, 128, false);

    const bw = new BitWriter();
    bw.writeBits(15, 4); // uncoded block id=15
    for (const r of rawInts) bw.writeBits(r, 10);
    sec7Payload = bw.toUint8Array();
  }

  const sec7 = new Uint8Array(5 + sec7Payload.length);
  new DataView(sec7.buffer).setUint32(0, sec7.length, false);
  sec7[4] = 7;
  sec7.set(sec7Payload, 5);

  const totalLen =
    16 + sec1.length + sec3.length + sec4.length + sec5.length + sec6.length + sec7.length + 4;
  const out = new Uint8Array(totalLen);
  out[0] = 0x47;
  out[1] = 0x52;
  out[2] = 0x49;
  out[3] = 0x42;
  out[7] = 2;
  new DataView(out.buffer).setBigUint64(8, BigInt(totalLen), false);

  let pos = 16;
  for (const sec of [sec1, sec3, sec4, sec5, sec6, sec7]) {
    out.set(sec, pos);
    pos += sec.length;
  }
  out[pos] = 0x37;
  out[pos + 1] = 0x37;
  out[pos + 2] = 0x37;
  out[pos + 3] = 0x37;
  return out;
}

describe('Phase 2: Pure-TS GRIB2 Decoder, Cycle Selection & Global Wind Proxy API', () => {
  beforeEach(() => {
    clearGlobalWindCache();
    clearGlobalWindClientCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('decodes Template 5.0, Template 5.3 (GFS Spatial Diff), Template 5.42 (IFS CCSDS), and bitmaps accurately', () => {
    const sample = [12, 15, 19, 25, 22, 14, 11, 8];

    const simpleMsg = buildSyntheticGrib2Message({
      template: 0,
      initYear: 2026,
      initMonth: 11,
      initDay: 25,
      initHour: 6,
      forecastHours: 3,
      values: sample,
    });
    const decodedSimple = decodeWindGrib2Message(simpleMsg);
    expect(decodedSimple.initTimeUtc).toBe('2026-11-25T06:00:00.000Z');
    expect(decodedSimple.validTimeUtc).toBe('2026-11-25T09:00:00.000Z');
    expect(Array.from(decodedSimple.values)).toEqual(sample);

    const gfsMsg = buildSyntheticGrib2Message({ template: 3, values: sample });
    const decodedGfs = decodeWindGrib2Message(gfsMsg);
    expect(Array.from(decodedGfs.values)).toEqual(sample);

    const ifsMsg = buildSyntheticGrib2Message({
      template: 42,
      lo1Deg: 180,
      values: sample,
    });
    const decodedIfs = decodeWindGrib2Message(ifsMsg);
    expect(decodedIfs.lo1).toBe(180);
    expect(Array.from(decodedIfs.values)).toEqual(sample);

    // Bitmap masks index 2 and index 5 cleanly to NaN
    const bitmapMsg = buildSyntheticGrib2Message({
      template: 0,
      values: sample,
      bitmap: [true, true, false, true, true, false, true, true],
    });
    const decodedBmp = decodeWindGrib2Message(bitmapMsg);
    expect(Number.isNaN(decodedBmp.values[2])).toBe(true);
    expect(Number.isNaN(decodedBmp.values[5])).toBe(true);
    expect(decodedBmp.values[3]).toBe(25);
  });

  it('rejects malformed GRIB2 signatures, truncated streams, and untrusted upstream hosts loudly', () => {
    expect(() => decodeWindGrib2Message(new Uint8Array(64))).toThrow(/signature/i);
    expect(() =>
      assertSafeWindUpstreamUrl('http://noaa-gfs-bdp-pds.s3.amazonaws.com/foo')
    ).toThrow(/non-HTTPS/i);
    expect(() => assertSafeWindUpstreamUrl('https://evil.example.com/gfs')).toThrow(
      /untrusted wind upstream host/i
    );
    expect(() =>
      assertSafeWindUpstreamUrl('https://user:pass@noaa-gfs-bdp-pds.s3.amazonaws.com/foo')
    ).toThrow(/credentialed/i);

    const valid = buildSyntheticGrib2Message({ template: 0, values: [1, 2, 3, 4, 5, 6, 7, 8] });
    expect(() => decodeWindGrib2Message(valid.subarray(0, valid.length - 5))).toThrow();
  });

  it('parses GFS .idx and IFS .index inventories, selects valid cycles/steps, and handles 404 cycle step-back', () => {
    const fixedNow = Date.UTC(2026, 10, 25, 11, 0, 0); // 11:00Z -> lag 5h => 06Z GFS, lag 6h => 00Z IFS
    expect(selectLatestGfsCycle(fixedNow)).toEqual({ date: '20261125', hour: 6 });
    expect(selectLatestIfsCycle(fixedNow)).toEqual({ date: '20261125', hour: 0 });
    expect(nearestGfsStep(124)).toBe(123);
    expect(nearestIfsStep(10, 0)).toBe(9);
    expect(nearestIfsStep(400, 6)).toBe(144);

    const idx = parseGfsIdx(
      `1:0:d=2026112500:UGRD:10 m above ground:6 hour fcst:
2:1000:d=2026112500:VGRD:10 m above ground:6 hour fcst:
3:2000:d=2026112500:TMP:2 m above ground:6 hour fcst:
4:3000:d=2026112500:HGT:500 mb:6 hour fcst:`
    );
    expect(idx.messages).toHaveLength(4);
    expect(() => parseGfsIdx('<html>error</html>')).toThrow(/malformed/i);

    const ifsIdx = parseIfsIndex(
      `{"param":"10u","_offset":0,"_length":500}\n{"param":"10v","_offset":500,"_length":600}\nbad-json\n`
    );
    expect(ifsIdx).toHaveLength(2);
    expect(() => parseIfsIndex('not json')).toThrow(/malformed/i);
  });

  it('fetches, resamples (lo1=180 & lo1=0), deduplicates, falls back to stale cache, and exposes honest binary transport', async () => {
    const gfsValuesU = [5, 5, 5, 5, 5, 5, 5, 5];
    const gfsValuesV = [2, 2, 2, 2, 2, 2, 2, 2];
    const uBuf = buildSyntheticGrib2Message({
      template: 3,
      lo1Deg: 180,
      la1Deg: 90,
      diDeg: 90,
      djDeg: 180,
      initYear: 2026,
      initMonth: 11,
      initDay: 25,
      initHour: 0,
      forecastHours: 9,
      values: gfsValuesU,
    });
    const vBuf = buildSyntheticGrib2Message({
      template: 3,
      lo1Deg: 180,
      la1Deg: 90,
      diDeg: 90,
      djDeg: 180,
      initYear: 2026,
      initMonth: 11,
      initDay: 25,
      initHour: 0,
      forecastHours: 9,
      values: gfsValuesV,
    });

    const idxBody = [
      `1:0:d=2026112500:UGRD:10 m above ground:9 hour fcst:`,
      `2:${uBuf.byteLength}:d=2026112500:VGRD:10 m above ground:9 hour fcst:`,
      `3:${uBuf.byteLength + vBuf.byteLength}:d=2026112500:TMP:2 m above ground:9 hour fcst:`,
      `4:${uBuf.byteLength + vBuf.byteLength + 10}:d=2026112500:EOF:surface:9 hour fcst:`,
    ].join('\n');

    let calls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      const url = String(input);
      if (url.endsWith('.idx')) {
        // First cycle (06Z at 11Z now) 404s -> falls back to 00Z cleanly!
        if (url.includes('/06/')) {
          return new Response('', { status: 404 });
        }
        return new Response(idxBody, { status: 200 });
      }
      const rangeHeader = (init?.headers as Record<string, string>)?.Range;
      if (rangeHeader === `bytes=0-${uBuf.byteLength - 1}`) {
        return new Response(Buffer.from(uBuf), { status: 206 });
      }
      if (
        rangeHeader ===
        `bytes=${uBuf.byteLength}-${uBuf.byteLength + vBuf.byteLength - 1}`
      ) {
        return new Response(Buffer.from(vBuf), { status: 206 });
      }
      // Simulate failure on optional TMP range -> wind must still succeed honestly!
      return new Response('', { status: 500 });
    });

    const fixedNow = Date.UTC(2026, 10, 25, 11, 0, 0);
    // Test concurrent deduplication
    const [snap1, snap2] = await Promise.all([
      fetchGlobalWindSnapshot({
        model: 'gfs',
        overlay: 'temperature',
        now: () => fixedNow,
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
      fetchGlobalWindSnapshot({
        model: 'gfs',
        overlay: 'temperature',
        now: () => fixedNow,
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ]);

    expect(snap1.manifest.isAvailable).toBe(true);
    expect(snap2.manifest.isAvailable).toBe(true);
    expect(snap1.manifest.initTimeUtc).toBe('2026-11-25T00:00:00.000Z');
    expect(snap1.manifest.validTimeUtc).toBe('2026-11-25T09:00:00.000Z');
    expect(snap1.manifest.scalar).toBeNull();
    expect(snap1.manifest.scalarError).toContain('temperature');
    expect(snap1.u).toHaveLength(360 * 181);
    expect(snap1.u[0]).toBeCloseTo(5, 4);
    expect(snap1.v[0]).toBeCloseTo(2, 4);
    expect(calls).toBe(5); // 06z idx (404), 00z idx, u, v, tmp (single-flight shared!)

    // Binary encoding & cycle serving
    const bin = encodeGlobalWindBinaryGrid(snap1);
    expect(bin.byteLength).toBe(360 * 181 * 8);
    const byCycle = await fetchGlobalWindBinaryByCycle({
      model: 'gfs',
      overlay: 'temperature',
      date: '20261125',
      hour: 0,
      forecastHour: 9,
      now: () => fixedNow,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(byCycle.bytes.byteLength).toBe(bin.byteLength);

    // Advance beyond 30m TTL with upstream outage -> serves explicit stale cache
    const stale = await fetchGlobalWindSnapshot({
      model: 'gfs',
      overlay: 'temperature',
      now: () => fixedNow + 40 * 60_000,
      fetchImpl: vi.fn().mockRejectedValue(new Error('Network down')) as unknown as typeof fetch,
    });
    expect(stale.manifest.status).toBe('stale_cached');
    expect(stale.manifest.isStale).toBe(true);
    expect(stale.manifest.freshness).toBe('stale');
    expect(stale.manifest.isAvailable).toBe(true);
  });

  it('validates /api/environment/wind/global and /global/grid parameters and serves binary payloads securely', async () => {
    // Reject invalid model / overlay / date / hour / step
    expect(
      (await getGlobalManifest(new NextRequest('http://localhost/api/environment/wind/global?model=bad'))).status
    ).toBe(400);
    expect(
      (await getGlobalManifest(new NextRequest('http://localhost/api/environment/wind/global?overlay=bad'))).status
    ).toBe(400);
    expect(
      (await getGlobalManifest(new NextRequest('http://localhost/api/environment/wind/global?validTimeUtc=bad'))).status
    ).toBe(400);
    expect(
      (await getGlobalGrid(new NextRequest('http://localhost/api/environment/wind/global/grid?date=abc&hour=0&step=0'))).status
    ).toBe(400);
    expect(
      (await getGlobalGrid(new NextRequest('http://localhost/api/environment/wind/global/grid?date=20261125&hour=3&step=0'))).status
    ).toBe(400);

    // Upstream unavailable -> returns no-store unavailable manifest honestly
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Upstream unreachable')));
    const unavailRes = await getGlobalManifest(
      new NextRequest('http://localhost/api/environment/wind/global?model=ifs')
    );
    expect(unavailRes.status).toBe(200);
    expect(unavailRes.headers.get('Cache-Control')).toBe('no-store');
    const unavailJson = await unavailRes.json();
    expect(unavailJson.isAvailable).toBe(false);
    expect(unavailJson.freshness).toBe('unavailable');
  });

  it('client loader rejects tampered manifests/grid sizes and caches across Cesium <-> Three.js switches', async () => {
    expect(isValidWindManifest({ schemaVersion: 2, model: 'gfs', gridUrl: 'https://evil.com/x' }, 'gfs', 'none')).toBe(false);

    const w = 4;
    const h = 3;
    const count = w * h;
    const payload = new Float32Array(count * 2).fill(7);
    const validManifest = {
      schemaVersion: 2,
      model: 'ifs',
      modelName: 'ECMWF IFS',
      provider: 'ECMWF',
      initTimeUtc: '2026-11-25T00:00:00.000Z',
      validTimeUtc: '2026-11-25T06:00:00.000Z',
      forecastHour: 6,
      retrievedAtUtc: '2026-11-25T06:01:00.000Z',
      grid: {
        width: w,
        height: h,
        lo1: 0,
        la1: 90,
        dx: 90,
        dy: 90,
        bounds: { west: -180, south: -90, east: 180, north: 90 },
        resolutionDeg: 90,
        nativeResolutionDeg: 0.25,
      },
      level: '10 m above ground',
      units: 'm/s',
      overlay: 'none',
      scalar: null,
      scalarError: null,
      status: 'available',
      freshness: 'current',
      ageMinutes: 1,
      isAvailable: true,
      isCached: false,
      isStale: false,
      unavailableReason: null,
      attribution: 'ECMWF',
      license: 'CC BY 4.0',
      cycle: { date: '20261125', hour: 0, forecastHour: 6 },
      gridUrl: '/api/environment/wind/global/grid?model=ifs&overlay=none&date=20261125&hour=0&step=6',
    };

    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).startsWith('/api/environment/wind/global/grid')) {
        return new Response(payload.buffer, { status: 200 });
      }
      return new Response(JSON.stringify(validManifest), { status: 200 });
    });

    const first = await fetchClientGlobalWindSnapshot({
      model: 'ifs',
      overlay: 'none',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(first.snapshot).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Second read (e.g., switching engine Cesium -> Three.js or Flow -> Speed) hits client cache cleanly
    const second = await fetchClientGlobalWindSnapshot({
      model: 'ifs',
      overlay: 'speed',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(second.snapshot).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Non-finite binary payload is rejected explicitly
    clearGlobalWindClientCache();
    const corrupt = new Float32Array(count * 2).fill(Number.NaN);
    const corruptFetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).startsWith('/api/environment/wind/global/grid')) {
        return new Response(corrupt.buffer, { status: 200 });
      }
      return new Response(JSON.stringify(validManifest), { status: 200 });
    });
    const failed = await fetchClientGlobalWindSnapshot({
      model: 'ifs',
      overlay: 'none',
      fetchImpl: corruptFetch as unknown as typeof fetch,
    });
    expect(failed.snapshot).toBeNull();
    expect(failed.error).toMatch(/non-finite/i);
  });
});

function createDynamicWindMockFetch(options?: {
  mode?: 'gfs' | 'ifs';
  failStatus?: number;
  gate?: Promise<void>;
  onSignalAbort?: () => void;
  onStepRequest?: (stepHour: number) => void;
}) {
  const mode = options?.mode ?? 'gfs';
  let idxCalls = 0;
  let rangeCalls = 0;

  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const sig = init?.signal;

    if (sig?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    let abortListener: (() => void) | null = null;
    try {
      if (options?.gate) {
        await new Promise<void>((resolve, reject) => {
          if (sig?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }
          abortListener = () => {
            options.onSignalAbort?.();
            reject(new DOMException('Aborted', 'AbortError'));
          };
          sig?.addEventListener('abort', abortListener, { once: true });
          void options.gate!.then(resolve, reject);
        });
      } else if (options?.onSignalAbort && sig) {
        sig.addEventListener('abort', options.onSignalAbort, { once: true });
      }
    } finally {
      if (abortListener && sig) {
        sig.removeEventListener('abort', abortListener);
      }
    }

    if (options?.failStatus && options.failStatus >= 500) {
      return new Response('', { status: options.failStatus });
    }

    if (mode === 'gfs') {
      const fMatch = url.match(/\.f(\d{3})(?:\.idx)?$/);
      const stepHour = fMatch ? Number(fMatch[1]) : 0;
      const cycleMatch = url.match(/\/gfs\.(\d{8})\/(\d{2})\//);
      const dateStr = cycleMatch ? cycleMatch[1] : '20261125';
      const hourNum = cycleMatch ? Number(cycleMatch[2]) : 0;
      const uBuf = buildSyntheticGrib2Message({
        template: 0,
        initYear: Number(dateStr.slice(0, 4)),
        initMonth: Number(dateStr.slice(4, 6)),
        initDay: Number(dateStr.slice(6, 8)),
        initHour: hourNum,
        forecastHours: stepHour,
        values: Array(8).fill(5 + (stepHour % 10)),
      });
      const vBuf = buildSyntheticGrib2Message({
        template: 0,
        initYear: Number(dateStr.slice(0, 4)),
        initMonth: Number(dateStr.slice(4, 6)),
        initDay: Number(dateStr.slice(6, 8)),
        initHour: hourNum,
        forecastHours: stepHour,
        values: Array(8).fill(2),
      });

      if (url.endsWith('.idx')) {
        idxCalls++;
        options?.onStepRequest?.(stepHour);
        const idxText = [
          `1:0:d=${dateStr}00:UGRD:10 m above ground:${stepHour} hour fcst:`,
          `2:${uBuf.byteLength}:d=${dateStr}00:VGRD:10 m above ground:${stepHour} hour fcst:`,
          `3:${uBuf.byteLength + vBuf.byteLength}:d=${dateStr}00:EOF:surface:${stepHour} hour fcst:`,
        ].join('\n');
        return new Response(idxText, { status: 200 });
      }

      rangeCalls++;
      const rangeHeader = (init?.headers as Record<string, string>)?.Range;
      if (rangeHeader === `bytes=0-${uBuf.byteLength - 1}`) {
        return new Response(Buffer.from(uBuf), { status: 206 });
      }
      return new Response(Buffer.from(vBuf), { status: 206 });
    }

    // IFS mock
    const fMatch = url.match(/-(\d+)h-oper-fc\.(index|grib2)$/);
    const stepHour = fMatch ? Number(fMatch[1]) : 0;
    const cycleMatch = url.match(/\/(\d{8})\/(\d{2})z\//);
    const dateStr = cycleMatch ? cycleMatch[1] : '20261125';
    const hourNum = cycleMatch ? Number(cycleMatch[2]) : 0;
    const uBuf = buildSyntheticGrib2Message({
      template: 0,
      lo1Deg: 180,
      initYear: Number(dateStr.slice(0, 4)),
      initMonth: Number(dateStr.slice(4, 6)),
      initDay: Number(dateStr.slice(6, 8)),
      initHour: hourNum,
      forecastHours: stepHour,
      values: Array(8).fill(4 + (stepHour % 7)),
    });
    const vBuf = buildSyntheticGrib2Message({
      template: 0,
      lo1Deg: 180,
      initYear: Number(dateStr.slice(0, 4)),
      initMonth: Number(dateStr.slice(4, 6)),
      initDay: Number(dateStr.slice(6, 8)),
      initHour: hourNum,
      forecastHours: stepHour,
      values: Array(8).fill(-1),
    });

    if (url.endsWith('.index')) {
      idxCalls++;
      options?.onStepRequest?.(stepHour);
      const body = [
        JSON.stringify({ param: '10u', _offset: 0, _length: uBuf.byteLength }),
        JSON.stringify({ param: '10v', _offset: uBuf.byteLength, _length: vBuf.byteLength }),
      ].join('\n');
      return new Response(body, { status: 200 });
    }

    rangeCalls++;
    const rangeHeader = (init?.headers as Record<string, string>)?.Range;
    if (rangeHeader === `bytes=0-${uBuf.byteLength - 1}`) {
      return new Response(Buffer.from(uBuf), { status: 206 });
    }
    return new Response(Buffer.from(vBuf), { status: 206 });
  });

  return {
    mock,
    getIdxCalls: () => idxCalls,
    getRangeCalls: () => rangeCalls,
  };
}

describe('PR #42 Blocker 1: Shared Wind Request Cancellation Isolation', () => {
  beforeEach(() => {
    clearGlobalWindCache();
    clearGlobalWindClientCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('Test A: shares upstream work across concurrent callers and returns valid results to both', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const harness = createDynamicWindMockFetch({ gate });
    const fixedNow = Date.UTC(2026, 10, 25, 11, 0, 0);

    const p1 = fetchGlobalWindSnapshot({
      model: 'gfs',
      now: () => fixedNow,
      fetchImpl: harness.mock as unknown as typeof fetch,
    });
    const p2 = fetchGlobalWindSnapshot({
      model: 'gfs',
      now: () => fixedNow,
      fetchImpl: harness.mock as unknown as typeof fetch,
    });

    expect(getGlobalWindCacheStats().inflightCount).toBe(1);
    release();
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1.manifest.isAvailable).toBe(true);
    expect(r2.manifest.isAvailable).toBe(true);
    expect(r1.u[0]).toBeCloseTo(r2.u[0], 4);
    expect(harness.getIdxCalls()).toBe(1);
    expect(harness.getRangeCalls()).toBe(2);
    expect(getGlobalWindCacheStats().inflightCount).toBe(0);
    expect(getGlobalWindCacheStats().failureCount).toBe(0);
  });

  it('Test B: cancelling Client A does NOT cancel Client B or upstream work', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let upstreamAborted = false;
    const harness = createDynamicWindMockFetch({
      gate,
      onSignalAbort: () => {
        upstreamAborted = true;
      },
    });
    const fixedNow = Date.UTC(2026, 10, 25, 11, 0, 0);

    const acA = new AbortController();
    const acB = new AbortController();

    const pA = fetchGlobalWindSnapshot({
      model: 'gfs',
      now: () => fixedNow,
      fetchImpl: harness.mock as unknown as typeof fetch,
      signal: acA.signal,
    });
    const pB = fetchGlobalWindSnapshot({
      model: 'gfs',
      now: () => fixedNow,
      fetchImpl: harness.mock as unknown as typeof fetch,
      signal: acB.signal,
    });

    acA.abort();
    await expect(pA).rejects.toMatchObject({ name: 'AbortError' });

    // Upstream work must still be active for Client B, with zero failure backoff recorded
    expect(upstreamAborted).toBe(false);
    expect(getGlobalWindCacheStats().inflightCount).toBe(1);
    expect(getGlobalWindCacheStats().failureCount).toBe(0);

    release();
    const resB = await pB;
    expect(resB.manifest.isAvailable).toBe(true);
    expect(resB.manifest.status).toBe('available');
    expect(getGlobalWindCacheStats().inflightCount).toBe(0);
    expect(getGlobalWindCacheStats().failureCount).toBe(0);
    expect(getGlobalWindCacheStats().snapshotCount).toBe(1);
  });

  it('Test C: caller cancellation never poisons subsequent healthy requests with 60s failure backoff', async () => {
    let releaseSlow!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });
    let upstreamAborted = false;
    const cancelledFetch = createDynamicWindMockFetch({
      gate,
      onSignalAbort: () => {
        upstreamAborted = true;
      },
    });
    const fixedNow = Date.UTC(2026, 10, 25, 11, 0, 0);

    const acSolo = new AbortController();
    const soloPromise = fetchGlobalWindSnapshot({
      model: 'gfs',
      now: () => fixedNow,
      fetchImpl: cancelledFetch.mock as unknown as typeof fetch,
      signal: acSolo.signal,
    });

    acSolo.abort();
    await expect(soloPromise).rejects.toMatchObject({ name: 'AbortError' });
    expect(upstreamAborted).toBe(true);
    expect(getGlobalWindCacheStats().failureCount).toBe(0);
    expect(getGlobalWindCacheStats().inflightCount).toBe(0);

    // Next request 500ms later MUST NOT hit 60s cooldown
    const healthyFetch = createDynamicWindMockFetch();
    const recovered = await fetchGlobalWindSnapshot({
      model: 'gfs',
      now: () => fixedNow + 500,
      fetchImpl: healthyFetch.mock as unknown as typeof fetch,
    });
    expect(recovered.manifest.isAvailable).toBe(true);
    expect(healthyFetch.getIdxCalls()).toBe(1);

    // Also verify HTTP route returns 499 cleanly without poisoning availability when req.signal aborts
    clearGlobalWindCache();
    let routeUpstreamAborted = false;
    vi.stubGlobal(
      'fetch',
      createDynamicWindMockFetch({
        gate: new Promise(() => {}),
        onSignalAbort: () => {
          routeUpstreamAborted = true;
        },
      }).mock as unknown as typeof fetch
    );
    const reqAc = new AbortController();
    const routePromise = getGlobalManifest(
      new NextRequest('http://localhost/api/environment/wind/global?model=gfs', {
        signal: reqAc.signal,
      })
    );
    await Promise.resolve();
    reqAc.abort();
    const abortedResp = await routePromise;
    expect(abortedResp.status).toBe(499);
    expect(routeUpstreamAborted).toBe(true);
    expect(getGlobalWindCacheStats().failureCount).toBe(0);
    expect(getGlobalWindCacheStats().inflightCount).toBe(0);
    releaseSlow?.();
  });

  it('Test D: genuine upstream failure still triggers 60-second negative-cache backoff', async () => {
    const fixedNow = Date.UTC(2026, 10, 25, 11, 0, 0);
    const failingFetch = vi.fn().mockRejectedValue(new Error('Upstream socket failure'));

    const fail1 = await fetchGlobalWindSnapshot({
      model: 'gfs',
      now: () => fixedNow,
      fetchImpl: failingFetch as unknown as typeof fetch,
    });
    expect(fail1.manifest.isAvailable).toBe(false);
    expect(fail1.manifest.status).toBe('temporarily_unavailable');
    expect(getGlobalWindCacheStats().failureCount).toBe(1);

    const callsAtFail = failingFetch.mock.calls.length;
    // Retry 10s later -> blocked by 60s backoff cooldown without hitting upstream
    const fail2 = await fetchGlobalWindSnapshot({
      model: 'gfs',
      now: () => fixedNow + 10_000,
      fetchImpl: failingFetch as unknown as typeof fetch,
    });
    expect(fail2.manifest.isAvailable).toBe(false);
    expect(failingFetch.mock.calls.length).toBe(callsAtFail);

    // After 61s cooldown expires -> allows healthy upstream retry
    const healthyFetch = createDynamicWindMockFetch();
    const ok = await fetchGlobalWindSnapshot({
      model: 'gfs',
      now: () => fixedNow + 61_000,
      fetchImpl: healthyFetch.mock as unknown as typeof fetch,
    });
    expect(ok.manifest.isAvailable).toBe(true);
    expect(getGlobalWindCacheStats().failureCount).toBe(0);
  });

  it('Test E: completed, cancelled, and failed operations leave zero stale in-flight entries', async () => {
    const fixedNow = Date.UTC(2026, 10, 25, 11, 0, 0);

    // 1. Completed
    const okHarness = createDynamicWindMockFetch();
    await fetchGlobalWindSnapshot({
      model: 'gfs',
      now: () => fixedNow,
      fetchImpl: okHarness.mock as unknown as typeof fetch,
    });
    expect(getGlobalWindCacheStats().inflightCount).toBe(0);

    // 2. Cancelled
    clearGlobalWindCache();
    const cancelAc = new AbortController();
    const pendingHarness = createDynamicWindMockFetch({ gate: new Promise(() => {}) });
    const cancelledCall = fetchGlobalWindSnapshot({
      model: 'gfs',
      now: () => fixedNow,
      fetchImpl: pendingHarness.mock as unknown as typeof fetch,
      signal: cancelAc.signal,
    });
    expect(getGlobalWindCacheStats().inflightCount).toBe(1);
    cancelAc.abort();
    await expect(cancelledCall).rejects.toMatchObject({ name: 'AbortError' });
    expect(getGlobalWindCacheStats().inflightCount).toBe(0);

    // 3. Failed
    const errCall = await fetchGlobalWindSnapshot({
      model: 'ifs',
      now: () => fixedNow,
      fetchImpl: vi.fn().mockRejectedValue(new Error('503')) as unknown as typeof fetch,
    });
    expect(errCall.manifest.isAvailable).toBe(false);
    expect(getGlobalWindCacheStats().inflightCount).toBe(0);
  });
});

describe('PR #42 Blocker 2: Bounded Forecast Caches & Horizon Validation', () => {
  beforeEach(() => {
    clearGlobalWindCache();
    clearGlobalWindClientCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('Test A: strictly bounds snapshot, alias, and failure caches under > capacity distinct requests', async () => {
    const fixedNow = Date.UTC(2026, 10, 25, 11, 0, 0);
    const harness = createDynamicWindMockFetch({ mode: 'gfs' });

    const countToInsert = GLOBAL_WIND_CACHE_MAX_SNAPSHOTS + 10;
    for (let h = 0; h < countToInsert; h++) {
      const targetIso = new Date(Date.UTC(2026, 10, 25, 6, 0, 0) + h * 3600_000).toISOString();
      const snap = await fetchGlobalWindSnapshot({
        model: 'gfs',
        targetValidTimeUtc: targetIso,
        now: () => fixedNow,
        fetchImpl: harness.mock as unknown as typeof fetch,
      });
      expect(snap.manifest.isAvailable).toBe(true);
    }

    const stats = getGlobalWindCacheStats();
    expect(stats.snapshotCount).toBe(GLOBAL_WIND_CACHE_MAX_SNAPSHOTS);
    expect(stats.aliasCount).toBeLessThanOrEqual(GLOBAL_WIND_CACHE_MAX_ALIASES);

    // Also verify negative backoff map stays bounded <= GLOBAL_WIND_FAILURE_CACHE_MAX_ENTRIES
    const failingMock = vi.fn().mockRejectedValue(new Error('down'));
    for (let h = 0; h < GLOBAL_WIND_FAILURE_CACHE_MAX_ENTRIES + 12; h++) {
      const targetIso = new Date(Date.UTC(2026, 10, 25, 6, 0, 0) + h * 3600_000).toISOString();
      await fetchGlobalWindSnapshot({
        model: 'ifs',
        targetValidTimeUtc: targetIso,
        now: () => fixedNow,
        fetchImpl: failingMock as unknown as typeof fetch,
      });
    }
    expect(getGlobalWindCacheStats().failureCount).toBeLessThanOrEqual(
      GLOBAL_WIND_FAILURE_CACHE_MAX_ENTRIES
    );
  });

  it('Test B: evicts LRU entries on overflow, removes expired entries cleanly, and spares active in-flight work', async () => {
    const fixedNow = Date.UTC(2026, 10, 25, 11, 0, 0);
    const requestedSteps: number[] = [];
    const harness = createDynamicWindMockFetch({
      mode: 'gfs',
      onStepRequest: (step) => requestedSteps.push(step),
    });

    // Fill capacity with f000..f023
    for (let h = 0; h < GLOBAL_WIND_CACHE_MAX_SNAPSHOTS; h++) {
      await fetchGlobalWindSnapshot({
        model: 'gfs',
        targetValidTimeUtc: new Date(Date.UTC(2026, 10, 25, 6, 0, 0) + h * 3600_000).toISOString(),
        now: () => fixedNow + h,
        fetchImpl: harness.mock as unknown as typeof fetch,
      });
    }

    // Touch f000 so it moves to MRU, leaving f001 as oldest LRU head
    requestedSteps.length = 0;
    await fetchGlobalWindSnapshot({
      model: 'gfs',
      targetValidTimeUtc: '2026-11-25T06:00:00.000Z',
      now: () => fixedNow + 100,
      fetchImpl: harness.mock as unknown as typeof fetch,
    });
    expect(requestedSteps).toHaveLength(0);

    // Start an active in-flight fetch on f030 BEFORE overflowing/pruning
    let releaseInflight!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseInflight = resolve;
    });
    const slowHarness = createDynamicWindMockFetch({ mode: 'gfs', gate });
    const inflightPromise = fetchGlobalWindSnapshot({
      model: 'gfs',
      targetValidTimeUtc: new Date(Date.UTC(2026, 10, 25, 6, 0, 0) + 30 * 3600_000).toISOString(),
      now: () => fixedNow + 200,
      fetchImpl: slowHarness.mock as unknown as typeof fetch,
    });
    expect(getGlobalWindCacheStats().inflightCount).toBe(1);

    // Insert f024 -> must evict f001 (not touched f000) and never delete inflight f030!
    await fetchGlobalWindSnapshot({
      model: 'gfs',
      targetValidTimeUtc: new Date(
        Date.UTC(2026, 10, 25, 6, 0, 0) + GLOBAL_WIND_CACHE_MAX_SNAPSHOTS * 3600_000
      ).toISOString(),
      now: () => fixedNow + 300,
      fetchImpl: harness.mock as unknown as typeof fetch,
    });
    expect(getGlobalWindCacheStats().inflightCount).toBe(1);

    // Explicit prune at expired age removes expired cache entries while preserving active inflight
    const prunedNoneYet = pruneExpiredGlobalWindCache(fixedNow + 1000);
    expect(prunedNoneYet.evictedSnapshots).toBe(0);
    expect(getGlobalWindCacheStats().inflightCount).toBe(1);

    // f000 still hits cache; f001 was evicted and requires fresh upstream call
    requestedSteps.length = 0;
    await fetchGlobalWindSnapshot({
      model: 'gfs',
      targetValidTimeUtc: '2026-11-25T06:00:00.000Z',
      now: () => fixedNow + 400,
      fetchImpl: harness.mock as unknown as typeof fetch,
    });
    expect(requestedSteps).toHaveLength(0);

    await fetchGlobalWindSnapshot({
      model: 'gfs',
      targetValidTimeUtc: '2026-11-25T07:00:00.000Z',
      now: () => fixedNow + 500,
      fetchImpl: harness.mock as unknown as typeof fetch,
    });
    expect(requestedSteps).toEqual([1]);

    // Finish active inflight cleanly and verify expiry pruning removes past-max-stale entries
    releaseInflight();
    const inflightResult = await inflightPromise;
    expect(inflightResult.manifest.isAvailable).toBe(true);
    expect(getGlobalWindCacheStats().inflightCount).toBe(0);

    const prunedOld = pruneExpiredGlobalWindCache(fixedNow + GLOBAL_WIND_CACHE_MAX_STALE_MS + 60_000);
    expect(prunedOld.evictedSnapshots).toBe(GLOBAL_WIND_CACHE_MAX_SNAPSHOTS);
    expect(getGlobalWindCacheStats().snapshotCount).toBe(0);
  });

  it('Test C & D: reuses cached data and deduplicates distinct timestamps resolving to the same cycle/step', async () => {
    const fixedNow = Date.UTC(2026, 10, 25, 11, 0, 0); // IFS 00z cycle
    const ifsHarness = createDynamicWindMockFetch({ mode: 'ifs' });

    // All three timestamps (08:20Z, 09:00Z, 09:40Z) snap onto IFS 00z step f009 (09:00Z)
    const s1 = await fetchGlobalWindSnapshot({
      model: 'ifs',
      targetValidTimeUtc: '2026-11-25T08:20:00.000Z',
      now: () => fixedNow,
      fetchImpl: ifsHarness.mock as unknown as typeof fetch,
    });
    const s2 = await fetchGlobalWindSnapshot({
      model: 'ifs',
      targetValidTimeUtc: '2026-11-25T09:00:00.000Z',
      now: () => fixedNow + 5000,
      fetchImpl: ifsHarness.mock as unknown as typeof fetch,
    });
    const s3 = await fetchGlobalWindSnapshot({
      model: 'ifs',
      targetValidTimeUtc: '2026-11-25T09:40:00.000Z',
      now: () => fixedNow + 10_000,
      fetchImpl: ifsHarness.mock as unknown as typeof fetch,
    });

    expect(s1.manifest.validTimeUtc).toBe('2026-11-25T09:00:00.000Z');
    expect(s2.manifest.validTimeUtc).toBe('2026-11-25T09:00:00.000Z');
    expect(s3.manifest.validTimeUtc).toBe('2026-11-25T09:00:00.000Z');
    expect(s2.manifest.isCached).toBe(true);
    expect(s3.manifest.isCached).toBe(true);
    expect(ifsHarness.getIdxCalls()).toBe(1);
    expect(getGlobalWindCacheStats().snapshotCount).toBe(1);

    // GFS 3-hourly horizon (>120h): +122h and +124h both resolve to f123
    clearGlobalWindCache();
    const gfsHarness = createDynamicWindMockFetch({ mode: 'gfs' });
    const t122 = new Date(Date.UTC(2026, 10, 25, 6, 0, 0) + 122 * 3600_000).toISOString();
    const t124 = new Date(Date.UTC(2026, 10, 25, 6, 0, 0) + 124 * 3600_000).toISOString();
    await fetchGlobalWindSnapshot({
      model: 'gfs',
      targetValidTimeUtc: t122,
      now: () => fixedNow,
      fetchImpl: gfsHarness.mock as unknown as typeof fetch,
    });
    const reuse124 = await fetchGlobalWindSnapshot({
      model: 'gfs',
      targetValidTimeUtc: t124,
      now: () => fixedNow,
      fetchImpl: gfsHarness.mock as unknown as typeof fetch,
    });
    expect(reuse124.manifest.forecastHour).toBe(123);
    expect(reuse124.manifest.isCached).toBe(true);
    expect(gfsHarness.getIdxCalls()).toBe(1);
    expect(getGlobalWindCacheStats().snapshotCount).toBe(1);

    // Binary cycle fetch reuses the warm cycle cache too
    const bin = await fetchGlobalWindBinaryByCycle({
      model: 'gfs',
      overlay: 'none',
      date: '20261125',
      hour: 6,
      forecastHour: 123,
      now: () => fixedNow,
      fetchImpl: gfsHarness.mock as unknown as typeof fetch,
    });
    expect(bin.bytes.byteLength).toBe(360 * 181 * 8);
    expect(gfsHarness.getIdxCalls()).toBe(1);
  });

  it('Test E: rejects out-of-range timestamps clearly while preserving legitimate diurnal & horizon requests', async () => {
    const fixedNow = Date.UTC(2026, 10, 25, 11, 0, 0);

    // Way too far in future (>384h GFS / >360h IFS) and past (<-24h)
    const farFuture = new Date(fixedNow + 500 * 3600_000).toISOString();
    const farPast = new Date(fixedNow - 48 * 3600_000).toISOString();

    await expect(
      fetchGlobalWindSnapshot({
        model: 'gfs',
        targetValidTimeUtc: farFuture,
        now: () => fixedNow,
      })
    ).rejects.toBeInstanceOf(WindForecastRangeError);

    await expect(
      fetchGlobalWindSnapshot({
        model: 'ifs',
        targetValidTimeUtc: farPast,
        now: () => fixedNow,
      })
    ).rejects.toBeInstanceOf(WindForecastRangeError);

    expect(getGlobalWindCacheStats().snapshotCount).toBe(0);
    expect(getGlobalWindCacheStats().failureCount).toBe(0);

    // Direct validator rejects out-of-range and accepts valid operational steps including -18h diurnal & +360h
    expect(
      validateForecastTargetTime({
        model: 'gfs',
        targetValidTimeUtc: '2099-01-01T00:00:00Z',
        nowMs: fixedNow,
      }).ok
    ).toBe(false);
    expect(
      validateForecastTargetTime({
        model: 'gfs',
        targetValidTimeUtc: new Date(fixedNow - 18 * 3600_000).toISOString(),
        nowMs: fixedNow,
      }).ok
    ).toBe(true);
    expect(
      validateForecastTargetTime({
        model: 'ifs',
        targetValidTimeUtc: new Date(fixedNow + 120 * 3600_000).toISOString(),
        nowMs: fixedNow,
      }).ok
    ).toBe(true);

    // Route /api/environment/wind/global returns HTTP 400 with structured error on out-of-horizon validTimeUtc
    const outOfRangeRes = await getGlobalManifest(
      new NextRequest('http://localhost/api/environment/wind/global?model=gfs&validTimeUtc=2099-01-01T00:00:00Z')
    );
    expect(outOfRangeRes.status).toBe(400);
    const errJson = await outOfRangeRes.json();
    expect(errJson.code).toBe('FORECAST_HORIZON_OUT_OF_RANGE');

    // Route /grid rejects invalid IFS 06z step > 144h
    const badIfsGridRes = await getGlobalGrid(
      new NextRequest('http://localhost/api/environment/wind/global/grid?model=ifs&date=20261125&hour=6&step=200')
    );
    expect(badIfsGridRes.status).toBe(400);
  });

  it('Test F: preserves stale-cached fallback during outages within max stale age and expires beyond max stale age', async () => {
    const fixedNow = Date.UTC(2026, 10, 25, 11, 0, 0);
    const harness = createDynamicWindMockFetch({ mode: 'gfs' });

    const live = await fetchGlobalWindSnapshot({
      model: 'gfs',
      now: () => fixedNow,
      fetchImpl: harness.mock as unknown as typeof fetch,
    });
    expect(live.manifest.status).toBe('available');

    // 45 minutes later (past 30m TTL, within 6h max stale retention) -> stale_cached fallback
    const stale = await fetchGlobalWindSnapshot({
      model: 'gfs',
      now: () => fixedNow + 45 * 60_000,
      fetchImpl: vi.fn().mockRejectedValue(new Error('Upstream outage')) as unknown as typeof fetch,
    });
    expect(stale.manifest.status).toBe('stale_cached');
    expect(stale.manifest.isStale).toBe(true);
    expect(stale.manifest.freshness).toBe('stale');
    expect(stale.manifest.isAvailable).toBe(true);

    // 7 hours later (> 6h max stale age) -> hard-expired and NOT served as indefinitely stale data
    const expired = await fetchGlobalWindSnapshot({
      model: 'gfs',
      now: () => fixedNow + 7 * 3600_000,
      fetchImpl: vi.fn().mockRejectedValue(new Error('Upstream outage')) as unknown as typeof fetch,
    });
    expect(expired.manifest.isAvailable).toBe(false);
    expect(expired.manifest.freshness).toBe('unavailable');
  });
});

function encodeDistinctWindPayloadU(dateStr: string, initHour: number, stepHour: number): number {
  const day = Number(dateStr.slice(6, 8));
  // Unique positive wind m/s encoding day, cycle hour, and forecast lead
  return Number((day + initHour / 100 + stepHour / 10000).toFixed(4));
}

function createHistoricalCycleAwareFetch(options?: {
  mode?: 'gfs' | 'ifs';
  unavailableCycles?: Set<string>;
}) {
  const mode = options?.mode ?? 'gfs';
  const requests: Array<{ date: string; hour: number; step: number }> = [];

  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (mode === 'gfs') {
      const fMatch = url.match(/\.f(\d{3})(?:\.idx)?$/);
      const stepHour = fMatch ? Number(fMatch[1]) : 0;
      const cycleMatch = url.match(/\/gfs\.(\d{8})\/(\d{2})\//);
      const dateStr = cycleMatch ? cycleMatch[1] : '20261125';
      const hourNum = cycleMatch ? Number(cycleMatch[2]) : 0;
      const cycleTag = `${dateStr}-${String(hourNum).padStart(2, '0')}`;

      if (options?.unavailableCycles?.has(cycleTag)) {
        if (url.endsWith('.idx')) {
          requests.push({ date: dateStr, hour: hourNum, step: stepHour });
        }
        return new Response('', { status: 404 });
      }

      const distinctU = encodeDistinctWindPayloadU(dateStr, hourNum, stepHour);
      const uBuf = buildSyntheticGrib2Message({
        template: 0,
        initYear: Number(dateStr.slice(0, 4)),
        initMonth: Number(dateStr.slice(4, 6)),
        initDay: Number(dateStr.slice(6, 8)),
        initHour: hourNum,
        forecastHours: stepHour,
        values: Array(8).fill(distinctU),
      });
      const vBuf = buildSyntheticGrib2Message({
        template: 0,
        initYear: Number(dateStr.slice(0, 4)),
        initMonth: Number(dateStr.slice(4, 6)),
        initDay: Number(dateStr.slice(6, 8)),
        initHour: hourNum,
        forecastHours: stepHour,
        values: Array(8).fill(-3),
      });

      if (url.endsWith('.idx')) {
        requests.push({ date: dateStr, hour: hourNum, step: stepHour });
        const idxText = [
          `1:0:d=${dateStr}00:UGRD:10 m above ground:${stepHour} hour fcst:`,
          `2:${uBuf.byteLength}:d=${dateStr}00:VGRD:10 m above ground:${stepHour} hour fcst:`,
          `3:${uBuf.byteLength + vBuf.byteLength}:d=${dateStr}00:EOF:surface:${stepHour} hour fcst:`,
        ].join('\n');
        return new Response(idxText, { status: 200 });
      }

      const rangeHeader = (init?.headers as Record<string, string>)?.Range;
      if (rangeHeader === `bytes=0-${uBuf.byteLength - 1}`) {
        return new Response(Buffer.from(uBuf), { status: 206 });
      }
      return new Response(Buffer.from(vBuf), { status: 206 });
    }

    // IFS cycle-aware mock
    const fMatch = url.match(/-(\d+)h-oper-fc\.(index|grib2)$/);
    const stepHour = fMatch ? Number(fMatch[1]) : 0;
    const cycleMatch = url.match(/\/(\d{8})\/(\d{2})z\//);
    const dateStr = cycleMatch ? cycleMatch[1] : '20261125';
    const hourNum = cycleMatch ? Number(cycleMatch[2]) : 0;
    const cycleTag = `${dateStr}-${String(hourNum).padStart(2, '0')}`;

    if (options?.unavailableCycles?.has(cycleTag)) {
      if (url.endsWith('.index')) {
        requests.push({ date: dateStr, hour: hourNum, step: stepHour });
      }
      return new Response('', { status: 404 });
    }

    const distinctU = encodeDistinctWindPayloadU(dateStr, hourNum, stepHour);
    const uBuf = buildSyntheticGrib2Message({
      template: 0,
      lo1Deg: 180,
      initYear: Number(dateStr.slice(0, 4)),
      initMonth: Number(dateStr.slice(4, 6)),
      initDay: Number(dateStr.slice(6, 8)),
      initHour: hourNum,
      forecastHours: stepHour,
      values: Array(8).fill(distinctU),
    });
    const vBuf = buildSyntheticGrib2Message({
      template: 0,
      lo1Deg: 180,
      initYear: Number(dateStr.slice(0, 4)),
      initMonth: Number(dateStr.slice(4, 6)),
      initDay: Number(dateStr.slice(6, 8)),
      initHour: hourNum,
      forecastHours: stepHour,
      values: Array(8).fill(-2),
    });

    if (url.endsWith('.index')) {
      requests.push({ date: dateStr, hour: hourNum, step: stepHour });
      const body = [
        JSON.stringify({ param: '10u', _offset: 0, _length: uBuf.byteLength }),
        JSON.stringify({ param: '10v', _offset: uBuf.byteLength, _length: vBuf.byteLength }),
      ].join('\n');
      return new Response(body, { status: 200 });
    }

    const rangeHeader = (init?.headers as Record<string, string>)?.Range;
    if (rangeHeader === `bytes=0-${uBuf.byteLength - 1}`) {
      return new Response(Buffer.from(uBuf), { status: 206 });
    }
    return new Response(Buffer.from(vBuf), { status: 206 });
  });

  return { mock, requests };
}

describe('PR #42 Final Fix: Historical Wind Forecast Cycle Accuracy', () => {
  beforeEach(() => {
    clearGlobalWindCache();
    clearGlobalWindClientCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('Test 1: previously failing historical request (2026-11-24T17:00Z at now=2026-11-25T11:00Z) selects historical 2026-11-24T12:00Z f005 instead of 2026-11-25T06:00Z f000', async () => {
    const fixedNow = Date.UTC(2026, 10, 25, 11, 0, 0);
    const harness = createHistoricalCycleAwareFetch({ mode: 'gfs' });

    const snap = await fetchGlobalWindSnapshot({
      model: 'gfs',
      targetValidTimeUtc: '2026-11-24T17:00:00Z',
      now: () => fixedNow,
      fetchImpl: harness.mock as unknown as typeof fetch,
    });

    expect(snap.manifest.isAvailable).toBe(true);
    expect(snap.manifest.initTimeUtc).toBe('2026-11-24T12:00:00.000Z');
    expect(snap.manifest.forecastHour).toBe(5);
    expect(snap.manifest.validTimeUtc).toBe('2026-11-24T17:00:00.000Z');
    expect(snap.manifest.freshness).toBe('historical');
    expect(snap.manifest.model).toBe('gfs');
    expect(snap.manifest.cycle).toEqual({ date: '20261124', hour: 12, forecastHour: 5 });
    expect(snap.u[0]).toBeCloseTo(encodeDistinctWindPayloadU('20261124', 12, 5), 2);
    // Negative forecast lead time must fail closed rather than clamping silently to f000
    expect(() => nearestGfsStep(-1)).toThrow(RangeError);
    expect(() => nearestIfsStep(-3, 0)).toThrow(RangeError);
  });

  it('Test 2: same-day historical request (2026-11-25T03:00Z at now=2026-11-25T11:00Z) selects 00:00Z f003 instead of newer 06:00Z f000', async () => {
    const fixedNow = Date.UTC(2026, 10, 25, 11, 0, 0);
    const harness = createHistoricalCycleAwareFetch({ mode: 'gfs' });

    const snap = await fetchGlobalWindSnapshot({
      model: 'gfs',
      targetValidTimeUtc: '2026-11-25T03:00:00Z',
      now: () => fixedNow,
      fetchImpl: harness.mock as unknown as typeof fetch,
    });

    expect(snap.manifest.isAvailable).toBe(true);
    expect(snap.manifest.initTimeUtc).toBe('2026-11-25T00:00:00.000Z');
    expect(snap.manifest.forecastHour).toBe(3);
    expect(snap.manifest.validTimeUtc).toBe('2026-11-25T03:00:00.000Z');
    expect(snap.manifest.freshness).toBe('historical');
    expect(snap.u[0]).toBeCloseTo(encodeDistinctWindPayloadU('20261125', 0, 3), 2);
  });

  it('Test 3: UTC midnight boundary historical request uses strict UTC calendar date, init hour, and lead time', async () => {
    const fixedNow = Date.UTC(2026, 10, 25, 11, 0, 0);
    const harness = createHistoricalCycleAwareFetch({ mode: 'gfs' });

    // Request just before UTC midnight: 2026-11-24T23:00Z -> cycle 2026-11-24 18z + f005
    const preMidnight = await fetchGlobalWindSnapshot({
      model: 'gfs',
      targetValidTimeUtc: '2026-11-24T23:00:00+00:00',
      now: () => fixedNow,
      fetchImpl: harness.mock as unknown as typeof fetch,
    });

    expect(preMidnight.manifest.initTimeUtc).toBe('2026-11-24T18:00:00.000Z');
    expect(preMidnight.manifest.forecastHour).toBe(5);
    expect(preMidnight.manifest.validTimeUtc).toBe('2026-11-24T23:00:00.000Z');
    expect(preMidnight.manifest.cycle).toEqual({ date: '20261124', hour: 18, forecastHour: 5 });

    // Even with a +05:30 IST offset representing 2026-11-25T04:30+05:30 (= 2026-11-24T23:00:00Z)
    const istEquiv = await fetchGlobalWindSnapshot({
      model: 'gfs',
      targetValidTimeUtc: '2026-11-25T04:30:00+05:30',
      now: () => fixedNow,
      fetchImpl: harness.mock as unknown as typeof fetch,
    });
    expect(istEquiv.manifest.initTimeUtc).toBe('2026-11-24T18:00:00.000Z');
    expect(istEquiv.manifest.validTimeUtc).toBe('2026-11-24T23:00:00.000Z');
  });

  it('Test 4: current forecast request without explicit timestamp preserves latest cycle behavior', async () => {
    const fixedNow = Date.UTC(2026, 10, 25, 11, 0, 0);
    const harness = createHistoricalCycleAwareFetch({ mode: 'gfs' });

    const current = await fetchGlobalWindSnapshot({
      model: 'gfs',
      now: () => fixedNow,
      fetchImpl: harness.mock as unknown as typeof fetch,
    });

    expect(current.manifest.isAvailable).toBe(true);
    expect(current.manifest.initTimeUtc).toBe('2026-11-25T06:00:00.000Z');
    expect(current.manifest.forecastHour).toBe(5);
    expect(current.manifest.validTimeUtc).toBe('2026-11-25T11:00:00.000Z');
    expect(current.manifest.freshness).toBe('current');
    expect(current.u[0]).toBeCloseTo(encodeDistinctWindPayloadU('20261125', 6, 5), 2);
  });

  it('Test 5: supported future forecast selects latest published cycle and exact lead step', async () => {
    const fixedNow = Date.UTC(2026, 10, 25, 11, 0, 0);
    const harness = createHistoricalCycleAwareFetch({ mode: 'gfs' });

    const future = await fetchGlobalWindSnapshot({
      model: 'gfs',
      targetValidTimeUtc: '2026-11-26T18:00:00Z', // 36h past 2026-11-25T06:00Z
      now: () => fixedNow,
      fetchImpl: harness.mock as unknown as typeof fetch,
    });

    expect(future.manifest.isAvailable).toBe(true);
    expect(future.manifest.initTimeUtc).toBe('2026-11-25T06:00:00.000Z');
    expect(future.manifest.forecastHour).toBe(36);
    expect(future.manifest.validTimeUtc).toBe('2026-11-26T18:00:00.000Z');
    expect(future.manifest.freshness).toBe('forecast');
    expect(future.u[0]).toBeCloseTo(encodeDistinctWindPayloadU('20261125', 6, 36), 2);
  });

  it('Test 6: ECMWF IFS historical requests follow 3-hourly cadence and stay within resolution tolerance', async () => {
    const fixedNow = Date.UTC(2026, 10, 25, 11, 0, 0);
    const harness = createHistoricalCycleAwareFetch({ mode: 'ifs' });

    // Target 2026-11-24T17:00Z -> cycle 2026-11-24T12:00Z, nearest 3h IFS step is f006 (18:00Z, diff 1.0h <= 1.5h)
    const ifsHist = await fetchGlobalWindSnapshot({
      model: 'ifs',
      targetValidTimeUtc: '2026-11-24T17:00:00Z',
      now: () => fixedNow,
      fetchImpl: harness.mock as unknown as typeof fetch,
    });

    expect(ifsHist.manifest.isAvailable).toBe(true);
    expect(ifsHist.manifest.model).toBe('ifs');
    expect(ifsHist.manifest.initTimeUtc).toBe('2026-11-24T12:00:00.000Z');
    expect(ifsHist.manifest.forecastHour).toBe(6);
    expect(ifsHist.manifest.validTimeUtc).toBe('2026-11-24T18:00:00.000Z');
    expect(ifsHist.manifest.freshness).toBe('historical');
    expect(
      Math.abs(Date.parse(ifsHist.manifest.validTimeUtc!) - Date.parse('2026-11-24T17:00:00Z'))
    ).toBeLessThanOrEqual(1.5 * 3600_000);
    expect(ifsHist.u[0]).toBeCloseTo(encodeDistinctWindPayloadU('20261124', 12, 6), 2);
  });

  it('Test 7: missing historical cycles report unavailability honestly without falling back to newer cycles', async () => {
    const fixedNow = Date.UTC(2026, 10, 25, 11, 0, 0);
    // Both eligible historical cycles (20261124-12 and 20261124-06) 404, while newer 20261125-06 IS available!
    const harness = createHistoricalCycleAwareFetch({
      mode: 'gfs',
      unavailableCycles: new Set(['20261124-12', '20261124-06']),
    });

    // Ensure newer forecast does NOT get queried or substituted for historical request
    const missingHist = await fetchGlobalWindSnapshot({
      model: 'gfs',
      targetValidTimeUtc: '2026-11-24T17:00:00Z',
      now: () => fixedNow,
      fetchImpl: harness.mock as unknown as typeof fetch,
    });

    expect(missingHist.manifest.isAvailable).toBe(false);
    expect(missingHist.manifest.freshness).toBe('unavailable');
    expect(missingHist.manifest.validTimeUtc).toBeNull();
    expect(missingHist.manifest.unavailableReason).toContain('2026-11-24T17:00:00.000Z');
    expect(harness.requests.some((r) => r.date === '20261125')).toBe(false);
  });

  it('Test 8: historical request uses distinct canonical cache key and never reuses newer cached forecasts', async () => {
    const fixedNow = Date.UTC(2026, 10, 25, 11, 0, 0);
    const harness = createHistoricalCycleAwareFetch({ mode: 'gfs' });

    // Step 1: Warm cache with newer forecasts (current 11:00Z & 06:00Z f000)
    const latestSnap = await fetchGlobalWindSnapshot({
      model: 'gfs',
      now: () => fixedNow,
      fetchImpl: harness.mock as unknown as typeof fetch,
    });
    const init06Snap = await fetchGlobalWindSnapshot({
      model: 'gfs',
      targetValidTimeUtc: '2026-11-25T06:00:00Z',
      now: () => fixedNow,
      fetchImpl: harness.mock as unknown as typeof fetch,
    });
    expect(latestSnap.manifest.validTimeUtc).toBe('2026-11-25T11:00:00.000Z');
    expect(init06Snap.manifest.validTimeUtc).toBe('2026-11-25T06:00:00.000Z');

    // Step 2: Request historical 2026-11-24T17:00Z -> MUST miss newer cached entries and fetch 2026-11-24 12z f005
    const callsBeforeHist = harness.requests.length;
    const histSnap = await fetchGlobalWindSnapshot({
      model: 'gfs',
      targetValidTimeUtc: '2026-11-24T17:00:00Z',
      now: () => fixedNow + 1000,
      fetchImpl: harness.mock as unknown as typeof fetch,
    });

    expect(harness.requests.length).toBeGreaterThan(callsBeforeHist);
    expect(histSnap.manifest.isCached).toBe(false);
    expect(histSnap.manifest.initTimeUtc).toBe('2026-11-24T12:00:00.000Z');
    expect(histSnap.manifest.forecastHour).toBe(5);
    expect(histSnap.manifest.validTimeUtc).toBe('2026-11-24T17:00:00.000Z');

    // Step 3: Re-request same historical time (or nearby 17:15Z) -> reuses the cached historical snapshot!
    const callsAfterHist = harness.requests.length;
    const cachedHistSnap = await fetchGlobalWindSnapshot({
      model: 'gfs',
      targetValidTimeUtc: '2026-11-24T17:15:00Z',
      now: () => fixedNow + 2000,
      fetchImpl: harness.mock as unknown as typeof fetch,
    });
    expect(harness.requests.length).toBe(callsAfterHist);
    expect(cachedHistSnap.manifest.isCached).toBe(true);
    expect(cachedHistSnap.manifest.validTimeUtc).toBe('2026-11-24T17:00:00.000Z');
    expect(getGlobalWindCacheStats().snapshotCount).toBe(3);
  });
});
