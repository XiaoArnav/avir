/**
 * Environmental Source Comparison & Provenance Engine (Step 3/24)
 * 
 * Implements rigorous three-mode source evaluation:
 * - Mode A: Single Source (No artificial consensus or confidence)
 * - Mode B: Multiple Incompatible Sources (Explicit reasons, no false averaging)
 * - Mode C: Multiple Independent Comparable Sources (Scientific Δ µg/m³ difference)
 * 
 * Strict Invariants:
 * - Zero uncalibrated confidence percentages.
 * - Deduplication of identical upstream sensors.
 * - Spatial limit: <= 25km (boundary-layer correlation limit).
 * - Temporal limit: <= 120 minutes.
 * - Unit compatibility: verified ug/m3.
 * - Pollutant-specific timestamp provenance (never borrow timestamps from other pollutants).
 * - No unsupported causal claims.
 */

import {
  EnvironmentalSourceRecord,
  SourceComparison,
  SourceComparisonMode,
  SourceComparisonStatus,
  ComparedSourceItem,
  SourceMeasurement,
} from '@/domain/types';
import {
  MAX_COMPARISON_DISTANCE_KM,
  MAX_COMPARISON_TIME_DIFF_MINUTES,
  MAX_OBSERVATION_AGE_HOURS,
  SKEW_ALLOWANCE_MINUTES,
  getPhysicalStationDeduplicationKey,
} from '@/config/environmental-sources';

// Re-export constants for backwards compatibility
export {
  MAX_COMPARISON_DISTANCE_KM,
  MAX_COMPARISON_TIME_DIFF_MINUTES,
  MAX_OBSERVATION_AGE_HOURS,
};

/**
 * Extracts a target pollutant measurement from an EnvironmentalSourceRecord.
 */
export function extractPollutantMeasurement(
  source: EnvironmentalSourceRecord,
  targetPollutant: 'pm25' | 'pm10'
): SourceMeasurement | null {
  if (!source || !source.measurements) return null;

  if (Array.isArray(source.measurements)) {
    const match = source.measurements.find(
      (m) => m && m.pollutant === targetPollutant && m.value !== null && Number.isFinite(m.value) && m.value >= 0
    );
    return match || null;
  }

  // Record dictionary object
  const dict = source.measurements as Record<string, SourceMeasurement>;
  const item = dict[targetPollutant];
  if (item && item.value !== null && Number.isFinite(item.value) && item.value >= 0) {
    return item;
  }

  return null;
}

/**
 * Deduplicates environmental sources:
 * - Collapses identical upstream station IDs or duplicate records.
 * - Derived standards (e.g. CPCB NAQI or US EPA AQI derived from PM2.5) are NOT independent sources.
 */
export function deduplicateEnvironmentalSources(
  sources: EnvironmentalSourceRecord[]
): EnvironmentalSourceRecord[] {
  if (!sources || sources.length === 0) return [];

  const seenKeys = new Set<string>();
  const deduplicated: EnvironmentalSourceRecord[] = [];

  for (const src of sources) {
    if (!src || !src.id) continue;

    // Derived mathematical conversions are excluded from independent observation feeds
    if (src.sourceKind === 'derived_standard' || src.providerKind === 'derived_standard') {
      continue;
    }

    // Provider-scoped by default, merging only with verified lineage or cross-provider mapping
    const upstreamKey = src.sourceKind === 'atmospheric_model'
      ? src.id
      : getPhysicalStationDeduplicationKey(src);

    if (seenKeys.has(upstreamKey)) {
      continue;
    }

    seenKeys.add(upstreamKey);
    deduplicated.push(src);
  }

  return deduplicated;
}

/**
 * Normalizes Open-Meteo numerical atmospheric chemistry model into an EnvironmentalSourceRecord.
 * Strictly separates model valid time (validAt) from model initialization time (modelRunAt).
 * Never labels model forecast outputs as physical observations.
 */
