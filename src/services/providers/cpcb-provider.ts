/**
 * Central Pollution Control Board (CPCB) / CAAQMS Official Provider (Server-Side Only)
 * 
 * Ingests officially published real-time ground monitoring observations from
 * India's Open Government Data (OGD) Platform (data.gov.in) under the
 * National Data Sharing and Accessibility Policy (NDSAP).
 * Resource: Real-time Air Quality Index from various locations (3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69)
 * 
 * Strict Invariants:
 * 1. Server-side only: DATA_GOV_IN_API_KEY is never leaked to client bundles or query strings.
 * 2. Honest status: 'not_configured' when API key is missing; 'unauthorized' on 401/403.
 * 3. Zero fabrication: Never invent synthetic observations, coordinates, or timestamps.
 * 4. Preserves original timestamps, units, and aggregation meanings (min/max/avg).
 * 5. Strictly parses Indian Standard Time (IST, UTC+05:30) observation times.
 * 6. Deduplication: Provider-scoped station identity ('cpcb:<stationId>').
 */

import {
  EnvironmentalSourceRecord,
  SourceMeasurement,
  OfficialProviderStatus,
  OfficialGroundProviderResult,
} from '@/domain/types';
import { calculateDistanceKm } from '@/services/ground-station-service';
import {
  MAX_OBSERVATION_AGE_HOURS,
  validateObservationTiming,
  getActivePhysicalSources,
} from '@/config/environmental-sources';

export const CPCB_OGD_ENDPOINT = 'https://api.data.gov.in/resource/3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69';
export const CPCB_DEFAULT_SEARCH_RADIUS_KM = 35;
export const CPCB_MAX_SEARCH_RADIUS_KM = 50;

/**
 * Raw record format returned by Open Government Data (OGD) Platform India API
 */
export interface DataGovInRecord {
  country?: string;
  state?: string;
  city?: string;
  station?: string;
  last_update?: string;
  pollutant_id?: string;
  pollutant_min?: string | number | null;
  pollutant_max?: string | number | null;
  pollutant_avg?: string | number | null;
  pollutant_unit?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
}

export interface DataGovInApiResponse {
  index_name?: string;
  title?: string;
  total?: number;
  count?: number;
  limit?: string | number;
  offset?: string | number;
  records?: DataGovInRecord[];
  error?: string;
  message?: string;
}

/**
 * Parses date/time strings formatted as "DD-MM-YYYY HH:mm:ss" or ISO strings
 * in Indian Standard Time (IST, UTC+05:30).
 * Returns strict ISO-8601 string in UTC, or null if unparseable/invalid.
 */
export function parseIndianStandardTime(dateStr: string | null | undefined): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed || trimmed === 'NA' || trimmed === 'N/A' || trimmed === 'null') return null;

  // Pattern 1: DD-MM-YYYY HH:mm:ss (e.g., 22-11-2026 18:00:00)
  const dmyMatch = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (dmyMatch) {
    const [, day, month, year, hours, minutes, seconds = '00'] = dmyMatch;
    const isoWithOffset = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+05:30`;
    const parsed = Date.parse(isoWithOffset);
    if (isNaN(parsed)) return null;
    return new Date(parsed).toISOString();
  }

  // Pattern 2: YYYY-MM-DD HH:mm:ss
  const ymdMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[T\s]+(\d{2}):(\d{2})(?::(\d{2}))?(?:\+05:30|Z)?$/);
  if (ymdMatch) {
    const [, year, month, day, hours, minutes, seconds = '00'] = ymdMatch;
    const isoWithOffset = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+05:30`;
    const parsed = Date.parse(isoWithOffset);
    if (isNaN(parsed)) return null;
    return new Date(parsed).toISOString();
  }

  // Fallback: standard Date.parse
  const parsed = Date.parse(trimmed);
  if (!isNaN(parsed)) {
    return new Date(parsed).toISOString();
  }

  return null;
}

/**
 * Normalizes pollutant IDs from official government records into canonical keys.
 */
export function normalizeCpcbPollutantId(rawId: string | undefined): 'pm25' | 'pm10' | 'no2' | 'so2' | 'co' | 'o3' | 'nh3' | 'pb' | null {
  if (!rawId) return null;
  const cleaned = rawId.toUpperCase().replace(/[\s\.\-_]/g, '');
  switch (cleaned) {
    case 'PM25':
    case 'PM2':
      return 'pm25';
    case 'PM10':
      return 'pm10';
    case 'NO2':
      return 'no2';
    case 'SO2':
      return 'so2';
    case 'CO':
      return 'co';
    case 'OZONE':
    case 'O3':
      return 'o3';
    case 'NH3':
      return 'nh3';
    case 'PB':
    case 'LEAD':
      return 'pb';
    default:
      return null;
  }
}

