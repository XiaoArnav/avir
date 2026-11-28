import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { GlobalWindManifest, GlobalWindModelId, GlobalWindOverlayKind } from '@/domain/wind-types';
import {
  clearGlobalWindClientCache,
  fetchClientGlobalWindSnapshot,
} from '@/services/environment/global-wind-client';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function buildManifest(
  model: GlobalWindModelId,
  overlay: GlobalWindOverlayKind = 'none',
  width = 4,
  height = 3
): GlobalWindManifest {
  const hasScalar = overlay === 'temperature' || overlay === 'pressure';
  return {
    schemaVersion: 2,
    model,
    modelName: model === 'ifs' ? 'ECMWF IFS' : 'NOAA GFS',
    provider: model === 'ifs' ? 'ECMWF' : 'NOAA',
    initTimeUtc: '2026-11-28T06:00:00Z',
    validTimeUtc: '2026-11-28T12:00:00Z',
    forecastHour: 6,
    retrievedAtUtc: '2026-11-28T12:01:00Z',
    level: '10 m above ground',
    units: 'm/s',
    overlay,
    status: 'available',
    freshness: 'current',
    ageMinutes: 1,
    grid: {
      width,
      height,
      lo1: 0,
      la1: 90,
      dx: 90,
      dy: 60,
      bounds: { west: 0, south: -90, east: 360, north: 90 },
      resolutionDeg: 0.25,
      nativeResolutionDeg: 0.25,
    },
    scalar: hasScalar
      ? {
          kind: overlay as 'temperature' | 'pressure',
          units: overlay === 'temperature' ? '°C' : 'hPa',
          level: overlay === 'temperature' ? '2 m above ground' : 'mean sea level',
          min: overlay === 'temperature' ? -5 : 995,
          max: overlay === 'temperature' ? 35 : 1025,
        }
      : null,
    isAvailable: true,
    isCached: false,
    isStale: false,
    unavailableReason: null,
    attribution: model === 'ifs' ? 'ECMWF' : 'NOAA',
    license: 'Open',
    cycle: { date: '20261128', hour: 6, forecastHour: 6 },
    gridUrl: `/api/environment/wind/global/grid?model=${model}&overlay=${overlay}&date=20261128&hour=6&step=6`,
  };
}

function buildGridBuffer(width = 4, height = 3, withScalar = false, scalarBase = 290): ArrayBuffer {
  const count = width * height;
  const arr = new Float32Array(count * (withScalar ? 3 : 2));
  for (let i = 0; i < count; i++) {
    arr[i] = 2.5 + (i % 3);
    arr[count + i] = -1.5 + (i % 2);
    if (withScalar) {
      arr[count * 2 + i] = scalarBase + i * 0.5;
    }
  }
  return arr.buffer;
}

function makeAbortError() {
  return new DOMException('The operation was aborted', 'AbortError');
}

