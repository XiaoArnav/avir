/**
 * Global Atmospheric Wind Data Engine (Phase 2)
 *
 * Fetches bounded GRIB2 byte-range slices from official public forecast archives:
 * - Primary: NOAA GFS 0.25° on AWS Open Data (`noaa-gfs-bdp-pds.s3.amazonaws.com`)
 * - Alternative: ECMWF IFS 0.25° Open Data (`data.ecmwf.int/forecasts`)
 *
 * Architecture & Safety Guarantees:
 * - Zero native binaries / WASM bloat: uses `decodeWindGrib2Message` pure-TS decoder
 * - Strict URL host allowlisting (`redirect: 'error'`) & hard byte-size caps
 * - Single-flight deduplication + TTL caching + negative backoff + stale fallback
 * - Separates model initialization time (`initTimeUtc`) from forecast valid time (`validTimeUtc`)
 * - Never fabricates missing grids or conceals stale/forecast status
 * - Adapted from MIT-licensed God's Eye View wind provider architecture (Bilawal Sidhu)
 */

import {
  GlobalWindCycleInfo,
  GlobalWindFreshnessStatus,
  GlobalWindManifest,
  GlobalWindModelId,
  GlobalWindOverlayKind,
  GlobalWindScalarMetadata,
  GlobalWindSnapshot,
  WindForecastStatus,
} from '@/domain/wind-types';
import { WIND_OVERLAY_SCALES } from '@/domain/wind-field';
import { decodeWindGrib2Message, type DecodedGrib2Message } from './grib2-decoder';

export const GFS_BUCKET = 'noaa-gfs-bdp-pds';
export const IFS_BASE_URL = 'https://data.ecmwf.int/forecasts';

const ALLOWED_UPSTREAM_HOSTS = new Set([
  `${GFS_BUCKET}.s3.amazonaws.com`,
  'data.ecmwf.int',
]);

const MAX_INDEX_BYTES = 2 * 1024 * 1024;
const MAX_GRIB_MESSAGE_BYTES = 8 * 1024 * 1024;
const DEFAULT_TTL_MS = 30 * 60 * 1000;
const NEGATIVE_BACKOFF_MS = 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 25_000;
const OPTIONAL_SCALAR_TIMEOUT_MS = 10_000;
const TARGET_GRID_RESOLUTION_DEG = 1;

/**
 * Bounded wind cache limits (per 1° global grid: 360 * 181 = 65,160 floats/field).
 * - Without scalar overlay (u, v): ~0.50 MiB raw
 * - With scalar overlay (u, v, scalar): ~0.75 MiB raw (~0.80 MiB total)
 * Capping unique canonical (model, overlay, cycle, step) snapshots at 24 keeps
 * worst-case serverless heap footprint strictly under ~20 MiB while supporting
 * both active models, multiple scalar overlays, and recent timeline cycles.
 */
export const GLOBAL_WIND_CACHE_MAX_SNAPSHOTS = 24;
export const GLOBAL_WIND_CACHE_MAX_ALIASES = 64;
export const GLOBAL_WIND_FAILURE_CACHE_MAX_ENTRIES = 64;
export const GLOBAL_WIND_CACHE_TTL_MS = DEFAULT_TTL_MS;
export const GLOBAL_WIND_CACHE_MAX_STALE_MS = 6 * 60 * 60 * 1000;
export const GLOBAL_WIND_PAST_HORIZON_MS = 24 * 60 * 60 * 1000;

const CANCELLED_BY_SUBSCRIBERS_REASON = 'AVIR_WIND_CANCELLED_BY_SUBSCRIBERS';
const UPSTREAM_TIMEOUT_REASON = 'AVIR_WIND_UPSTREAM_TIMEOUT';

export class WindForecastRangeError extends Error {
  readonly code = 'FORECAST_HORIZON_OUT_OF_RANGE';
  readonly minValidTimeUtc: string;
  readonly maxValidTimeUtc: string;

  constructor(message: string, minValidTimeUtc: string, maxValidTimeUtc: string) {
    super(message);
    this.name = 'WindForecastRangeError';
    this.minValidTimeUtc = minValidTimeUtc;
    this.maxValidTimeUtc = maxValidTimeUtc;
  }
}

export interface GfsIdxMessage {
  index: number;
  offset: number;
  variable: string;
  level: string;
}

export interface IfsIndexEntry {
  param: string;
  offset: number;
  length: number;
}

export interface ByteRangeSpec {
  start: number;
  end: number;
}

interface CachedGlobalWindState {
  id: string;
  snapshot: GlobalWindSnapshot;
  fetchedAtMs: number;
}

interface TargetResolutionAlias {
  canonicalKey: string;
  fetchedAtMs: number;
}

interface InflightGlobalWindEntry {
  promise: Promise<GlobalWindSnapshot>;
  subscribers: number;
  controller: AbortController;
  cancelledBySubscribers: boolean;
}

const cycleSnapshotCache = new Map<string, CachedGlobalWindState>();
const targetResolutionIndex = new Map<string, TargetResolutionAlias>();
const inflightMap = new Map<string, InflightGlobalWindEntry>();
const lastFailureMs = new Map<string, number>();

export function clearGlobalWindCache(): void {
  cycleSnapshotCache.clear();
  targetResolutionIndex.clear();
  inflightMap.clear();
  lastFailureMs.clear();
}

export function getGlobalWindCacheStats(): {
  snapshotCount: number;
  aliasCount: number;
  inflightCount: number;
  failureCount: number;
  maxSnapshots: number;
  maxAliases: number;
  maxFailures: number;
  ttlMs: number;
  maxStaleMs: number;
} {
  return {
    snapshotCount: cycleSnapshotCache.size,
    aliasCount: targetResolutionIndex.size,
    inflightCount: inflightMap.size,
    failureCount: lastFailureMs.size,
    maxSnapshots: GLOBAL_WIND_CACHE_MAX_SNAPSHOTS,
    maxAliases: GLOBAL_WIND_CACHE_MAX_ALIASES,
    maxFailures: GLOBAL_WIND_FAILURE_CACHE_MAX_ENTRIES,
    ttlMs: GLOBAL_WIND_CACHE_TTL_MS,
    maxStaleMs: GLOBAL_WIND_CACHE_MAX_STALE_MS,
  };
}

export function assertSafeWindUpstreamUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:') {
    throw new Error(`Blocked non-HTTPS wind upstream URL: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new Error('Blocked credentialed wind upstream URL');
  }
  if (!ALLOWED_UPSTREAM_HOSTS.has(url.hostname)) {
    throw new Error(`Blocked untrusted wind upstream host: ${url.hostname}`);
  }
  return url;
}

export function scalarMetadataForOverlay(
  overlay: GlobalWindOverlayKind
): GlobalWindScalarMetadata | null {
  if (overlay === 'temperature') {
    return {
      kind: 'temperature',
      units: '°C',
      level: '2 m above ground',
      min: WIND_OVERLAY_SCALES.temperature.min,
      max: WIND_OVERLAY_SCALES.temperature.max,
    };
  }
  if (overlay === 'pressure') {
    return {
      kind: 'pressure',
      units: 'hPa',
      level: 'mean sea level',
      min: WIND_OVERLAY_SCALES.pressure.min,
      max: WIND_OVERLAY_SCALES.pressure.max,
    };
  }
  return null;
}

export function selectLatestGfsCycle(
  nowMs: number,
  availabilityLagMs = 5 * 3600_000
): { date: string; hour: number } {
  const d = new Date(nowMs - availabilityLagMs);
  const utcDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const hour = Math.floor(d.getUTCHours() / 6) * 6;
  utcDay.setUTCHours(hour);
  return {
    date: utcDay.toISOString().slice(0, 10).replaceAll('-', ''),
    hour,
  };
}

export function selectLatestIfsCycle(
  nowMs: number,
  availabilityLagMs = 6 * 3600_000
): { date: string; hour: number } {
  const shifted = new Date(nowMs - availabilityLagMs);
  return {
    date: shifted.toISOString().slice(0, 10).replaceAll('-', ''),
    hour: Math.floor(shifted.getUTCHours() / 6) * 6,
  };
}

export function stepBackSynopticCycle(
  cycle: { date: string; hour: number },
  hoursBack = 6
): { date: string; hour: number } {
  const ms =
    Date.UTC(
      Number(cycle.date.slice(0, 4)),
      Number(cycle.date.slice(4, 6)) - 1,
      Number(cycle.date.slice(6, 8)),
      cycle.hour
    ) -
    hoursBack * 3600_000;
  const d = new Date(ms);
  return {
    date: d.toISOString().slice(0, 10).replaceAll('-', ''),
    hour: Math.floor(d.getUTCHours() / 6) * 6,
  };
}

export function cycleRunMs(cycle: { date: string; hour: number }): number {
  return Date.UTC(
    Number(cycle.date.slice(0, 4)),
    Number(cycle.date.slice(4, 6)) - 1,
    Number(cycle.date.slice(6, 8)),
    cycle.hour
  );
}

/** GFS 0.25° is hourly through f120, then 3-hourly through f384. */
export function nearestGfsStep(hoursElapsed: number): number {
  const val = Math.max(0, Number.isFinite(hoursElapsed) ? hoursElapsed : 0);
  const step = val <= 120 ? Math.round(val) : Math.round(val / 3) * 3;
  return Math.max(0, Math.min(384, step));
}

/** IFS 0.25° oper is 3-hourly through f144, then 6-hourly through f360 on 00/12z. */
export function nearestIfsStep(hoursElapsed: number, cycleHour: number): number {
  const maxStep = cycleHour === 6 || cycleHour === 18 ? 144 : 360;
  const val = Math.max(0, Number.isFinite(hoursElapsed) ? hoursElapsed : 0);
  const step = val <= 144 ? Math.round(val / 3) * 3 : Math.round(val / 6) * 6;
  return Math.max(0, Math.min(maxStep, step));
}

export function gfsObjectUrl(cycle: GlobalWindCycleInfo): string {
  const hh = String(cycle.hour).padStart(2, '0');
  const fhh = String(cycle.forecastHour).padStart(3, '0');
  return `https://${GFS_BUCKET}.s3.amazonaws.com/gfs.${cycle.date}/${hh}/atmos/gfs.t${hh}z.pgrb2.0p25.f${fhh}`;
}

export function ifsObjectUrls(cycle: GlobalWindCycleInfo): { grib: string; index: string } {
  const hh = String(cycle.hour).padStart(2, '0');
  const stem = `${IFS_BASE_URL}/${cycle.date}/${hh}z/ifs/0p25/oper/${cycle.date}${hh}0000-${cycle.forecastHour}h-oper-fc`;
  return {
    grib: `${stem}.grib2`,
    index: `${stem}.index`,
  };
}

export function parseGfsIdx(text: string): { messages: GfsIdxMessage[] } {
  const messages: GfsIdxMessage[] = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line) continue;
    const parts = line.split(':');
    if (
      parts.length < 6 ||
      !/^\d+$/.test(parts[0]) ||
      !/^\d+$/.test(parts[1]) ||
      !parts[3] ||
      !parts[4]
    ) {
      continue;
    }
    messages.push({
      index: Number(parts[0]),
      offset: Number(parts[1]),
      variable: parts[3],
      level: parts[4],
    });
  }
  if (messages.length === 0) {
    throw new Error('Malformed or empty GFS .idx inventory');
  }
  return { messages };
}

export function gfsMessageRanges(
  parsed: { messages: GfsIdxMessage[] },
  overlay: GlobalWindOverlayKind = 'none'
): { u: ByteRangeSpec; v: ByteRangeSpec; scalar?: ByteRangeSpec } {
  const findRange = (variable: string, level: string): ByteRangeSpec => {
    const idx = parsed.messages.findIndex((m) => m.variable === variable && m.level === level);
    const msg = parsed.messages[idx];
    const next = parsed.messages[idx + 1];
    if (!msg || !next || next.offset <= msg.offset) {
      throw new Error(`Missing GFS ${variable} at ${level}`);
    }
    return { start: msg.offset, end: next.offset - 1 };
  };

  return {
    u: findRange('UGRD', '10 m above ground'),
    v: findRange('VGRD', '10 m above ground'),
    ...(overlay === 'temperature' ? { scalar: findRange('TMP', '2 m above ground') } : {}),
    ...(overlay === 'pressure' ? { scalar: findRange('PRMSL', 'mean sea level') } : {}),
  };
}

