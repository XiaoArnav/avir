/**
 * Cesium 3D Elevation Terrain Provider (Phase 5 Part B)
 *
 * Configures Re:Earth keyless quantized-mesh ellipsoidal terrain:
 * - Upstream endpoint: https://terrain.reearth.land/cesium-mesh/ellipsoid
 * - Legal Attribution: Re:Earth / Mapterhorn ellipsoidal quantized mesh, CC BY 4.0
 * - Async Race & Error Recovery: Guards concurrent toggles/unmounts via generation tokens
 *   and subscribes to `errorEvent` to recover cleanly to Cesium.EllipsoidTerrainProvider.
 */

export const REEARTH_KEYLESS_TERRAIN_URL = 'https://terrain.reearth.land/cesium-mesh/ellipsoid';
export const TERRAIN_ATTRIBUTION = 'Terrain: Re:Earth / Mapterhorn (CC BY 4.0)';

export type TerrainStatus = 'real_terrain' | 'ellipsoid_fallback' | 'unavailable';

export type TerrainFailureReason =
  | 'none'
  | 'unsupported_api'
  | 'unauthorized'
  | 'rate_limited'
  | 'network_error'
  | 'metadata_unavailable'
  | 'tile_error'
  | 'unknown_error';

export interface TerrainProviderResult {
  provider: any;
  isRealTerrain: boolean;
  attribution: string | null;
  status: TerrainStatus;
  reason: TerrainFailureReason;
}

export interface TerrainErrorSubscription {
  detach: () => void;
  getErrorCount: () => number;
  hasFallenBack: () => boolean;
}

export interface TerrainTargetViewer {
  isDestroyed(): boolean;
  terrainProvider: any;
}

export interface SyncTerrainOptions {
  viewer: TerrainTargetViewer;
  Cesium: any;
  enabled: boolean;
  onAttributionChange: (attribution: string | null) => void;
  loadProvider?: (Cesium: any) => Promise<TerrainProviderResult>;
  maxTransientErrors?: number;
}

export interface CesiumTerrainController {
  sync: (options: SyncTerrainOptions) => Promise<void>;
  cancelPending: () => void;
  dispose: () => void;
  getActiveGeneration: () => number;
  isDisposed: () => boolean;
}

const DEFAULT_MAX_TRANSIENT_TILE_ERRORS = 3;

/**
 * Extracts a bounded, non-sensitive diagnostic summary without raw URLs, tokens, or large payloads.
 */
export function formatSanitizedTerrainError(error: unknown): string {
  if (!error) return 'Unknown terrain error';

  const errObj = typeof error === 'object' ? (error as Record<string, unknown>) : null;
  const statusCode =
    errObj && typeof errObj.statusCode === 'number'
      ? errObj.statusCode
      : errObj && typeof errObj.status === 'number'
        ? errObj.status
        : null;

  let message =
    error instanceof Error
      ? error.message
      : errObj && typeof errObj.message === 'string'
        ? errObj.message
        : typeof error === 'string'
          ? error
          : 'Terrain provider error';

  message = message
    .replace(/https?:\/\/[^\s)]+/gi, '[REDACTED_URL]')
    .replace(/(bearer\s+|token[=:]\s*|key[=:]\s*|apikey[=:]\s*)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, 160);

  if (statusCode !== null) {
    return message ? `HTTP ${statusCode}: ${message}` : `HTTP ${statusCode}`;
  }
  return message || 'Terrain provider error';
}

/**
 * Classifies initial or runtime terrain failures into deterministic failure causes.
 */
export function classifyTerrainError(error: unknown): TerrainFailureReason {
  const errObj = typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : null;
  const statusCode =
    errObj && typeof errObj.statusCode === 'number'
      ? errObj.statusCode
      : errObj && typeof errObj.status === 'number'
        ? errObj.status
        : null;

  if (statusCode === 401 || statusCode === 403) return 'unauthorized';
  if (statusCode === 429) return 'rate_limited';
  if (statusCode === 404) return 'metadata_unavailable';

  const summary = formatSanitizedTerrainError(error).toLowerCase();
  if (/\b(401|403|unauthorized|forbidden)\b/.test(summary)) return 'unauthorized';
  if (/\b(429|rate limit|too many requests|throttl)/.test(summary)) return 'rate_limited';
  if (/(layer\.json|metadata|availability|unexpected token|invalid json|\b404\b)/.test(summary)) {
    return 'metadata_unavailable';
  }
  if (/(network|failed to fetch|timeout|timed out|abort|econn|offline)/.test(summary)) {
    return 'network_error';
  }
  return 'unknown_error';
}

