/**
 * Shared Client-Safe Configuration for Environmental Sources (Step 3/24)
 * 
 * Single source of truth for OpenAQ v3 API bounds, comparison thresholds,
 * data freshness policies, canonical measurement eligibility, and pure source selectors.
 * Client-safe with zero server-only dependencies or credentials.
 */

import {
  EnvironmentalSourceRecord,
  SourceMeasurement,
} from '@/domain/types';

// OpenAQ API v3 Geographic Search Bounds
export const OPENAQ_MIN_RADIUS_KM = 1;
export const OPENAQ_DEFAULT_RADIUS_KM = 25;
export const OPENAQ_MAX_RADIUS_KM = 25; // Official OpenAQ v3 API maximum search radius (25,000 meters)

// Inter-Source Scientific Comparison Bounds & Heuristics
export const MAX_COMPARISON_DISTANCE_KM = 25; // Documented geographic boundary-layer correlation limit
export const MAX_COMPARISON_TIME_DIFF_MINUTES = 120; // 2 hours maximum temporal delta
export const MAX_OBSERVATION_AGE_HOURS = 24; // 24-hour freshness policy
export const SKEW_ALLOWANCE_MINUTES = 10; // Maximum allowed forward clock skew

/**
 * Validates whether an observation timestamp is fresh, stale, or future-dated.
 * Distinguishes missing/unverifiable timestamps from authentically stale (>24h) readings.
 */
export function validateObservationTiming(
  timestampStr: string | null | undefined,
  nowMs = Date.now()
): { isValid: boolean; isStale: boolean; isUntimed?: boolean; error?: string } {
  if (!timestampStr) {
    return { isValid: false, isStale: false, isUntimed: true, error: 'Missing timestamp (unverifiable freshness)' };
  }

  const parsed = Date.parse(timestampStr);
  if (isNaN(parsed)) {
    return { isValid: false, isStale: false, error: 'Unparseable timestamp' };
  }

  const skewAllowanceMs = SKEW_ALLOWANCE_MINUTES * 60 * 1000;
  if (parsed > nowMs + skewAllowanceMs) {
    return { isValid: false, isStale: false, error: 'Suspicious future-dated physical observation timestamp' };
  }

  const ageMs = nowMs - parsed;
  const maxAgeMs = MAX_OBSERVATION_AGE_HOURS * 3600 * 1000;
  if (ageMs > maxAgeMs) {
    const ageHours = Math.round(ageMs / 3600000);
    return {
      isValid: true,
      isStale: true,
      error: `Observation is ${ageHours} hours old (exceeds ${MAX_OBSERVATION_AGE_HOURS}h freshness policy)`,
    };
  }

  return { isValid: true, isStale: false };
}

/**
 * Canonical Measurement Eligibility Result
 */
export type MeasurementEligibility =
  | {
      eligible: true;
      pollutant: 'pm25' | 'pm10';
      value: number;
      unit: string;
      observedAt: string;
      ageMinutes: number;
    }
  | {
      eligible: false;
      reason:
        | 'missing_measurement'
        | 'invalid_value'
        | 'unsupported_unit'
        | 'missing_timestamp'
        | 'invalid_timestamp'
        | 'future_timestamp'
        | 'stale'
        | 'source_unavailable'
        | 'registry_only'
        | 'duplicate_source';
      message: string;
    };

/**
 * Pure Canonical Measurement Eligibility Function.
 * Single source of truth for physical particulate measurement validation.
 * 
 * Strict Invariants:
 * 1. ZERO TIMESTAMP CONTAMINATION: strictly evaluates measurement.observedAt ?? null.
 *    Never falls back to source-level observedAt or other pollutants.
 * 2. Missing timestamps are UNVERIFIABLE, not automatically stale.
 * 3. Valid zero concentrations (0 µg/m³) are preserved and accepted.
 * 4. Stale measurements (>24h) are rejected from active counts but preserved for provenance.
 */
