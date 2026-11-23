/**
 * Shared Environmental Data Eligibility Engine
 * Verifies that measurements, models, and metadata meet affirmative criteria
 * required to support specific downstream claims (advisories, rankings, forecasts, or legal status).
 */

import { TemporalProvenance } from './temporal-provenance';

export type MeasurementStatus =
  | 'usable'
  | 'stale'
  | 'untimed'
  | 'invalid'
  | 'unsupported_method'
  | 'unavailable';

export interface EnvironmentalEligibility {
  eligible: boolean;
  status: MeasurementStatus;
  measurementStatus: MeasurementStatus;
  reasons: string[];
  sourceKind: string | null;
  method: string | null;
  validAt: string | null;
  ageMinutes: number | null;
}

export interface EligibilityCheckParams {
  value?: number | null | undefined;
  pm25?: number | null | undefined;
  pm10?: number | null | undefined;
  aqi?: number | null | undefined;
  unit?: string | null;
  pollutant?: string;
  provenance?: TemporalProvenance | null;
  timestamp?: string | null;
  averagingPeriodMinutes?: number | null;
  standard?: string | null;
  targetClaim?: 'display_measurement' | 'health_advisory' | 'official_grap' | 'forecast_hour' | 'comparison';
}

const ACCEPTED_MASS_UNITS = new Set(['ug/m3', 'µg/m³', 'μg/m³', 'ug/m^3', 'mg/m³']);

/**
 * Validates whether an environmental data point is eligible to support a specified claim.
 */
export function checkEnvironmentalEligibility(
  params: EligibilityCheckParams,
  now: Date = new Date()
): EnvironmentalEligibility {
  const reasons: string[] = [];
  const targetClaim = params.targetClaim || 'display_measurement';
  const effectiveVal = params.value ?? params.pm25 ?? params.pm10 ?? params.aqi;

  const buildResult = (eligible: boolean, status: MeasurementStatus, reasonsList: string[], validAt: string | null = null, ageMinutes: number | null = null): EnvironmentalEligibility => ({
    eligible,
    status,
    measurementStatus: status,
    reasons: reasonsList,
    sourceKind: params.provenance?.sourceKind ?? null,
    method: params.standard ?? null,
    validAt,
    ageMinutes,
  });

  // 1. Value check: must be finite and non-negative
  if (effectiveVal === null || effectiveVal === undefined) {
    return buildResult(false, 'unavailable', ['Value is unavailable (null or undefined).']);
  }

  if (typeof effectiveVal !== 'number' || !Number.isFinite(effectiveVal)) {
    return buildResult(false, 'invalid', ['Value is non-numeric, NaN, or infinite.']);
  }

  if (effectiveVal < 0) {
    return buildResult(false, 'invalid', [`Negative value (${effectiveVal}) is physically invalid.`]);
  }

  // 2. Unit check for particulate pollutants
  if (params.pollutant && (params.pollutant.toLowerCase().includes('pm2') || params.pollutant.toLowerCase().includes('pm10'))) {
    if (params.unit) {
      const cleanUnit = params.unit.trim().toLowerCase();
      if (!ACCEPTED_MASS_UNITS.has(cleanUnit)) {
        return buildResult(false, 'unsupported_method', [`Unsupported unit "${params.unit}" for particulate matter. Must be µg/m³.`]);
      }
    }
  }

  // 3. Timing and Temporal Provenance
  const timeStr = params.provenance?.observedAt || params.provenance?.modelValidAt || params.timestamp;
  if (!timeStr) {
    return buildResult(false, 'untimed', ['Missing measurement timestamp or valid time.']);
  }

  const parsedTime = Date.parse(timeStr);
  if (isNaN(parsedTime)) {
    return buildResult(false, 'untimed', [`Unparseable timestamp: "${timeStr}".`]);
  }

  const ageMinutes = Math.round((now.getTime() - parsedTime) / (60 * 1000));

  // 4. Freshness rules per claim type
  if (targetClaim === 'health_advisory') {
    // Health advisories require observations less than 24h old
    if (ageMinutes > 24 * 60) {
      return buildResult(false, 'stale', [`Telemetry is stale (${Math.round(ageMinutes / 60)} hours old). Cannot issue current health advisory.`], new Date(parsedTime).toISOString(), ageMinutes);
    }
  }

  if (targetClaim === 'official_grap') {
    // INVARIANT: AQI telemetry alone is NEVER eligible to declare a statutory GRAP stage
    return buildResult(false, 'unsupported_method', ['Statutory CAQM GRAP legal stages cannot be declared based solely on ambient AQI measurements.'], new Date(parsedTime).toISOString(), ageMinutes);
  }

  if (targetClaim === 'comparison') {
    if (params.averagingPeriodMinutes == null) {
      return buildResult(false, 'unsupported_method', ['Missing averaging period. Multi-source comparison requires equal averaging intervals.'], new Date(parsedTime).toISOString(), ageMinutes);
    }
  }

  // All checks passed
  return buildResult(true, 'usable', [], new Date(parsedTime).toISOString(), ageMinutes);
}