export function parseIfsIndex(text: string): IfsIndexEntry[] {
  const entries: IfsIndexEntry[] = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const val = JSON.parse(line);
      if (
        typeof val?.param === 'string' &&
        Number.isFinite(val._offset) &&
        Number.isFinite(val._length) &&
        val._length > 0
      ) {
        entries.push({
          param: val.param,
          offset: val._offset,
          length: val._length,
        });
      }
    } catch {
      continue;
    }
  }
  if (entries.length === 0) {
    throw new Error('Malformed or empty ECMWF IFS .index inventory');
  }
  return entries;
}

export function ifsWindRanges(
  entries: IfsIndexEntry[],
  overlay: GlobalWindOverlayKind = 'none'
): { u: ByteRangeSpec; v: ByteRangeSpec; scalar?: ByteRangeSpec } {
  const findRange = (param: string): ByteRangeSpec => {
    const item = entries.find((e) => e.param === param);
    if (!item) {
      throw new Error(`Missing ECMWF IFS ${param}`);
    }
    return { start: item.offset, end: item.offset + item.length - 1 };
  };

  return {
    u: findRange('10u'),
    v: findRange('10v'),
    ...(overlay === 'temperature' ? { scalar: findRange('2t') } : {}),
    ...(overlay === 'pressure' ? { scalar: findRange('msl') } : {}),
  };
}

async function readBoundedResponse(
  response: Response,
  maxBytes: number,
  signal?: AbortSignal
): Promise<Uint8Array> {
  const contentLen = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(contentLen) && contentLen > maxBytes) {
    await response.body?.cancel?.();
    throw new Error('Wind upstream payload exceeds byte limit');
  }

  if (!response.body || typeof response.body.getReader !== 'function') {
    const ab = await response.arrayBuffer();
    if (ab.byteLength > maxBytes) {
      throw new Error('Wind upstream payload exceeds byte limit');
    }
    return new Uint8Array(ab);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  const abortReader = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener('abort', abortReader, { once: true });

  try {
    while (true) {
      signal?.throwIfAborted?.();
      const { done, value } = await reader.read();
      signal?.throwIfAborted?.();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          throw new Error('Wind upstream payload exceeds byte limit');
        }
        chunks.push(value);
      }
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return merged;
  } finally {
    signal?.removeEventListener('abort', abortReader);
    reader.releaseLock();
  }
}

async function fetchTextSafe(
  url: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal
): Promise<{ status: number; text: string }> {
  assertSafeWindUpstreamUrl(url);
  const res = await fetchImpl(url, { signal, redirect: 'error' });
  if (!res.ok) {
    await res.body?.cancel?.();
    return { status: res.status, text: '' };
  }
  const bytes = await readBoundedResponse(res, MAX_INDEX_BYTES, signal);
  return { status: res.status, text: new TextDecoder().decode(bytes) };
}

async function fetchRangeSafe(
  url: string,
  range: ByteRangeSpec,
  fetchImpl: typeof fetch,
  signal?: AbortSignal
): Promise<Uint8Array> {
  assertSafeWindUpstreamUrl(url);
  const { start, end } = range;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    end - start + 1 > MAX_GRIB_MESSAGE_BYTES
  ) {
    throw new Error('Invalid GRIB2 byte range bounds');
  }

  const expectedLen = end - start + 1;
  const res = await fetchImpl(url, {
    signal,
    redirect: 'error',
    headers: { Range: `bytes=${start}-${end}` },
  });
  const okStatus = res.status === 206 || (res.status === 200 && start === 0);
  if (!okStatus || !res.ok) {
    await res.body?.cancel?.();
    throw new Error(`GRIB2 range request failed with HTTP ${res.status}`);
  }
  const bytes = await readBoundedResponse(res, expectedLen, signal);
  if (bytes.byteLength !== expectedLen) {
    throw new Error(`GRIB2 range byte length mismatch (${bytes.byteLength} !== ${expectedLen})`);
  }
  return bytes;
}

async function loadOptionalScalarMessage(params: {
  url: string;
  range?: ByteRangeSpec;
  fetchImpl: typeof fetch;
  signal?: AbortSignal;
}): Promise<DecodedGrib2Message | undefined> {
  if (!params.range) return undefined;
  const controller = new AbortController();
  const onAbort = () => controller.abort(params.signal?.reason);
  params.signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), OPTIONAL_SCALAR_TIMEOUT_MS);
  try {
    params.signal?.throwIfAborted?.();
    const bytes = await fetchRangeSafe(params.url, params.range, params.fetchImpl, controller.signal);
    const decoded = decodeWindGrib2Message(bytes);
    controller.signal.throwIfAborted?.();
    return decoded;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
    controller.abort();
    params.signal?.removeEventListener('abort', onAbort);
  }
}

