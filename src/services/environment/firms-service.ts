/**
 * NASA FIRMS Active-Fire Hotspots Service (Phase 4)
 *
 * Queries the official NASA FIRMS Area API (`/api/area/csv/{MAP_KEY}/VIIRS_NOAA20_NRT/{bbox}/{dayRange}`)
 * with:
 * - Server-only `FIRMS_MAP_KEY` protection & sanitized diagnostics (zero secret leakage)
 * - Spherical bounding boxes accounting for latitude cosine & international date line crossings
 * - Exact Haversine great-circle filtering and strict CSV parsing
 * - Explicit state discrimination (active detections, zero detections, unconfigured, invalid credentials,
 *   quota exceeded, timeout, malformed CSV, upstream error, stale cached)
 */

import https from 'node:https';
import { Readable } from 'node:stream';
import {
  FIRMS_SCIENTIFIC_DISCLAIMER,
  FirmsHotspot,
  FirmsStatusResponse,
  filterHotspotsNearCoordinates,
  parseFirmsCsvDetailed,
} from '@/domain/firms-types';

const FIRMS_DATASET = 'VIIRS_NOAA20_NRT';
const FIRMS_PUBLIC_DATASET = 'VIIRS_NOAA20_C2_24H';
const FIRMS_SATELLITE = 'NOAA-20';
const FIRMS_INSTRUMENT: 'VIIRS' | 'MODIS' = 'VIIRS';
const FIRMS_DAY_RANGE = 1;
const EARTH_MEAN_RADIUS_KM = 6371.0088;

interface FirmsCacheEntry {
  cachedAtMs: number;
  cachedAtUtc: string;
  data: FirmsStatusResponse;
}

interface FirmsPublicRegionCacheEntry {
  cachedAtMs: number;
  cachedAtUtc: string;
  hotspots: FirmsHotspot[];
}

interface FirmsPublicRegionSpec {
  id: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  approxBytes: number;
}

// Official keyless NASA FIRMS NOAA-20 VIIRS C2 trailing-24h regional CSV archives ordered smallest-first.
const FIRMS_PUBLIC_REGIONS: readonly FirmsPublicRegionSpec[] = [
  { id: 'Alaska', minLat: 51, maxLat: 72, minLng: -179, maxLng: -129, approxBytes: 10_000 },
  { id: 'Canada', minLat: 40, maxLat: 75, minLng: -141, maxLng: -52, approxBytes: 52_000 },
  { id: 'Europe', minLat: 33, maxLat: 72, minLng: -26, maxLng: 36, approxBytes: 66_000 },
  { id: 'Central_America', minLat: 6, maxLat: 34, minLng: -118, maxLng: -58, approxBytes: 180_000 },
  { id: 'USA_contiguous_and_Hawaii', minLat: 17, maxLat: 50, minLng: -159, maxLng: -64, approxBytes: 180_000 },
  { id: 'SouthEast_Asia', minLat: -13, maxLat: 32, minLng: 87, maxLng: 161, approxBytes: 305_000 },
  { id: 'South_Asia', minLat: 5, maxLat: 41, minLng: 53, maxLng: 103, approxBytes: 330_000 },
  { id: 'Australia_NewZealand', minLat: -48, maxLat: -9, minLng: 112, maxLng: 180, approxBytes: 775_000 },
  { id: 'Southern_Africa', minLat: -36, maxLat: -3, minLng: 10, maxLng: 58, approxBytes: 965_000 },
  { id: 'Russia_Asia', minLat: 9, maxLat: 73, minLng: 25, maxLng: 163, approxBytes: 1_200_000 },
  { id: 'South_America', minLat: -56, maxLat: 13, minLng: -87, maxLng: -34, approxBytes: 2_250_000 },
  { id: 'Northern_and_Central_Africa', minLat: -10, maxLat: 38, minLng: -26, maxLng: 53, approxBytes: 2_950_000 },
];

const firmsCache = new Map<string, FirmsCacheEntry>();
const firmsPublicRegionCache = new Map<string, FirmsPublicRegionCacheEntry>();
const firmsPublicInFlight = new Map<string, Promise<FirmsPublicRegionCacheEntry>>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function clearFirmsCache(): void {
  firmsCache.clear();
  firmsPublicRegionCache.clear();
  firmsPublicInFlight.clear();
}

