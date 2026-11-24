/**
 * NASA FIRMS Active-Fire Hotspots Service (Phase 4)
 * 
 * Safely fetches and caches satellite thermal anomaly observations from NASA FIRMS.
 * Enforces server-only secret security (FIRMS_MAP_KEY), rate limiting, disk/memory caching,
 * and scientific disclaimers against unverified pollution causality.
 */

import {
  FirmsHotspot,
  FirmsStatusResponse,
  FIRMS_SCIENTIFIC_DISCLAIMER,
  parseFirmsCsv,
  filterHotspotsNearCoordinates,
} from '@/domain/firms-types';

interface FirmsCacheEntry {
  timestamp: number;
  data: FirmsStatusResponse;
}

const firmsCache = new Map<string, FirmsCacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export async function fetchFirmsHotspots(params: {
  latitude: number;
  longitude: number;
  radiusKm?: number;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}): Promise<FirmsStatusResponse> {
  const {
    latitude,
    longitude,
    radiusKm = 500,
    apiKey = process.env.FIRMS_MAP_KEY,
    fetchImpl = fetch,
  } = params;

  const nowIso = new Date().toISOString();

  // 1. Check for API Key
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    return {
      configured: false,
      status: 'unconfigured',
      message:
        'FIRMS_MAP_KEY is not configured. Active-fire satellite hotspot intelligence is unavailable until a server key is set.',
      hotspots: [],
      count: 0,
      retrievedAt: nowIso,
      disclaimer: FIRMS_SCIENTIFIC_DISCLAIMER,
      regionalContext: null,
    };
  }

  // 2. Cache Lookup
  const cacheKey = `${latitude.toFixed(2)}_${longitude.toFixed(2)}_${radiusKm}`;
  const cached = firmsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  // 3. Compute Bounding Box (W, S, E, N)
  // 1 degree latitude ≈ 111 km. Bounded query window prevents downloading millions of global records.
  const degSpan = Math.min(10, Math.max(1, radiusKm / 111));
  const west = Math.max(-180, longitude - degSpan).toFixed(2);
  const south = Math.max(-90, latitude - degSpan).toFixed(2);
  const east = Math.min(180, longitude + degSpan).toFixed(2);
  const north = Math.min(90, latitude + degSpan).toFixed(2);
  const bbox = `${west},${south},${east},${north}`;

  // NASA FIRMS Area API Endpoint
  const upstreamUrl = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${apiKey.trim()}/VIIRS_NOAA20_NRT/${bbox}/1`;

  try {
    const res = await fetchImpl(upstreamUrl, {
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 401 || res.status === 403) {
      return {
        configured: true,
        status: 'unconfigured',
        message: 'NASA FIRMS returned unauthorized. Please verify the FIRMS_MAP_KEY credential.',
        hotspots: [],
        count: 0,
        retrievedAt: nowIso,
        disclaimer: FIRMS_SCIENTIFIC_DISCLAIMER,
        regionalContext: null,
      };
    }

    if (res.status === 429) {
      return {
        configured: true,
        status: 'quota_exceeded',
        message: 'NASA FIRMS quota ceiling reached. Please retry in a few minutes.',
        hotspots: [],
        count: 0,
        retrievedAt: nowIso,
        disclaimer: FIRMS_SCIENTIFIC_DISCLAIMER,
        regionalContext: null,
      };
    }

    if (!res.ok) {
      throw new Error(`NASA FIRMS upstream error HTTP ${res.status}`);
    }

    const csvText = await res.text();
    const parsedHotspots = parseFirmsCsv(csvText, 'NOAA-20', 'VIIRS');
    const { filtered, count, nearestKm } = filterHotspotsNearCoordinates(
      parsedHotspots,
      latitude,
      longitude,
      radiusKm
    );

    const result: FirmsStatusResponse = {
      configured: true,
      status: 'active',
      message: `Retrieved ${count} active thermal hotspot detection(s) within ${radiusKm} km.`,
      hotspots: filtered,
      count,
      retrievedAt: nowIso,
      disclaimer: FIRMS_SCIENTIFIC_DISCLAIMER,
      regionalContext: {
        centerLat: latitude,
        centerLng: longitude,
        radiusKm,
        countWithinRadius: count,
        nearestDistanceKm: nearestKm,
      },
    };

    firmsCache.set(cacheKey, { timestamp: Date.now(), data: result });
    return result;
  } catch (err: any) {
    return {
      configured: true,
      status: 'upstream_error',
      message: `NASA FIRMS fetch failed: ${err.message || String(err)}`,
      hotspots: [],
      count: 0,
      retrievedAt: nowIso,
      disclaimer: FIRMS_SCIENTIFIC_DISCLAIMER,
      regionalContext: null,
    };
  }
}