/** Resamples a decoded 0.25° global GRIB2 field onto a normalized 1° north-to-south grid (lo1=0, la1=90). */
export function resampleWindField(params: {
  u: DecodedGrib2Message;
  v: DecodedGrib2Message;
  scalar?: DecodedGrib2Message;
  overlay: GlobalWindOverlayKind;
  targetDx?: number;
}): {
  width: number;
  height: number;
  lo1: number;
  la1: number;
  dx: number;
  dy: number;
  u: Float32Array;
  v: Float32Array;
  scalarValues: Float32Array | null;
  scalarError: string | null;
} {
  const { u, v, scalar, overlay, targetDx = TARGET_GRID_RESOLUTION_DEG } = params;
  if (
    u.ni !== v.ni ||
    u.nj !== v.nj ||
    u.lo1 !== v.lo1 ||
    u.la1 !== v.la1 ||
    u.di !== v.di ||
    u.dj !== v.dj ||
    u.scanMode !== v.scanMode
  ) {
    throw new Error('Mismatched U and V GRIB2 grid geometry');
  }

  const width = Math.round(360 / targetDx);
  const height = Math.round(180 / targetDx) + 1;
  const outCount = width * height;
  if (outCount > 1_000_000 || targetDx < 0.25 || targetDx > 10) {
    throw new Error('Resampled wind grid exceeds allowed resolution bounds');
  }

  const southToNorth = (u.scanMode & 0x40) !== 0;

  const sampleSrc = (src: Float64Array, msg: DecodedGrib2Message, lon: number, lat: number): number => {
    const x = (((lon - msg.lo1) / msg.di) % msg.ni + msg.ni) % msg.ni;
    const rawY = southToNorth
      ? (lat - msg.la1) / msg.dj
      : (msg.la1 - lat) / msg.dj;
    const y = Math.max(0, Math.min(msg.nj - 1, rawY));
    const x0 = Math.floor(x);
    const x1 = (x0 + 1) % msg.ni;
    const y0 = Math.floor(y);
    const y1 = Math.min(msg.nj - 1, y0 + 1);
    const fx = x - x0;
    const fy = y - y0;

    const a = src[y0 * msg.ni + x0];
    const b = src[y0 * msg.ni + x1];
    const c = src[y1 * msg.ni + x0];
    const d = src[y1 * msg.ni + x1];
    const top = a * (1 - fx) + b * fx;
    const bottom = c * (1 - fx) + d * fx;
    return top * (1 - fy) + bottom * fy;
  };

  let usableScalar: DecodedGrib2Message | undefined = scalar;
  let scalarError: string | null = null;
  if (overlay === 'temperature' || overlay === 'pressure') {
    if (
      !usableScalar ||
      usableScalar.ni !== u.ni ||
      usableScalar.nj !== u.nj ||
      usableScalar.lo1 !== u.lo1 ||
      usableScalar.la1 !== u.la1
    ) {
      usableScalar = undefined;
      scalarError =
        overlay === 'temperature'
          ? '2 m temperature field unavailable for this cycle'
          : 'Mean sea-level pressure field unavailable for this cycle';
    }
  } else {
    usableScalar = undefined;
  }

  const outU = new Float32Array(outCount);
  const outV = new Float32Array(outCount);
  const outScalar = usableScalar ? new Float32Array(outCount) : null;

  const scalarScale = overlay === 'pressure' ? 0.01 : 1;
  const scalarOffset = overlay === 'temperature' ? -273.15 : 0;

  for (let row = 0; row < height; row++) {
    const lat = 90 - row * targetDx;
    for (let col = 0; col < width; col++) {
      const lon = col * targetDx;
      const idx = row * width + col;
      const su = sampleSrc(u.values, u, lon, lat);
      const sv = sampleSrc(v.values, v, lon, lat);
      if (!Number.isFinite(su) || !Number.isFinite(sv)) {
        throw new Error('Non-finite resampled wind vector component');
      }
      outU[idx] = su;
      outV[idx] = sv;
      if (outScalar && usableScalar) {
        const ss = sampleSrc(usableScalar.values, usableScalar, lon, lat) * scalarScale + scalarOffset;
        if (!Number.isFinite(ss)) {
          throw new Error('Non-finite resampled scalar field value');
        }
        outScalar[idx] = ss;
      }
    }
  }

  return {
    width,
    height,
    lo1: 0,
    la1: 90,
    dx: targetDx,
    dy: targetDx,
    u: outU,
    v: outV,
    scalarValues: outScalar,
    scalarError,
  };
}

function resolveGlobalFreshness(params: {
  validTimeUtc: string;
  nowMs: number;
  isStale: boolean;
}): { freshness: GlobalWindFreshnessStatus; ageMinutes: number } {
  const { validTimeUtc, nowMs, isStale } = params;
  const validMs = Date.parse(validTimeUtc);
  const diffMinutes = Math.round((nowMs - validMs) / 60_000);
  if (isStale) {
    return { freshness: 'stale', ageMinutes: Math.abs(diffMinutes) };
  }
  if (validMs - nowMs > 30 * 60_000) {
    return { freshness: 'forecast', ageMinutes: Math.abs(diffMinutes) };
  }
  if (nowMs - validMs > 180 * 60_000) {
    return { freshness: 'historical', ageMinutes: Math.abs(diffMinutes) };
  }
  return { freshness: 'current', ageMinutes: Math.max(0, Math.abs(diffMinutes)) };
}

function modelMetadata(model: GlobalWindModelId): {
  modelName: string;
  provider: string;
  attribution: string;
  license: string;
} {
  if (model === 'ifs') {
    return {
      modelName: 'ECMWF IFS (0.25° -> 1° grid)',
      provider: 'ECMWF Open Data',
      attribution: 'ECMWF Integrated Forecasting System (IFS) Open Data · 10 m Surface Wind',
      license: 'CC BY 4.0 (© European Centre for Medium-Range Weather Forecasts)',
    };
  }
  return {
    modelName: 'NOAA GFS (0.25° -> 1° grid)',
    provider: 'NOAA / NCEP Open Data',
    attribution: 'NOAA / NCEP Global Forecast System (GFS) · 10 m Surface Wind',
    license: 'Public Domain (U.S. Government Open Data)',
  };
}

function buildUnavailableGlobalSnapshot(params: {
  model: GlobalWindModelId;
  overlay: GlobalWindOverlayKind;
  status: WindForecastStatus;
  reason: string;
}): GlobalWindSnapshot {
  const meta = modelMetadata(params.model);
  return {
    manifest: {
      schemaVersion: 2,
      model: params.model,
      modelName: meta.modelName,
      provider: meta.provider,
      initTimeUtc: null,
      validTimeUtc: null,
      forecastHour: null,
      retrievedAtUtc: new Date().toISOString(),
      grid: {
        width: 0,
        height: 0,
        lo1: 0,
        la1: 90,
        dx: 1,
        dy: 1,
        bounds: { west: -180, south: -90, east: 180, north: 90 },
        resolutionDeg: 1,
        nativeResolutionDeg: 0.25,
      },
      level: '10 m above ground',
      units: 'm/s',
      overlay: params.overlay,
      scalar: null,
      scalarError: null,
      status: params.status,
      freshness: 'unavailable',
      ageMinutes: null,
      isAvailable: false,
      isCached: false,
      isStale: false,
      unavailableReason: params.reason,
      attribution: meta.attribution,
      license: meta.license,
      cycle: null,
      gridUrl: null,
    },
    u: new Float32Array(0),
    v: new Float32Array(0),
    scalarValues: null,
  };
}

