/**
 * OpenAQ v3 Provider Connector (Server-Side Only)
 * 
 * Secure connector for OpenAQ API v3 global air quality monitoring network.
 * Adheres strictly to zero-fabrication and data-provenance directives:
 * - Keeps OPENAQ_API_KEY strictly on the server (never exposed to client).
 * - Honest 'not_configured' status when API key is missing.
 * - Handles 401, 429 rate limits, timeouts, and network outages gracefully.
 * - Validates physical units (rejects silent unit mixups), non-negative values, and timestamps.
 * - Retains original observation timestamps; NEVER substitutes station datetimeLast for measurement timestamps.
 * - Enforces official OpenAQ v3 maximum search radius of 25km.
 */

import {
  EnvironmentalSourceRecord,
  EnvironmentalSourceStatus,
  EnvironmentalSourceKind,
  SourceMeasurement,
} from '@/domain/types';
import { calculateDistanceKm } from '@/services/ground-station-service';
import {
  OPENAQ_MIN_RADIUS_KM,
  OPENAQ_DEFAULT_RADIUS_KM,
  OPENAQ_MAX_RADIUS_KM,
  SKEW_ALLOWANCE_MINUTES,
  MAX_OBSERVATION_AGE_HOURS,
  validateObservationTiming,
} from '@/config/environmental-sources';

// Re-export constants for client/server shared consistency
export { OPENAQ_MIN_RADIUS_KM, OPENAQ_DEFAULT_RADIUS_KM, OPENAQ_MAX_RADIUS_KM };

export type OpenAqProviderStatus =
  | 'available'
  | 'not_configured'
  | 'no_coverage'
  | 'unauthorized'
  | 'rate_limited'
  | 'unavailable';