describe('Step 6 Global Wind Request Deduplication', () => {
  beforeEach(() => {
    clearGlobalWindClientCache();
  });

  afterEach(() => {
    clearGlobalWindClientCache();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('1. Two concurrent identical calls share one manifest fetch and one binary grid fetch', async () => {
    const manifestGate = createDeferred<void>();
    const gridGate = createDeferred<void>();
    let manifestCalls = 0;
    let gridCalls = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/environment/wind/global/grid')) {
        gridCalls += 1;
        await gridGate.promise;
        return new Response(buildGridBuffer(), { status: 200 });
      }
      manifestCalls += 1;
      await manifestGate.promise;
      return new Response(JSON.stringify(buildManifest('gfs', 'none')), { status: 200 });
    });

    const p1 = fetchClientGlobalWindSnapshot({
      model: 'gfs',
      overlay: 'none',
      validAtUtc: '2026-11-28T12:15:00Z',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const p2 = fetchClientGlobalWindSnapshot({
      model: 'gfs',
      overlay: 'none',
      validAtUtc: '2026-11-28T12:45:00Z', // Same UTC hour bucket
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    manifestGate.resolve();
    await new Promise((r) => setTimeout(r, 10));
    gridGate.resolve();

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(manifestCalls).toBe(1);
    expect(gridCalls).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r1.snapshot).not.toBeNull();
    expect(r2.snapshot).not.toBeNull();
    expect(r1.snapshot?.u).toEqual(r2.snapshot?.u);
    expect(r1.snapshot?.v).toEqual(r2.snapshot?.v);
  });

  it('2. Three concurrent identical calls share one download and all receive valid snapshots', async () => {
    const gate = createDeferred<void>();
    let manifestCalls = 0;
    let gridCalls = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/environment/wind/global/grid')) {
        gridCalls += 1;
        return new Response(buildGridBuffer(), { status: 200 });
      }
      manifestCalls += 1;
      await gate.promise;
      return new Response(JSON.stringify(buildManifest('ifs', 'none')), { status: 200 });
    });

    const p1 = fetchClientGlobalWindSnapshot({
      model: 'ifs',
      overlay: 'none',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const p2 = fetchClientGlobalWindSnapshot({
      model: 'ifs',
      overlay: 'none',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const p3 = fetchClientGlobalWindSnapshot({
      model: 'ifs',
      overlay: 'none',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    gate.resolve();
    const results = await Promise.all([p1, p2, p3]);

    expect(manifestCalls).toBe(1);
    expect(gridCalls).toBe(1);
    expect(results).toHaveLength(3);
    for (const res of results) {
      expect(res.error).toBeUndefined();
      expect(res.aborted).toBeUndefined();
      expect(res.snapshot?.manifest.model).toBe('ifs');
      expect(res.snapshot?.u.length).toBe(12);
    }
  });

  it('3. Aborting one subscriber does not cancel the shared fetch or other active callers', async () => {
    const manifestGate = createDeferred<void>();
    const gridGate = createDeferred<void>();
    const underlyingSignals: AbortSignal[] = [];

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal) underlyingSignals.push(init.signal);
      const url = String(input);
      if (url.startsWith('/api/environment/wind/global/grid')) {
        await gridGate.promise;
        return new Response(buildGridBuffer(), { status: 200 });
      }
      await manifestGate.promise;
      return new Response(JSON.stringify(buildManifest('gfs', 'none')), { status: 200 });
    });

    const ac1 = new AbortController();
    const ac2 = new AbortController();

    const p1 = fetchClientGlobalWindSnapshot({
      model: 'gfs',
      overlay: 'none',
      signal: ac1.signal,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const p2 = fetchClientGlobalWindSnapshot({
      model: 'gfs',
      overlay: 'none',
      signal: ac2.signal,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    // Abort only caller 1 while manifest is still pending
    ac1.abort();
    const r1 = await p1;
    expect(r1).toEqual({ aborted: true, snapshot: null, manifest: null });
    expect(underlyingSignals[0]?.aborted).toBe(false);

    // Caller 2 finishes cleanly on the shared underlying fetch
    manifestGate.resolve();
    await new Promise((r) => setTimeout(r, 10));
    gridGate.resolve();
    const r2 = await p2;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r2.aborted).toBeUndefined();
    expect(r2.snapshot).not.toBeNull();
    expect(r2.snapshot?.u.length).toBe(12);
  });

  it('4 & 5. Aborting every caller cancels the underlying fetch, avoids caching incomplete results, and allows a fresh request afterward', async () => {
    const capturedSignals: AbortSignal[] = [];
    let attempt = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.signal) capturedSignals.push(init.signal);

      if (attempt === 0) {
        // Reject when the shared underlying AbortSignal aborts
        return await new Promise<Response>((_resolve, reject) => {
          if (init?.signal?.aborted) {
            reject(makeAbortError());
            return;
          }
          init?.signal?.addEventListener('abort', () => reject(makeAbortError()), { once: true });
        });
      }

      if (url.startsWith('/api/environment/wind/global/grid')) {
        return new Response(buildGridBuffer(), { status: 200 });
      }
      return new Response(JSON.stringify(buildManifest('gfs', 'none')), { status: 200 });
    });

    const ac1 = new AbortController();
    const ac2 = new AbortController();

    const p1 = fetchClientGlobalWindSnapshot({
      model: 'gfs',
      overlay: 'none',
      signal: ac1.signal,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const p2 = fetchClientGlobalWindSnapshot({
      model: 'gfs',
      overlay: 'none',
      signal: ac2.signal,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    ac1.abort();
    expect(capturedSignals[0]?.aborted).toBe(false);

    ac2.abort();
    expect(capturedSignals[0]?.aborted).toBe(true);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual({ aborted: true, snapshot: null, manifest: null });
    expect(r2).toEqual({ aborted: true, snapshot: null, manifest: null });

    // Start a fresh request after all previous subscribers aborted -> must NOT hit stale cache or cancelled registry
    attempt = 1;
    const fresh = await fetchClientGlobalWindSnapshot({
      model: 'gfs',
      overlay: 'none',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(fresh.aborted).toBeUndefined();
    expect(fresh.snapshot).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 aborted manifest + 1 fresh manifest + 1 fresh grid
  });

  it('6. Failed requests remove the in-flight entry so subsequent calls retry cleanly', async () => {
    const manifestGate = createDeferred<void>();
    let phase: 'fail' | 'succeed' = 'fail';
    let manifestCalls = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/environment/wind/global/grid')) {
        return new Response(buildGridBuffer(), { status: 200 });
      }
      manifestCalls += 1;
      if (phase === 'fail') {
        await manifestGate.promise;
        return new Response('Upstream error', { status: 503 });
      }
      return new Response(JSON.stringify(buildManifest('gfs', 'none')), { status: 200 });
    });

    const p1 = fetchClientGlobalWindSnapshot({
      model: 'gfs',
      overlay: 'none',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const p2 = fetchClientGlobalWindSnapshot({
      model: 'gfs',
      overlay: 'none',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    manifestGate.resolve();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(manifestCalls).toBe(1);
    expect(r1.snapshot).toBeNull();
    expect(r1.error).toContain('HTTP 503');
    expect(r2.snapshot).toBeNull();
    expect(r2.error).toContain('HTTP 503');

    // Retry must initiate a fresh fetch and succeed
    phase = 'succeed';
    const retry = await fetchClientGlobalWindSnapshot({
      model: 'gfs',
      overlay: 'none',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(manifestCalls).toBe(2);
    expect(retry.snapshot).not.toBeNull();
  });

  it('7. Different models, scalar overlays, and distinct injected fetchImpl instances are not cross-deduplicated', async () => {
    const gate = createDeferred<void>();
    const callsA: string[] = [];
    const callsB: string[] = [];

    const makeMock = (log: string[], withScalarKind?: 'temperature' | 'pressure') =>
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        log.push(url);
        if (url.startsWith('/api/environment/wind/global/grid')) {
          const isTemp = url.includes('temperature');
          const isPres = url.includes('pressure');
          return new Response(
            buildGridBuffer(4, 3, isTemp || isPres, isPres ? 1012 : 22),
            { status: 200 }
          );
        }
        await gate.promise;
        const m = url.includes('model=ifs') ? 'ifs' : 'gfs';
        const ov: GlobalWindOverlayKind = url.includes('overlay=temperature')
          ? 'temperature'
          : url.includes('overlay=pressure')
          ? 'pressure'
          : withScalarKind ?? 'none';
        return new Response(JSON.stringify(buildManifest(m, ov)), { status: 200 });
      });

    const fetchA = makeMock(callsA);
    const fetchB = makeMock(callsB);

    const pGfsNone = fetchClientGlobalWindSnapshot({
      model: 'gfs',
      overlay: 'none',
      fetchImpl: fetchA as unknown as typeof fetch,
    });
    const pIfsNone = fetchClientGlobalWindSnapshot({
      model: 'ifs',
      overlay: 'none',
      fetchImpl: fetchA as unknown as typeof fetch,
    });
    const pGfsTemp = fetchClientGlobalWindSnapshot({
      model: 'gfs',
      overlay: 'temperature',
      fetchImpl: fetchA as unknown as typeof fetch,
    });
    // Identical model+overlay but distinct injected fetchImpl must use fetchB, not fetchA
    const pGfsNoneDistinctFetch = fetchClientGlobalWindSnapshot({
      model: 'gfs',
      overlay: 'none',
      fetchImpl: fetchB as unknown as typeof fetch,
    });

    gate.resolve();
    const [rGfs, rIfs, rTemp, rGfsB] = await Promise.all([
      pGfsNone,
      pIfsNone,
      pGfsTemp,
      pGfsNoneDistinctFetch,
    ]);

    expect(callsA.filter((u) => !u.includes('/grid'))).toHaveLength(3); // gfs:none, ifs:none, gfs:temperature
    expect(callsB.filter((u) => !u.includes('/grid'))).toHaveLength(1); // isolated fetchB
    expect(rGfs.snapshot?.manifest.model).toBe('gfs');
    expect(rIfs.snapshot?.manifest.model).toBe('ifs');
    expect(rTemp.snapshot?.manifest.scalar?.kind).toBe('temperature');
    expect(rGfsB.snapshot?.manifest.model).toBe('gfs');
  });

  it('8 & 9. Retains temperature/pressure scalar data and shares speed/none vector downloads accurately', async () => {
    const gate = createDeferred<void>();
    let manifestCalls = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/environment/wind/global/grid')) {
        const isScalar = url.includes('temperature') || url.includes('pressure');
        const scalarBase = url.includes('pressure') ? 1005 : 24;
        return new Response(buildGridBuffer(4, 3, isScalar, scalarBase), { status: 200 });
      }
      manifestCalls += 1;
      await gate.promise;
      const ov: GlobalWindOverlayKind = url.includes('temperature')
        ? 'temperature'
        : url.includes('pressure')
        ? 'pressure'
        : 'none';
      return new Response(JSON.stringify(buildManifest('gfs', ov)), { status: 200 });
    });

    const pFlow = fetchClientGlobalWindSnapshot({
      model: 'gfs',
      overlay: 'none',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const pSpeed = fetchClientGlobalWindSnapshot({
      model: 'gfs',
      overlay: 'speed',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const pTemp = fetchClientGlobalWindSnapshot({
      model: 'gfs',
      overlay: 'temperature',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const pPres = fetchClientGlobalWindSnapshot({
      model: 'gfs',
      overlay: 'pressure',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    gate.resolve();
    const [rFlow, rSpeed, rTemp, rPres] = await Promise.all([pFlow, pSpeed, pTemp, pPres]);

    // flow ('none') and 'speed' share one download; temperature and pressure each do their own -> 3 manifests
    expect(manifestCalls).toBe(3);
    expect(rFlow.snapshot?.manifest.overlay).toBe('none');
    expect(rSpeed.snapshot?.manifest.overlay).toBe('speed');
    expect(rFlow.snapshot?.scalarValues).toBeNull();
    expect(rSpeed.snapshot?.scalarValues).toBeNull();
    expect(rFlow.snapshot?.u).toEqual(rSpeed.snapshot?.u);

    expect(rTemp.snapshot?.manifest.scalar?.kind).toBe('temperature');
    expect(rTemp.snapshot?.scalarValues?.[0]).toBeCloseTo(24);
    expect(rPres.snapshot?.manifest.scalar?.kind).toBe('pressure');
    expect(rPres.snapshot?.scalarValues?.[0]).toBeCloseTo(1005);
  });

  it('10. Completed snapshots honor the existing 10-minute cache TTL and clearGlobalWindClientCache()', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-28T10:00:00Z'));

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/environment/wind/global/grid')) {
        return new Response(buildGridBuffer(), { status: 200 });
      }
      return new Response(JSON.stringify(buildManifest('gfs', 'none')), { status: 200 });
    });

    await fetchClientGlobalWindSnapshot({
      model: 'gfs',
      overlay: 'none',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Within 10-minute TTL -> cache hit, 0 network calls
    vi.setSystemTime(new Date('2026-11-28T10:09:59Z'));
    const cached = await fetchClientGlobalWindSnapshot({
      model: 'gfs',
      overlay: 'speed',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(cached.snapshot?.manifest.overlay).toBe('speed');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Past 10-minute TTL -> re-fetches
    vi.setSystemTime(new Date('2026-11-28T10:10:01Z'));
    await fetchClientGlobalWindSnapshot({
      model: 'gfs',
      overlay: 'none',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);

    // clearGlobalWindClientCache drops cached snapshot immediately
    clearGlobalWindClientCache();
    await fetchClientGlobalWindSnapshot({
      model: 'gfs',
      overlay: 'none',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('11. Rejects invalid manifests and corrupt binary grids cleanly without caching', async () => {
    const badManifestFetch = vi.fn(async () => {
      const m = buildManifest('gfs', 'none');
      m.gridUrl = 'https://evil.example.com/bad';
      return new Response(JSON.stringify(m), { status: 200 });
    });

    const [badM1, badM2] = await Promise.all([
      fetchClientGlobalWindSnapshot({
        model: 'gfs',
        overlay: 'none',
        fetchImpl: badManifestFetch as unknown as typeof fetch,
      }),
      fetchClientGlobalWindSnapshot({
        model: 'gfs',
        overlay: 'none',
        fetchImpl: badManifestFetch as unknown as typeof fetch,
      }),
    ]);
    expect(badM1.error).toBe('Malformed wind manifest received from server');
    expect(badM2.error).toBe('Malformed wind manifest received from server');

    const corruptGridFetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).startsWith('/api/environment/wind/global/grid')) {
        const nanBuf = new Float32Array(4 * 3 * 2).fill(Number.NaN).buffer;
        return new Response(nanBuf, { status: 200 });
      }
      return new Response(JSON.stringify(buildManifest('ifs', 'none')), { status: 200 });
    });

    const badGrid = await fetchClientGlobalWindSnapshot({
      model: 'ifs',
      overlay: 'none',
      fetchImpl: corruptGridFetch as unknown as typeof fetch,
    });
    expect(badGrid.snapshot).toBeNull();
    expect(badGrid.error).toBe('Wind grid contained non-finite binary values');
    // Must not have cached invalid result
    await fetchClientGlobalWindSnapshot({
      model: 'ifs',
      overlay: 'none',
      fetchImpl: corruptGridFetch as unknown as typeof fetch,
    });
    expect(corruptGridFetch).toHaveBeenCalledTimes(4);
  });

  it('12. Already-aborted caller never receives a late snapshot even when joining a succeeding in-flight request', async () => {
    const manifestGate = createDeferred<void>();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/environment/wind/global/grid')) {
        return new Response(buildGridBuffer(), { status: 200 });
      }
      await manifestGate.promise;
      return new Response(JSON.stringify(buildManifest('gfs', 'none')), { status: 200 });
    });

    // Active caller 1 starts request
    const pActive = fetchClientGlobalWindSnapshot({
      model: 'gfs',
      overlay: 'none',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    // Caller 2 joins with a pre-aborted signal
    const preAborted = new AbortController();
    preAborted.abort();
    const resPreAborted = await fetchClientGlobalWindSnapshot({
      model: 'gfs',
      overlay: 'none',
      signal: preAborted.signal,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    // Caller 3 joins normally, then aborts right as manifest resolves
    const acMid = new AbortController();
    const pMid = fetchClientGlobalWindSnapshot({
      model: 'gfs',
      overlay: 'none',
      signal: acMid.signal,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    acMid.abort();

    manifestGate.resolve();
    const [rActive, rMid] = await Promise.all([pActive, pMid]);

    expect(resPreAborted).toEqual({ aborted: true, snapshot: null, manifest: null });
    expect(rMid).toEqual({ aborted: true, snapshot: null, manifest: null });
    expect(rActive.snapshot).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('13. clearGlobalWindClientCache cancels & settles active in-flight entries without duplicate downloads or late cache poisoning', async () => {
    const staleGate = createDeferred<void>();
    const observedSignals: AbortSignal[] = [];
    let callPhase: 'stale' | 'fresh' = 'stale';

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (callPhase === 'stale') {
        if (init?.signal) observedSignals.push(init.signal);
        if (url.startsWith('/api/environment/wind/global/grid')) {
          return new Response(buildGridBuffer(4, 3, true, 10), { status: 200 });
        }
        await staleGate.promise;
        return new Response(JSON.stringify(buildManifest('gfs', 'temperature')), { status: 200 });
      }

      if (url.startsWith('/api/environment/wind/global/grid')) {
        return new Response(buildGridBuffer(4, 3, true, 99), { status: 200 });
      }
      return new Response(JSON.stringify(buildManifest('gfs', 'temperature')), { status: 200 });
    });

    const staleCallerAc = new AbortController();
    const pStale1 = fetchClientGlobalWindSnapshot({
      model: 'gfs',
      overlay: 'temperature',
      signal: staleCallerAc.signal,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const pStale2 = fetchClientGlobalWindSnapshot({
      model: 'gfs',
      overlay: 'temperature',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(observedSignals[0]?.aborted).toBe(false);

    // Clear cache while the shared request is still in flight
    clearGlobalWindClientCache();

    // Shared fetch must be aborted and existing callers settled cleanly without blocking
    expect(observedSignals[0]?.aborted).toBe(true);
    const [rStale1, rStale2] = await Promise.all([pStale1, pStale2]);
    expect(rStale1).toEqual({ aborted: true, snapshot: null, manifest: null });
    expect(rStale2).toEqual({ aborted: true, snapshot: null, manifest: null });
    expect(staleCallerAc.signal.aborted).toBe(false); // Caller's own AbortController untouched

    // Even if the stale network mock eventually finishes resolving after cache clear, it must NOT write stale data into cache
    staleGate.resolve();
    await new Promise((r) => setTimeout(r, 10));

    // A subsequent request must fetch fresh data once (not hit stale scalar=10) and cache fresh scalar=99
    callPhase = 'fresh';
    const rFresh1 = await fetchClientGlobalWindSnapshot({
      model: 'gfs',
      overlay: 'temperature',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const rFresh2 = await fetchClientGlobalWindSnapshot({
      model: 'gfs',
      overlay: 'temperature',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(rFresh1.snapshot?.scalarValues?.[0]).toBeCloseTo(99);
    expect(rFresh2.snapshot?.scalarValues?.[0]).toBeCloseTo(99);
    // 1 aborted manifest + 1 fresh manifest + 1 fresh grid = 3 calls (no duplicate grid on stale & no re-fetch on cached fresh)
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