async function fetchCycleFromProvider(params: {
  model: GlobalWindModelId;
  overlay: GlobalWindOverlayKind;
  cycle: GlobalWindCycleInfo;
  nowMs: number;
  fetchImpl: typeof fetch;
  signal?: AbortSignal;
}): Promise<GlobalWindSnapshot> {
  const { model, overlay, cycle, nowMs, fetchImpl, signal } = params;
  const gribUrl = model === 'ifs' ? ifsObjectUrls(cycle).grib : gfsObjectUrl(cycle);
  const indexUrl = model === 'ifs' ? ifsObjectUrls(cycle).index : `${gfsObjectUrl(cycle)}.idx`;

  const idxResp = await fetchTextSafe(indexUrl, fetchImpl, signal);
  if (idxResp.status === 404) {
    throw new Error(`HTTP_404:${indexUrl}`);
  }
  if (!idxResp.text) {
    throw new Error(`Empty inventory from ${model.toUpperCase()}`);
  }

  const ranges =
    model === 'ifs'
      ? ifsWindRanges(parseIfsIndex(idxResp.text), overlay)
      : gfsMessageRanges(parseGfsIdx(idxResp.text), overlay);

  const [uBytes, vBytes, scalarMsg] = await Promise.all([
    fetchRangeSafe(gribUrl, ranges.u, fetchImpl, signal),
    fetchRangeSafe(gribUrl, ranges.v, fetchImpl, signal),
    loadOptionalScalarMessage({
      url: gribUrl,
      range: ranges.scalar,
      fetchImpl,
      signal,
    }),
  ]);
  signal?.throwIfAborted?.();

  const uMsg = decodeWindGrib2Message(uBytes);
  const vMsg = decodeWindGrib2Message(vBytes);

  const resampled = resampleWindField({
    u: uMsg,
    v: vMsg,
    scalar: scalarMsg,
    overlay,
    targetDx: TARGET_GRID_RESOLUTION_DEG,
  });

  const meta = modelMetadata(model);
  const effectiveOverlay: GlobalWindOverlayKind =
    resampled.scalarValues !== null ? overlay : overlay === 'speed' ? 'speed' : 'none';
  const scalarMeta =
    resampled.scalarValues !== null && (overlay === 'temperature' || overlay === 'pressure')
      ? scalarMetadataForOverlay(overlay)
      : null;

  const initTimeUtc = uMsg.initTimeUtc;
  const validTimeUtc = uMsg.validTimeUtc;
  const retrievedAtUtc = new Date(nowMs).toISOString();
  const fresh = resolveGlobalFreshness({ validTimeUtc, nowMs, isStale: false });

  const id = `${model}-${cycle.date}-${cycle.hour}-f${cycle.forecastHour}-${overlay}${resampled.scalarValues ? '' : '-wind-only'}`;
  const gridQuery = new URLSearchParams({
    model,
    overlay: scalarMeta ? scalarMeta.kind : 'none',
    date: cycle.date,
    hour: String(cycle.hour),
    step: String(cycle.forecastHour),
  });
  const gridUrl = `/api/environment/wind/global/grid?${gridQuery.toString()}`;

  return {
    manifest: {
      schemaVersion: 2,
      model,
      modelName: meta.modelName,
      provider: meta.provider,
      initTimeUtc,
      validTimeUtc,
      forecastHour: cycle.forecastHour,
      retrievedAtUtc,
      grid: {
        width: resampled.width,
        height: resampled.height,
        lo1: resampled.lo1,
        la1: resampled.la1,
        dx: resampled.dx,
        dy: resampled.dy,
        bounds: { west: -180, south: -90, east: 180, north: 90 },
        resolutionDeg: resampled.dx,
        nativeResolutionDeg: uMsg.di,
      },
      level: '10 m above ground',
      units: 'm/s',
      overlay: effectiveOverlay,
      scalar: scalarMeta,
      scalarError: resampled.scalarError,
      status: 'available',
      freshness: fresh.freshness,
      ageMinutes: fresh.ageMinutes,
      isAvailable: true,
      isCached: false,
      isStale: false,
      unavailableReason: null,
      attribution: meta.attribution,
      license: meta.license,
      cycle,
      gridUrl,
    },
    u: resampled.u,
    v: resampled.v,
    scalarValues: resampled.scalarValues,
  };
}

function createAbortError(reason?: unknown): Error {
  if (reason instanceof Error && reason.name === 'AbortError') {
    return reason;
  }
  return new DOMException('The operation was aborted', 'AbortError');
}

function canonicalCycleKey(
  model: GlobalWindModelId,
  overlay: GlobalWindOverlayKind,
  cycle: GlobalWindCycleInfo
): string {
  return `${model}:${overlay}:${cycle.date}:${cycle.hour}:f${cycle.forecastHour}`;
}

function maxModelForecastHours(model: GlobalWindModelId, cycleHour: number): number {
  if (model === 'ifs') {
    return cycleHour === 6 || cycleHour === 18 ? 144 : 360;
  }
  return 384;
}

function resolveModelStep(
  model: GlobalWindModelId,
  hoursElapsed: number,
  cycleHour: number
): number {
  return model === 'ifs'
    ? nearestIfsStep(hoursElapsed, cycleHour)
    : nearestGfsStep(hoursElapsed);
}

function touchMapEntry<K, V>(map: Map<K, V>, key: K, value: V): void {
  map.delete(key);
  map.set(key, value);
}

/**
 * Validates that an explicit `targetValidTimeUtc` falls inside the operational forecast horizon
 * of the active NWP model (24 h past lookback through 384 h GFS / 360 h IFS future steps).
 */
export function validateForecastTargetTime(params: {
  model: GlobalWindModelId;
  targetValidTimeUtc?: string;
  nowMs: number;
}): {
  ok: true;
  targetMs: number;
  hasExplicitTarget: boolean;
  primaryCycle: { date: string; hour: number };
  candidates: Array<{ date: string; hour: number }>;
  minValidTimeUtc: string;
  maxValidTimeUtc: string;
} | {
  ok: false;
  reason: string;
  minValidTimeUtc: string;
  maxValidTimeUtc: string;
} {
  const { model, targetValidTimeUtc, nowMs } = params;
  const primaryCycle =
    model === 'ifs' ? selectLatestIfsCycle(nowMs) : selectLatestGfsCycle(nowMs);
  const fallbackCycle = stepBackSynopticCycle(primaryCycle, 6);
  const baseCandidates = [primaryCycle, fallbackCycle];

  const minMs = nowMs - GLOBAL_WIND_PAST_HORIZON_MS;
  const maxMs = Math.max(
    ...baseCandidates.map(
      (c) => cycleRunMs(c) + maxModelForecastHours(model, c.hour) * 3600_000
    )
  );
  const minValidTimeUtc = new Date(minMs).toISOString();
  const maxValidTimeUtc = new Date(maxMs).toISOString();

  if (targetValidTimeUtc === undefined) {
    return {
      ok: true,
      targetMs: nowMs,
      hasExplicitTarget: false,
      primaryCycle,
      candidates: baseCandidates,
      minValidTimeUtc,
      maxValidTimeUtc,
    };
  }

  const parsedMs =
    typeof targetValidTimeUtc === 'string' && targetValidTimeUtc.trim().length > 0
      ? Date.parse(targetValidTimeUtc)
      : Number.NaN;
  if (Number.isNaN(parsedMs)) {
    return {
      ok: false,
      reason: 'Invalid validTimeUtc. Expected ISO-8601 UTC timestamp.',
      minValidTimeUtc,
      maxValidTimeUtc,
    };
  }

  if (parsedMs < minMs || parsedMs > maxMs) {
    return {
      ok: false,
      reason: `Requested validTimeUtc (${new Date(parsedMs).toISOString()}) is outside the supported ${model.toUpperCase()} forecast horizon (${minValidTimeUtc} to ${maxValidTimeUtc}).`,
      minValidTimeUtc,
      maxValidTimeUtc,
    };
  }

  const coveredCandidates = baseCandidates.filter(
    (c) => parsedMs <= cycleRunMs(c) + maxModelForecastHours(model, c.hour) * 3600_000
  );

  return {
    ok: true,
    targetMs: parsedMs,
    hasExplicitTarget: true,
    primaryCycle,
    candidates: coveredCandidates.length > 0 ? coveredCandidates : [fallbackCycle],
    minValidTimeUtc,
    maxValidTimeUtc,
  };
}

