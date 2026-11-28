import { GeneralizedSensitivity } from '@/domain/planning-types';
import { DailySchedule } from '@/domain/routine-types';
import { AtmosphericMetrics, DataProvenance, UserVulnerabilityProfile } from '@/domain/types';
import { inspectPromptInjection } from '@/lib/security/sanitizer';
import { EnvironmentalDecisionContext } from '@/services/ai/decision-context';

export interface RawCoordinatesInput {
  lat?: unknown;
  lng?: unknown;
  latitude?: unknown;
  longitude?: unknown;
}

export interface RawSourceInput {
  provider?: unknown;
  isModel?: unknown;
  stationName?: unknown;
  distanceKm?: unknown;
  observationTime?: unknown;
  freshnessHours?: unknown;
}

export interface RawMetricsInput extends Omit<Partial<AtmosphericMetrics>, 'location' | 'cpcbCategory'> {
  location?: {
    latitude?: unknown;
    longitude?: unknown;
  };
  cpcbCategory?: unknown;
}

export interface RawAiPlanBody {
  city?: unknown;
  country?: unknown;
  timezone?: unknown;
  aqiStandard?: unknown;
  coordinates?: RawCoordinatesInput;
  schedule?: DailySchedule;
  hourlyForecast?: Array<Record<string, unknown>>;
  decisionContext?: EnvironmentalDecisionContext;
  metrics?: RawMetricsInput;
  profile?: Partial<UserVulnerabilityProfile>;
  roomSizeSqFt?: unknown;
  customRoutine?: unknown;
  currentAmbientSource?: unknown;
  currentAmbientProvenance?: unknown;
  currentAmbientPm25?: unknown;
  currentAmbientUsAqi?: unknown;
  currentAmbientCpcbAqi?: unknown;
  selectedSourceUnavailable?: unknown;
  generalizedSensitivity?: unknown;
  commuteMode?: EnvironmentalDecisionContext['userContext']['commuteMode'];
  indoorAirPurification?: EnvironmentalDecisionContext['userContext']['indoorAirPurification'];
  source?: RawSourceInput;
}

export const VALID_PROVENANCES: readonly DataProvenance[] = [
  'observed',
  'modeled_forecast',
  'derived_calculation',
  'estimated_outcome',
  'unavailable',
];

/**
 * Validates that a client-supplied provenance string belongs to Avir's canonical classifications.
 */
export function isValidProvenance(value: unknown): value is DataProvenance {
  return typeof value === 'string' && (VALID_PROVENANCES as readonly string[]).includes(value);
}

/**
 * Validates a bounded IANA timezone identifier using Intl runtime lookup.
 */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.trim().length === 0 || tz.length > 100) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitizes a user- or client-supplied label against prompt-injection signatures.
 */
export function sanitizeTextLabel(value: string, fallback: string): string {
  const inspection = inspectPromptInjection(value);
  return inspection.isThreatDetected ? fallback : value.trim();
}

/**
 * Resolves a validated GeneralizedSensitivity literal when explicitly provided.
 */
export function parseGeneralizedSensitivity(value: unknown): GeneralizedSensitivity | undefined {
  return value === 'standard' || value === 'sensitive' || value === 'highly_sensitive'
    ? value
    : undefined;
}

/**
 * Extracts finite, in-bounds WGS84 coordinates across supported request fields without fabrication.
 */
export function extractVerifiedCoordinates(rawBody: RawAiPlanBody): {
  latitude: number | null;
  longitude: number | null;
} {
  const candidates = [
    { lat: rawBody.coordinates?.lat, lng: rawBody.coordinates?.lng },
    { lat: rawBody.coordinates?.latitude, lng: rawBody.coordinates?.longitude },
    { lat: rawBody.metrics?.latitude, lng: rawBody.metrics?.longitude },
    { lat: rawBody.metrics?.location?.latitude, lng: rawBody.metrics?.location?.longitude },
  ];

  for (const c of candidates) {
    if (
      typeof c.lat === 'number' &&
      Number.isFinite(c.lat) &&
      c.lat >= -90 &&
      c.lat <= 90 &&
      typeof c.lng === 'number' &&
      Number.isFinite(c.lng) &&
      c.lng >= -180 &&
      c.lng <= 180
    ) {
      return { latitude: c.lat, longitude: c.lng };
    }
  }

  return { latitude: null, longitude: null };
}