/**
 * Selects the smallest official keyless NASA FIRMS 24h CSV archive region covering
 * `(latitude, longitude, radiusKm)`, falling back to `Global` for oceans/border crossings.
 */
export function selectPublicFirmsRegions(
  latitude: number,
  longitude: number,
  radiusKm: number
): string[] {
  const latDelta = (radiusKm / EARTH_MEAN_RADIUS_KM) * (180 / Math.PI);
  const cosLat = Math.max(0.15, Math.cos((latitude * Math.PI) / 180));
  const lngDelta = Math.min(180, latDelta / cosLat);

  const qSouth = Math.max(-90, latitude - latDelta);
  const qNorth = Math.min(90, latitude + latDelta);
  const qWest = longitude - lngDelta;
  const qEast = longitude + lngDelta;

  if (qWest < -180 || qEast > 180) {
    return ['Global'];
  }

  // Prefer single smallest region completely containing the search box
  const fullMatch = FIRMS_PUBLIC_REGIONS.find(
    (r) => qSouth >= r.minLat && qNorth <= r.maxLat && qWest >= r.minLng && qEast <= r.maxLng
  );
  if (fullMatch) {
    return [fullMatch.id];
  }

  // Next, intersect containing regions at query center before falling back to Global
  const overlapping = FIRMS_PUBLIC_REGIONS.filter(
    (r) => qNorth >= r.minLat && qSouth <= r.maxLat && qEast >= r.minLng && qWest <= r.maxLng
  );
  if (overlapping.length > 0 && overlapping.length <= 2) {
    return overlapping.map((r) => r.id);
  }

  return ['Global'];
}

function getAddressAttemptErrors(err: unknown): unknown[] | null {
  let cause = (err as { cause?: unknown } | null)?.cause as { cause?: unknown; errors?: unknown[] } | undefined;
  for (let depth = 0; cause && depth < 3; depth += 1) {
    if (Array.isArray(cause.errors) && cause.errors.length > 0) return cause.errors;
    cause = cause.cause as typeof cause;
  }
  return null;
}

function fetchFirmsOverIpv4(url: string, signal: AbortSignal): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { method: 'GET', signal, family: 4, agent: false },
      (res) => {
        try {
          const status = res.statusCode || 500;
          if (status > 599) throw new Error(`FIRMS returned unsupported HTTP status ${status}`);
          const headers = new Headers();
          for (const [key, val] of Object.entries(res.headers)) {
            if (Array.isArray(val)) val.forEach((v) => headers.append(key, v));
            else if (val !== undefined) headers.set(key, String(val));
          }
          const nullBody = status === 204 || status === 205 || status === 304;
          const body = nullBody ? null : (Readable.toWeb(res) as ReadableStream);
          if (nullBody) res.resume();
          resolve(new Response(body, { status, statusText: res.statusMessage || '', headers }));
        } catch (err) {
          res.destroy();
          reject(err);
        }
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function fetchFirmsWithIpv4Retry(
  url: string,
  timeoutMs: number,
  fetchImpl: typeof fetch
): Promise<Response> {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    return await fetchImpl(url, { signal });
  } catch (err) {
    if (
      fetchImpl === fetch &&
      err instanceof TypeError &&
      getAddressAttemptErrors(err) &&
      !signal.aborted
    ) {
      return fetchFirmsOverIpv4(url, signal);
    }
    throw err;
  }
}

function sanitizeFirmsErrorMessage(raw: unknown, apiKey?: string): string {
  let msg = raw instanceof Error ? raw.message : String(raw || 'Upstream request failed');
  if (apiKey && apiKey.trim().length > 0) {
    msg = msg.split(apiKey.trim()).join('[REDACTED]');
  }
  msg = msg.replace(/\/api\/area\/csv\/[^/\s]+/gi, '/api/area/csv/[REDACTED]');
  return msg.slice(0, 240);
}

/**
 * Computes bounded NASA FIRMS Area API bounding box(es) `west,south,east,north`
 * covering a spherical radius around `(latitude, longitude)`, splitting cleanly
 * into two non-wrapping boxes when crossing the international date line (`±180°`).
 */