export function createOpenMeteoModelRecord(params: {
  pm25: number | null;
  pm10?: number | null;
  timestamp: string; // forecast or current condition valid time
  latitude: number;
  longitude: number;
  cityName?: string;
  retrievedAt?: string;
  modelRunAt?: string | null;
}): EnvironmentalSourceRecord {
  const {
    pm25,
    pm10,
    timestamp,
    latitude,
    longitude,
    cityName,
    retrievedAt = new Date().toISOString(),
    modelRunAt = null,
  } = params;

  const measurements: SourceMeasurement[] = [];
  if (pm25 !== null && Number.isFinite(pm25) && pm25 >= 0) {
    measurements.push({
      pollutant: 'pm25',
      value: Math.round(pm25 * 10) / 10,
      unit: 'ug/m3',
      averagingPeriodMinutes: 60, // hourly simulation grid average
      observedAt: null, // Numerical model output is NOT an in-situ physical observation
      validAt: timestamp,
      qualityFlag: 'valid',
    });
  }

  if (pm10 !== null && pm10 !== undefined && Number.isFinite(pm10) && pm10 >= 0) {
    measurements.push({
      pollutant: 'pm10',
      value: Math.round(pm10 * 10) / 10,
      unit: 'ug/m3',
      averagingPeriodMinutes: 60,
      observedAt: null,
      validAt: timestamp,
      qualityFlag: 'valid',
    });
  }

  const isValid = measurements.length > 0;

  return {
    id: 'open-meteo-atmospheric-model',
    providerId: 'open-meteo',
    providerName: 'Open-Meteo / ECMWF IFS & CAMS',
    upstreamProviderId: 'ecmwf_cams',
    datasetId: 'cams_global_atmospheric_chemistry',
    sourceName: 'Open-Meteo Atmospheric Chemistry (ECMWF IFS & CAMS)',
    name: 'Open-Meteo Atmospheric Chemistry',
    provider: 'Open-Meteo (ECMWF IFS / CAMS)',
    sourceKind: 'atmospheric_model',
    providerKind: 'atmospheric_model',
    status: isValid ? 'fresh' : 'unavailable',
    latitude,
    longitude,
    distanceKm: 0,
    coordinates: { latitude, longitude, distanceKm: 0 },
    observedAt: null, // Model output has no physical observation timestamp
    measuredAt: null,
    validAt: timestamp, // Forecast / model valid time
    modelRunAt: modelRunAt ?? null, // Model run/initialization timestamp is null unless authentic init time is known
    retrievedAt,
    ingestedAt: retrievedAt,
    measurements,
    attribution: 'Open-Meteo Air Quality (ECMWF CAMS) & Weather (NOAA GFS)',
    explanation: 'Regional numerical atmospheric dispersion and aerosol chemistry grid model (~11km resolution).',
    provenance: {
      network: 'ECMWF IFS / Copernicus Atmosphere Monitoring Service',
      licenseOrAttribution: 'Open-Meteo (CC BY 4.0) / ECMWF',
      url: 'https://open-meteo.com/',
      isModel: true,
      limitations: [
        'Numerical atmospheric chemistry simulation averaged across grid cell (~11km)',
        'Does not capture localized street-level combustion spikes or microclimatic trapping',
      ],
    },
  };
}

/**
 * Resolves observation timestamp or forecast valid time for comparison eligibility checks.
 * Rejects future-dated observations (>10 min clock skew) and unparseable date strings.
 * Enforces pollutant-specific timestamps: physical observations must use the measurement's own timestamp.
 */
export function getSourceTimestamp(
  source: EnvironmentalSourceRecord,
  measurement?: SourceMeasurement | null
): { timeStr: string | null; timestamp: number | null; error?: string } {
  const isModel = source.sourceKind === 'atmospheric_model';
  // Pollutant-specific timestamp: physical observation timing MUST come from the specific measurement
  const timeStr = isModel
    ? (measurement?.validAt || source.validAt || null)
    : (measurement?.observedAt || null);

  if (!timeStr) {
    return { timeStr: null, timestamp: null, error: 'Missing measurement timestamp or valid time' };
  }

  const parsed = Date.parse(timeStr);
  if (isNaN(parsed)) {
    return { timeStr, timestamp: null, error: 'Unparseable or invalid timestamp' };
  }

  const now = Date.now();
  // Check future clock skew allowance (10 min) for physical observations
  if (!isModel && parsed > now + SKEW_ALLOWANCE_MINUTES * 60 * 1000) {
    return { timeStr, timestamp: parsed, error: 'Future-dated physical observation timestamp rejected' };
  }

  return { timeStr, timestamp: parsed };
}

