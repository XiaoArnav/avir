/**
 * OpenAQ v3 Provider Connector (Server-Side Only)
 * 
 * Secure connector for OpenAQ API v3 global air quality monitoring network.
 * Adheres strictly to zero-fabrication and data-provenance directives:
 * - Keeps OPENAQ_API_KEY strictly on the server (never exposed to client).
 * - Honest 'not_configured' status when API key is missing.
 * - Handles 401, 429 rate limits, timeouts, and network outages gracefully.
 * - Validates physical units (rejects silent unit mixups), non-negative values, and timestamps.
 * - Retains original observation timestamps across cache cycles.
 */

import {
  EnvironmentalSourceRecord,
  EnvironmentalSourceStatus,
  SourceMeasurement,
} from '@/domain/types';
import { calculateDistanceKm } from '@/services/ground-station-service';

export interface OpenAqLocationResult {
  id: number;
  name: string;
  locality?: string;
  timezone?: string;
  country?: { code?: string; name?: string };
  owner?: { name?: string };
  provider?: { id?: number; name?: string };
  coordinates?: { latitude: number; longitude: number };
  sensors?: Array<{
    id: number;
    name: string;
    parameter: { id: number; name: string; units: string; displayName?: string };
  }>;
  datetimeFirst?: { utc: string; local: string };
  datetimeLast?: { utc: string; local: string };
}

export interface OpenAqLatestMeasurementItem {
  sensorId?: number;
  parameter?: { name: string; units: string };
  value?: number | null;
  period?: { datetimeTo?: { utc: string; local: string } };
  datetime?: { utc: string; local: string } | string;
  coordinates?: { latitude: number; longitude: number };
}