export function computeFirmsBoundingBoxes(
  latitude: number,
  longitude: number,
  radiusKm: number
): string[] {
  const angularRadiusRad = radiusKm / EARTH_MEAN_RADIUS_KM;
  const latPadDeg = 0.05;
  const latDeltaDeg = (angularRadiusRad * 180) / Math.PI + latPadDeg;

  const south = Math.max(-90, latitude - latDeltaDeg);
  const north = Math.min(90, latitude + latDeltaDeg);

  // Near poles or when the search circle covers a pole, span full longitude [-180, 180]
  if (south <= -89.5 || north >= 89.5) {
    return [`-180.0000,${south.toFixed(4)},180.0000,${north.toFixed(4)}`];
  }

  const maxAbsLatRad = (Math.max(Math.abs(south), Math.abs(north)) * Math.PI) / 180;
  const cosMaxLat = Math.max(1e-6, Math.cos(maxAbsLatRad));
  const sinRatio = Math.sin(angularRadiusRad) / cosMaxLat;

  if (sinRatio >= 1) {
    return [`-180.0000,${south.toFixed(4)},180.0000,${north.toFixed(4)}`];
  }

  const lngDeltaDeg = Math.min(180, (Math.asin(sinRatio) * 180) / Math.PI + 0.05);
  const rawWest = longitude - lngDeltaDeg;
  const rawEast = longitude + lngDeltaDeg;

  if (rawWest < -180 && rawEast <= 180) {
    const wrappedWest = (rawWest + 360).toFixed(4);
    return [
      `${wrappedWest},${south.toFixed(4)},180.0000,${north.toFixed(4)}`,
      `-180.0000,${south.toFixed(4)},${rawEast.toFixed(4)},${north.toFixed(4)}`,
    ];
  }

  if (rawEast > 180 && rawWest >= -180) {
    const wrappedEast = (rawEast - 360).toFixed(4);
    return [
      `${rawWest.toFixed(4)},${south.toFixed(4)},180.0000,${north.toFixed(4)}`,
      `-180.0000,${south.toFixed(4)},${wrappedEast},${north.toFixed(4)}`,
    ];
  }

  const west = Math.max(-180, rawWest).toFixed(4);
  const east = Math.min(180, rawEast).toFixed(4);
  return [`${west},${south.toFixed(4)},${east},${north.toFixed(4)}`];
}

function buildUnavailableFirmsResponse(params: {
  configured: boolean;
  status: FirmsStatusResponse['status'];
  message: string;
  retrievedAt: string;
}): FirmsStatusResponse {
  return {
    configured: params.configured,
    isAvailable: false,
    isCached: false,
    isStale: false,
    cachedAtUtc: null,
    status: params.status,
    message: params.message,
    dataset: FIRMS_DATASET,
    satellite: FIRMS_SATELLITE,
    instrument: FIRMS_INSTRUMENT,
    dayRange: FIRMS_DAY_RANGE,
    hotspots: [],
    count: 0,
    retrievedAt: params.retrievedAt,
    latestObservationUtc: null,
    disclaimer: FIRMS_SCIENTIFIC_DISCLAIMER,
    uncertaintyNotes:
      'Active-fire satellite detection data is currently unavailable. Unavailable observations must never be interpreted as confirmation that no fires exist.',
    regionalContext: null,
  };
}

async function fetchKeylessPublicRegion(
  region: string,
  bypassCache: boolean,
  fetchImpl: typeof fetch
): Promise<{
  entry: FirmsPublicRegionCacheEntry;
  fromCache: boolean;
  isStale: boolean;
}> {
  const existing = firmsPublicRegionCache.get(region);
  const nowMs = Date.now();
  if (!bypassCache && existing && nowMs - existing.cachedAtMs < CACHE_TTL_MS) {
    return { entry: existing, fromCache: true, isStale: false };
  }

  let promise = firmsPublicInFlight.get(region);
  if (!promise) {
    const publicUrl = `https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_${encodeURIComponent(region)}_24h.csv`;
    promise = (async () => {
      const res = await fetchFirmsWithIpv4Retry(publicUrl, 12_000, fetchImpl);
      if (res.status === 429) {
        throw Object.assign(new Error('NASA FIRMS public archive rate limit (HTTP 429).'), {
          firmsStatus: 'quota_exceeded' as FirmsStatusResponse['status'],
        });
      }
      if (!res.ok) {
        throw Object.assign(new Error(`NASA FIRMS public archive returned HTTP ${res.status}.`), {
          firmsStatus: 'upstream_error' as FirmsStatusResponse['status'],
        });
      }
      const csvText = await res.text();
      const parsed = parseFirmsCsvDetailed(
        csvText,
        FIRMS_SATELLITE,
        FIRMS_INSTRUMENT,
        FIRMS_PUBLIC_DATASET
      );
      if (!parsed.isValidCsv) {
        throw Object.assign(
          new Error(`NASA FIRMS public archive malformed CSV: ${parsed.errorReason || 'invalid format'}`),
          { firmsStatus: 'malformed_csv' as FirmsStatusResponse['status'] }
        );
      }
      const created: FirmsPublicRegionCacheEntry = {
        cachedAtMs: Date.now(),
        cachedAtUtc: new Date().toISOString(),
        hotspots: parsed.hotspots,
      };
      firmsPublicRegionCache.set(region, created);
      return created;
    })();
    firmsPublicInFlight.set(region, promise);
  }

  try {
    const entry = await promise;
    return { entry, fromCache: false, isStale: false };
  } catch (err) {
    if (!bypassCache && existing) {
      return { entry: existing, fromCache: true, isStale: true };
    }
    throw err;
  } finally {
    if (firmsPublicInFlight.get(region) === promise) {
      firmsPublicInFlight.delete(region);
    }
  }
}

