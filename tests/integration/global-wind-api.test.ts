import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { decodeWindGrib2Message } from '@/services/environment/grib2-decoder';
import {
  assertSafeWindUpstreamUrl,
  clearGlobalWindCache,
  encodeGlobalWindBinaryGrid,
  fetchGlobalWindBinaryByCycle,
  fetchGlobalWindSnapshot,
  nearestGfsStep,
  nearestIfsStep,
  parseGfsIdx,
  parseIfsIndex,
  selectLatestGfsCycle,
  selectLatestIfsCycle,
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
        fetchImpl: fetchMock as any,
      }),
      fetchGlobalWindSnapshot({
        model: 'gfs',
        overlay: 'temperature',
        now: () => fixedNow,
        fetchImpl: fetchMock as any,
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
      fetchImpl: fetchMock as any,
    });
    expect(byCycle.bytes.byteLength).toBe(bin.byteLength);

    // Advance beyond 30m TTL with upstream outage -> serves explicit stale cache
    const stale = await fetchGlobalWindSnapshot({
      model: 'gfs',
      overlay: 'temperature',
      now: () => fixedNow + 40 * 60_000,
      fetchImpl: vi.fn().mockRejectedValue(new Error('Network down')) as any,
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
      fetchImpl: fetchMock as any,
    });
    expect(first.snapshot).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Second read (e.g., switching engine Cesium -> Three.js or Flow -> Speed) hits client cache cleanly
    const second = await fetchClientGlobalWindSnapshot({
      model: 'ifs',
      overlay: 'speed',
      fetchImpl: fetchMock as any,
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
      fetchImpl: corruptFetch as any,
    });
    expect(failed.snapshot).toBeNull();
    expect(failed.error).toMatch(/non-finite/i);
  });
});