/** Removes expired cached snapshots, aliases, and failure backoff records without touching active in-flight work. */
export function pruneExpiredGlobalWindCache(
  nowMs = Date.now(),
  maxAgeMs = GLOBAL_WIND_CACHE_MAX_STALE_MS
): { evictedSnapshots: number; evictedAliases: number; evictedFailures: number } {
  let evictedSnapshots = 0;
  for (const [key, state] of cycleSnapshotCache.entries()) {
    if (nowMs - state.fetchedAtMs >= maxAgeMs) {
      cycleSnapshotCache.delete(key);
      evictedSnapshots++;
    }
  }

  let evictedAliases = 0;
  for (const [aliasKey, alias] of targetResolutionIndex.entries()) {
    if (
      !cycleSnapshotCache.has(alias.canonicalKey) ||
      nowMs - alias.fetchedAtMs >= maxAgeMs
    ) {
      targetResolutionIndex.delete(aliasKey);
      evictedAliases++;
    }
  }

  let evictedFailures = 0;
  for (const [failKey, failedAt] of lastFailureMs.entries()) {
    if (nowMs - failedAt >= NEGATIVE_BACKOFF_MS) {
      lastFailureMs.delete(failKey);
      evictedFailures++;
    }
  }

  return { evictedSnapshots, evictedAliases, evictedFailures };
}

function setCycleSnapshotCache(
  canonicalKey: string,
  state: CachedGlobalWindState,
  nowMs: number,
  ttlMs = DEFAULT_TTL_MS
): void {
  pruneExpiredGlobalWindCache(nowMs);

  if (cycleSnapshotCache.has(canonicalKey)) {
    touchMapEntry(cycleSnapshotCache, canonicalKey, state);
  } else {
    // Prefer evicting TTL-expired stale entries (oldest first) before active fresh entries.
    if (cycleSnapshotCache.size >= GLOBAL_WIND_CACHE_MAX_SNAPSHOTS) {
      for (const [key, existing] of cycleSnapshotCache.entries()) {
        if (cycleSnapshotCache.size < GLOBAL_WIND_CACHE_MAX_SNAPSHOTS) break;
        if (nowMs - existing.fetchedAtMs >= ttlMs) {
          cycleSnapshotCache.delete(key);
        }
      }
    }
    // Enforce hard global LRU cap regardless of remaining TTL.
    while (cycleSnapshotCache.size >= GLOBAL_WIND_CACHE_MAX_SNAPSHOTS) {
      const oldestKey = cycleSnapshotCache.keys().next().value;
      if (!oldestKey) break;
      cycleSnapshotCache.delete(oldestKey);
    }
    cycleSnapshotCache.set(canonicalKey, state);
  }

  // Drop dangling aliases referencing evicted snapshots.
  for (const [aliasKey, alias] of targetResolutionIndex.entries()) {
    if (!cycleSnapshotCache.has(alias.canonicalKey)) {
      targetResolutionIndex.delete(aliasKey);
    }
  }
}

function setTargetResolutionAlias(
  requestKey: string,
  canonicalKey: string,
  fetchedAtMs: number
): void {
  while (
    !targetResolutionIndex.has(requestKey) &&
    targetResolutionIndex.size >= GLOBAL_WIND_CACHE_MAX_ALIASES
  ) {
    const oldestAlias = targetResolutionIndex.keys().next().value;
    if (!oldestAlias) break;
    targetResolutionIndex.delete(oldestAlias);
  }
  touchMapEntry(targetResolutionIndex, requestKey, { canonicalKey, fetchedAtMs });
}

function recordFailureBackoff(requestKey: string, nowMs: number): void {
  for (const [key, ts] of lastFailureMs.entries()) {
    if (nowMs - ts >= NEGATIVE_BACKOFF_MS) {
      lastFailureMs.delete(key);
    }
  }
  while (
    !lastFailureMs.has(requestKey) &&
    lastFailureMs.size >= GLOBAL_WIND_FAILURE_CACHE_MAX_ENTRIES
  ) {
    const oldestKey = lastFailureMs.keys().next().value;
    if (!oldestKey) break;
    lastFailureMs.delete(oldestKey);
  }
  touchMapEntry(lastFailureMs, requestKey, nowMs);
}

function findCachedState(
  requestKey: string,
  nowMs: number
): { canonicalKey: string; state: CachedGlobalWindState } | null {
  const direct = cycleSnapshotCache.get(requestKey);
  if (direct && nowMs - direct.fetchedAtMs < GLOBAL_WIND_CACHE_MAX_STALE_MS) {
    touchMapEntry(cycleSnapshotCache, requestKey, direct);
    return { canonicalKey: requestKey, state: direct };
  }
  if (direct && nowMs - direct.fetchedAtMs >= GLOBAL_WIND_CACHE_MAX_STALE_MS) {
    cycleSnapshotCache.delete(requestKey);
  }

  const alias = targetResolutionIndex.get(requestKey);
  if (!alias) return null;
  const resolved = cycleSnapshotCache.get(alias.canonicalKey);
  if (!resolved || nowMs - resolved.fetchedAtMs >= GLOBAL_WIND_CACHE_MAX_STALE_MS) {
    targetResolutionIndex.delete(requestKey);
    if (resolved) cycleSnapshotCache.delete(alias.canonicalKey);
    return null;
  }

  touchMapEntry(targetResolutionIndex, requestKey, alias);
  touchMapEntry(cycleSnapshotCache, alias.canonicalKey, resolved);
  return { canonicalKey: alias.canonicalKey, state: resolved };
}