/**
 * Compares environmental sources for a target pollutant (default PM2.5).
 * Implements Mode A (Single source), Mode B (Multiple incompatible), and Mode C (Comparable).
 * Enforces strict scientific parity: matching units, equal averaging periods, spatial (<=25km) and temporal (<=120m) parity.
 */
export function compareEnvironmentalSources(
  rawSources: EnvironmentalSourceRecord[],
  targetPollutant: 'pm25' | 'pm10' = 'pm25'
): SourceComparison {
  const sources = deduplicateEnvironmentalSources(rawSources);
  const now = Date.now();

  // Find all sources that report the target pollutant with valid non-negative values
  const candidates: Array<{
    source: EnvironmentalSourceRecord;
    measurement: SourceMeasurement;
  }> = [];

  const excludedSourceIds: string[] = [];
  const reasons: string[] = [];

  for (const src of sources) {
    if (
      src.status === 'not_configured' ||
      src.status === 'registry_only' ||
      src.status === 'unavailable' ||
      src.status === 'stale' ||
      src.status === 'rejected' ||
      src.status === 'unreachable' ||
      src.status === 'error'
    ) {
      excludedSourceIds.push(src.id);
      if (src.status === 'stale') {
        reasons.push(
          `${src.sourceName || src.name}: observation is stale (>24h old) and excluded from current comparison.`
        );
      }
      continue;
    }

    const measurement = extractPollutantMeasurement(src, targetPollutant);
    if (!measurement) {
      excludedSourceIds.push(src.id);
      reasons.push(
        `${src.sourceName || src.name}: does not report valid ${targetPollutant.toUpperCase()} measurement.`
      );
      continue;
    }

    candidates.push({ source: src, measurement });
  }

  // Helper to map candidates into ComparedSourceItem
  const mapToComparedItem = (c: {
    source: EnvironmentalSourceRecord;
    measurement: SourceMeasurement;
  }): ComparedSourceItem => ({
    sourceId: c.source.id,
    provider: c.source.providerName || c.source.provider || 'Environmental Provider',
    name: c.source.sourceName || c.source.name || 'Source',
    value: c.measurement.value!,
    unit: c.measurement.unit,
    measuredAt: c.measurement.observedAt || null,
    validAt: c.measurement.validAt || c.source.validAt || null,
    distanceKm: c.source.distanceKm ?? null,
    averagingPeriodMinutes: c.measurement.averagingPeriodMinutes ?? null,
    kind: c.source.sourceKind,
    isModel: c.source.sourceKind === 'atmospheric_model',
  });

  // MODE A: Exactly 0 or 1 source available
  if (candidates.length <= 1) {
    const single = candidates[0];
    const compared: ComparedSourceItem[] = single ? [mapToComparedItem(single)] : [];

    return {
      targetPollutant,
      mode: 'mode_a_single_source',
      status: 'insufficient_sources',
      sourcesCompared: compared,
      eligibleSourceIds: single ? [single.source.id] : [],
      excludedSourceIds,
      reasons:
        candidates.length === 0
          ? ['No active environmental sources reporting valid measurements.']
          : ['Independent multi-source comparison unavailable. Exactly 1 primary environmental dataset is currently available.'],
      incompatibilityReasons: [],
      absoluteDifferenceUgM3: null,
      absoluteDifference: null,
      relativeDifferencePercent: null,
      minConcentration: single?.measurement.value ?? null,
      maxConcentration: single?.measurement.value ?? null,
      summary: single
        ? `1 primary environmental dataset available (${single.source.sourceName || single.source.name}: ${single.measurement.value} µg/m³). Independent comparison unavailable.`
        : 'Environmental telemetry currently unavailable.',
      comparedAt: new Date().toISOString(),
    };
  }

  // Evaluate compatibility between candidate sources
  const incompatibilityReasons: string[] = [];
  const eligibleCandidates: Array<{
    source: EnvironmentalSourceRecord;
    measurement: SourceMeasurement;
  }> = [];

  // Anchor to the primary model or closest ground station
  const anchor = candidates[0];
  const anchorTiming = getSourceTimestamp(anchor.source, anchor.measurement);

  let anchorValid = true;
  if (anchorTiming.error || anchorTiming.timestamp === null) {
    anchorValid = false;
    incompatibilityReasons.push(
      `${anchor.source.sourceName || anchor.source.name}: ${anchorTiming.error || 'Missing measurement timestamp'}.`
    );
  }

  // Anchor unit check
  const anchorUnit = anchor.measurement.unit.toLowerCase().trim();
  if (anchorUnit !== 'ug/m3' && anchorUnit !== 'µg/m³') {
    anchorValid = false;
    incompatibilityReasons.push(
      `Unsupported anchor unit: ${anchor.source.sourceName || anchor.source.name} reports in ${anchor.measurement.unit}. Only µg/m³ particulate concentrations are comparable.`
    );
  }

  if (anchor.measurement.averagingPeriodMinutes == null) {
    anchorValid = false;
    incompatibilityReasons.push(
      `Missing averaging period: ${anchor.source.sourceName || anchor.source.name} does not specify an averaging interval.`
    );
  }

  if (anchor.source.distanceKm == null || !Number.isFinite(anchor.source.distanceKm)) {
    anchorValid = false;
    incompatibilityReasons.push(
      `Unknown station location: ${anchor.source.sourceName || anchor.source.name} coordinates or distance are unavailable.`
    );
  } else if (anchor.source.distanceKm > MAX_COMPARISON_DISTANCE_KM) {
    anchorValid = false;
    incompatibilityReasons.push(
      `Station distance exceeds comparison limit: ${anchor.source.sourceName || anchor.source.name} is ${anchor.source.distanceKm}km away (limit: ${MAX_COMPARISON_DISTANCE_KM}km).`
    );
  }

  if (anchorValid) {
    eligibleCandidates.push(anchor);
  } else {
    excludedSourceIds.push(anchor.source.id);
  }

  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i];
    let isCompatible = true;

    // 1. Unit compatibility
    const currUnit = c.measurement.unit.toLowerCase().trim();
    if (anchorUnit !== currUnit || (currUnit !== 'ug/m3' && currUnit !== 'µg/m³')) {
      isCompatible = false;
      incompatibilityReasons.push(
        `Incompatible units: ${anchor.source.sourceName || anchor.source.name} reports in ${anchor.measurement.unit}, while ${c.source.sourceName || c.source.name} reports in ${c.measurement.unit}.`
      );
    }

    // 2. Averaging period compatibility
    const anchorAvg = anchor.measurement.averagingPeriodMinutes;
    const currAvg = c.measurement.averagingPeriodMinutes;
    if (anchorAvg == null || currAvg == null) {
      isCompatible = false;
      incompatibilityReasons.push(
        `Missing averaging period: ${anchorAvg == null ? (anchor.source.sourceName || anchor.source.name) : (c.source.sourceName || c.source.name)} does not specify an averaging interval.`
      );
    } else if (anchorAvg !== currAvg) {
      isCompatible = false;
      incompatibilityReasons.push(
        `Incompatible averaging periods: ${anchor.source.sourceName || anchor.source.name} (${anchorAvg}m) vs ${c.source.sourceName || c.source.name} (${currAvg}m).`
      );
    }

    // 3. Geographic proximity limit
    if (c.source.distanceKm == null || !Number.isFinite(c.source.distanceKm)) {
      isCompatible = false;
      incompatibilityReasons.push(
        `Unknown station location: ${c.source.sourceName || c.source.name} coordinates or distance are unavailable.`
      );
    } else if (c.source.distanceKm > MAX_COMPARISON_DISTANCE_KM) {
      isCompatible = false;
      incompatibilityReasons.push(
        `Station distance exceeds comparison limit: ${c.source.sourceName || c.source.name} is ${c.source.distanceKm}km away (limit: ${MAX_COMPARISON_DISTANCE_KM}km).`
      );
    }

    // 4. Temporal freshness & delta (<= 120 minutes)
    const cTiming = getSourceTimestamp(c.source, c.measurement);
    if (cTiming.error || cTiming.timestamp === null) {
      isCompatible = false;
      incompatibilityReasons.push(
        `${c.source.sourceName || c.source.name}: ${cTiming.error || 'Missing measurement timestamp'}.`
      );
    } else if (anchorTiming.timestamp !== null) {
      const timeDiffMinutes = Math.abs(anchorTiming.timestamp - cTiming.timestamp) / (60 * 1000);
      if (timeDiffMinutes > MAX_COMPARISON_TIME_DIFF_MINUTES) {
        isCompatible = false;
        incompatibilityReasons.push(
          `Observation time divergence: ${Math.round(timeDiffMinutes)} minutes difference exceeds the ${MAX_COMPARISON_TIME_DIFF_MINUTES}-minute threshold.`
        );
      }

      const ageHours = (now - cTiming.timestamp) / (3600 * 1000);
      if (ageHours > MAX_OBSERVATION_AGE_HOURS) {
        isCompatible = false;
        incompatibilityReasons.push(
          `${c.source.sourceName || c.source.name} observation is ${Math.round(ageHours)} hours old (> 24h stale threshold).`
        );
      }
    }

    if (isCompatible && anchorValid) {
      eligibleCandidates.push(c);
    } else {
      excludedSourceIds.push(c.source.id);
    }
  }

  // MODE B: Multiple sources available, but incompatible
  if (eligibleCandidates.length < 2) {
    const compared: ComparedSourceItem[] = candidates.map(mapToComparedItem);

    return {
      targetPollutant,
      mode: 'mode_b_incompatible',
      status: 'incompatible',
      sourcesCompared: compared,
      eligibleSourceIds: eligibleCandidates.map((c) => c.source.id),
      excludedSourceIds: Array.from(new Set(excludedSourceIds)),
      reasons: incompatibilityReasons,
      incompatibilityReasons,
      absoluteDifferenceUgM3: null,
      absoluteDifference: null,
      relativeDifferencePercent: null,
      minConcentration: Math.min(...candidates.map((c) => c.measurement.value!)),
      maxConcentration: Math.max(...candidates.map((c) => c.measurement.value!)),
      summary: `Measurements cannot be compared directly: ${incompatibilityReasons.join(' ')} Sources are displayed independently with their limitations.`,
      comparedAt: new Date().toISOString(),
    };
  }

  // MODE C: Multiple independent comparable sources
  const values = eligibleCandidates.map((c) => c.measurement.value!);
  const minConcentration = Math.round(Math.min(...values) * 10) / 10;
  const maxConcentration = Math.round(Math.max(...values) * 10) / 10;
  const absoluteDifferenceUgM3 = Math.round((maxConcentration - minConcentration) * 10) / 10;

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const relativeDifferencePercent = mean > 0 ? Math.round((absoluteDifferenceUgM3 / mean) * 100) : 0;

  const compared: ComparedSourceItem[] = eligibleCandidates.map(mapToComparedItem);

  let divergenceReason: string | null = null;
  if (relativeDifferencePercent >= 35) {
    divergenceReason = `Significant divergence (${relativeDifferencePercent}%): reported concentrations differ substantially. Possible reasons include differing geographic sampling locations, instrument sensing principles (e.g. optical vs reference gravimetric), integration averaging periods, or localized atmospheric dispersion variability.`;
  } else if (relativeDifferencePercent >= 15) {
    divergenceReason = `Moderate divergence (${relativeDifferencePercent}%): reported concentrations reflect minor local dispersion variances or microclimatic differences across sensor positions.`;
  }

  const count = eligibleCandidates.length;
  const pollutantLabel = targetPollutant === 'pm25' ? 'PM2.5' : 'PM10';
  let summary = '';
  if (count === 2) {
    const s1 = eligibleCandidates[0];
    const s2 = eligibleCandidates[1];
    summary = `Two comparable ${pollutantLabel} sources are available. Their reported concentrations differ by ${absoluteDifferenceUgM3} µg/m³ (${s1.source.sourceName || s1.source.name}: ${s1.measurement.value} µg/m³, ${s2.source.sourceName || s2.source.name}: ${s2.measurement.value} µg/m³).`;
  } else {
    summary = `${count} comparable ${pollutantLabel} sources are available. Reported concentrations range from ${minConcentration} to ${maxConcentration} µg/m³ (spread: Δ ${absoluteDifferenceUgM3} µg/m³).`;
  }

  return {
    targetPollutant,
    mode: 'mode_c_comparable',
    status: 'comparable',
    sourcesCompared: compared,
    eligibleSourceIds: eligibleCandidates.map((c) => c.source.id),
    excludedSourceIds: Array.from(new Set(excludedSourceIds)),
    reasons: [],
    incompatibilityReasons: [],
    absoluteDifferenceUgM3,
    absoluteDifference: absoluteDifferenceUgM3,
    relativeDifferencePercent,
    minConcentration,
    maxConcentration,
    summary,
    divergenceReason,
    comparedAt: new Date().toISOString(),
  };
}