/**
 * Parses numeric pollutant values strictly.
 * Rejects "NA", non-numeric strings, negative values, and Infinity.
 * Preserves genuine 0 values.
 */
export function parseCpcbPollutantValue(val: string | number | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    return Number.isFinite(val) && val >= 0 ? Math.round(val * 10) / 10 : null;
  }
  const trimmed = String(val).trim();
  if (!trimmed || trimmed === 'NA' || trimmed === 'N/A' || trimmed === 'null') return null;
  const num = Number(trimmed);
  return Number.isFinite(num) && num >= 0 ? Math.round(num * 10) / 10 : null;
}

/**
 * Parses coordinates safely.
 */
function parseCoordinate(val: string | number | null | undefined, min: number, max: number): number | null {
  if (val === null || val === undefined) return null;
  const num = typeof val === 'number' ? val : Number(String(val).trim());
  if (!Number.isFinite(num) || num < min || num > max) return null;
  return Math.round(num * 10000) / 10000;
}

/**
 * Groups and transforms flat data.gov.in records into canonical EnvironmentalSourceRecords.
 */
export function normalizeDataGovInRecords(
  records: DataGovInRecord[],
  targetLat?: number,
  targetLon?: number,
  maxRadiusKm = CPCB_MAX_SEARCH_RADIUS_KM
): EnvironmentalSourceRecord[] {
  if (!Array.isArray(records) || records.length === 0) return [];

  // Group flat pollutant rows by station identity
  const stationMap = new Map<string, {
    stationName: string;
    city: string;
    state: string;
    latitude: number | null;
    longitude: number | null;
    lastUpdateRaw: string | null;
    rawRows: DataGovInRecord[];
  }>();

  for (const r of records) {
    const stationName = (r.station || '').trim();
    if (!stationName) continue;
    const city = (r.city || '').trim();
    const state = (r.state || '').trim();
    const groupKey = `${state}:${city}:${stationName}`.toLowerCase();

    const lat = parseCoordinate(r.latitude, -90, 90);
    const lon = parseCoordinate(r.longitude, -180, 180);

    if (!stationMap.has(groupKey)) {
      stationMap.set(groupKey, {
        stationName,
        city,
        state,
        latitude: lat,
        longitude: lon,
        lastUpdateRaw: r.last_update || null,
        rawRows: [],
      });
    }

    const entry = stationMap.get(groupKey)!;
    if (entry.latitude === null && lat !== null) entry.latitude = lat;
    if (entry.longitude === null && lon !== null) entry.longitude = lon;
    if (!entry.lastUpdateRaw && r.last_update) entry.lastUpdateRaw = r.last_update;
    entry.rawRows.push(r);
  }

  const now = new Date().toISOString();
  const sources: EnvironmentalSourceRecord[] = [];

  for (const [, stationData] of stationMap.entries()) {
    let distanceKm: number | null = null;
    if (
      targetLat !== undefined &&
      targetLon !== undefined &&
      stationData.latitude !== null &&
      stationData.longitude !== null
    ) {
      distanceKm = calculateDistanceKm(targetLat, targetLon, stationData.latitude, stationData.longitude);
      // Filter out stations beyond search radius if distance is calculable
      if (distanceKm > maxRadiusKm) {
        continue;
      }
    }

    // Build pollutant measurements
    const measurements: SourceMeasurement[] = [];
    let latestObservationIso: string | null = null;

    for (const row of stationData.rawRows) {
      const pollutant = normalizeCpcbPollutantId(row.pollutant_id);
      if (!pollutant) continue;

      const avgVal = parseCpcbPollutantValue(row.pollutant_avg);
      const minVal = parseCpcbPollutantValue(row.pollutant_min);
      const maxVal = parseCpcbPollutantValue(row.pollutant_max);

      // Use average if available, otherwise fallback to min/max if avg missing
      const primaryVal = avgVal !== null ? avgVal : maxVal !== null ? maxVal : minVal;
      if (primaryVal === null) continue;

      // Parse pollutant-specific timestamp
      const rowObservedIso = parseIndianStandardTime(row.last_update);
      if (rowObservedIso && (!latestObservationIso || rowObservedIso > latestObservationIso)) {
        latestObservationIso = rowObservedIso;
      }

      // Explicit units: default to ug/m3, except CO which is mg/m3
      const unit = pollutant === 'co' ? 'mg/m3' : (row.pollutant_unit && row.pollutant_unit !== 'NA' ? row.pollutant_unit : 'ug/m3');

      measurements.push({
        pollutant,
        value: primaryVal,
        unit,
        // CPCB OGD API publishes real-time records without explicit averaging periods (null)
        averagingPeriodMinutes: null,
        observedAt: rowObservedIso,
        qualityFlag: 'valid',
      });
    }

    // Determine station-level status
    const timing = validateObservationTiming(latestObservationIso);
    let status: EnvironmentalSourceRecord['status'] = 'fresh';
    if (measurements.length === 0) {
      status = 'registry_only';
    } else if (timing.isStale) {
      status = 'stale';
    } else if (!timing.isValid && timing.isUntimed) {
      // Untimed reading
      status = 'fresh';
    }

    // Extract operating agency from station name (e.g. "Anand Vihar, Delhi - DPCC")
    let agency = 'Central Pollution Control Board (CPCB)';
    if (stationData.stationName.includes(' - ')) {
      const parts = stationData.stationName.split(' - ');
      if (parts[1]) agency = `${parts[1].trim()} / CPCB`;
    }

    const stationSlug = stationData.stationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const recordId = `cpcb-${stationSlug}`;

    sources.push({
      id: recordId,
      providerId: 'cpcb',
      providerName: 'Central Pollution Control Board (CPCB)',
      provider: 'CPCB / State PCB',
      upstreamProviderId: 'cpcb_caaqms',
      stationId: stationData.stationName,
      sourceName: `${stationData.stationName}${distanceKm !== null ? ` (${distanceKm}km)` : ''}`,
      name: stationData.stationName,
      sourceKind: 'official_ground_station',
      providerKind: 'official_ground_station',
      status,
      latitude: stationData.latitude,
      longitude: stationData.longitude,
      distanceKm,
      coordinates: stationData.latitude !== null && stationData.longitude !== null
        ? { latitude: stationData.latitude, longitude: stationData.longitude, distanceKm }
        : null,
      observedAt: latestObservationIso,
      measuredAt: latestObservationIso,
      retrievedAt: now,
      ingestedAt: now,
      measurements,
      attribution: 'Central Pollution Control Board (CPCB / CAAQMS Open Data)',
      explanation: measurements.length === 0
        ? 'Official reference monitor registered in national network; real-time sensor measurements currently unavailable.'
        : `Official government regulatory monitoring station operated by ${agency}.`,
      provenance: {
        network: agency,
        licenseOrAttribution: 'Open Government Data (OGD) Platform India (NDSAP)',
        url: CPCB_OGD_ENDPOINT,
        isModel: false,
        limitations: [
          'Official regulatory reference station (Beta-Attenuation Monitor / TEOM / Chemiluminescence)',
          'Hourly synchronization schedule governed by national server synchronization',
          'Averaging periods represent source-defined aggregation',
        ],
      },
    });
  }

  // Sort by distance if available
  sources.sort((a, b) => {
    if (a.distanceKm === null) return 1;
    if (b.distanceKm === null) return -1;
    return a.distanceKm - b.distanceKm;
  });

  return sources;
}

