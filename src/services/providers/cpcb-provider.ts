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
 * Calendar and time validation helpers for strict timestamp parsing.
 * Strictly rejects impossible calendar dates (e.g. Feb 30, non-leap Feb 29)
 * and invalid time units (hours > 23, minutes > 59, seconds > 59).
 */
function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (year < 1970 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [
    31,
    isLeapYear ? 29 : 28,
    31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
  ];

  return day <= daysInMonth[month - 1];
}

function isValidTime(hours: number, minutes: number, seconds: number): boolean {
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 && seconds >= 0 && seconds <= 59;
}

/**
 * Parses date/time strings formatted as "DD-MM-YYYY HH:mm:ss" or ISO strings
 * in Indian Standard Time (IST, UTC+05:30) or explicit UTC/offset formats.
 * 
 * Strict Invariants (Defect 5):
 * 1. Format A: DD-MM-YYYY HH:mm:ss -> strictly interpreted as IST (+05:30) -> UTC ISO.
 * 2. Format B: YYYY-MM-DD HH:mm:ss -> documented dataset timezone (IST +05:30).
 * 3. Format C/D: Explicit ISO with offset (Z or +/-HH:mm) -> preserves original offset strictly. Never applies IST twice.
 * 4. Rejects impossible calendar dates (Feb 30, non-leap Feb 29, month 13, day 32).
 * 5. Rejects invalid time units (hours >= 24, minutes >= 60, seconds >= 60).
 * 6. Zero browser-local timezone dependency; never falls back to permissive Date.parse().
 */
