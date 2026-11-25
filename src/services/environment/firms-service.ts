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

import {
  FIRMS_SCIENTIFIC_DISCLAIMER,
  FirmsHotspot,
  FirmsStatusResponse,
  filterHotspotsNearCoordinates,
  parseFirmsCsvDetailed,
} from '@/domain/firms-types';

const FIRMS_DATASET = 'VIIRS_NOAA20_NRT';
const FIRMS_SATELLITE = 'NOAA-20';
const FIRMS_INSTRUMENT: 'VIIRS' | 'MODIS' = 'VIIRS';
const FIRMS_DAY_RANGE = 1;
const EARTH_MEAN_RADIUS_KM = 6371.0088;

interface FirmsCacheEntry {
  cachedAtMs: number;
  cachedAtUtc: string;
  data: FirmsStatusResponse;
}

const firmsCache = new Map<string, FirmsCacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function clearFirmsCache(): void {
  firmsCache.clear();
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

export async function fetchFirmsHotspots(params: {
  latitude: number;
  longitude: number;
  radiusKm?: number;
  apiKey?: string;
  bypassCache?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<FirmsStatusResponse> {
  const {
    latitude,
    longitude,
    radiusKm = 500,
    apiKey = process.env.FIRMS_MAP_KEY,
    bypassCache = false,
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

  // 1. Check server-side credential configuration
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    return buildUnavailableFirmsResponse({
      configured: false,
      status: 'unconfigured',
      message:
        'FIRMS_MAP_KEY is not configured. Active-fire satellite hotspot intelligence is unavailable until a server key is set.',
      retrievedAt: nowIso,
    });
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
      const res = await fetchImpl(upstreamUrl, {
        signal: AbortSignal.timeout(8000),
      });

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