export function evaluateMeasurementEligibility(
  source: EnvironmentalSourceRecord,
  targetPollutant: 'pm25' | 'pm10',
  now: Date | number = Date.now()
): MeasurementEligibility {
  if (!source || !source.id) {
    return {
      eligible: false,
      reason: 'source_unavailable',
      message: 'Source record is null or missing an identifier.',
    };
  }

  // Check source-level status
  if (source.status === 'not_configured') {
    return {
      eligible: false,
      reason: 'source_unavailable',
      message: 'Provider API key is not configured on the server.',
    };
  }
  if (source.status === 'registry_only') {
    return {
      eligible: false,
      reason: 'registry_only',
      message: 'Hardware station is registered but awaiting live measurement stream.',
    };
  }
  if (
    source.status === 'unavailable' ||
    source.status === 'rejected' ||
    source.status === 'unreachable' ||
    source.status === 'error'
  ) {
    return {
      eligible: false,
      reason: 'source_unavailable',
      message: `Source status is ${source.status}.`,
    };
  }

  // Must have a measurement for target pollutant
  const measurement: SourceMeasurement | undefined = source.measurements?.find(
    (m) => m && m.pollutant === targetPollutant
  );

  if (!measurement) {
    return {
      eligible: false,
      reason: 'missing_measurement',
      message: `No ${targetPollutant.toUpperCase()} measurement present in source records.`,
    };
  }

  // Value checks (finite, non-negative, valid zero)
  if (
    measurement.value === null ||
    measurement.value === undefined ||
    !Number.isFinite(measurement.value) ||
    measurement.value < 0 ||
    measurement.qualityFlag === 'rejected'
  ) {
    return {
      eligible: false,
      reason: 'invalid_value',
      message: `Invalid or negative ${targetPollutant.toUpperCase()} concentration value.`,
    };
  }

  // Unit validation (strictly ug/m3 or µg/m³)
  const unit = (measurement.unit || '').toLowerCase().trim();
  if (unit !== 'ug/m3' && unit !== 'µg/m³' && unit !== 'ug/m^3' && unit !== 'micrograms/m3') {
    return {
      eligible: false,
      reason: 'unsupported_unit',
      message: `Unsupported concentration unit "${measurement.unit}". Only µg/m³ is valid for physical particulate measurements.`,
    };
  }

  // ZERO TIMESTAMP CONTAMINATION: strictly pollutant's own measurement timestamp, NEVER source.observedAt
  const obsTime = measurement.observedAt ?? null;
  if (!obsTime) {
    return {
      eligible: false,
      reason: 'missing_timestamp',
      message: `${targetPollutant.toUpperCase()} observation timestamp is missing; freshness cannot be verified.`,
    };
  }

  const nowMs = typeof now === 'number' ? now : now.getTime();
  const timing = validateObservationTiming(obsTime, nowMs);

  if (timing.isUntimed || !timing.isValid) {
    if (timing.error?.includes('future-dated')) {
      return {
        eligible: false,
        reason: 'future_timestamp',
        message: timing.error,
      };
    }
    return {
      eligible: false,
      reason: timing.isUntimed ? 'missing_timestamp' : 'invalid_timestamp',
      message: timing.error || `Invalid ${targetPollutant.toUpperCase()} observation timestamp "${obsTime}".`,
    };
  }

  if (timing.isStale) {
    return {
      eligible: false,
      reason: 'stale',
      message: timing.error || `Observation exceeds ${MAX_OBSERVATION_AGE_HOURS}h freshness policy.`,
    };
  }

  const parsed = Date.parse(obsTime);
  const ageMs = nowMs - parsed;

  return {
    eligible: true,
    pollutant: targetPollutant,
    value: measurement.value,
    unit: 'ug/m3',
    observedAt: obsTime,
    ageMinutes: Math.round(ageMs / 60000),
  };
}

/**
 * Deduplication key generator for physical observation stations.
 * Collapses records from multiple aggregators pointing to the same physical station ID.
 */
