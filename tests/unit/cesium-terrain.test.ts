import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  REEARTH_KEYLESS_TERRAIN_URL,
  TERRAIN_ATTRIBUTION,
  TERRAIN_RETRY_ATTEMPTS,
  createKeylessTerrainProvider,
  createCesiumTerrainController,
  createTerrainRetryPolicy,
  formatSanitizedTerrainError,
  type CesiumTerrainProviderLike,
  type TerrainProviderResult,
} from '@/components/globe/cesium/cesium-terrain';
import { AvirCesiumGlobe } from '@/components/globe/cesium/AvirCesiumGlobe';

function createMockCesiumEvent() {
  const listeners = new Set<(err: unknown) => void>();
  const removeSpies: ReturnType<typeof vi.fn>[] = [];

  const addEventListener = vi.fn((fn: (err: unknown) => void) => {
    listeners.add(fn);
    const removeFn = vi.fn(() => {
      listeners.delete(fn);
    });
    removeSpies.push(removeFn);
    return removeFn;
  });

  const removeEventListener = vi.fn((fn: (err: unknown) => void) => {
    listeners.delete(fn);
  });

  const raiseEvent = (err: unknown) => {
    for (const listener of Array.from(listeners)) {
      listener(err);
    }
  };

  return {
    addEventListener,
    removeEventListener,
    raiseEvent,
    listenerCount: () => listeners.size,
    removeSpies,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('Cesium 3D Elevation Terrain Provider (Phase 5 Part B)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defines the canonical keyless Re:Earth quantized-mesh endpoint', () => {
    expect(REEARTH_KEYLESS_TERRAIN_URL).toBe(
      'https://terrain.reearth.land/cesium-mesh/ellipsoid'
    );
  });

  it('defines the legally required attribution badge', () => {
    expect(TERRAIN_ATTRIBUTION).toContain('Re:Earth / Mapterhorn');
    expect(TERRAIN_ATTRIBUTION).toContain('CC BY 4.0');
  });

  it('creates quantized-mesh terrain provider when upstream call succeeds', async () => {
    const mockProvider = { isRealQuantizedMesh: true };
    const mockCesium = {
      CesiumTerrainProvider: {
        fromUrl: vi.fn().mockResolvedValue(mockProvider),
      },
      EllipsoidTerrainProvider: vi.fn(),
    };

    const res = await createKeylessTerrainProvider(mockCesium);
    expect(res.isRealTerrain).toBe(true);
    expect(res.status).toBe('real_terrain');
    expect(res.reason).toBe('none');
    expect(res.provider).toBe(mockProvider);
    expect(res.attribution).toBe(TERRAIN_ATTRIBUTION);
    expect(mockCesium.CesiumTerrainProvider.fromUrl).toHaveBeenCalledWith(
      REEARTH_KEYLESS_TERRAIN_URL,
      expect.objectContaining({ requestVertexNormals: true, requestWaterMask: false })
    );
  });

  it('gracefully falls back to EllipsoidTerrainProvider on network failure or 429 throttling without leaking URLs', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mockEllipsoid = { isEllipsoidFallback: true };
    const rateErr = Object.assign(
      new Error('HTTP 429 Too Many Requests at https://terrain.reearth.land/cesium-mesh/ellipsoid?token=secret123'),
      { statusCode: 429 }
    );
    const mockCesium = {
      CesiumTerrainProvider: {
        fromUrl: vi.fn().mockRejectedValue(rateErr),
      },
      EllipsoidTerrainProvider: vi.fn().mockImplementation(() => mockEllipsoid),
    };

    const res = await createKeylessTerrainProvider(mockCesium);
    expect(res.isRealTerrain).toBe(false);
    expect(res.status).toBe('ellipsoid_fallback');
    expect(res.reason).toBe('rate_limited');
    expect(res.provider).toBe(mockEllipsoid);
    expect(res.attribution).toBeNull();

    const logged = JSON.stringify(warnSpy.mock.calls);
    expect(logged).not.toContain('https://terrain.reearth.land');
    expect(logged).not.toContain('secret123');
    expect(formatSanitizedTerrainError(rateErr)).not.toContain('https://');
  });

  it('classifies HTTP 401/403, network failure, and missing layer.json metadata safely', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mockEllipsoid = { isEllipsoidFallback: true };
    const makeCesium = (errOrValue: unknown, shouldReject = true) => ({
      CesiumTerrainProvider: {
        fromUrl: shouldReject
          ? vi.fn().mockRejectedValue(errOrValue)
          : vi.fn().mockResolvedValue(errOrValue),
      },
      EllipsoidTerrainProvider: vi.fn().mockImplementation(() => mockEllipsoid),
    });

    const unauth = await createKeylessTerrainProvider(
      makeCesium(Object.assign(new Error('Forbidden'), { statusCode: 403 }))
    );
    expect(unauth.isRealTerrain).toBe(false);
    expect(unauth.reason).toBe('unauthorized');
    expect(unauth.provider).toBe(mockEllipsoid);
    expect(unauth.attribution).toBeNull();

    const net = await createKeylessTerrainProvider(makeCesium(new Error('Failed to fetch')));
    expect(net.isRealTerrain).toBe(false);
    expect(net.reason).toBe('network_error');
    expect(net.attribution).toBeNull();

    const badMeta = await createKeylessTerrainProvider(
      makeCesium(new Error('layer.json availability missing'))
    );
    expect(badMeta.isRealTerrain).toBe(false);
    expect(badMeta.reason).toBe('metadata_unavailable');

    const nullProvider = await createKeylessTerrainProvider(makeCesium(null, false));
    expect(nullProvider.isRealTerrain).toBe(false);
    expect(nullProvider.reason).toBe('metadata_unavailable');
  });

  it('handles missing or unsupported Cesium APIs safely without crashing', async () => {
    const noCesium = await createKeylessTerrainProvider(null);
    expect(noCesium.isRealTerrain).toBe(false);
    expect(noCesium.status).toBe('unavailable');
    expect(noCesium.reason).toBe('unsupported_api');
    expect(noCesium.provider).toBeNull();
    expect(noCesium.attribution).toBeNull();

    const onlyEllipsoid = {
      EllipsoidTerrainProvider: vi.fn().mockImplementation(() => ({ isEllipsoid: true })),
    };
    const res = await createKeylessTerrainProvider(onlyEllipsoid);
    expect(res.isRealTerrain).toBe(false);
    expect(res.status).toBe('ellipsoid_fallback');
    expect(res.reason).toBe('unsupported_api');
    expect(res.provider).toEqual({ isEllipsoid: true });
    expect(res.attribution).toBeNull();
  });

  it('recovers cleanly to EllipsoidTerrainProvider on async tile errors without infinite retry loops', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorEvent = createMockCesiumEvent();
    const realProvider = { isRealTerrain: true, errorEvent };
    const ellipsoidInstances: Array<{ isEllipsoid: boolean; id: number }> = [];
    const mockCesium = {
      CesiumTerrainProvider: {
        fromUrl: vi.fn().mockResolvedValue(realProvider),
      },
      EllipsoidTerrainProvider: vi.fn().mockImplementation(() => {
        const inst = { isEllipsoid: true, id: ellipsoidInstances.length + 1 };
        ellipsoidInstances.push(inst);
        return inst;
      }),
    };
    const viewer = {
      isDestroyed: () => false,
      terrainProvider: null as CesiumTerrainProviderLike | null,
    };
    const attributionCalls: Array<string | null> = [];
    const controller = createCesiumTerrainController();

    await controller.sync({
      viewer,
      Cesium: mockCesium,
      enabled: true,
      maxTransientErrors: 3,
      onAttributionChange: (attr) => attributionCalls.push(attr),
    });

    expect(viewer.terrainProvider).toBe(realProvider);
    expect(attributionCalls.at(-1)).toBe(TERRAIN_ATTRIBUTION);
    expect(errorEvent.listenerCount()).toBe(1);

    // First 2 transient tile errors tolerate temporary jitter
    errorEvent.raiseEvent({ message: 'Transient tile timeout 1', timesRetried: 0, retry: true });
    errorEvent.raiseEvent({ message: 'Transient tile timeout 2', timesRetried: 0, retry: true });
    expect(viewer.terrainProvider).toBe(realProvider);
    expect(errorEvent.listenerCount()).toBe(1);

    // 3rd persistent tile error forces controlled single recovery & stops retries
    const thirdErr = { message: 'Persistent tile failure', timesRetried: 0, retry: true };
    errorEvent.raiseEvent(thirdErr);
    expect(thirdErr.retry).toBe(false);
    expect(viewer.terrainProvider).toEqual({ isEllipsoid: true, id: 1 });
    expect(attributionCalls.at(-1)).toBeNull();
    expect(errorEvent.listenerCount()).toBe(0);

    // Repeated late bursts never re-trigger fallback (zero infinite retry loop)
    errorEvent.raiseEvent({ message: 'Extra burst', statusCode: 429, retry: true });
    expect(ellipsoidInstances).toHaveLength(1);
  });

  it('recovers immediately on unrecoverable HTTP 429/403 errorEvent and preserves viewer', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorEvent = createMockCesiumEvent();
    const realProvider = { isRealTerrain: true, errorEvent };
    const mockCesium = {
      CesiumTerrainProvider: { fromUrl: vi.fn().mockResolvedValue(realProvider) },
      EllipsoidTerrainProvider: vi.fn().mockImplementation(() => ({ isEllipsoid: true })),
    };
    const viewer = { isDestroyed: () => false, terrainProvider: null as CesiumTerrainProviderLike | null };
    let activeAttr: string | null = null;
    const controller = createCesiumTerrainController();

    await controller.sync({
      viewer,
      Cesium: mockCesium,
      enabled: true,
      onAttributionChange: (attr) => {
        activeAttr = attr;
      },
    });
    expect(activeAttr).toBe(TERRAIN_ATTRIBUTION);

    errorEvent.raiseEvent({ statusCode: 429, message: 'Rate limited', retry: true });
    expect(viewer.terrainProvider).toEqual({ isEllipsoid: true });
    expect(activeAttr).toBeNull();
    expect(errorEvent.listenerCount()).toBe(0);
  });

  it('prevents stale re-activation on rapid ON -> OFF -> ON toggles (latest intent wins)', async () => {
    const firstPending = createDeferred<TerrainProviderResult>();
    const secondPending = createDeferred<TerrainProviderResult>();
    const errEvent1 = createMockCesiumEvent();
    const errEvent3 = createMockCesiumEvent();

    let callNum = 0;
    const loadProvider = vi.fn().mockImplementation(() => {
      callNum += 1;
      return callNum === 1 ? firstPending.promise : secondPending.promise;
    });

    const ellipsoidA = { isEllipsoid: 'A' };
    const mockCesium = {
      EllipsoidTerrainProvider: vi.fn().mockImplementation(() => ellipsoidA),
    };
    const viewer = { isDestroyed: () => false, terrainProvider: null as CesiumTerrainProviderLike | null };
    const attrHistory: Array<string | null> = [];
    const controller = createCesiumTerrainController();

    // 1. Toggle ON (slow)
    const p1 = controller.sync({
      viewer,
      Cesium: mockCesium,
      enabled: true,
      loadProvider,
      onAttributionChange: (a) => attrHistory.push(a),
    });

    // 2. Toggle OFF
    await controller.sync({
      viewer,
      Cesium: mockCesium,
      enabled: false,
      loadProvider,
      onAttributionChange: (a) => attrHistory.push(a),
    });
    expect(viewer.terrainProvider).toBe(ellipsoidA);
    expect(attrHistory.at(-1)).toBeNull();

    // 3. Toggle ON again (newer request)
    const p3 = controller.sync({
      viewer,
      Cesium: mockCesium,
      enabled: true,
      loadProvider,
      onAttributionChange: (a) => attrHistory.push(a),
    });

    const latestProvider = { id: 'latest-3', errorEvent: errEvent3 };
    const staleProvider = { id: 'stale-1', errorEvent: errEvent1 };

    // Resolve newest first, then obsolete first request later
    secondPending.resolve({
      provider: latestProvider,
      isRealTerrain: true,
      attribution: TERRAIN_ATTRIBUTION,
      status: 'real_terrain',
      reason: 'none',
    });
    await p3;

    firstPending.resolve({
      provider: staleProvider,
      isRealTerrain: true,
      attribution: TERRAIN_ATTRIBUTION,
      status: 'real_terrain',
      reason: 'none',
    });
    await p1;

    expect(viewer.terrainProvider).toBe(latestProvider);
    expect(attrHistory.at(-1)).toBe(TERRAIN_ATTRIBUTION);
    expect(errEvent1.listenerCount()).toBe(0);
    expect(errEvent3.listenerCount()).toBe(1);
  });

  it('never installs terrain or sets attribution when disabled during a pending load', async () => {
    const pending = createDeferred<TerrainProviderResult>();
    const errEvent = createMockCesiumEvent();
    const loadProvider = vi.fn().mockReturnValue(pending.promise);
    const ellipsoid = { isEllipsoid: true };
    const mockCesium = {
      EllipsoidTerrainProvider: vi.fn().mockImplementation(() => ellipsoid),
    };
    const viewer = { isDestroyed: () => false, terrainProvider: null as CesiumTerrainProviderLike | null };
    const onAttr = vi.fn();
    const controller = createCesiumTerrainController();

    const pOn = controller.sync({
      viewer,
      Cesium: mockCesium,
      enabled: true,
      loadProvider,
      onAttributionChange: onAttr,
    });

    await controller.sync({
      viewer,
      Cesium: mockCesium,
      enabled: false,
      loadProvider,
      onAttributionChange: onAttr,
    });

    pending.resolve({
      provider: { id: 'late-real', errorEvent: errEvent } as CesiumTerrainProviderLike,
      isRealTerrain: true,
      attribution: TERRAIN_ATTRIBUTION,
      status: 'real_terrain',
      reason: 'none',
    });
    await pOn;

    expect(viewer.terrainProvider).toBe(ellipsoid);
    expect(onAttr).not.toHaveBeenCalledWith(TERRAIN_ATTRIBUTION);
    expect(errEvent.listenerCount()).toBe(0);
  });

  it('aborts mutations and React state setters when Viewer is destroyed or unmounted during load or recovery', async () => {
    const pending = createDeferred<TerrainProviderResult>();
    let destroyed = false;
    const errEvent = createMockCesiumEvent();
    const provider = { id: 'late-provider', errorEvent: errEvent };
    const viewer = {
      isDestroyed: () => destroyed,
      terrainProvider: { initial: true } as CesiumTerrainProviderLike,
    };
    const mockCesium = {
      EllipsoidTerrainProvider: vi.fn().mockImplementation(() => ({ isEllipsoid: true })),
    };
    const onAttr = vi.fn();
    const controller = createCesiumTerrainController();

    // A) Destroy & dispose while load is pending
    const pendingSync = controller.sync({
      viewer,
      Cesium: mockCesium,
      enabled: true,
      loadProvider: () => pending.promise,
      onAttributionChange: onAttr,
    });

    onAttr.mockClear();
    destroyed = true;
    controller.dispose();

    pending.resolve({
      provider,
      isRealTerrain: true,
      attribution: TERRAIN_ATTRIBUTION,
      status: 'real_terrain',
      reason: 'none',
    });
    await pendingSync;

    expect(viewer.terrainProvider).toEqual({ initial: true });
    expect(onAttr).not.toHaveBeenCalled();
    expect(errEvent.listenerCount()).toBe(0);

    // B) Destroy during active provider's errorEvent recovery
    destroyed = false;
    const controller2 = createCesiumTerrainController();
    const onAttr2 = vi.fn();
    const errEvent2 = createMockCesiumEvent();
    const activeProvider = { id: 'active', errorEvent: errEvent2 };

    await controller2.sync({
      viewer,
      Cesium: mockCesium,
      enabled: true,
      loadProvider: async () => ({
        provider: activeProvider,
        isRealTerrain: true,
        attribution: TERRAIN_ATTRIBUTION,
        status: 'real_terrain',
        reason: 'none',
      }),
      onAttributionChange: onAttr2,
    });

    expect(errEvent2.listenerCount()).toBe(1);
    onAttr2.mockClear();
    destroyed = true;
    errEvent2.raiseEvent({ statusCode: 429, message: 'Throttled' });
    expect(viewer.terrainProvider).toBe(activeProvider);
    expect(onAttr2).not.toHaveBeenCalled();
    expect(errEvent2.listenerCount()).toBe(0);
  });

  it('removes errorEvent listeners cleanly when switching terrain off or replacing provider', async () => {
    const errEvent = createMockCesiumEvent();
    const provider = { id: 'active', errorEvent: errEvent };
    const mockCesium = {
      CesiumTerrainProvider: { fromUrl: vi.fn().mockResolvedValue(provider) },
      EllipsoidTerrainProvider: vi.fn().mockImplementation(() => ({ isEllipsoid: true })),
    };
    const viewer = { isDestroyed: () => false, terrainProvider: null as CesiumTerrainProviderLike | null };
    const controller = createCesiumTerrainController();

    await controller.sync({
      viewer,
      Cesium: mockCesium,
      enabled: true,
      onAttributionChange: vi.fn(),
    });
    expect(errEvent.listenerCount()).toBe(1);

    await controller.sync({
      viewer,
      Cesium: mockCesium,
      enabled: false,
      onAttributionChange: vi.fn(),
    });
    expect(errEvent.listenerCount()).toBe(0);
  });

  it('preserves accessible main imagery attribution in AvirCesiumGlobe and omits terrain credit by default', () => {
    const html = ReactDOMServer.renderToString(
      React.createElement(AvirCesiumGlobe, {
        points: [],
        onSelectPoint: vi.fn(),
        isTerrainEnabled: false,
      })
    );

    expect(html).toContain('Map Attribution');
    expect(html).toContain('Imagery: Tiles © Esri, Maxar, Earthstar Geographics');
    expect(html).not.toContain('Re:Earth / Mapterhorn');
  });

  it('Fix 3 regression: attaches shared-cooldown retry policy on Cesium.Resource and retries 429/503 without premature fallback', async () => {
    const waits: number[] = [];
    let currentMs = 1000;
    const policy = createTerrainRetryPolicy({
      now: () => currentMs,
      wait: async (ms) => {
        waits.push(ms);
        currentMs += ms;
      },
      random: () => 0,
    });

    const tileResource = { request: { cancelled: false } };
    expect(policy.shouldRetry({ statusCode: 429 })).toBe(true);
    expect(policy.shouldRetry({ statusCode: 503 })).toBe(true);
    expect(policy.shouldRetry({ statusCode: 404 })).toBe(false);

    // Retry honors Retry-After header cleanly
    const allowRetry = await policy.retryCallback(tileResource, {
      statusCode: 429,
      responseHeaders: { 'retry-after': '2' },
    });
    expect(allowRetry).toBe(true);
    expect(waits[0]).toBeGreaterThanOrEqual(2000);

    // Cancelled resource aborts retry immediately
    expect(
      await policy.retryCallback({ request: { cancelled: true } }, { statusCode: 429 })
    ).toBe(false);

    // Passes Cesium.Resource instance when Resource constructor is available
    const constructed: Array<{ url?: string; retryAttempts?: number }> = [];
    class MockResource {
      isMockResource = true;
      constructor(opts: { url: string; retryAttempts?: number }) {
        constructed.push(opts);
        Object.assign(this, opts);
      }
    }
    const mockCesiumWithResource = {
      Resource: MockResource,
      CesiumTerrainProvider: {
        fromUrl: vi.fn().mockResolvedValue({ isRealQuantizedMesh: true }),
      },
      EllipsoidTerrainProvider: vi.fn(),
    };

    const loaded = await createKeylessTerrainProvider(mockCesiumWithResource);
    expect(loaded.isRealTerrain).toBe(true);
    expect(constructed).toHaveLength(1);
    expect(constructed[0]?.url).toBe(REEARTH_KEYLESS_TERRAIN_URL);
    expect(constructed[0]?.retryAttempts).toBe(TERRAIN_RETRY_ATTEMPTS);
  });
});
