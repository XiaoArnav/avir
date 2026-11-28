/**
 * Source Resolution Engine
 *
 * Evaluates user source preferences against active environmental telemetry,
 * enforcing zero-fabrication, deterministic selection, transparent provenance,
 * scientific eligibility, and no silent fallback.
 */

import {
  AtmosphericMetrics,
  EnvironmentalSourceRecord,
} from '@/domain/types';
import { AqiStandard } from '@/services/geo/geographic-observation-adapter';
import {
  SourcePreference,
  ResolvedSourceData,
} from './source-control-types';
import {
  resolveAtmosphericModelMode,
  resolveAutomaticMode,
  resolveOfficialGroundMode,
  resolveOpenAqMode,
  resolveSpecificStationMode,
} from './source-resolution-modes';
import {
  SourceAlternativeOption,
  createUnavailableResolvedData,
} from './source-resolution-results';

export { isSourceEligibleForPm25, hasValidPm25 } from './source-eligibility';

/**
 * Resolves the active environmental source according to user preference and available telemetry.
 */
export function resolveSource(
  preference: SourcePreference,
  metrics: AtmosphericMetrics | null,
  aqiStandard: AqiStandard = 'cpcb',
  evaluationTimeMs?: number
): ResolvedSourceData {
  const currentRetrievedAt = new Date().toISOString();
  const nowMs = evaluationTimeMs ?? Date.now();

  // 1. Handle completely null or error telemetry
  if (!metrics) {
    return createUnavailableResolvedData(
      preference,
      'Environmental telemetry is currently unavailable for this location.',
      currentRetrievedAt,
      aqiStandard
    );
  }

  const sources: EnvironmentalSourceRecord[] = metrics.environmentalSources || [];
  const modelSource = sources.find((s) => s.sourceKind === 'atmospheric_model') || null;

  // Build alternative options
  const alternatives: SourceAlternativeOption[] = [];
  if (modelSource) {
    alternatives.push({
      mode: 'atmospheric_model',
      label: 'Open-Meteo CAMS Model',
      sourceId: modelSource.id,
    });
  }

  // 2. Mode Dispatch
  switch (preference.mode) {
    case 'official_ground':
      return resolveOfficialGroundMode(preference, sources, modelSource, aqiStandard, currentRetrievedAt, alternatives, metrics, nowMs);

    case 'openaq':
      return resolveOpenAqMode(preference, sources, modelSource, aqiStandard, currentRetrievedAt, alternatives, metrics, nowMs);

    case 'atmospheric_model':
      return resolveAtmosphericModelMode(preference, modelSource, aqiStandard, currentRetrievedAt, alternatives, metrics, nowMs);

    case 'specific_station':
      return resolveSpecificStationMode(preference, sources, modelSource, aqiStandard, currentRetrievedAt, alternatives, metrics, nowMs);

    case 'automatic':
    default:
      return resolveAutomaticMode(preference, sources, modelSource, aqiStandard, currentRetrievedAt, alternatives, metrics, nowMs);
  }
}