export function getPhysicalStationDeduplicationKey(src: EnvironmentalSourceRecord): string {
  if (src.stationId && src.sourceKind !== 'atmospheric_model' && src.sourceKind !== 'derived_standard') {
    return `station:${src.stationId.trim().toLowerCase()}`;
  }
  if (src.upstreamProviderId && src.stationId) {
    return `${src.upstreamProviderId.toLowerCase().trim()}:${src.stationId.trim()}`;
  }
  return src.id;
}

/**
 * Pure selector: extracts active, reporting physical ground observation monitors.
 * Strictly excludes:
 * - Stale readings (>24h)
 * - Untimed readings (missing observation timestamp)
 * - Rejected or unparseable readings
 * - Unreachable providers or network error records
 * - Unconfigured diagnostic placeholders
 * - Registry-only stations with no measurements
 * - Atmospheric models or derived standards
 * - Duplicate upstream sensor feeds
 */
export function getActivePhysicalSources(
  sources: EnvironmentalSourceRecord[] = [],
  targetPollutant: 'pm25' | 'pm10' = 'pm25',
  now: Date | number = Date.now()
): EnvironmentalSourceRecord[] {
  if (!Array.isArray(sources)) return [];

  const seenKeys = new Set<string>();
  const active: EnvironmentalSourceRecord[] = [];

  for (const src of sources) {
    if (!src || !src.id) continue;

    // Must be a physical or ground observation kind
    const isPhysical =
      src.sourceKind === 'physical_observation' ||
      src.sourceKind === 'official_ground_station' ||
      src.sourceKind === 'community_optical' ||
      src.sourceKind === 'user_hardware';

    if (!isPhysical) continue;

    const eligibility = evaluateMeasurementEligibility(src, targetPollutant, now);
    if (!eligibility.eligible) {
      continue;
    }

    const key = getPhysicalStationDeduplicationKey(src);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    active.push(src);
  }

  return active;
}

/**
 * Pure selector: extracts stale physical ground monitors (>24h).
 * Strictly requires that the target pollutant measurement exists and its own timestamp is >24h old.
 * Does NOT classify untimed measurements as stale.
 */
export function getStalePhysicalSources(
  sources: EnvironmentalSourceRecord[] = [],
  targetPollutant: 'pm25' | 'pm10' = 'pm25',
  now: Date | number = Date.now()
): EnvironmentalSourceRecord[] {
  if (!Array.isArray(sources)) return [];

  const seenKeys = new Set<string>();
  const stale: EnvironmentalSourceRecord[] = [];

  for (const src of sources) {
    if (!src || !src.id) continue;

    const isPhysical =
      src.sourceKind === 'physical_observation' ||
      src.sourceKind === 'official_ground_station' ||
      src.sourceKind === 'community_optical' ||
      src.sourceKind === 'user_hardware';

    if (!isPhysical) continue;

    const eligibility = evaluateMeasurementEligibility(src, targetPollutant, now);
    if (!eligibility.eligible && eligibility.reason === 'stale') {
      const key = getPhysicalStationDeduplicationKey(src);
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        stale.push(src);
      }
    }
  }

  return stale;
}

/**
 * Pure selector: extracts registry-only stations (verified hardware, awaiting live telemetry).
 */
export function getRegistryOnlyStations(
  sources: EnvironmentalSourceRecord[] = []
): EnvironmentalSourceRecord[] {
  if (!Array.isArray(sources)) return [];
  return sources.filter((s) => s && s.status === 'registry_only');
}

/**
 * Pure selector: extracts numerical atmospheric models.
 */
export function getAtmosphericModels(
  sources: EnvironmentalSourceRecord[] = []
): EnvironmentalSourceRecord[] {
  if (!Array.isArray(sources)) return [];
  return sources.filter(
    (s) => s && (s.sourceKind === 'atmospheric_model' || s.sourceKind === 'satellite_reanalysis')
  );
}

/**
 * Pure selector: extracts unconfigured provider diagnostics.
 */
export function getUnconfiguredProviders(
  sources: EnvironmentalSourceRecord[] = []
): EnvironmentalSourceRecord[] {
  if (!Array.isArray(sources)) return [];
  return sources.filter((s) => s && s.status === 'not_configured');
}
