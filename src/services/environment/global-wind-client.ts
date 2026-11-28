/**
 * Client-Side Global Wind Snapshot Loader & Cache
 *
 * Fetches global wind manifests + compact Float32Array binary grids, validates dimensions,
 * IEEE-754 finite buffers, and safe same-origin binary URLs, and shares snapshots across
 * CesiumJS <-> Three.js engine switches so identical forecasts are never re-downloaded.
 */

import type {
  GlobalWindManifest,
  GlobalWindModelId,
  GlobalWindOverlayKind,
  GlobalWindSnapshot,
} from '@/domain/wind-types';
import { validateWindGrid } from '@/domain/wind-field';

const MAX_MANIFEST_BYTES = 32 * 1024;
const MAX_GRID_BYTES = 16 * 1024 * 1024;
const ALLOWED_GRID_URL_RE =
  /^\/api\/environment\/wind\/global\/grid\?(?:[\w.%-]+=[\w.%-]+&?)+$/;

type GlobalWindFetchResult = {
  snapshot: GlobalWindSnapshot | null;
  manifest: GlobalWindManifest | null;
  error?: string;
  aborted?: boolean;
};

interface InFlightSubscriber {
  overlay: GlobalWindOverlayKind;
  signal?: AbortSignal;
  aborted: boolean;
  resolve: (result: GlobalWindFetchResult) => void;
  cleanupListener?: () => void;
}

interface InFlightEntry {
  key: string;
  controller: AbortController;
  subscribers: Set<InFlightSubscriber>;
  settled: boolean;
}

const clientSnapshotCache = new Map<string, { fetchedAt: number; snapshot: GlobalWindSnapshot }>();
const inFlightRequests = new Map<string, InFlightEntry>();
const fetchImplIds = new WeakMap<typeof fetch, number>();
let nextFetchImplId = 1;
const CLIENT_CACHE_TTL_MS = 10 * 60 * 1000;

function getFetchImplId(fetchImpl: typeof fetch): number {
  let id = fetchImplIds.get(fetchImpl);
  if (id === undefined) {
    id = nextFetchImplId++;
    fetchImplIds.set(fetchImpl, id);
  }
  return id;
}

function formatResultForOverlay(
  snapshot: GlobalWindSnapshot,
  manifest: GlobalWindManifest,
  requestedOverlay: GlobalWindOverlayKind
): GlobalWindFetchResult {
  return {
    snapshot: {
      ...snapshot,
      manifest: {
        ...manifest,
        overlay:
          requestedOverlay === 'speed' && !manifest.scalar && !snapshot.scalarValues
            ? 'speed'
            : manifest.overlay,
      },
    },
    manifest,
  };
}

export function clearGlobalWindClientCache(): void {
  clientSnapshotCache.clear();
  inFlightRequests.clear();
}

export function isValidWindManifest(
  manifest: unknown,
  expectedModel: GlobalWindModelId,
  expectedOverlay: GlobalWindOverlayKind
): manifest is GlobalWindManifest {
  if (!manifest || typeof manifest !== 'object') return false;
  const m = manifest as GlobalWindManifest;
  if (m.schemaVersion !== 2 || m.model !== expectedModel) return false;
  if (!m.isAvailable || !m.grid || !m.gridUrl) return false;

  const { width, height, lo1, la1, dx, dy } = m.grid;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 2 ||
    height < 2 ||
    width * height > 1_000_000 ||
    ![lo1, la1, dx, dy].every(Number.isFinite) ||
    dx <= 0 ||
    dy <= 0
  ) {
    return false;
  }

  if (!ALLOWED_GRID_URL_RE.test(m.gridUrl)) return false;

  if (
    (expectedOverlay === 'temperature' || expectedOverlay === 'pressure') &&
    m.scalar &&
    m.scalar.kind !== expectedOverlay
  ) {
    return false;
  }

  return true;
}