export async function fetchFirmsHotspots(params: {
  latitude: number;
  longitude: number;
  radiusKm?: number;
  apiKey?: string;
  bypassCache?: boolean;
  allowPublicArchive?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<FirmsStatusResponse> {
  const {
    latitude,
    longitude,
    radiusKm = 500,
    apiKey = process.env.FIRMS_MAP_KEY,
    bypassCache = false,
    allowPublicArchive = true,
    fetchImpl = fetch,
  } = params;

  if (
    typeof latitude !== 'number' ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof longitude !== 'number' ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    typeof radiusKm !== 'number' ||
    !Number.isFinite(radiusKm) ||
    radiusKm < 1 ||
    radiusKm > 1000
  ) {
    throw new RangeError('Invalid geographic coordinates or radiusKm for FIRMS query.');
  }

  const nowIso = new Date().toISOString();

  // 1. Keyless official NASA FIRMS 24h Regional CSV Archive when server FIRMS_MAP_KEY is unset
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    if (!allowPublicArchive) {
      return buildUnavailableFirmsResponse({
        configured: false,
        status: 'unconfigured',
        message:
          'FIRMS_MAP_KEY is not configured. Active-fire satellite hotspot intelligence is unavailable until a server key is set.',
        retrievedAt: nowIso,
      });
    }

    const regions = selectPublicFirmsRegions(latitude, longitude, radiusKm);
    try {
      const regionResults = await Promise.all(
        regions.map((region) => fetchKeylessPublicRegion(region, bypassCache, fetchImpl))
      );

      const mergedHotspots: FirmsHotspot[] = [];
      const seenKeys = new Set<string>();
      let anyFromCache = false;
      let anyStale = false;
      let earliestCacheUtc: string | null = null;

      for (const rr of regionResults) {
        if (rr.fromCache) anyFromCache = true;
        if (rr.isStale) anyStale = true;
        if (rr.fromCache && (!earliestCacheUtc || rr.entry.cachedAtUtc < earliestCacheUtc)) {
          earliestCacheUtc = rr.entry.cachedAtUtc;
        }
        for (const spot of rr.entry.hotspots) {
          const dedupKey = `${spot.latitude.toFixed(5)}_${spot.longitude.toFixed(5)}_${spot.acqDate}_${spot.acqTime}_${spot.satellite}`;
          if (!seenKeys.has(dedupKey)) {
            seenKeys.add(dedupKey);
            mergedHotspots.push(spot);
          }
        }
      }

      const { filtered, count, nearestKm } = filterHotspotsNearCoordinates(
        mergedHotspots,
        latitude,
        longitude,
        radiusKm
      );
      const latestObservationUtc =
        filtered.length > 0
          ? filtered
              .map((h) => h.observedAtUtc)
              .sort((a, b) => Date.parse(b) - Date.parse(a))[0]
          : null;

      const status: FirmsStatusResponse['status'] = anyStale
        ? 'stale_cached'
        : count > 0
          ? 'active'
          : 'no_detections';

      const regionLabel = regions.join('+');
      const message = anyStale
        ? `NASA FIRMS public ${regionLabel} feed temporarily failed; serving cached trailing-24h NOAA-20 VIIRS observations from ${earliestCacheUtc}.`
        : count > 0
          ? `Retrieved ${count} NOAA-20 VIIRS thermal anomaly detection(s) within ${radiusKm} km from official keyless NASA FIRMS 24h archive (${regionLabel}).`
          : `No NOAA-20 VIIRS thermal anomalies within ${radiusKm} km in official keyless NASA FIRMS 24h archive (${regionLabel}; sub-pixel, cloud-obscured, or off-pass fires cannot be ruled out).`;

      return {
        configured: false,
        isAvailable: true,
        isCached: anyFromCache,
        isStale: anyStale,
        cachedAtUtc: anyFromCache ? earliestCacheUtc : null,
        status,
        message,
        dataset: FIRMS_PUBLIC_DATASET,
        satellite: FIRMS_SATELLITE,
        instrument: FIRMS_INSTRUMENT,
        dayRange: FIRMS_DAY_RANGE,
        hotspots: filtered,
        count,
        retrievedAt: nowIso,
        latestObservationUtc,
        disclaimer: FIRMS_SCIENTIFIC_DISCLAIMER,
        uncertaintyNotes:
          'Served from official keyless NASA FIRMS C2 trailing-24h regional VIIRS archive without FIRMS_MAP_KEY; detections reflect overpass UTC rather than guaranteed active burning.',
        regionalContext: {
          centerLat: latitude,
          centerLng: longitude,
          radiusKm,
          countWithinRadius: count,
          nearestDistanceKm: nearestKm,
        },
      };
    } catch (err: unknown) {
      if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
        return buildUnavailableFirmsResponse({
          configured: false,
          status: 'upstream_timeout',
          message: 'Keyless NASA FIRMS 24h public archive request timed out.',
          retrievedAt: nowIso,
        });
      }
      const typedStatus =
        (err as { firmsStatus?: FirmsStatusResponse['status'] } | null)?.firmsStatus ?? 'upstream_error';
      const sanitizedMsg = sanitizeFirmsErrorMessage(err);
      console.warn('Keyless NASA FIRMS archive fetch failed (sanitized):', sanitizedMsg);
      return buildUnavailableFirmsResponse({
        configured: false,
        status: typedStatus,
        message: 'Keyless NASA FIRMS 24h public archive is temporarily unavailable.',
        retrievedAt: nowIso,
      });
    }
  }

  const trimmedKey = apiKey.trim();

  // 2. Full cache identity (coordinates, radius, dataset, day range, key-configured state)
  const cacheKey = `${latitude.toFixed(4)}_${longitude.toFixed(4)}_${radiusKm}_${FIRMS_DATASET}_${FIRMS_DAY_RANGE}_configured`;
  const cached = !bypassCache ? firmsCache.get(cacheKey) : undefined;
  if (cached && Date.now() - cached.cachedAtMs < CACHE_TTL_MS) {
    return {
      ...cached.data,
      isCached: true,
      isStale: false,
      cachedAtUtc: cached.cachedAtUtc,
    };
  }

  const bboxes = computeFirmsBoundingBoxes(latitude, longitude, radiusKm);

  const tryServeStaleOrUnavailable = (
    status: FirmsStatusResponse['status'],
    message: string
  ): FirmsStatusResponse => {
    const staleEntry = !bypassCache ? firmsCache.get(cacheKey) : undefined;
    if (staleEntry && status !== 'invalid_credentials') {
      return {
        ...staleEntry.data,
        status: 'stale_cached',
        isAvailable: true,
        isCached: true,
        isStale: true,
        cachedAtUtc: staleEntry.cachedAtUtc,
        message: `${message} Serving stale cached NASA FIRMS observations from ${staleEntry.cachedAtUtc}; newer satellite passes are currently unavailable.`,
      };
    }

    return buildUnavailableFirmsResponse({
      configured: true,
      status,
      message,
      retrievedAt: nowIso,
    });
  };

  try {
    const combinedHotspots: FirmsHotspot[] = [];
    const seenDetectionKeys = new Set<string>();

    for (const bbox of bboxes) {
      const upstreamUrl = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${trimmedKey}/${FIRMS_DATASET}/${bbox}/${FIRMS_DAY_RANGE}`;
      const res = await fetchFirmsWithIpv4Retry(upstreamUrl, 8000, fetchImpl);

      if (res.status === 401 || res.status === 403) {
        return buildUnavailableFirmsResponse({
          configured: true,
          status: 'invalid_credentials',
          message:
            'NASA FIRMS rejected the server credential (HTTP unauthorized). Verify the server-side FIRMS_MAP_KEY.',
          retrievedAt: nowIso,
        });
      }

      if (res.status === 429) {
        return tryServeStaleOrUnavailable(
          'quota_exceeded',
          'NASA FIRMS API rate limit or quota ceiling reached (HTTP 429).'
        );
      }

      if (!res.ok) {
        return tryServeStaleOrUnavailable(
          'upstream_error',
          `NASA FIRMS upstream service returned HTTP ${res.status}.`
        );
      }

      const csvText = await res.text();
      if (/invalid\s*map_key/i.test(csvText)) {
        return buildUnavailableFirmsResponse({
          configured: true,
          status: 'invalid_credentials',
          message: 'NASA FIRMS reported an invalid server MAP_KEY credential.',
          retrievedAt: nowIso,
        });
      }

      const parsed = parseFirmsCsvDetailed(
        csvText,
        FIRMS_SATELLITE,
        FIRMS_INSTRUMENT,
        FIRMS_DATASET
      );
      if (!parsed.isValidCsv) {
        return tryServeStaleOrUnavailable(
          'malformed_csv',
          `NASA FIRMS returned malformed CSV telemetry: ${parsed.errorReason || 'invalid CSV format'}.`
        );
      }

      for (const spot of parsed.hotspots) {
        const dedupKey = `${spot.latitude.toFixed(5)}_${spot.longitude.toFixed(5)}_${spot.acqDate}_${spot.acqTime}_${spot.satellite}`;
        if (!seenDetectionKeys.has(dedupKey)) {
          seenDetectionKeys.add(dedupKey);
          combinedHotspots.push(spot);
        }
      }
    }

    const { filtered, count, nearestKm } = filterHotspotsNearCoordinates(
      combinedHotspots,
      latitude,
      longitude,
      radiusKm
    );

    const latestObservationUtc =
      filtered.length > 0
        ? filtered
            .map((h) => h.observedAtUtc)
            .sort((a, b) => Date.parse(b) - Date.parse(a))[0]
        : null;

    const status: FirmsStatusResponse['status'] = count > 0 ? 'active' : 'no_detections';
    const message =
      count > 0
        ? `Retrieved ${count} ${FIRMS_DATASET} (${FIRMS_SATELLITE} ${FIRMS_INSTRUMENT}) thermal anomaly detection(s) within ${radiusKm} km over the last ${FIRMS_DAY_RANGE * 24}h.`
        : `No ${FIRMS_DATASET} (${FIRMS_SATELLITE} ${FIRMS_INSTRUMENT}) satellite thermal anomalies were returned within ${radiusKm} km for the queried ${FIRMS_DAY_RANGE * 24}h interval (sub-pixel, cloud-obscured, or off-pass fires cannot be ruled out).`;

    const result: FirmsStatusResponse = {
      configured: true,
      isAvailable: true,
      isCached: false,
      isStale: false,
      cachedAtUtc: null,
      status,
      message,
      dataset: FIRMS_DATASET,
      satellite: FIRMS_SATELLITE,
      instrument: FIRMS_INSTRUMENT,
      dayRange: FIRMS_DAY_RANGE,
      hotspots: filtered,
      count,
      retrievedAt: nowIso,
      latestObservationUtc,
      disclaimer: FIRMS_SCIENTIFIC_DISCLAIMER,
      uncertaintyNotes:
        'Detections represent VIIRS NOAA-20 375m I-4 thermal anomalies from the last 24h NRT stream; satellite acquisition time reflects past overpass UTC rather than guaranteed ongoing burning, and detections exclude cloud-obscured or unpassed areas.',
      regionalContext: {
        centerLat: latitude,
        centerLng: longitude,
        radiusKm,
        countWithinRadius: count,
        nearestDistanceKm: nearestKm,
      },
    };

    firmsCache.set(cacheKey, {
      cachedAtMs: Date.now(),
      cachedAtUtc: nowIso,
      data: result,
    });
    return result;
  } catch (err: unknown) {
    if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
      return tryServeStaleOrUnavailable(
        'upstream_timeout',
        'NASA FIRMS upstream request timed out.'
      );
    }

    const sanitizedMsg = sanitizeFirmsErrorMessage(err, trimmedKey);
    console.warn('NASA FIRMS fetch error (sanitized):', sanitizedMsg);
    return tryServeStaleOrUnavailable(
      'upstream_error',
      'NASA FIRMS upstream telemetry fetch failed.'
    );
  }
}