export interface FetchCpcbOptions {
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  city?: string;
  state?: string;
  signal?: AbortSignal;
  apiKeyOverride?: string;
  mockRecords?: DataGovInRecord[];
}

/**
 * Fetches and parses official ground station observations from data.gov.in.
 * Strictly adheres to server-side isolation and security policies.
 */
export async function fetchCpcbProviderResult(options: FetchCpcbOptions = {}): Promise<OfficialGroundProviderResult> {
  const now = new Date().toISOString();

  // Test injection: allow testing normalization directly with mock records
  if (options.mockRecords) {
    const sources = normalizeDataGovInRecords(
      options.mockRecords,
      options.latitude,
      options.longitude,
      options.radiusKm || CPCB_DEFAULT_SEARCH_RADIUS_KM
    );
    const activePm25 = getActivePhysicalSources(sources, 'pm25');
    const activePm10 = getActivePhysicalSources(sources, 'pm10');
    return {
      providerId: 'cpcb',
      status: sources.length > 0 ? 'available' : 'no_coverage',
      sources,
      retrievedAt: now,
      observedThrough: sources[0]?.observedAt || null,
      activeStationCount: activePm25.length,
      activePm25Count: activePm25.length,
      activePm10Count: activePm10.length,
      availableStationCount: sources.length,
    };
  }

  // API key resolution (server-side only)
  const apiKey = options.apiKeyOverride || process.env.DATA_GOV_IN_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'your_data_gov_in_api_key_here') {
    return {
      providerId: 'cpcb',
      status: 'not_configured',
      sources: [],
      retrievedAt: now,
      observedThrough: null,
      activeStationCount: 0,
      activePm25Count: 0,
      activePm10Count: 0,
      availableStationCount: 0,
      errorMessage: 'DATA_GOV_IN_API_KEY is not configured on the server.',
    };
  }

  try {
    // Construct authorized request URL
    const url = new URL(CPCB_OGD_ENDPOINT);
    url.searchParams.set('api-key', apiKey);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '500');

    if (options.city) {
      url.searchParams.set('filters[city]', options.city);
    }
    if (options.state) {
      url.searchParams.set('filters[state]', options.state);
    }

    // Set 8-second timeout for government open data API
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const combinedSignal = options.signal || controller.signal;

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        signal: combinedSignal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Avir-Environmental-Intelligence/1.0',
        },
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (res.status === 401 || res.status === 403) {
      return {
        providerId: 'cpcb',
        status: 'unauthorized',
        sources: [],
        retrievedAt: now,
        observedThrough: null,
        activeStationCount: 0,
        activePm25Count: 0,
        activePm10Count: 0,
        availableStationCount: 0,
        errorCode: 'UNAUTHORIZED',
        errorMessage: 'Invalid or unauthorized DATA_GOV_IN_API_KEY.',
      };
    }

    if (res.status === 429) {
      return {
        providerId: 'cpcb',
        status: 'rate_limited',
        sources: [],
        retrievedAt: now,
        observedThrough: null,
        activeStationCount: 0,
        activePm25Count: 0,
        activePm10Count: 0,
        availableStationCount: 0,
        errorCode: 'RATE_LIMITED',
        errorMessage: 'data.gov.in API rate limit exceeded.',
      };
    }

    if (!res.ok) {
      return {
        providerId: 'cpcb',
        status: 'upstream_error',
        sources: [],
        retrievedAt: now,
        observedThrough: null,
        activeStationCount: 0,
        activePm25Count: 0,
        activePm10Count: 0,
        availableStationCount: 0,
        errorCode: `HTTP_${res.status}`,
        errorMessage: `data.gov.in upstream service responded with HTTP ${res.status}.`,
      };
    }

    const data: DataGovInApiResponse = await res.json();

    if (data.error) {
      if (data.error.toLowerCase().includes('authoris') || data.error.toLowerCase().includes('key')) {
        return {
          providerId: 'cpcb',
          status: 'unauthorized',
          sources: [],
          retrievedAt: now,
          observedThrough: null,
          activeStationCount: 0,
          activePm25Count: 0,
          activePm10Count: 0,
          availableStationCount: 0,
          errorCode: 'UNAUTHORIZED',
          errorMessage: data.error,
        };
      }
      return {
        providerId: 'cpcb',
        status: 'upstream_error',
        sources: [],
        retrievedAt: now,
        observedThrough: null,
        activeStationCount: 0,
        activePm25Count: 0,
        activePm10Count: 0,
        availableStationCount: 0,
        errorCode: 'UPSTREAM_API_ERROR',
        errorMessage: data.error,
      };
    }

    const records = Array.isArray(data.records) ? data.records : [];
    const normalizedSources = normalizeDataGovInRecords(
      records,
      options.latitude,
      options.longitude,
      options.radiusKm || CPCB_DEFAULT_SEARCH_RADIUS_KM
    );

    const activePm25 = getActivePhysicalSources(normalizedSources, 'pm25');
    const activePm10 = getActivePhysicalSources(normalizedSources, 'pm10');

    let providerStatus: OfficialProviderStatus = 'available';
    if (normalizedSources.length === 0) {
      providerStatus = 'no_coverage';
    }

    return {
      providerId: 'cpcb',
      status: providerStatus,
      sources: normalizedSources,
      retrievedAt: now,
      observedThrough: normalizedSources[0]?.observedAt || null,
      activeStationCount: activePm25.length,
      activePm25Count: activePm25.length,
      activePm10Count: activePm10.length,
      availableStationCount: normalizedSources.length,
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return {
        providerId: 'cpcb',
        status: 'unavailable',
        sources: [],
        retrievedAt: now,
        observedThrough: null,
        activeStationCount: 0,
        activePm25Count: 0,
        activePm10Count: 0,
        availableStationCount: 0,
        errorCode: 'TIMEOUT',
        errorMessage: 'data.gov.in request timed out.',
      };
    }

    return {
      providerId: 'cpcb',
      status: 'unavailable',
      sources: [],
      retrievedAt: now,
      observedThrough: null,
      activeStationCount: 0,
      activePm25Count: 0,
      activePm10Count: 0,
      availableStationCount: 0,
      errorCode: 'NETWORK_ERROR',
      errorMessage: err?.message || 'Failed to connect to data.gov.in official feed.',
    };
  }
}
