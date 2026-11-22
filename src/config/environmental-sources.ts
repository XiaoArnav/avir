/**
 * Shared Client-Safe Configuration for Environmental Sources (Step 3/24)
 * 
 * Single source of truth for OpenAQ v3 API bounds, comparison thresholds,
 * data freshness policies, and pure source selectors.
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
 */
export function validateObservationTiming(
  timestampStr: string | null | undefined,
  nowMs = Date.now()
): { isValid: boolean; isStale: boolean; error?: string } {
  if (!timestampStr) {
    return { isValid: false, isStale: true, error: 'Missing timestamp' };
  }

  const parsed = Date.parse(timestampStr);
  if (isNaN(parsed)) {
    return { isValid: false, isStale: true, error: 'Unparseable timestamp' };
  }

  const skewAllowanceMs = SKEW_ALLOWANCE_MINUTES * 60 * 1000;
  if (parsed > nowMs + skewAllowanceMs) {
    return { isValid: false, isStale: true, error: 'Suspicious future-dated physical observation timestamp' };
  }

  const ageMs = nowMs - parsed;
  const maxAgeMs = MAX_OBSERVATION_AGE_HOURS * 3600 * 1000;
  if (ageMs > maxAgeMs) {
    const ageHours = Math.round(ageMs / 3600000);
    return {
      isValid: true,
      isStale: true,
      error: `Observation is ${ageHours} hours old (exceeds 24h freshness policy)`,
    };
  }

  return { isValid: true, isStale: false };
}

/**
 * Pure selector: extracts an active, reporting physical ground observation monitor.
 * Strictly excludes:
 * - Stale readings (>24h)
 * - Rejected or unparseable readings
 * - Unreachable providers or network error records
 * - Unconfigured diagnostic placeholders
 * - Registry-only stations with no measurements
 * - Atmospheric models or derived standards
 * - Duplicate upstream sensor feeds
 */
export function getActivePhysicalSources(
  sources: EnvironmentalSourceRecord[] = [],
  targetPollutant: 'pm25' | 'pm10' = 'pm25'
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

    // Must NOT be in an unavailable, unconfigured, or error state
    if (
      src.status === 'not_configured' ||
      src.status === 'registry_only' ||
      src.status === 'unavailable' ||
      src.status === 'stale' ||
      src.status === 'rejected' ||
      src.status === 'unreachable' ||
      src.status === 'error'
    ) {
      continue;
    }

    // Must have a valid target pollutant measurement
    const measurement: SourceMeasurement | undefined = src.measurements?.find(
      (m) => m && m.pollutant === targetPollutant
    );

    if (
      !measurement ||
      measurement.value === null ||
      !Number.isFinite(measurement.value) ||
      measurement.value < 0 ||
      measurement.qualityFlag === 'rejected'
    ) {
      continue;
    }

    // Must have a valid, fresh observation timestamp
    const obsTime = measurement.observedAt || src.observedAt;
    const timing = validateObservationTiming(obsTime);
    if (!timing.isValid || timing.isStale) {
      continue;
    }

    // Deduplicate identical upstream stations
    const key = src.upstreamProviderId && src.stationId
      ? `${src.upstreamProviderId.toLowerCase().trim()}:${src.stationId.trim()}`
      : src.id;

    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    active.push(src);
  }

  return active;
}

/**
 * Pure selector: extracts stale physical ground monitors (>24h).
 */
export function getStalePhysicalSources(
  sources: EnvironmentalSourceRecord[] = [],
  targetPollutant: 'pm25' | 'pm10' = 'pm25'
): EnvironmentalSourceRecord[] {
  if (!Array.isArray(sources)) return [];

  return sources.filter((src) => {
    if (!src || !src.id) return false;
    const isPhysical =
      src.sourceKind === 'physical_observation' ||
      src.sourceKind === 'official_ground_station' ||
      src.sourceKind === 'community_optical' ||
      src.sourceKind === 'user_hardware';
    if (!isPhysical) return false;

    if (src.status === 'stale') return true;

    const m = src.measurements?.find((item) => item.pollutant === targetPollutant);
    const obsTime = m?.observedAt || src.observedAt;
    if (obsTime) {
      const timing = validateObservationTiming(obsTime);
      return timing.isStale;
    }

    return false;
  });
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