export interface OpenAqProviderResult {
  provider: 'openaq';
  status: OpenAqProviderStatus;
  sources: EnvironmentalSourceRecord[];
  retrievedAt: string;
  count: number;
  activeCount: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface OpenAqSensorParameter {
  id: number;
  name: string;
  units: string;
  displayName?: string;
}

export interface OpenAqSensorMetadata {
  id: number;
  name?: string;
  parameter?: OpenAqSensorParameter;
}

export interface OpenAqLocationResult {
  id: number;
  name: string;
  locality?: string;
  timezone?: string;
  country?: { code?: string; name?: string };
  owner?: { name?: string };
  provider?: { id?: number; name?: string };
  isMonitor?: boolean;
  isMobile?: boolean;
  coordinates?: { latitude: number; longitude: number };
  sensors?: OpenAqSensorMetadata[];
  datetimeFirst?: { utc: string; local: string };
  datetimeLast?: { utc: string; local: string };
  latest?: OpenAqLatestMeasurementItem[];
}

export interface OpenAqLatestMeasurementItem {
  sensorsId?: number; // Official OpenAQ v3 field
  sensorId?: number;  // Fallback alias
  locationsId?: number;
  value?: number | null;
  coordinates?: {
    latitude: number | null;
    longitude: number | null;
  };
  period?: {
    datetimeTo?: { utc: string; local?: string };
    interval?: string; // e.g. "01:00:00"
  };
  datetime?: {
    utc: string;
    local?: string;
  } | string;
  parameter?: {
    name: string;
    units: string;
  }; // Legacy / mocked fallback
}

interface OpenAqCacheEntry {
  result: OpenAqProviderResult;
  cachedAt: number; // millisecond timestamp
}

// In-memory cache for server-side responses (10 min TTL)
const openAqCache = new Map<string, OpenAqCacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;

export function clearOpenAqCache(): void {
  openAqCache.clear();
}

/**
 * Validates and normalizes pollutant concentration measurement.
 * Never defaults unit to ug/m3 when missing.
 * Only assigns averagingPeriodMinutes when explicitly established from metadata.
 * Missing observation timestamps remain null.
 */
export function validateMeasurementValue(
  rawVal: any,
  parameterName?: string | null,
  rawUnit?: string | null,
  observedTimeStr?: string | null,
  averagingPeriodMinutes?: number | null
): SourceMeasurement | null {
  if (!parameterName || !rawUnit) {
    return null;
  }

  const pollutantLower = parameterName.toLowerCase().replace(/[\.\s_-]/g, '');
  let pollutant: 'pm25' | 'pm10' | 'o3' | 'no2' | 'so2' | 'co' | 'nh3' | null = null;

  if (pollutantLower === 'pm25') pollutant = 'pm25';
  else if (pollutantLower === 'pm10') pollutant = 'pm10';
  else if (pollutantLower === 'o3' || pollutantLower === 'ozone') pollutant = 'o3';
  else if (pollutantLower === 'no2') pollutant = 'no2';
  else if (pollutantLower === 'so2') pollutant = 'so2';
  else if (pollutantLower === 'co') pollutant = 'co';
  else if (pollutantLower === 'nh3') pollutant = 'nh3';

  if (!pollutant) return null;

  // Numeric validation
  const parsed = typeof rawVal === 'number' ? rawVal : parseFloat(rawVal);
  if (isNaN(parsed) || !Number.isFinite(parsed) || parsed < 0) {
    // Negative, NaN, or non-finite are rejected
    return null;
  }

  // Preserve valid zero (zero is not missing!)
  const value = Math.round(parsed * 10) / 10;

  // Unit validation (do not silently misinterpret ppm as ug/m3, and do not default to ug/m3)
  const normUnit = rawUnit.toLowerCase().trim();
  let standardizedUnit = rawUnit;
  let isSupportedConcentrationUnit = false;

  if (normUnit === 'µg/m³' || normUnit === 'ug/m3' || normUnit === 'ug/m^3' || normUnit === 'micrograms/m3') {
    standardizedUnit = 'ug/m3';
    isSupportedConcentrationUnit = true;
  } else if ((normUnit === 'ppm' || normUnit === 'ppb') && pollutant !== 'pm25' && pollutant !== 'pm10') {
    standardizedUnit = normUnit;
    isSupportedConcentrationUnit = true;
  }

  // Averaging period: only assign if known from metadata, otherwise null
  const period = typeof averagingPeriodMinutes === 'number' && averagingPeriodMinutes > 0
    ? averagingPeriodMinutes
    : null;

  return {
    pollutant,
    value,
    unit: standardizedUnit,
    averagingPeriodMinutes: period,
    observedAt: observedTimeStr || null,
    qualityFlag: isSupportedConcentrationUnit ? 'valid' : 'suspect',
  };
}

/**
 * Evaluates whether an observation timestamp is fresh, stale, or future-dated.
 */
export function evaluateObservationFreshness(observedAt: string | null): {
  status: EnvironmentalSourceStatus;
  isStale: boolean;
  explanation?: string;
} {
  if (!observedAt) {
    return { status: 'unavailable', isStale: true, explanation: 'Missing measurement timestamp' };
  }

  const timing = validateObservationTiming(observedAt);
  if (!timing.isValid) {
    return {
      status: 'rejected',
      isStale: true,
      explanation: timing.error || 'Invalid measurement timestamp',
    };
  }

  if (timing.isStale) {
    const ageHours = Math.round((Date.now() - Date.parse(observedAt)) / 3600000);
    return {
      status: 'stale',
      isStale: true,
      explanation: `Observation is ${ageHours} hours old (exceeds 24h freshness policy)`,
    };
  }

  return { status: 'fresh', isStale: false };
}

/**
 * Builds unconfigured record when OPENAQ_API_KEY is not configured on the server.
 */
export function buildUnconfiguredOpenAqRecord(): EnvironmentalSourceRecord {
  const now = new Date().toISOString();
  return {
    id: 'openaq-unconfigured',
    providerId: 'openaq',
    providerName: 'OpenAQ Global Air Quality Network',
    sourceName: 'OpenAQ Air Quality Network (Unconfigured)',
    name: 'OpenAQ Air Quality Network (Unconfigured)',
    provider: 'OpenAQ',
    sourceKind: 'physical_observation',
    providerKind: 'physical_observation',
    status: 'not_configured',
    latitude: null,
    longitude: null,
    distanceKm: null,
    coordinates: null,
    observedAt: null,
    measuredAt: null,
    retrievedAt: now,
    ingestedAt: now,
    measurements: [],
    attribution: 'OpenAQ Open Data (CC BY 4.0)',
    explanation:
      'OPENAQ_API_KEY is not configured on the server. Ground monitoring stations from OpenAQ network are currently disabled.',
    errorCode: 'NOT_CONFIGURED',
    provenance: {
      network: 'OpenAQ Global Community',
      licenseOrAttribution: 'OpenAQ Open Data (CC BY 4.0)',
      url: 'https://openaq.org/',
      isModel: false,
      limitations: [
        'OPENAQ_API_KEY is not configured on the server',
        'Configure OPENAQ_API_KEY in server environment to enable live ground observations',
      ],
    },
  };
}

/**
 * Parses OpenAQ v3 location & sensor response into normalized EnvironmentalSourceRecord.
 * Correctly maps sensorsId to location.sensors metadata to extract parameter and units.
 * Never defaults missing units to ug/m3.
 * Strictly prevents substituting station datetimeLast for missing individual measurement timestamps.
 */
export function parseOpenAqLocation(
  loc: OpenAqLocationResult,
  targetLat: number,
  targetLon: number,
  latestMeasurements: OpenAqLatestMeasurementItem[] = []
): EnvironmentalSourceRecord | null {
  if (!loc || !loc.id) return null;

  const locLat = loc.coordinates?.latitude;
  const locLon = loc.coordinates?.longitude;
  let distanceKm: number | null = null;

  if (typeof locLat === 'number' && typeof locLon === 'number' && Number.isFinite(locLat) && Number.isFinite(locLon)) {
    distanceKm = calculateDistanceKm(targetLat, targetLon, locLat, locLon);
  }

  // Build sensor lookup table keyed by sensor ID
  const sensorById = new Map<number, OpenAqSensorMetadata>(
    loc.sensors?.map((s) => [s.id, s]) ?? []
  );

  const measurements: SourceMeasurement[] = [];
  let latestObservedAt: string | null = null;

  // Process measurement items
  for (const m of latestMeasurements) {
    const sId = m.sensorsId ?? m.sensorId;
    const sensor = sId != null ? sensorById.get(sId) : undefined;

    // Parameter name and units MUST come from sensor metadata or m.parameter
    const paramName = sensor?.parameter?.name || m.parameter?.name;
    const rawUnit = sensor?.parameter?.units || m.parameter?.units;

    if (!paramName || !rawUnit) {
      // Unmatched sensor ID or missing parameter/unit metadata: do not invent values
      continue;
    }

    const rawVal = m.value;
    let obsTime: string | null = null;

    if (typeof m.datetime === 'string') obsTime = m.datetime;
    else if (m.datetime?.utc) obsTime = m.datetime.utc;
    else if (m.period?.datetimeTo?.utc) obsTime = m.period.datetimeTo.utc;

    // Check if period interval is specified (e.g. "01:00:00" = 60m)
    let avgPeriodMinutes: number | null = null;
    if (m.period?.interval) {
      const match = m.period.interval.match(/(\d+):(\d+):(\d+)/);
      if (match) {
        const hours = parseInt(match[1], 10);
        const mins = parseInt(match[2], 10);
        avgPeriodMinutes = hours * 60 + mins;
      }
    }

    const validated = validateMeasurementValue(rawVal, paramName, rawUnit, obsTime, avgPeriodMinutes);
    if (validated) {
      measurements.push(validated);
      if (obsTime && (!latestObservedAt || Date.parse(obsTime) > Date.parse(latestObservedAt))) {
        latestObservedAt = obsTime;
      }
    }
  }

  // ZERO-FABRICATION: Never substitute location's datetimeLast for missing measurement timestamps.
  // loc.datetimeLast is station metadata ONLY.

  const freshness = evaluateObservationFreshness(latestObservedAt);
  const now = new Date().toISOString();
  const upstreamProvider = loc.provider?.name || loc.owner?.name || 'Local Environmental Agency';

  // Classification: check isMonitor to separate official reference grade from citizen optical
  let sourceKind: EnvironmentalSourceKind = 'physical_observation';
  let providerKind: EnvironmentalSourceKind = 'physical_observation';

  if (loc.isMonitor === true) {
    sourceKind = 'official_ground_station';
    providerKind = 'official_ground_station';
  } else if (loc.isMonitor === false) {
    sourceKind = 'community_optical';
    providerKind = 'community_optical';
  }

  const stationLastReportedAt = loc.datetimeLast?.utc || null;

  return {
    id: `openaq-${loc.id}`,
    providerId: 'openaq',
    providerName: 'OpenAQ',
    upstreamProviderId: upstreamProvider,
    stationId: String(loc.id),
    sourceName: `${loc.name} (OpenAQ)`,
    name: loc.name,
    provider: `OpenAQ (${upstreamProvider})`,
    sourceKind,
    providerKind,
    status: measurements.length === 0 ? 'unavailable' : freshness.status,
    latitude: locLat ?? null,
    longitude: locLon ?? null,
    distanceKm,
    coordinates: locLat != null && locLon != null ? { latitude: locLat, longitude: locLon, distanceKm } : null,
    observedAt: latestObservedAt,
    measuredAt: latestObservedAt,
    validAt: null, // Physical observations have observedAt, not model validAt
    retrievedAt: now,
    ingestedAt: now,
    measurements,
    attribution: 'OpenAQ Open Data (CC BY 4.0)',
    explanation: freshness.explanation,
    provenance: {
      network: upstreamProvider,
      licenseOrAttribution: 'OpenAQ Open Data (CC BY 4.0)',
      url: `https://openaq.org/locations/${loc.id}`,
      reportingLatencyMinutes: latestObservedAt ? Math.round((Date.now() - Date.parse(latestObservedAt)) / 60000) : undefined,
      isModel: false,
      limitations: [
        loc.isMonitor === true
          ? 'Regulatory reference-grade monitor aggregated via OpenAQ'
          : loc.isMonitor === false
          ? 'Low-cost / community sensor aggregated via OpenAQ'
          : 'Direct in-situ physical ground observation aggregated via OpenAQ',
        stationLastReportedAt
          ? `Station reported heartbeat at: ${stationLastReportedAt}`
          : 'Station heartbeat timestamp unavailable',
        'Reporting latency and calibration depend on the originating environmental agency',
      ],
    },
  };
}

/**
 * Fetches OpenAQ v3 sources and returns typed OpenAqProviderResult.
 * Distinguishes provider diagnostics from actual physical observation records.
 * Keeps OPENAQ_API_KEY strictly on the server.
 */
export async function fetchOpenAqProviderResult(params: {
  latitude: number;
  longitude: number;
  radiusKm?: number;
  apiKey?: string;
  signal?: AbortSignal;
  bypassCache?: boolean;
}): Promise<OpenAqProviderResult> {
  const {
    latitude,
    longitude,
    radiusKm = OPENAQ_DEFAULT_RADIUS_KM,
    apiKey = process.env.OPENAQ_API_KEY,
    signal,
    bypassCache = false,
  } = params;
  const now = new Date().toISOString();

  // Validate coordinates
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return {
      provider: 'openaq',
      status: 'unavailable',
      sources: [],
      retrievedAt: now,
      count: 0,
      activeCount: 0,
      errorCode: 'INVALID_COORDINATES',
      errorMessage: 'Invalid coordinates provided.',
    };
  }

