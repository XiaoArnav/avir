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
 * - Spatial limit: <= 35km.
 * - Temporal limit: <= 120 minutes.
 * - Unit compatibility: verified ug/m3.
 */

import {
  EnvironmentalSourceRecord,
  SourceComparison,
  SourceComparisonMode,
  SourceComparisonStatus,
  ComparedSourceItem,
  SourceMeasurement,
} from '@/domain/types';

export const MAX_COMPARISON_DISTANCE_KM = 35;
export const MAX_COMPARISON_TIME_DIFF_MINUTES = 120;
export const MAX_OBSERVATION_AGE_HOURS = 24;

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

    // Unique upstream identity key
    const upstreamKey = src.upstreamProviderId && src.stationId
      ? `${src.upstreamProviderId.toLowerCase().trim()}:${src.stationId.trim()}`
      : src.id;

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
 */
export function createOpenMeteoModelRecord(params: {
  pm25: number | null;
  pm10?: number | null;
  timestamp: string;
  latitude: number;
  longitude: number;
  cityName?: string;
  retrievedAt?: string;
}): EnvironmentalSourceRecord {
  const { pm25, pm10, timestamp, latitude, longitude, cityName, retrievedAt = new Date().toISOString() } = params;

  const measurements: SourceMeasurement[] = [];
  if (pm25 !== null && Number.isFinite(pm25) && pm25 >= 0) {
    measurements.push({
      pollutant: 'pm25',
      value: Math.round(pm25 * 10) / 10,
      unit: 'ug/m3',
      averagingPeriodMinutes: 60,
      observedAt: timestamp,
      qualityFlag: 'valid',
    });
  }

  if (pm10 !== null && pm10 !== undefined && Number.isFinite(pm10) && pm10 >= 0) {
    measurements.push({
      pollutant: 'pm10',
      value: Math.round(pm10 * 10) / 10,
      unit: 'ug/m3',
      averagingPeriodMinutes: 60,
      observedAt: timestamp,
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
    observedAt: timestamp,
    measuredAt: timestamp,
    retrievedAt,
    ingestedAt: retrievedAt,
    modelRunAt: timestamp,
    measurements,
    attribution: 'Open-Meteo (CC BY 4.0) / ECMWF / Copernicus Atmosphere Monitoring Service',
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
 * Compares environmental sources for a target pollutant (default PM2.5).
 * Implements Mode A (Single source), Mode B (Multiple incompatible), and Mode C (Comparable).
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
    if (src.status === 'not_configured' || src.status === 'registry_only' || src.status === 'unavailable' || src.status === 'stale') {
      excludedSourceIds.push(src.id);
      if (src.status === 'stale') {
        reasons.push(`${src.sourceName || src.name}: observation is stale (>24h old) and excluded from current comparison.`);
      }
      continue;
    }

    const measurement = extractPollutantMeasurement(src, targetPollutant);
    if (!measurement) {
      excludedSourceIds.push(src.id);
      reasons.push(`${src.sourceName || src.name}: does not report valid ${targetPollutant.toUpperCase()} measurement.`);
      continue;
    }

    candidates.push({ source: src, measurement });
  }

  // MODE A: Exactly 1 source available
  if (candidates.length <= 1) {
    const single = candidates[0];
    const compared: ComparedSourceItem[] = single
      ? [
          {
            sourceId: single.source.id,
            provider: single.source.providerName || single.source.provider || 'Environmental Provider',
            name: single.source.sourceName || single.source.name || 'Primary Source',
            value: single.measurement.value!,
            unit: single.measurement.unit,
            measuredAt: single.measurement.observedAt || single.source.observedAt || new Date().toISOString(),
            distanceKm: single.source.distanceKm,
            averagingPeriodMinutes: single.measurement.averagingPeriodMinutes,
            kind: single.source.sourceKind,
          },
        ]
      : [];

    return {
      targetPollutant,
      mode: 'mode_a_single_source',
      status: 'insufficient_sources',
      sourcesCompared: compared,
      eligibleSourceIds: single ? [single.source.id] : [],
      excludedSourceIds,
      reasons: candidates.length === 0
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
  const anchorTime = anchor.measurement.observedAt || anchor.source.observedAt;
  const anchorTimestamp = anchorTime ? Date.parse(anchorTime) : NaN;

  eligibleCandidates.push(anchor);

  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i];
    let isCompatible = true;

    // 1. Unit compatibility
    const anchorUnit = anchor.measurement.unit.toLowerCase().trim();
    const currUnit = c.measurement.unit.toLowerCase().trim();
    if (anchorUnit !== currUnit) {
      isCompatible = false;
      incompatibilityReasons.push(
        `Incompatible units: ${anchor.source.sourceName} reports in ${anchor.measurement.unit}, while ${c.source.sourceName} reports in ${c.measurement.unit}.`
      );
    }

    // 2. Averaging period compatibility
    const anchorAvg = anchor.measurement.averagingPeriodMinutes ?? 60;
    const currAvg = c.measurement.averagingPeriodMinutes ?? 60;
    if (Math.abs(anchorAvg - currAvg) > 60 && (anchorAvg >= 1440 || currAvg >= 1440)) {
      isCompatible = false;
      incompatibilityReasons.push(
        `Incompatible averaging periods: ${anchor.source.sourceName} (${anchorAvg}m) vs ${c.source.sourceName} (${currAvg}m).`
      );
    }

    // 3. Geographic proximity limit (<= 35km)
    const dist = c.source.distanceKm ?? 0;
    if (dist > MAX_COMPARISON_DISTANCE_KM) {
      isCompatible = false;
      incompatibilityReasons.push(
        `Station distance exceeds comparison limit: ${c.source.sourceName} is ${dist}km away (limit: ${MAX_COMPARISON_DISTANCE_KM}km).`
      );
    }

    // 4. Temporal freshness & delta (<= 120 minutes)
    const cTime = c.measurement.observedAt || c.source.observedAt;
    const cTimestamp = cTime ? Date.parse(cTime) : NaN;

    if (!isNaN(anchorTimestamp) && !isNaN(cTimestamp)) {
      const timeDiffMinutes = Math.abs(anchorTimestamp - cTimestamp) / (60 * 1000);
      if (timeDiffMinutes > MAX_COMPARISON_TIME_DIFF_MINUTES) {
        isCompatible = false;
        incompatibilityReasons.push(
          `Observation time divergence: ${Math.round(timeDiffMinutes)} minutes difference exceeds the ${MAX_COMPARISON_TIME_DIFF_MINUTES}-minute threshold.`
        );
      }

      const ageHours = (now - cTimestamp) / (3600 * 1000);
      if (ageHours > MAX_OBSERVATION_AGE_HOURS) {
        isCompatible = false;
        incompatibilityReasons.push(
          `${c.source.sourceName} observation is ${Math.round(ageHours)} hours old (> 24h stale threshold).`
        );
      }
    }

    if (isCompatible) {
      eligibleCandidates.push(c);
    } else {
      excludedSourceIds.push(c.source.id);
    }
  }

  // MODE B: Multiple sources available, but incompatible
  if (eligibleCandidates.length < 2) {
    const compared: ComparedSourceItem[] = candidates.map((c) => ({
      sourceId: c.source.id,
      provider: c.source.providerName || c.source.provider || 'Environmental Provider',
      name: c.source.sourceName || c.source.name || 'Source',
      value: c.measurement.value!,
      unit: c.measurement.unit,
      measuredAt: c.measurement.observedAt || c.source.observedAt || new Date().toISOString(),
      distanceKm: c.source.distanceKm,
      averagingPeriodMinutes: c.measurement.averagingPeriodMinutes,
      kind: c.source.sourceKind,
    }));

    return {
      targetPollutant,
      mode: 'mode_b_incompatible',
      status: 'incompatible',
      sourcesCompared: compared,
      eligibleSourceIds: eligibleCandidates.map((c) => c.source.id),
      excludedSourceIds,
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

  const compared: ComparedSourceItem[] = eligibleCandidates.map((c) => ({
    sourceId: c.source.id,
    provider: c.source.providerName || c.source.provider || 'Environmental Provider',
    name: c.source.sourceName || c.source.name || 'Source',
    value: c.measurement.value!,
    unit: c.measurement.unit,
    measuredAt: c.measurement.observedAt || c.source.observedAt || new Date().toISOString(),
    distanceKm: c.source.distanceKm,
    averagingPeriodMinutes: c.measurement.averagingPeriodMinutes,
    kind: c.source.sourceKind,
  }));

  let divergenceReason: string | null = null;
  if (relativeDifferencePercent >= 35) {
    divergenceReason = `Significant divergence (${relativeDifferencePercent}%): ground monitor concentration differs substantially from regional model grid. Near-surface emissions or microclimatic boundary-layer trapping may contribute.`;
  } else if (relativeDifferencePercent >= 15) {
    divergenceReason = `Moderate divergence (${relativeDifferencePercent}%): ground sensor and atmospheric model reflect minor local dispersion variances.`;
  }

  const s1 = eligibleCandidates[0];
  const s2 = eligibleCandidates[1];
  const summary = `Two comparable PM2.5 sources are available. Their reported concentrations differ by ${absoluteDifferenceUgM3} µg/m³ (${s1.source.sourceName || s1.source.name}: ${s1.measurement.value} µg/m³, ${s2.source.sourceName || s2.source.name}: ${s2.measurement.value} µg/m³).`;

  return {
    targetPollutant,
    mode: 'mode_c_comparable',
    status: 'comparable',
    sourcesCompared: compared,
    eligibleSourceIds: eligibleCandidates.map((c) => c.source.id),
    excludedSourceIds,
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
