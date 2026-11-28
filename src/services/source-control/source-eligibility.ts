/**
 * Environmental Source PM2.5 Eligibility Service
 *
 * Evaluates whether an EnvironmentalSourceRecord holds an eligible,
 * scientifically valid PM2.5 reading without duplicating canonical physical thresholds.
 */

import { AtmosphericMetrics, EnvironmentalSourceRecord } from '@/domain/types';
import {
  evaluateMeasurementEligibility,
  MAX_OBSERVATION_AGE_HOURS,
} from '@/config/environmental-sources';
import { calculateDistanceKm } from '@/services/ground-station-service';

export interface VerifiedDistanceResult {
  isWithinRange: boolean;
  distanceKm: number | null;
  isVerified: boolean;
  reason?:
    | 'valid'
    | 'missing_coordinates'
    | 'invalid_coordinates'
    | 'unknown_distance'
    | 'invalid_distance'
    | 'out_of_range';
}

function hasFiniteCoordinate(val: unknown, min: number, max: number): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val >= min && val <= max;
}

/**
 * Verifies a physical station's geographic distance against active location coordinates.
 * Always treats Haversine distance from valid active + station coordinates as authoritative,
 * and rejects unverified proximity when either coordinate pair is unavailable or invalid.
 */
export function verifySourceDistance(
  src: EnvironmentalSourceRecord,
  metrics: Pick<AtmosphericMetrics, 'latitude' | 'longitude' | 'location'> | null | undefined,
  maxRadiusKm?: number
): VerifiedDistanceResult {
  const rawLat = src.latitude ?? src.coordinates?.latitude;
  const rawLon = src.longitude ?? src.coordinates?.longitude;

  const hasLatField = rawLat !== null && rawLat !== undefined;
  const hasLonField = rawLon !== null && rawLon !== undefined;

  if (hasLatField !== hasLonField) {
    return { isWithinRange: false, distanceKm: null, isVerified: false, reason: 'invalid_coordinates' };
  }

  if (!hasLatField || !hasLonField) {
    return { isWithinRange: false, distanceKm: null, isVerified: false, reason: 'missing_coordinates' };
  }

  if (!hasFiniteCoordinate(rawLat, -90, 90) || !hasFiniteCoordinate(rawLon, -180, 180)) {
    return { isWithinRange: false, distanceKm: null, isVerified: false, reason: 'invalid_coordinates' };
  }

  const activeLat = metrics?.latitude ?? metrics?.location?.latitude;
  const activeLon = metrics?.longitude ?? metrics?.location?.longitude;
  const hasValidActiveCoords =
    hasFiniteCoordinate(activeLat, -90, 90) && hasFiniteCoordinate(activeLon, -180, 180);

  if (!hasValidActiveCoords) {
    return { isWithinRange: false, distanceKm: null, isVerified: false, reason: 'unknown_distance' };
  }

  const verifiedDistanceKm = calculateDistanceKm(activeLat, activeLon, rawLat, rawLon);

  if (maxRadiusKm !== undefined && verifiedDistanceKm > maxRadiusKm) {
    return {
      isWithinRange: false,
      distanceKm: verifiedDistanceKm,
      isVerified: true,
      reason: 'out_of_range',
    };
  }

  return {
    isWithinRange: true,
    distanceKm: verifiedDistanceKm,
    isVerified: true,
    reason: 'valid',
  };
}

/**
 * Returns a shallow copy with verified distanceKm attached when resolved distance differs from stored.
 */
export function withVerifiedDistance(
  src: EnvironmentalSourceRecord,
  distanceKm: number | null
): EnvironmentalSourceRecord {
  if (src.distanceKm === distanceKm && (!src.coordinates || src.coordinates.distanceKm === distanceKm)) {
    return src;
  }
  return {
    ...src,
    distanceKm,
    coordinates: src.coordinates
      ? { ...src.coordinates, distanceKm }
      : src.coordinates,
  };
}

/**
 * Evaluates whether an EnvironmentalSourceRecord has an eligible, scientifically valid PM2.5 measurement.
 * Reuses Avir's canonical evaluateMeasurementEligibility for physical observations and validates
 * atmospheric chemistry models against valid-time windows.
 */
export function isSourceEligibleForPm25(
  src: EnvironmentalSourceRecord | null | undefined,
  now: number | Date = Date.now()
): { isEligible: boolean; reason?: string } {
  if (!src || !src.id) {
    return { isEligible: false, reason: 'Source record is null or missing an identifier' };
  }

  // Source status check
  if (
    src.status === 'unavailable' ||
    src.status === 'stale' ||
    src.status === 'rejected' ||
    src.status === 'unreachable' ||
    src.status === 'error' ||
    src.status === 'not_configured' ||
    src.status === 'registry_only'
  ) {
    return { isEligible: false, reason: `Source status is ${src.status}` };
  }

  const isModel = src.sourceKind === 'atmospheric_model' || src.providerKind === 'atmospheric_model';

  if (!isModel) {
    const res = evaluateMeasurementEligibility(src, 'pm25', now);
    if (!res.eligible) {
      return { isEligible: false, reason: res.message };
    }
    return { isEligible: true };
  }

  // Model-specific eligibility
  const pm25 = src.measurements?.find((m) => m && m.pollutant === 'pm25');
  if (!pm25) {
    return { isEligible: false, reason: 'No PM2.5 measurement in atmospheric model record' };
  }

  if (
    pm25.value === null ||
    pm25.value === undefined ||
    !Number.isFinite(pm25.value) ||
    pm25.value < 0 ||
    pm25.qualityFlag === 'rejected'
  ) {
    return { isEligible: false, reason: 'Invalid or negative PM2.5 value in model' };
  }

  const unit = (pm25.unit || '').toLowerCase().trim();
  if (unit !== 'ug/m3' && unit !== 'µg/m³' && unit !== 'ug/m^3' && unit !== 'micrograms/m3') {
    return { isEligible: false, reason: `Unsupported unit "${pm25.unit}". Only µg/m³ is valid.` };
  }

  const validTimeStr = pm25.validAt || src.validAt;
  if (!validTimeStr) {
    return { isEligible: false, reason: 'Missing model valid time' };
  }

  const parsedValidTime = Date.parse(validTimeStr);
  if (isNaN(parsedValidTime)) {
    return { isEligible: false, reason: 'Unparseable model valid time' };
  }

  const nowMs = typeof now === 'number' ? now : now.getTime();
  const ageMs = nowMs - parsedValidTime;
  if (ageMs > MAX_OBSERVATION_AGE_HOURS * 3600 * 1000) {
    return { isEligible: false, reason: `Model forecast valid time is older than ${MAX_OBSERVATION_AGE_HOURS}h` };
  }

  return { isEligible: true };
}

/**
 * Pure boolean helper checking if an EnvironmentalSourceRecord has a valid, fresh PM2.5 reading.
 */
export function hasValidPm25(
  src: EnvironmentalSourceRecord | null | undefined,
  now: number | Date = Date.now()
): boolean {
  return isSourceEligibleForPm25(src, now).isEligible;
}