/**
 * Safely instantiates Cesium.EllipsoidTerrainProvider without throwing if Cesium APIs are absent.
 */
export function createEllipsoidTerrainProvider(Cesium: any): any {
  if (!Cesium || typeof Cesium.EllipsoidTerrainProvider !== 'function') {
    return null;
  }
  try {
    return new Cesium.EllipsoidTerrainProvider();
  } catch {
    return null;
  }
}

/**
 * Creates keyless quantized-mesh terrain provider with automatic fallback to standard Ellipsoid.
 */
export async function createKeylessTerrainProvider(Cesium: any): Promise<TerrainProviderResult> {
  if (!Cesium || typeof Cesium.CesiumTerrainProvider?.fromUrl !== 'function') {
    const fallback = createEllipsoidTerrainProvider(Cesium);
    return {
      provider: fallback,
      isRealTerrain: false,
      attribution: null,
      status: fallback ? 'ellipsoid_fallback' : 'unavailable',
      reason: 'unsupported_api',
    };
  }

  try {
    const provider = await Cesium.CesiumTerrainProvider.fromUrl(REEARTH_KEYLESS_TERRAIN_URL, {
      requestVertexNormals: true,
      requestWaterMask: false,
    });

    if (!provider || typeof provider !== 'object') {
      const fallback = createEllipsoidTerrainProvider(Cesium);
      return {
        provider: fallback,
        isRealTerrain: false,
        attribution: null,
        status: fallback ? 'ellipsoid_fallback' : 'unavailable',
        reason: 'metadata_unavailable',
      };
    }

    return {
      provider,
      isRealTerrain: true,
      attribution: TERRAIN_ATTRIBUTION,
      status: 'real_terrain',
      reason: 'none',
    };
  } catch (error) {
    const reason = classifyTerrainError(error);
    console.warn(
      `[Avir Cesium] Re:Earth terrain unavailable (${reason}), falling back to ellipsoid:`,
      formatSanitizedTerrainError(error)
    );
    const fallback = createEllipsoidTerrainProvider(Cesium);
    return {
      provider: fallback,
      isRealTerrain: false,
      attribution: null,
      status: fallback ? 'ellipsoid_fallback' : 'unavailable',
      reason,
    };
  }
}

/**
 * Subscribes to asynchronous `provider.errorEvent` failures after provider installation,
 * switching cleanly back to `EllipsoidTerrainProvider` on persistent/unrecoverable errors
 * without infinite retry loops or post-disposal mutations.
 */
export function subscribeTerrainErrorRecovery(params: {
  provider: any;
  Cesium: any;
  isDisposedOrStale: () => boolean;
  onRecoverToEllipsoid: (fallbackProvider: any, reason: TerrainFailureReason) => void;
  maxTransientErrors?: number;
}): TerrainErrorSubscription {
  const {
    provider,
    Cesium,
    isDisposedOrStale,
    onRecoverToEllipsoid,
    maxTransientErrors = DEFAULT_MAX_TRANSIENT_TILE_ERRORS,
  } = params;

  let cleanedUp = false;
  let settled = false;
  let errorCount = 0;
  let removeHandle: (() => void) | undefined;

  const errorEvent = provider?.errorEvent;

  const detach = () => {
    if (cleanedUp) return;
    cleanedUp = true;

    try {
      if (typeof removeHandle === 'function') {
        removeHandle();
      } else if (errorEvent && typeof errorEvent.removeEventListener === 'function') {
        errorEvent.removeEventListener(handleError);
      }
    } catch {
      // Listener removal must never throw during cleanup
    } finally {
      removeHandle = undefined;
    }
  };

  const handleError = (error: unknown) => {
    if (cleanedUp || settled) {
      return;
    }

    if (isDisposedOrStale()) {
      detach();
      return;
    }

    errorCount += 1;
    const classified = classifyTerrainError(error);
    const timesRetried =
      error && typeof error === 'object' && typeof (error as any).timesRetried === 'number'
        ? (error as any).timesRetried
        : 0;

    const isUnrecoverable =
      classified === 'unauthorized' ||
      classified === 'rate_limited' ||
      classified === 'metadata_unavailable' ||
      timesRetried >= 1 ||
      errorCount >= Math.max(1, maxTransientErrors);

    if (!isUnrecoverable) {
      return;
    }

    settled = true;

    // Suppress Cesium TileProviderError internal retries when falling back
    if (error && typeof error === 'object' && !Object.isFrozen(error)) {
      try {
        if ('retry' in error) {
          (error as any).retry = false;
        }
      } catch {
        // Ignore read-only error fields
      }
    }

    detach();

    if (isDisposedOrStale()) {
      return;
    }

    const recoveryReason: TerrainFailureReason =
      classified === 'unknown_error' ? 'tile_error' : classified;

    console.warn(
      `[Avir Cesium] Active terrain tile error (${recoveryReason}), switching to ellipsoid fallback:`,
      formatSanitizedTerrainError(error)
    );

    const fallback = createEllipsoidTerrainProvider(Cesium);
    onRecoverToEllipsoid(fallback, recoveryReason);
  };

  if (errorEvent && typeof errorEvent.addEventListener === 'function') {
    const maybeRemove = errorEvent.addEventListener(handleError);
    if (typeof maybeRemove === 'function') {
      removeHandle = maybeRemove;
    }
  }

  return {
    detach,
    getErrorCount: () => errorCount,
    hasFallenBack: () => settled,
  };
}