async function executeSharedWindDownload(params: {
  model: GlobalWindModelId;
  fetchOverlay: GlobalWindOverlayKind;
  validAtUtc?: string | null;
  cacheKey: string;
  fetchImpl: typeof fetch;
  entry: InFlightEntry;
}): Promise<GlobalWindFetchResult> {
  const { model, fetchOverlay, validAtUtc, cacheKey, fetchImpl, entry } = params;
  const { signal } = entry.controller;
  const isCancelled = () => signal.aborted || entry.settled || entry.subscribers.size === 0;

  const query = new URLSearchParams({ model, overlay: fetchOverlay });
  if (validAtUtc && !Number.isNaN(Date.parse(validAtUtc))) {
    query.set('validTimeUtc', new Date(validAtUtc).toISOString());
  }

  try {
    const manifestRes = await fetchImpl(`/api/environment/wind/global?${query.toString()}`, {
      signal,
      cache: 'no-store',
    });
    if (isCancelled()) {
      return { aborted: true, snapshot: null, manifest: null };
    }
    if (!manifestRes.ok) {
      return {
        snapshot: null,
        manifest: null,
        error: `Wind forecast service returned HTTP ${manifestRes.status}`,
      };
    }

    const manifestText = await manifestRes.text();
    if (isCancelled()) {
      return { aborted: true, snapshot: null, manifest: null };
    }
    if (manifestText.length > MAX_MANIFEST_BYTES) {
      return { snapshot: null, manifest: null, error: 'Malformed wind manifest size' };
    }
    const manifest = JSON.parse(manifestText) as GlobalWindManifest;
    if (!manifest.isAvailable) {
      return {
        snapshot: null,
        manifest,
        error: manifest.unavailableReason || 'Global wind forecast unavailable',
      };
    }

    if (!isValidWindManifest(manifest, model, fetchOverlay)) {
      return {
        snapshot: null,
        manifest: null,
        error: 'Malformed wind manifest received from server',
      };
    }

    const gridRes = await fetchImpl(manifest.gridUrl!, { signal });
    if (isCancelled()) {
      return { aborted: true, snapshot: null, manifest: null };
    }
    if (!gridRes.ok) {
      return {
        snapshot: null,
        manifest,
        error: `Wind grid download failed with HTTP ${gridRes.status}`,
      };
    }

    const buf = await gridRes.arrayBuffer();
    if (isCancelled()) {
      return { aborted: true, snapshot: null, manifest: null };
    }
    if (buf.byteLength > MAX_GRID_BYTES) {
      return { snapshot: null, manifest, error: 'Wind binary grid exceeded memory limit' };
    }

    const count = manifest.grid.width * manifest.grid.height;
    const hasScalar = Boolean(manifest.scalar);
    const expectedBytes = count * (hasScalar ? 12 : 8);
    if (buf.byteLength !== expectedBytes) {
      return { snapshot: null, manifest, error: 'Wind binary grid size mismatch' };
    }

    const floats = new Float32Array(buf);
    for (let i = 0; i < floats.length; i++) {
      if (!Number.isFinite(floats[i])) {
        return { snapshot: null, manifest, error: 'Wind grid contained non-finite binary values' };
      }
    }

    const u = floats.slice(0, count);
    const v = floats.slice(count, count * 2);
    const scalarValues = hasScalar ? floats.slice(count * 2, count * 3) : null;

    const validCheck = validateWindGrid({
      width: manifest.grid.width,
      height: manifest.grid.height,
      lo1: manifest.grid.lo1,
      la1: manifest.grid.la1,
      dx: manifest.grid.dx,
      dy: manifest.grid.dy,
      u,
      v,
    });
    if (!validCheck.ok) {
      return { snapshot: null, manifest, error: validCheck.reason };
    }

    if (isCancelled()) {
      return { aborted: true, snapshot: null, manifest: null };
    }

    const snapshot: GlobalWindSnapshot = {
      manifest,
      u,
      v,
      scalarValues,
    };

    clientSnapshotCache.set(cacheKey, { fetchedAt: Date.now(), snapshot });
    return { snapshot, manifest };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { aborted: true, snapshot: null, manifest: null };
    }
    return {
      snapshot: null,
      manifest: null,
      error: err instanceof Error ? err.message : 'Unable to load global wind forecast',
    };
  }
}