function awaitWithCallerSignal<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  onCallerAbort: () => void
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    onCallerAbort();
    return Promise.reject(createAbortError(signal.reason));
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const handleAbort = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', handleAbort);
      onCallerAbort();
      reject(createAbortError(signal.reason));
    };

    signal.addEventListener('abort', handleAbort, { once: true });

    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', handleAbort);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', handleAbort);
        reject(err);
      }
    );
  });
}

/**
 * Fetches and caches the normalized global wind vector snapshot for `gfs` or `ifs`.
 * Tries the latest published synoptic cycle and steps back 6 hours if not yet published.
 */
export async function fetchGlobalWindSnapshot(params: {
  model?: GlobalWindModelId;
  overlay?: GlobalWindOverlayKind;
  targetValidTimeUtc?: string;
  now?: () => number;
  bypassCache?: boolean;
  ttlMs?: number;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<GlobalWindSnapshot> {
  if (params.signal?.aborted) {
    throw createAbortError(params.signal.reason);
  }

  const model: GlobalWindModelId = params.model === 'ifs' ? 'ifs' : 'gfs';
  const rawOverlay = params.overlay ?? 'none';
  const fetchOverlay: GlobalWindOverlayKind =
    rawOverlay === 'temperature' || rawOverlay === 'pressure' ? rawOverlay : 'none';
  const now = params.now ?? (() => Date.now());
  const nowMs = now();
  const ttlMs = params.ttlMs ?? DEFAULT_TTL_MS;
  const fetchImpl = params.fetchImpl ?? fetch;

  const horizonCheck = validateForecastTargetTime({
    model,
    targetValidTimeUtc: params.targetValidTimeUtc,
    nowMs,
  });
  if (!horizonCheck.ok) {
    throw new WindForecastRangeError(
      horizonCheck.reason,
      horizonCheck.minValidTimeUtc,
      horizonCheck.maxValidTimeUtc
    );
  }

  const { targetMs, hasExplicitTarget, candidates } = horizonCheck;
  const anchorCycle = candidates[0];
  const requestKey = hasExplicitTarget
    ? canonicalCycleKey(model, fetchOverlay, {
        ...anchorCycle,
        forecastHour: resolveModelStep(
          model,
          (targetMs - cycleRunMs(anchorCycle)) / 3600_000,
          anchorCycle.hour
        ),
      })
    : `${model}:${fetchOverlay}:latest`;

  if (!params.bypassCache) {
    const cachedHit = findCachedState(requestKey, nowMs);
    if (cachedHit && nowMs - cachedHit.state.fetchedAtMs < ttlMs) {
      const fresh = resolveGlobalFreshness({
        validTimeUtc:
          cachedHit.state.snapshot.manifest.validTimeUtc ?? new Date(nowMs).toISOString(),
        nowMs,
        isStale: false,
      });
      return {
        ...cachedHit.state.snapshot,
        manifest: {
          ...cachedHit.state.snapshot.manifest,
          isCached: true,
          isStale: false,
          freshness: fresh.freshness,
          ageMinutes: fresh.ageMinutes,
        },
      };
    }

    const lastFail = lastFailureMs.get(requestKey);
    if (lastFail !== undefined) {
      if (nowMs - lastFail >= NEGATIVE_BACKOFF_MS) {
        lastFailureMs.delete(requestKey);
      } else {
        const staleHit = cachedHit ?? findCachedState(requestKey, nowMs);
        if (staleHit) {
          const fresh = resolveGlobalFreshness({
            validTimeUtc:
              staleHit.state.snapshot.manifest.validTimeUtc ?? new Date(nowMs).toISOString(),
            nowMs,
            isStale: true,
          });
          return {
            ...staleHit.state.snapshot,
            manifest: {
              ...staleHit.state.snapshot.manifest,
              status: 'stale_cached',
              freshness: 'stale',
              ageMinutes: fresh.ageMinutes,
              isCached: true,
              isStale: true,
              unavailableReason: 'Upstream retry cooldown active; serving stale cached forecast.',
            },
          };
        }
        return buildUnavailableGlobalSnapshot({
          model,
          overlay: fetchOverlay,
          status: 'temporarily_unavailable',
          reason: 'Global wind upstream temporarily unavailable (backoff cooldown).',
        });
      }
    }
  }

  const shared = !params.bypassCache;
  let entry = shared ? inflightMap.get(requestKey) : undefined;

  if (!entry) {
    const newEntry: InflightGlobalWindEntry = {
      subscribers: 0,
      controller: new AbortController(),
      cancelledBySubscribers: false,
      promise: null as unknown as Promise<GlobalWindSnapshot>,
    };

    newEntry.promise = (async (): Promise<GlobalWindSnapshot> => {
      const timer = setTimeout(
        () => newEntry.controller.abort(UPSTREAM_TIMEOUT_REASON),
        UPSTREAM_TIMEOUT_MS
      );

      try {
        let lastErr: unknown = null;
        for (const baseCycle of candidates) {
          if (newEntry.cancelledBySubscribers) break;
          const runMs = cycleRunMs(baseCycle);
          const elapsedHours = (targetMs - runMs) / 3600_000;
          const forecastHour = resolveModelStep(model, elapsedHours, baseCycle.hour);
          const cycle: GlobalWindCycleInfo = { ...baseCycle, forecastHour };
          try {
            const snapshot = await fetchCycleFromProvider({
              model,
              overlay: fetchOverlay,
              cycle,
              nowMs,
              fetchImpl,
              signal: newEntry.controller.signal,
            });
            if (newEntry.cancelledBySubscribers) {
              return buildUnavailableGlobalSnapshot({
                model,
                overlay: fetchOverlay,
                status: 'temporarily_unavailable',
                reason: 'Global wind request cancelled by caller.',
              });
            }
            const fetchedAtMs = now();
            const canonicalKey = canonicalCycleKey(model, fetchOverlay, cycle);
            const state: CachedGlobalWindState = {
              id: `${cycle.date}-${cycle.hour}-f${cycle.forecastHour}`,
              snapshot,
              fetchedAtMs,
            };
            setCycleSnapshotCache(canonicalKey, state, fetchedAtMs, ttlMs);
            if (canonicalKey !== requestKey) {
              setTargetResolutionAlias(requestKey, canonicalKey, fetchedAtMs);
            }
            lastFailureMs.delete(requestKey);
            return snapshot;
          } catch (err) {
            lastErr = err;
            if (newEntry.cancelledBySubscribers || newEntry.controller.signal.aborted) break;
          }
        }

        throw lastErr ?? new Error('Global wind provider unavailable');
      } catch (err: any) {
        if (
          newEntry.cancelledBySubscribers ||
          newEntry.controller.signal.reason === CANCELLED_BY_SUBSCRIBERS_REASON
        ) {
          return buildUnavailableGlobalSnapshot({
            model,
            overlay: fetchOverlay,
            status: 'temporarily_unavailable',
            reason: 'Global wind request cancelled by caller.',
          });
        }

        const failNowMs = now();
        recordFailureBackoff(requestKey, failNowMs);
        const isTimeout =
          newEntry.controller.signal.reason === UPSTREAM_TIMEOUT_REASON ||
          err?.name === 'AbortError' ||
          err?.message === 'TimeoutError';
        const staleHit = findCachedState(requestKey, failNowMs);
        if (staleHit) {
          const fresh = resolveGlobalFreshness({
            validTimeUtc:
              staleHit.state.snapshot.manifest.validTimeUtc ?? new Date(failNowMs).toISOString(),
            nowMs: failNowMs,
            isStale: true,
          });
          return {
            ...staleHit.state.snapshot,
            manifest: {
              ...staleHit.state.snapshot.manifest,
              status: 'stale_cached',
              freshness: 'stale',
              ageMinutes: fresh.ageMinutes,
              isCached: true,
              isStale: true,
              unavailableReason: `${isTimeout ? 'Upstream timeout' : 'Upstream error'}; serving stale cached forecast from ${staleHit.state.snapshot.manifest.retrievedAtUtc}.`,
            },
          };
        }
        return buildUnavailableGlobalSnapshot({
          model,
          overlay: fetchOverlay,
          status: isTimeout ? 'upstream_timeout' : 'temporarily_unavailable',
          reason:
            err instanceof Error && !err.message.startsWith('HTTP_404')
              ? err.message
              : `Unable to retrieve ${model.toUpperCase()} global wind forecast GRIB2 field.`,
        });
      } finally {
        clearTimeout(timer);
        if (shared && inflightMap.get(requestKey) === newEntry) {
          inflightMap.delete(requestKey);
        }
      }
    })();

    // Ensure background rejection can never become an unhandled promise rejection if all subscribers leave early.
    newEntry.promise.catch(() => {});

    if (shared) {
      inflightMap.set(requestKey, newEntry);
    }
    entry = newEntry;
  }

  entry.subscribers += 1;
  return awaitWithCallerSignal(entry.promise, params.signal, () => {
    entry.subscribers = Math.max(0, entry.subscribers - 1);
    if (entry.subscribers === 0) {
      entry.cancelledBySubscribers = true;
      if (shared && inflightMap.get(requestKey) === entry) {
        inflightMap.delete(requestKey);
      }
      entry.controller.abort(CANCELLED_BY_SUBSCRIBERS_REASON);
    }
  });
}

export function encodeGlobalWindBinaryGrid(snapshot: GlobalWindSnapshot): Uint8Array {
  const count = snapshot.manifest.grid.width * snapshot.manifest.grid.height;
  if (
    count < 1 ||
    snapshot.u.length !== count ||
    snapshot.v.length !== count ||
    (snapshot.scalarValues && snapshot.scalarValues.length !== count)
  ) {
    throw new Error('Cannot encode malformed global wind snapshot');
  }

  const arrays = snapshot.scalarValues
    ? [snapshot.u, snapshot.v, snapshot.scalarValues]
    : [snapshot.u, snapshot.v];
  const totalBytes = arrays.length * count * 4;
  const out = new Uint8Array(totalBytes);
  let byteOffset = 0;

  for (const arr of arrays) {
    const view = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    out.set(view, byteOffset);
    byteOffset += arr.byteLength;
  }

  return out;
}

/**
 * Resolves the compact Float32 binary payload `[u, v, (optional scalar)]` for a specific
 * immutable cycle tuple, checking warm serverless memory first and cleanly falling back to
 * fetching/decoding that exact cycle when hitting a cold serverless container.
 */
export async function fetchGlobalWindBinaryByCycle(params: {
  model: GlobalWindModelId;
  overlay: GlobalWindOverlayKind;
  date: string;
  hour: number;
  forecastHour: number;
  now?: () => number;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<{ bytes: Uint8Array; manifest: GlobalWindManifest }> {
  if (params.signal?.aborted) {
    throw createAbortError(params.signal.reason);
  }

  const { model, overlay, date, hour, forecastHour } = params;
  const fetchOverlay: GlobalWindOverlayKind =
    overlay === 'temperature' || overlay === 'pressure' ? overlay : 'none';
  const nowFn = params.now ?? (() => Date.now());
  const nowMs = nowFn();
  const canonicalKey = canonicalCycleKey(model, fetchOverlay, {
    date,
    hour,
    forecastHour,
  });

  const cached = cycleSnapshotCache.get(canonicalKey);
  if (cached && nowMs - cached.fetchedAtMs < GLOBAL_WIND_CACHE_MAX_STALE_MS) {
    touchMapEntry(cycleSnapshotCache, canonicalKey, cached);
    return {
      bytes: encodeGlobalWindBinaryGrid(cached.snapshot),
      manifest: cached.snapshot.manifest,
    };
  }
  if (cached && nowMs - cached.fetchedAtMs >= GLOBAL_WIND_CACHE_MAX_STALE_MS) {
    cycleSnapshotCache.delete(canonicalKey);
  }

  const snapshot = await fetchCycleFromProvider({
    model,
    overlay: fetchOverlay,
    cycle: { date, hour, forecastHour },
    nowMs,
    fetchImpl: params.fetchImpl ?? fetch,
    signal: params.signal,
  });

  setCycleSnapshotCache(
    canonicalKey,
    {
      id: `${date}-${hour}-f${forecastHour}`,
      snapshot,
      fetchedAtMs: nowFn(),
    },
    nowMs
  );

  return {
    bytes: encodeGlobalWindBinaryGrid(snapshot),
    manifest: snapshot.manifest,
  };
}
