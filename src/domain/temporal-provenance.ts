/**
 * Canonical Environmental Temporal Provenance
 * Enforces strict scientific provenance, model-valid vs observation times,
 * and unambiguous UTC representation with IANA city timezone awareness.
 */

export type EnvironmentalSourceKind =
  | 'physical_observation'
  | 'atmospheric_model'
  | 'derived_calculation'
  | 'personal_sensor'
  | 'unavailable';

export type TemporalFreshness =
  | 'current'         // Observation or model valid within permitted freshness threshold (< 24h)
  | 'stale'           // Observation or model exceeds freshness threshold (>= 24h old)
  | 'future_forecast' // Valid time is in the future relative to observation/retrieval
  | 'unknown';        // Missing or unparseable timestamps

export interface TemporalProvenance {
  /**
   * ISO 8601 UTC timestamp of genuine physical observation.
   * Null if data is derived from a numerical model without ground instrumentation.
   */
  observedAt: string | null;

  /**
   * ISO 8601 UTC timestamp represented by a numerical model (e.g. forecast valid hour).
   * Null if record is purely a physical ground measurement.
   */
  modelValidAt: string | null;

  /**
   * ISO 8601 UTC timestamp of model initialization/run time (e.g. ECMWF 00Z or 12Z cycle).
   * Null if not provided by the upstream provider.
   */
  modelRunAt: string | null;

  /**
   * ISO 8601 UTC timestamp when the response was retrieved by Avir.
   * INVARIANT: Retrieval time NEVER substitutes for missing observedAt or modelValidAt.
   */
  retrievedAt: string;

  /**
   * Canonical IANA timezone identifier for the target location (e.g. 'Asia/Kolkata', 'Europe/London').
   */
  timezone: string | null;

  /**
   * Provenance classification of the environmental data.
   */
  sourceKind: EnvironmentalSourceKind;

  /**
   * Evaluated scientific freshness state.
   */
  freshness: TemporalFreshness;

  /**
   * Age of observation or model valid time in minutes relative to evaluation instant.
   */
  ageMinutes: number | null;
}

/**
 * Freshness evaluation policy thresholds.
 */
export interface FreshnessPolicy {
  maxObservationAgeMinutes?: number; // Default: 24 * 60 = 1440 minutes (24h)
  maxModelAgeMinutes?: number;       // Default: 12 * 60 = 720 minutes (12h)
  maxFutureLeadMinutes?: number;     // Default: 2 * 60 = 120 minutes (for current validity)
  allowedClockSkewMinutes?: number;  // Default: 10 minutes
}

const DEFAULT_POLICY: Required<FreshnessPolicy> = {
  maxObservationAgeMinutes: 1440,
  maxModelAgeMinutes: 720,
  maxFutureLeadMinutes: 120,
  allowedClockSkewMinutes: 10,
};

/**
 * Creates and validates a canonical TemporalProvenance record.
 */
export function createTemporalProvenance(
  params: {
    observedAt?: string | null;
    modelValidAt?: string | null;
    modelRunAt?: string | null;
    retrievedAt?: string;
    timezone?: string | null;
    sourceKind: EnvironmentalSourceKind;
  },
  now: Date = new Date(),
  policy: FreshnessPolicy = {}
): TemporalProvenance {
  const mergedPolicy = { ...DEFAULT_POLICY, ...policy };
  const nowMs = now.getTime();
  const retrievedAt = params.retrievedAt || new Date(nowMs).toISOString();

  // Parse timestamps
  const observedMs = params.observedAt ? Date.parse(params.observedAt) : null;
  const modelValidMs = params.modelValidAt ? Date.parse(params.modelValidAt) : null;
  const modelRunMs = params.modelRunAt ? Date.parse(params.modelRunAt) : null;

  // Effective anchor time: physical observation takes precedence, then model valid time
  const effectiveMs = (observedMs !== null && !isNaN(observedMs))
    ? observedMs
    : (modelValidMs !== null && !isNaN(modelValidMs))
    ? modelValidMs
    : null;

  let freshness: TemporalFreshness = 'unknown';
  let ageMinutes: number | null = null;

  if (effectiveMs !== null) {
    const diffMs = nowMs - effectiveMs;
    ageMinutes = Math.round(diffMs / (60 * 1000));

    if (effectiveMs > nowMs + mergedPolicy.allowedClockSkewMinutes * 60 * 1000) {
      // Future dated beyond clock skew
      freshness = 'future_forecast';
    } else if (params.sourceKind === 'physical_observation') {
      freshness = ageMinutes <= mergedPolicy.maxObservationAgeMinutes ? 'current' : 'stale';
    } else if (params.sourceKind === 'atmospheric_model') {
      freshness = ageMinutes <= mergedPolicy.maxModelAgeMinutes ? 'current' : 'stale';
    } else {
      freshness = ageMinutes <= mergedPolicy.maxObservationAgeMinutes ? 'current' : 'stale';
    }
  }

  return {
    observedAt: observedMs !== null && !isNaN(observedMs) ? new Date(observedMs).toISOString() : null,
    modelValidAt: modelValidMs !== null && !isNaN(modelValidMs) ? new Date(modelValidMs).toISOString() : null,
    modelRunAt: modelRunMs !== null && !isNaN(modelRunMs) ? new Date(modelRunMs).toISOString() : null,
    retrievedAt: new Date(retrievedAt).toISOString(),
    timezone: params.timezone ?? null,
    sourceKind: params.sourceKind,
    freshness,
    ageMinutes,
  };
}

/**
 * Assesses whether a timestamp is current, stale, future_forecast, or unknown.
 */
export function assessProvenanceFreshness(
  timestamp: string | null | undefined,
  maxAgeMinutes: number = 60,
  now: Date = new Date()
): TemporalFreshness {
  if (!timestamp) return 'unknown';
  const t = Date.parse(timestamp);
  if (isNaN(t)) return 'unknown';
  const diffMinutes = Math.round((now.getTime() - t) / (60 * 1000));
  if (diffMinutes < -10) return 'future_forecast';
  return diffMinutes <= maxAgeMinutes ? 'current' : 'stale';
}