export async function fetchClientGlobalWindSnapshot(params: {
  model: GlobalWindModelId;
  overlay: GlobalWindOverlayKind;
  validAtUtc?: string | null;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<GlobalWindFetchResult> {
  const { model, overlay, validAtUtc, signal, fetchImpl = fetch } = params;
  if (signal?.aborted) {
    return { aborted: true, snapshot: null, manifest: null };
  }

  const fetchOverlay: GlobalWindOverlayKind =
    overlay === 'temperature' || overlay === 'pressure' ? overlay : 'none';

  const normalizedValid =
    validAtUtc && !Number.isNaN(Date.parse(validAtUtc))
      ? new Date(validAtUtc).toISOString().slice(0, 13)
      : 'latest';
  const cacheKey = `${model}:${fetchOverlay}:${normalizedValid}`;

  const cached = clientSnapshotCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CLIENT_CACHE_TTL_MS) {
    return formatResultForOverlay(cached.snapshot, cached.snapshot.manifest, overlay);
  }

  // Switching speed <-> flow only needs U/V; reuse the wind-only snapshot if cached!
  if (fetchOverlay === 'none') {
    for (const altKey of [
      `${model}:temperature:${normalizedValid}`,
      `${model}:pressure:${normalizedValid}`,
    ]) {
      const alt = clientSnapshotCache.get(altKey);
      if (alt && Date.now() - alt.fetchedAt < CLIENT_CACHE_TTL_MS) {
        return { snapshot: alt.snapshot, manifest: alt.snapshot.manifest };
      }
    }
  }

  const inFlightKey = `${cacheKey}#${getFetchImplId(fetchImpl)}`;
  let entry = inFlightRequests.get(inFlightKey);
  const isCreator = !entry || entry.settled;

  if (isCreator) {
    entry = {
      key: inFlightKey,
      controller: new AbortController(),
      subscribers: new Set<InFlightSubscriber>(),
      settled: false,
    };
    inFlightRequests.set(inFlightKey, entry);
  }

  const activeEntry = entry!;

  const callerPromise = new Promise<GlobalWindFetchResult>((resolve) => {
    const sub: InFlightSubscriber = {
      overlay,
      signal,
      aborted: false,
      resolve,
    };

    if (signal) {
      const onAbort = () => {
        if (sub.aborted) return;
        sub.aborted = true;
        sub.cleanupListener = undefined;
        activeEntry.subscribers.delete(sub);
        sub.resolve({ aborted: true, snapshot: null, manifest: null });

        // Cancel underlying network request only when no active callers remain
        if (!activeEntry.settled && activeEntry.subscribers.size === 0) {
          activeEntry.settled = true;
          if (inFlightRequests.get(activeEntry.key) === activeEntry) {
            inFlightRequests.delete(activeEntry.key);
          }
          activeEntry.controller.abort();
        }
      };

      signal.addEventListener('abort', onAbort, { once: true });
      sub.cleanupListener = () => signal.removeEventListener('abort', onAbort);
    }

    activeEntry.subscribers.add(sub);
  });

  if (isCreator) {
    void executeSharedWindDownload({
      model,
      fetchOverlay,
      validAtUtc,
      cacheKey,
      fetchImpl,
      entry: activeEntry,
    }).then((baseResult) => {
      if (inFlightRequests.get(activeEntry.key) === activeEntry) {
        inFlightRequests.delete(activeEntry.key);
      }

      const wasCancelledByAll = activeEntry.settled;
      activeEntry.settled = true;

      for (const sub of Array.from(activeEntry.subscribers)) {
        sub.cleanupListener?.();
        sub.cleanupListener = undefined;
        activeEntry.subscribers.delete(sub);

        if (wasCancelledByAll || sub.aborted || sub.signal?.aborted) {
          sub.resolve({ aborted: true, snapshot: null, manifest: null });
        } else if (baseResult.snapshot && baseResult.manifest && !baseResult.error && !baseResult.aborted) {
          sub.resolve(formatResultForOverlay(baseResult.snapshot, baseResult.manifest, sub.overlay));
        } else {
          sub.resolve(baseResult);
        }
      }
    });
  }

  return callerPromise;
}