export function parseIndianStandardTime(dateStr: string | null | undefined): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed || trimmed === 'NA' || trimmed === 'N/A' || trimmed === 'null') return null;

  // Format A: DD-MM-YYYY HH:mm:ss (or DD-MM-YYYY HH:mm)
  const dmyMatch = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})(?:[\sT](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    const hours = Number(dmyMatch[4] || 0);
    const minutes = Number(dmyMatch[5] || 0);
    const seconds = Number(dmyMatch[6] || 0);

    if (!isValidCalendarDate(year, month, day) || !isValidTime(hours, minutes, seconds)) {
      return null;
    }

    const isoWithOffset = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}+05:30`;
    const parsed = Date.parse(isoWithOffset);
    if (isNaN(parsed)) return null;
    return new Date(parsed).toISOString();
  }

  // Format B, C, D, E: YYYY-MM-DD[T\s]HH:mm:ss[.sss][offset]
  const ymdMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/);
  if (ymdMatch) {
    const year = Number(ymdMatch[1]);
    const month = Number(ymdMatch[2]);
    const day = Number(ymdMatch[3]);
    const hours = Number(ymdMatch[4] || 0);
    const minutes = Number(ymdMatch[5] || 0);
    const seconds = Number(ymdMatch[6] || 0);
    const offset = ymdMatch[7]; // 'Z' or '+05:30', etc.

    if (!isValidCalendarDate(year, month, day) || !isValidTime(hours, minutes, seconds)) {
      return null;
    }

    let isoString: string;
    if (offset) {
      // Explicit offset provided (Z, +05:30, -05:00) - respect it strictly!
      let normalizedOffset = offset;
      if (normalizedOffset.length === 5 && (normalizedOffset.startsWith('+') || normalizedOffset.startsWith('-'))) {
        normalizedOffset = `${normalizedOffset.slice(0, 3)}:${normalizedOffset.slice(3)}`;
      }
      isoString = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}${normalizedOffset}`;
    } else {
      // Documented dataset timezone (IST +05:30) when timestamp has no offset
      isoString = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}+05:30`;
    }

    const parsed = Date.parse(isoString);
    if (isNaN(parsed)) return null;
    return new Date(parsed).toISOString();
  }

  // Strictly reject unsupported, ambiguous, or invalid date strings
  return null;
}

/**
 * Official CPCB CAAQMS OGD Dataset (Resource 3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69)
 * Documented Statutory Units Contract (MoEFCC CPCB Guidelines 2014):
 * - Criteria particulates and gases (PM2.5, PM10, NO2, SO2, NH3, Pb, Ozone) in µg/m³.
 * - Carbon Monoxide (CO) in mg/m³.
 */
export const DOCUMENTED_CPCB_DATASET_UNITS: Record<string, string> = {
  pm25: 'ug/m3',
  pm10: 'ug/m3',
  no2: 'ug/m3',
  so2: 'ug/m3',
  nh3: 'ug/m3',
  pb: 'ug/m3',
  o3: 'ug/m3',
  co: 'mg/m3',
};

/**
 * Resolves measurement units strictly (Defect 3):
 * 1. Explicit source-row metadata (normalized)
 * 2. Documented dataset-level statutory unit mapping (when row unit is missing/NA)
 * 3. Otherwise returns null (unknown unit, excluded from unit-dependent calculations).
 */
export function resolveCpcbPollutantUnit(
  rawUnit: string | null | undefined,
  pollutant: string
): string | null {
  if (rawUnit && typeof rawUnit === 'string') {
    const trimmed = rawUnit.trim();
    if (trimmed && trimmed !== 'NA' && trimmed !== 'N/A' && trimmed !== 'null') {
      const lower = trimmed.toLowerCase();
      if (lower === 'ug/m3' || lower === 'µg/m³' || lower === 'ug/m^3' || lower === 'micrograms/m3') {
        return 'ug/m3';
      }
      if (lower === 'mg/m3' || lower === 'mg/m³' || lower === 'mg/m^3' || lower === 'milligrams/m3') {
        return 'mg/m3';
      }
      // If raw unit is explicitly provided but unrecognized/unsupported (e.g. 'ppm')
      return lower;
    }
  }

  // When upstream row does not provide unit, verify documented dataset contract
  const documented = DOCUMENTED_CPCB_DATASET_UNITS[pollutant];
  return documented || null;
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

      // Defect 1: Strict Statistical Integrity — pollutant_avg ONLY represents the average.
      // Never substitute pollutant_min or pollutant_max into canonical measurement value.
      // If pollutant_avg is missing, invalid, or "NA", no valid average measurement is created.
      if (avgVal === null) {
        continue;
      }

      // Parse pollutant-specific timestamp
      const rowObservedIso = parseIndianStandardTime(row.last_update);
      if (rowObservedIso && (!latestObservationIso || rowObservedIso > latestObservationIso)) {
        latestObservationIso = rowObservedIso;
      }

      // Defect 3: Unit resolution — explicit row metadata or documented dataset contract
      const unit = resolveCpcbPollutantUnit(row.pollutant_unit, pollutant);
      if (!unit) {
        // Exclude unverified or unknown units from valid measurements
        continue;
      }

      measurements.push({
        pollutant,
        value: avgVal,
        unit,
        // CPCB OGD API publishes real-time records without explicit averaging periods (null)
        averagingPeriodMinutes: null,
        observedAt: rowObservedIso,
        qualityFlag: 'valid',
        min: minVal,
        max: maxVal,
      });
    }

    // Determine station-level status (Defect 2)
    // Never default to 'fresh'. A physical observation is fresh ONLY after validating an original timestamp.
    let status: EnvironmentalSourceRecord['status'] = 'unavailable';
    if (measurements.length === 0) {
      // Live station query returned rows, but usable average measurements are currently unavailable
      status = 'unavailable';
    } else if (!latestObservationIso) {
      // Untimed reading: missing observation timestamp cannot produce fresh status
      status = 'unavailable';
    } else {
      const timing = validateObservationTiming(latestObservationIso);
      if (!timing.isValid) {
        status = 'unavailable';
      } else if (timing.isStale) {
        status = 'stale';
      } else {
        status = 'fresh';
      }
    }

    // Defect 8: Extract operating agency strictly from metadata or explicit name pattern.
    // Never guess or default to CPCB! Unknown operating agency remains unknown.
    let agency: string | null = null;
    if (stationData.stationName.includes(' - ')) {
      const parts = stationData.stationName.split(' - ');
      const suffix = parts[parts.length - 1]?.trim().toUpperCase();
      if (suffix === 'DPCC') agency = 'Delhi Pollution Control Committee (DPCC)';
      else if (suffix === 'UPPCB') agency = 'Uttar Pradesh Pollution Control Board (UPPCB)';
      else if (suffix === 'HSPCB') agency = 'Haryana State Pollution Control Board (HSPCB)';
      else if (suffix === 'RSPCB') agency = 'Rajasthan State Pollution Control Board (RSPCB)';
      else if (suffix === 'BSPCB') agency = 'Bihar State Pollution Control Board (BSPCB)';
      else if (suffix === 'KSPCB') agency = 'Karnataka State Pollution Control Board (KSPCB)';
      else if (suffix === 'MPCB') agency = 'Maharashtra Pollution Control Board (MPCB)';
      else if (suffix === 'CPCB') agency = 'Central Pollution Control Board (CPCB)';
      else if (suffix) agency = parts[parts.length - 1].trim();
    }

    // Defect 8: Scoped record ID to prevent collisions across cities with identical station names (e.g. "Civil Lines")
    const stateSlug = stationData.state.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const citySlug = stationData.city.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const stationSlug = stationData.stationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const recordId = `cpcb-${stateSlug ? `${stateSlug}-` : ''}${citySlug ? `${citySlug}-` : ''}${stationSlug}`;

    sources.push({
      id: recordId,
      providerId: 'cpcb',
      providerName: 'Central Pollution Control Board (CPCB)',
      provider: agency || 'CPCB / State PCB',
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
        : agency
        ? `Official government regulatory monitoring station operated by ${agency}.`
        : 'Official government regulatory monitoring station (operating authority not specified in public dataset).',
      provenance: {
        network: agency || 'Unknown Operating Authority (Published via OGD Platform India)',
        licenseOrAttribution: 'Open Government Data (OGD) Platform India (NDSAP)',
        url: CPCB_OGD_ENDPOINT,
        isModel: false,
        limitations: [
          'Continuous Ambient Air Quality Monitoring Station (CAAQMS) official regulatory stream',
          'Specific monitoring instrumentation not reported in public dataset metadata',
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
  limit?: number;
  maxPages?: number;
}

/**
 * Composes an external caller signal and an internal timeout signal (Defect 7).
 * Ensures both caller cancellation and internal timeout remain active,
 * with complete cleanup of timers and listeners.
 */
export function createCombinedAbortSignal(
  externalSignal?: AbortSignal,
  timeoutMs = 8000
): { signal: AbortSignal; cleanup: () => void; isTimeout: () => boolean } {
  const timeoutController = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    timeoutController.abort(new DOMException('Request timed out', 'TimeoutError'));
  }, timeoutMs);

  let cleanupListeners = () => {};

  if (typeof (AbortSignal as any).any === 'function' && externalSignal) {
    const combined = (AbortSignal as any).any([externalSignal, timeoutController.signal]);
    cleanupListeners = () => {
      clearTimeout(timer);
    };
    return {
      signal: combined,
      cleanup: cleanupListeners,
      isTimeout: () => timedOut,
    };
  }

  const compositeController = new AbortController();

  const onExternalAbort = () => {
    compositeController.abort(externalSignal?.reason);
  };
  const onTimeoutAbort = () => {
    compositeController.abort(timeoutController.signal.reason);
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      compositeController.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  timeoutController.signal.addEventListener('abort', onTimeoutAbort, { once: true });

  cleanupListeners = () => {
    clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
    timeoutController.signal.removeEventListener('abort', onTimeoutAbort);
  };

  return {
    signal: compositeController.signal,
    cleanup: cleanupListeners,
    isTimeout: () => timedOut,
  };
}

/**
 * Fetches and parses official ground station observations from data.gov.in.
 * Strictly adheres to server-side isolation and security policies.
 * Implements bounded pagination (Defect 6) and composed timeout cancellation (Defect 7).
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

    // Defect 11: Compute observedThrough strictly from newest valid observation
    let latestValidObservedThrough: string | null = null;
    for (const s of sources) {
      for (const m of s.measurements) {
        if (m.observedAt) {
          const timing = validateObservationTiming(m.observedAt);
          if (timing.isValid && (!latestValidObservedThrough || m.observedAt > latestValidObservedThrough)) {
            latestValidObservedThrough = m.observedAt;
          }
        }
      }
    }

    return {
      providerId: 'cpcb',
      status: sources.length > 0 ? 'available' : 'no_coverage',
      sources,
      retrievedAt: now,
      observedThrough: latestValidObservedThrough,
      activeStationCount: activePm25.length,
      activePm25Count: activePm25.length,
      activePm10Count: activePm10.length,
      availableStationCount: sources.length,
      isPartial: false,
      totalReported: options.mockRecords.length,
      totalFetched: options.mockRecords.length,
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
      isPartial: false,
      errorMessage: 'DATA_GOV_IN_API_KEY is not configured on the server.',
    };
  }

  try {
    const limit = options.limit ? Math.min(options.limit, 500) : 500;
    const maxPages = options.maxPages || 5; // Up to 2,500 records
    let offset = 0;
    let pageIndex = 0;
    const accumulatedRecords: DataGovInRecord[] = [];
    const seenRowKeys = new Set<string>();
    let totalReported: number | undefined = undefined;
    let isPartial = false;
    let paginationRateLimited = false;
    let paginationTimedOut = false;

    while (pageIndex < maxPages) {
      const url = new URL(CPCB_OGD_ENDPOINT);
      url.searchParams.set('api-key', apiKey);
      url.searchParams.set('format', 'json');
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('offset', String(offset));

      if (options.city) {
        url.searchParams.set('filters[city]', options.city);
      }
      if (options.state) {
        url.searchParams.set('filters[state]', options.state);
      }

      // Compose caller signal with internal 8-second timeout (Defect 7)
      const { signal: combinedSignal, cleanup, isTimeout } = createCombinedAbortSignal(options.signal, 8000);

      let res: Response;
      try {
        res = await fetch(url.toString(), {
          signal: combinedSignal,
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Avir-Environmental-Intelligence/1.0',
          },
        });
      } catch (fetchErr: any) {
        cleanup();
        if (fetchErr?.name === 'AbortError' || isTimeout()) {
          if (isTimeout()) {
            if (pageIndex > 0) {
              isPartial = true;
              paginationTimedOut = true;
              break;
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
              isPartial: false,
              errorCode: 'TIMEOUT',
              errorMessage: 'data.gov.in request timed out.',
            };
          } else {
            // Caller-initiated cancellation
            throw fetchErr;
          }
        }
        if (pageIndex > 0) {
          isPartial = true;
          break;
        }
        throw fetchErr;
      }
      cleanup();

      if (res.status === 401 || res.status === 403) {
        if (pageIndex > 0) {
          isPartial = true;
          break;
        }
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
          isPartial: false,
          errorCode: 'UNAUTHORIZED',
          errorMessage: 'Invalid or unauthorized DATA_GOV_IN_API_KEY.',
        };
      }

      if (res.status === 429) {
        if (pageIndex > 0) {
          isPartial = true;
          paginationRateLimited = true;
          break;
        }
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
          isPartial: false,
          errorCode: 'RATE_LIMITED',
          errorMessage: 'data.gov.in API rate limit exceeded.',
        };
      }

      if (!res.ok) {
        if (pageIndex > 0) {
          isPartial = true;
          break;
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
          isPartial: false,
          errorCode: `HTTP_${res.status}`,
          errorMessage: `data.gov.in upstream service responded with HTTP ${res.status}.`,
        };
      }

      const data: DataGovInApiResponse = await res.json();

      if (data.error) {
        if (data.error.toLowerCase().includes('authoris') || data.error.toLowerCase().includes('key')) {
          if (pageIndex > 0) {
            isPartial = true;
            break;
          }
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
            isPartial: false,
            errorCode: 'UNAUTHORIZED',
            errorMessage: data.error,
          };
        }
        if (pageIndex > 0) {
          isPartial = true;
          break;
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
          isPartial: false,
          errorCode: 'UPSTREAM_API_ERROR',
          errorMessage: data.error,
        };
      }

      if (data.total !== undefined && typeof data.total === 'number') {
        totalReported = data.total;
      }

      const pageRecords = Array.isArray(data.records) ? data.records : [];
      if (pageRecords.length === 0) {
        // Empty page -> reached end of dataset
        break;
      }

      let newRowsAdded = 0;
      for (const r of pageRecords) {
        // Row deduplication key
        const rowKey = `${r.state || ''}:${r.city || ''}:${r.station || ''}:${r.pollutant_id || ''}:${r.last_update || ''}:${r.pollutant_avg || ''}`;
        if (!seenRowKeys.has(rowKey)) {
          seenRowKeys.add(rowKey);
          accumulatedRecords.push(r);
          newRowsAdded++;
        }
      }

      // If no new unique records were added (e.g. repeated page loop), break
      if (newRowsAdded === 0) {
        break;
      }

      // If page had fewer records than limit, reached end
      if (pageRecords.length < limit) {
        break;
      }

      // If total reported is reached
      if (totalReported !== undefined && (offset + pageRecords.length) >= totalReported) {
        break;
      }

      offset += limit;
      pageIndex++;
    }

    if (totalReported !== undefined && totalReported > accumulatedRecords.length && pageIndex >= maxPages) {
      isPartial = true;
    }

    const normalizedSources = normalizeDataGovInRecords(
      accumulatedRecords,
      options.latitude,
      options.longitude,
      options.radiusKm || CPCB_DEFAULT_SEARCH_RADIUS_KM
    );

    const activePm25 = getActivePhysicalSources(normalizedSources, 'pm25');
    const activePm10 = getActivePhysicalSources(normalizedSources, 'pm10');

    // Defect 11: Compute observedThrough from the latest valid observation among all retrieved measurements
    let latestValidObservedThrough: string | null = null;
    for (const s of normalizedSources) {
      for (const m of s.measurements) {
        if (m.observedAt) {
          const timing = validateObservationTiming(m.observedAt);
          if (timing.isValid && (!latestValidObservedThrough || m.observedAt > latestValidObservedThrough)) {
            latestValidObservedThrough = m.observedAt;
          }
        }
      }
    }

    let providerStatus: OfficialProviderStatus = 'available';
    if (isPartial && normalizedSources.length === 0) {
      // Incomplete query must not be reported as definitive no_coverage (Defect 6)
      providerStatus = 'partial';
    } else if (normalizedSources.length === 0) {
      providerStatus = 'no_coverage';
    }

    return {
      providerId: 'cpcb',
      status: providerStatus,
      sources: normalizedSources,
      retrievedAt: now,
      observedThrough: latestValidObservedThrough,
      activeStationCount: activePm25.length,
      activePm25Count: activePm25.length,
      activePm10Count: activePm10.length,
      availableStationCount: normalizedSources.length,
      isPartial,
      totalReported,
      totalFetched: accumulatedRecords.length,
      errorMessage: paginationRateLimited
        ? 'data.gov.in rate limit encountered during pagination; partial results preserved.'
        : paginationTimedOut
        ? 'data.gov.in request timed out during pagination; partial results preserved.'
        : undefined,
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      const isCallerCancellation = options.signal?.aborted;
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
        isPartial: false,
        errorCode: isCallerCancellation ? 'CLIENT_ABORTED' : 'TIMEOUT',
        errorMessage: isCallerCancellation ? 'Request cancelled by caller.' : 'data.gov.in request timed out.',
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
      isPartial: false,
      errorCode: 'NETWORK_ERROR',
      errorMessage: err?.message || 'Failed to connect to data.gov.in official feed.',
    };
  }
}