interface OpenAqCacheEntry {
  records: EnvironmentalSourceRecord[];
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
 */
export function validateMeasurementValue(
  rawVal: any,
  parameterName: string,
  rawUnit: string,
  observedTimeStr?: string | null
): SourceMeasurement | null {
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

  // Unit validation (do not silently misinterpret ppm as ug/m3)
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

  // If unit is unrecognized for mass concentration, keep raw unit with suspect flag
  return {
    pollutant,
    value,
    unit: standardizedUnit,
    averagingPeriodMinutes: 60, // standard OpenAQ hourly reporting period
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

  const parsedTime = Date.parse(observedAt);
  if (isNaN(parsedTime)) {
    return { status: 'rejected', isStale: true, explanation: 'Unparseable measurement timestamp' };
  }

  const now = Date.now();
  const skewAllowanceMs = 10 * 60 * 1000; // 10 minutes clock skew allowed
  if (parsedTime > now + skewAllowanceMs) {
    return {
      status: 'rejected',
      isStale: true,
      explanation: 'Suspicious future-dated physical observation timestamp',
    };
  }

  const ageMs = now - parsedTime;
  const staleThresholdMs = 24 * 60 * 60 * 1000; // 24 hours

  if (ageMs > staleThresholdMs) {
    return {
      status: 'stale',
      isStale: true,
      explanation: `Observation is ${Math.round(ageMs / (3600 * 1000))} hours old (exceeds 24h freshness policy)`,
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

  const measurements: SourceMeasurement[] = [];
  let latestObservedAt: string | null = null;

  // Process measurement items
  for (const m of latestMeasurements) {
    const paramName = m.parameter?.name || '';
    const rawVal = m.value;
    const rawUnit = m.parameter?.units || 'ug/m3';
    let obsTime: string | null = null;

    if (typeof m.datetime === 'string') obsTime = m.datetime;
    else if (m.datetime?.utc) obsTime = m.datetime.utc;
    else if (m.period?.datetimeTo?.utc) obsTime = m.period.datetimeTo.utc;

    const validated = validateMeasurementValue(rawVal, paramName, rawUnit, obsTime);
    if (validated) {
      measurements.push(validated);
      if (obsTime && (!latestObservedAt || Date.parse(obsTime) > Date.parse(latestObservedAt))) {
        latestObservedAt = obsTime;
      }
    }
  }

  // Fallback to location's datetimeLast if latest reading didn't provide timestamp
  if (!latestObservedAt && loc.datetimeLast?.utc) {
    latestObservedAt = loc.datetimeLast.utc;
  }

  const freshness = evaluateObservationFreshness(latestObservedAt);
  const now = new Date().toISOString();
  const upstreamProvider = loc.provider?.name || loc.owner?.name || 'Local Environmental Agency';

  return {
    id: `openaq-${loc.id}`,
    providerId: 'openaq',
    providerName: 'OpenAQ',
    upstreamProviderId: upstreamProvider,
    stationId: String(loc.id),
    sourceName: `${loc.name} (OpenAQ)`,
    name: loc.name,
    provider: `OpenAQ (${upstreamProvider})`,
    sourceKind: 'physical_observation',
    providerKind: 'official_ground_station',
    status: measurements.length === 0 ? 'unavailable' : freshness.status,
    latitude: locLat ?? null,
    longitude: locLon ?? null,
    distanceKm,
    coordinates: locLat != null && locLon != null ? { latitude: locLat, longitude: locLon, distanceKm } : null,
    observedAt: latestObservedAt,
    measuredAt: latestObservedAt,
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
        'Direct in-situ physical ground observation aggregated via OpenAQ',
        'Reporting latency and calibration depend on the originating environmental agency',
      ],
    },
  };
}

/**
 * Fetches OpenAQ v3 sources for given coordinates.
 * Server-side entry point.
 */
export async function fetchOpenAqSources(params: {
  latitude: number;
  longitude: number;
  radiusKm?: number;
  apiKey?: string;
  signal?: AbortSignal;
  bypassCache?: boolean;
}): Promise<EnvironmentalSourceRecord[]> {
  const { latitude, longitude, radiusKm = 35, apiKey = process.env.OPENAQ_API_KEY, signal, bypassCache = false } = params;

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
    return [];
  }

  // Key check: honest not_configured when missing
  if (!apiKey || apiKey.trim() === '' || apiKey === 'your_openaq_api_key_here') {
    return [buildUnconfiguredOpenAqRecord()];
  }

  const radiusMeters = Math.min(100000, Math.max(1000, Math.round(radiusKm * 1000)));
  const cacheKey = `${latitude.toFixed(2)},${longitude.toFixed(2)},${radiusMeters}`;

  if (!bypassCache) {
    const cached = openAqCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return cached.records;
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
      return [
        {
          ...buildUnconfiguredOpenAqRecord(),
          id: 'openaq-unauthorized',
          status: 'rejected',
          errorCode: 'UNAUTHORIZED',
          explanation: 'Invalid or expired OpenAQ API key provided in server environment.',
        },
      ];
    }

    if (res.status === 429) {
      return [
        {
          ...buildUnconfiguredOpenAqRecord(),
          id: 'openaq-rate-limit',
          status: 'unreachable',
          errorCode: 'RATE_LIMIT',
          explanation: 'OpenAQ API rate limit exceeded. Retrying on next scheduled cycle.',
        },
      ];
    }

    if (!res.ok) {
      return [
        {
          ...buildUnconfiguredOpenAqRecord(),
          id: 'openaq-server-error',
          status: 'unreachable',
          errorCode: `HTTP_${res.status}`,
          explanation: `OpenAQ API upstream error (HTTP ${res.status}).`,
        },
      ];
    }

    const data = await res.json();
    const locations: OpenAqLocationResult[] = Array.isArray(data?.results) ? data.results : [];

    if (locations.length === 0) {
      const now = new Date().toISOString();
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
          explanation: `No active OpenAQ ground monitoring stations found within ${radiusKm}km.`,
          provenance: {
            network: 'OpenAQ',
            licenseOrAttribution: 'OpenAQ Open Data (CC BY 4.0)',
            url: 'https://openaq.org/',
            isModel: false,
            limitations: ['No physical monitoring station found within configured radius'],
          },
        },
      ];
      openAqCache.set(cacheKey, { records: emptyRecords, cachedAt: Date.now() });
      return emptyRecords;
    }

    // Sort locations by distance to target coordinates
    const sorted = locations
      .map((loc) => {
        const lat = loc.coordinates?.latitude;
        const lon = loc.coordinates?.longitude;
        const dist = lat != null && lon != null ? calculateDistanceKm(latitude, longitude, lat, lon) : Infinity;
        return { loc, dist };
      })
      .filter((item) => item.dist <= radiusKm)
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

    if (records.length > 0) {
      openAqCache.set(cacheKey, { records, cachedAt: Date.now() });
    }

    return records;
  } catch (err: any) {
    return [
      {
        ...buildUnconfiguredOpenAqRecord(),
        id: 'openaq-network-error',
        status: 'unreachable',
        errorCode: 'NETWORK_ERROR',
        explanation: err?.name === 'AbortError' ? 'OpenAQ request timed out or was cancelled.' : 'Failed to reach OpenAQ API.',
      },
    ];
  }
}