/**
 * Coordinates async terrain loading, stale-request cancellation, errorEvent recovery,
 * and clean disposal so obsolete promises never mutate a disabled or destroyed Viewer.
 */
export function createCesiumTerrainController(): CesiumTerrainController {
  let generation = 0;
  let disposed = false;
  let activeSubscription: TerrainErrorSubscription | null = null;

  const cleanupListener = () => {
    if (activeSubscription) {
      activeSubscription.detach();
      activeSubscription = null;
    }
  };

  return {
    async sync(options: SyncTerrainOptions): Promise<void> {
      const {
        viewer,
        Cesium,
        enabled,
        onAttributionChange,
        loadProvider = createKeylessTerrainProvider,
        maxTransientErrors,
      } = options;

      if (disposed || !viewer || viewer.isDestroyed()) {
        return;
      }

      const requestId = ++generation;
      const isStale = () => disposed || requestId !== generation || viewer.isDestroyed();

      cleanupListener();

      if (!enabled) {
        const ellipsoid = createEllipsoidTerrainProvider(Cesium);
        if (ellipsoid && !viewer.isDestroyed()) {
          viewer.terrainProvider = ellipsoid;
        }
        if (!isStale()) {
          onAttributionChange(null);
        }
        return;
      }

      // Ensure real-terrain attribution is cleared until a real provider completes installation
      onAttributionChange(null);

      try {
        const res = await loadProvider(Cesium);
        if (isStale()) {
          return;
        }

        if (res?.provider && !viewer.isDestroyed()) {
          viewer.terrainProvider = res.provider;
        }

        if (isStale()) {
          return;
        }

        if (res?.isRealTerrain && res.provider) {
          activeSubscription = subscribeTerrainErrorRecovery({
            provider: res.provider,
            Cesium,
            maxTransientErrors,
            isDisposedOrStale: isStale,
            onRecoverToEllipsoid: (fallbackProvider) => {
              if (isStale()) return;
              if (fallbackProvider && !viewer.isDestroyed()) {
                viewer.terrainProvider = fallbackProvider;
              }
              if (!isStale()) {
                onAttributionChange(null);
              }
            },
          });

          if (!isStale()) {
            onAttributionChange(res.attribution ?? TERRAIN_ATTRIBUTION);
          }
        } else {
          onAttributionChange(null);
        }
      } catch (error) {
        if (isStale()) {
          return;
        }
        console.warn(
          '[Avir Cesium] Terrain synchronization failed, using ellipsoid fallback:',
          formatSanitizedTerrainError(error)
        );
        const fallback = createEllipsoidTerrainProvider(Cesium);
        if (fallback && !viewer.isDestroyed()) {
          viewer.terrainProvider = fallback;
        }
        if (!isStale()) {
          onAttributionChange(null);
        }
      }
    },

    cancelPending() {
      generation += 1;
      cleanupListener();
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      cleanupListener();
    },

    getActiveGeneration: () => generation,
    isDisposed: () => disposed,
  };
}