  // Key check: honest not_configured when missing
  if (!apiKey || apiKey.trim() === '' || apiKey === 'your_openaq_api_key_here') {
    const unconfiguredRecord = buildUnconfiguredOpenAqRecord();
    return {
      provider: 'openaq',
      status: 'not_configured',
      sources: [unconfiguredRecord],
      retrievedAt: now,
      count: 0,
      activeCount: 0,
      errorCode: 'NOT_CONFIGURED',
      errorMessage: 'OPENAQ_API_KEY is not configured on the server.',
    };
  }

  // Clamped search radius [1km, 25km]
  const effectiveRadiusKm = Math.min(OPENAQ_MAX_RADIUS_KM, Math.max(OPENAQ_MIN_RADIUS_KM, radiusKm));
  const radiusMeters = Math.round(effectiveRadiusKm * 1000);
  const cacheKey = `${latitude.toFixed(2)},${longitude.toFixed(2)},${radiusMeters}`;

  if (!bypassCache) {
    const cached = openAqCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return cached.result;
    }
  }

  const url = `https://api.openaq.org/v3/locations?coordinates=${latitude.toFixed(4)},${longitude.toFixed(4)}&radius=${radiusMeters}`;

  try {
    const res = await fetch(url, {
      headers: {
        'X-API-Key': apiKey,
        'User-Agent': 'Avir-Air-Quality-Assistant/1.0',
        Accept: 'application/json',
      },
      signal,
    });

    if (res.status === 401) {
      const result: OpenAqProviderResult = {
        provider: 'openaq',
        status: 'unauthorized',
        sources: [
          {
            ...buildUnconfiguredOpenAqRecord(),
            id: 'openaq-unauthorized',
            status: 'rejected',
            errorCode: 'UNAUTHORIZED',
            explanation: 'Invalid or expired OpenAQ API key provided in server environment.',
          },
        ],
        retrievedAt: now,
        count: 0,
        activeCount: 0,
        errorCode: 'UNAUTHORIZED',
        errorMessage: 'Invalid or expired OpenAQ API key.',
      };
      return result;
    }

    if (res.status === 429) {
      const result: OpenAqProviderResult = {
        provider: 'openaq',
        status: 'rate_limited',
        sources: [
          {
            ...buildUnconfiguredOpenAqRecord(),
            id: 'openaq-rate-limit',
            status: 'unreachable',
            errorCode: 'RATE_LIMIT',
            explanation: 'OpenAQ API rate limit exceeded. Retrying on next scheduled cycle.',
          },
        ],
        retrievedAt: now,
        count: 0,
        activeCount: 0,
        errorCode: 'RATE_LIMIT',
        errorMessage: 'OpenAQ API rate limit exceeded.',
      };
      return result;
    }

    if (!res.ok) {
      const result: OpenAqProviderResult = {
        provider: 'openaq',
        status: 'unavailable',
        sources: [
          {
            ...buildUnconfiguredOpenAqRecord(),
            id: 'openaq-server-error',
            status: 'unreachable',
            errorCode: `HTTP_${res.status}`,
            explanation: `OpenAQ API upstream error (HTTP ${res.status}).`,
          },
        ],
        retrievedAt: now,
        count: 0,
        activeCount: 0,
        errorCode: `HTTP_${res.status}`,
        errorMessage: `OpenAQ API returned HTTP ${res.status}.`,
      };
      return result;
    }

    const data = await res.json();
    const locations: OpenAqLocationResult[] = Array.isArray(data?.results) ? data.results : [];

    if (locations.length === 0) {
      const emptyRecords: EnvironmentalSourceRecord[] = [
        {
          id: 'openaq-no-nearby-stations',
          providerId: 'openaq',
          providerName: 'OpenAQ',
          sourceName: 'OpenAQ Network (No Local Station)',
          name: 'OpenAQ Network (No Local Station)',
          provider: 'OpenAQ',
          sourceKind: 'physical_observation',
          providerKind: 'physical_observation',
          status: 'unavailable',
          latitude: null,
          longitude: null,
          distanceKm: null,
          coordinates: null,
          observedAt: null,
          measuredAt: null,
          retrievedAt: now,
          ingestedAt: now,
          measurements: [],
          attribution: 'OpenAQ Open Data (CC BY 4.0)',
          explanation: `No active OpenAQ ground monitoring stations found within ${effectiveRadiusKm}km.`,
          provenance: {
            network: 'OpenAQ',
            licenseOrAttribution: 'OpenAQ Open Data (CC BY 4.0)',
            url: 'https://openaq.org/',
            isModel: false,
            limitations: ['No physical monitoring station found within configured radius'],
          },
        },
      ];
      const result: OpenAqProviderResult = {
        provider: 'openaq',
        status: 'no_coverage',
        sources: emptyRecords,
        retrievedAt: now,
        count: 0,
        activeCount: 0,
      };
      openAqCache.set(cacheKey, { result, cachedAt: Date.now() });
      return result;
    }

    // Sort locations by distance to target coordinates
    const sorted = locations
      .map((loc) => {
        const lat = loc.coordinates?.latitude;
        const lon = loc.coordinates?.longitude;
        const dist = lat != null && lon != null ? calculateDistanceKm(latitude, longitude, lat, lon) : Infinity;
        return { loc, dist };
      })
      .filter((item) => item.dist <= effectiveRadiusKm)
      .sort((a, b) => a.dist - b.dist);

    const records: EnvironmentalSourceRecord[] = [];

    // Query latest measurement for the top nearest candidate stations (up to 3 stations)
    for (const item of sorted.slice(0, 3)) {
      let latestMeasurements: OpenAqLatestMeasurementItem[] = [];
      try {
        const latestRes = await fetch(`https://api.openaq.org/v3/locations/${item.loc.id}/latest`, {
          headers: {
            'X-API-Key': apiKey,
            'User-Agent': 'Avir-Air-Quality-Assistant/1.0',
            Accept: 'application/json',
          },
          signal,
        });

        if (latestRes.ok) {
          const latestData = await latestRes.json();
          if (Array.isArray(latestData?.results)) {
            latestMeasurements = latestData.results;
          }
        }
      } catch {
        // Latest measurements fetch failed, continue with basic location metadata
      }

      const record = parseOpenAqLocation(item.loc, latitude, longitude, latestMeasurements);
      if (record) records.push(record);
    }

    const activeCount = records.filter(
      (r) => r.status === 'fresh' || r.status === 'active'
    ).length;

    const result: OpenAqProviderResult = {
      provider: 'openaq',
      status: 'available',
      sources: records,
      retrievedAt: now,
      count: records.length,
      activeCount,
    };

    if (records.length > 0) {
      openAqCache.set(cacheKey, { result, cachedAt: Date.now() });
    }

    return result;
  } catch (err: any) {
    return {
      provider: 'openaq',
      status: 'unavailable',
      sources: [
        {
          ...buildUnconfiguredOpenAqRecord(),
          id: 'openaq-network-error',
          status: 'unreachable',
          errorCode: 'NETWORK_ERROR',
          explanation: err?.name === 'AbortError' ? 'OpenAQ request timed out or was cancelled.' : 'Failed to reach OpenAQ API.',
        },
      ],
      retrievedAt: now,
      count: 0,
      activeCount: 0,
      errorCode: 'NETWORK_ERROR',
      errorMessage: err?.message || 'Failed to reach OpenAQ API.',
    };
  }
}

/**
 * Fetches OpenAQ v3 sources and returns EnvironmentalSourceRecord array.
 * Backwards-compatible server-side entry point.
 */
export async function fetchOpenAqSources(params: {
  latitude: number;
  longitude: number;
  radiusKm?: number;
  apiKey?: string;
  signal?: AbortSignal;
  bypassCache?: boolean;
}): Promise<EnvironmentalSourceRecord[]> {
  const result = await fetchOpenAqProviderResult(params);
  return result.sources;
}
