/**
 * Source Control Mode Resolution Policies (Modes A–E)
 *
 * Implements deterministic selection policies for automatic, official ground,
 * OpenAQ network, ECMWF CAMS model, and specific-station user preferences.
 */

import {
  AtmosphericMetrics,
  EnvironmentalSourceRecord,
} from '@/domain/types';
import { AqiStandard } from '@/services/geo/geographic-observation-adapter';
import { evaluateMeasurementEligibility } from '@/config/environmental-sources';
import { ResolvedSourceData, SourcePreference } from './source-control-types';
import { hasValidPm25, isSourceEligibleForPm25 } from './source-eligibility';
import {
  SourceAlternativeOption,
  buildResolvedFromMetrics,
  buildResolvedSourceData,
  createModeUnavailableResolvedData,
  createUnavailableResolvedData,
} from './source-resolution-results';

function hasStaleCandidate(sources: EnvironmentalSourceRecord[], nowMs: number): boolean {
  return sources.some((s) => {
    if (s.status === 'stale') return true;
    const elig = evaluateMeasurementEligibility(s, 'pm25', nowMs);
    return !elig.eligible && elig.reason === 'stale';
  });
}

/**
 * Mode A: Automatic Selection Policy
 * Deterministic ranking:
 * 1. Fresh official reference ground stations (CPCB) <= 35km
 * 2. Verified physical ground monitors (OpenAQ) <= 35km
 * 3. Verified numerical atmospheric chemistry model (Open-Meteo CAMS)
 */
export function resolveAutomaticMode(
  preference: SourcePreference,
  sources: EnvironmentalSourceRecord[],
  modelSource: EnvironmentalSourceRecord | null,
  aqiStandard: AqiStandard,
  retrievedAt: string,
  alternatives: SourceAlternativeOption[],
  metrics: AtmosphericMetrics,
  nowMs: number
): ResolvedSourceData {
  // 1. Look for fresh official reference station within 35km
  const officialStations = sources
    .filter(
      (s) =>
        s.sourceKind === 'official_ground_station' &&
        (s.distanceKm === null || s.distanceKm <= 35) &&
        hasValidPm25(s, nowMs)
    )
    .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));

  if (officialStations.length > 0) {
    const selected = officialStations[0];
    const distStr = selected.distanceKm !== null ? ` (${selected.distanceKm} km away)` : '';
    return buildResolvedSourceData({
      preference,
      resolvedSource: selected,
      resolutionStatus: 'resolved',
      selectionReason: `Fresh official reference station "${selected.sourceName || selected.name}" selected${distStr}.`,
      isFallback: false,
      aqiStandard,
      retrievedAt,
      alternatives,
    });
  }

  // 2. Look for verified OpenAQ physical ground station within 35km
  const openAqStations = sources
    .filter(
      (s) =>
        s.providerId === 'openaq' &&
        s.sourceKind !== 'atmospheric_model' &&
        (s.distanceKm === null || s.distanceKm <= 35) &&
        hasValidPm25(s, nowMs)
    )
    .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));

  if (openAqStations.length > 0) {
    const selected = openAqStations[0];
    const distStr = selected.distanceKm !== null ? ` (${selected.distanceKm} km away)` : '';
    return buildResolvedSourceData({
      preference,
      resolvedSource: selected,
      resolutionStatus: 'resolved',
      selectionReason: `Verified ground monitor "${selected.sourceName || selected.name}" selected via OpenAQ${distStr}.`,
      isFallback: false,
      aqiStandard,
      retrievedAt,
      alternatives,
    });
  }

  // 3. Fall back to verified atmospheric chemistry model (Open-Meteo CAMS)
  if (modelSource && hasValidPm25(modelSource, nowMs)) {
    return buildResolvedSourceData({
      preference,
      resolvedSource: modelSource,
      resolutionStatus: 'resolved',
      selectionReason: 'CAMS Atmospheric Model selected because no fresh ground stations are reporting within 35 km.',
      isFallback: false,
      aqiStandard,
      retrievedAt,
      alternatives,
    });
  }

  // 4. Default model values directly from metrics if available
  if (metrics.pm25 !== null && Number.isFinite(metrics.pm25) && metrics.pm25 >= 0 && metrics.status !== 'error') {
    return buildResolvedFromMetrics(
      preference,
      metrics,
      aqiStandard,
      retrievedAt,
      'Atmospheric model selected from primary telemetry stream.',
      alternatives
    );
  }

  return createUnavailableResolvedData(
    preference,
    'No eligible environmental data sources are currently available for this location.',
    retrievedAt,
    aqiStandard
  );
}

/**
 * Mode B: Official Ground Stations (CPCB)
 */
export function resolveOfficialGroundMode(
  preference: SourcePreference,
  sources: EnvironmentalSourceRecord[],
  modelSource: EnvironmentalSourceRecord | null,
  aqiStandard: AqiStandard,
  retrievedAt: string,
  alternatives: SourceAlternativeOption[],
  metrics: AtmosphericMetrics,
  nowMs: number
): ResolvedSourceData {
  const officialStations = sources
    .filter((s) => s.sourceKind === 'official_ground_station' || s.providerId === 'cpcb')
    .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));

  const reportingStation = officialStations.find((s) => hasValidPm25(s, nowMs));

  if (reportingStation) {
    return buildResolvedSourceData({
      preference,
      resolvedSource: reportingStation,
      resolutionStatus: 'resolved',
      selectionReason: `Using official regulatory monitor "${reportingStation.sourceName || reportingStation.name}".`,
      isFallback: false,
      aqiStandard,
      retrievedAt,
      alternatives,
    });
  }

  // If user explicitly allowed fallback to model
  if (preference.allowFallbackToModel && modelSource && hasValidPm25(modelSource, nowMs)) {
    return buildResolvedSourceData({
      preference,
      resolvedSource: modelSource,
      resolutionStatus: 'fallback',
      selectionReason: 'Fell back to CAMS Atmospheric Model because no official CPCB stations are currently reporting nearby.',
      isFallback: true,
      fallbackReason: 'Official regulatory stations have no continuous feed at this location.',
      aqiStandard,
      retrievedAt,
      alternatives,
    });
  }

  // Honest unavailable state: no silent fallback
  const isStale = hasStaleCandidate(officialStations, nowMs);
  const isRegistryOnly = officialStations.length > 0;

  let selectionReason = 'No official regulatory stations are located within observation range of this city.';
  if (isStale) {
    selectionReason = 'Official CPCB station observations are stale (>24h old) and cannot be presented as current.';
  } else if (isRegistryOnly) {
    selectionReason = 'Official CPCB stations are registered in this city but are awaiting continuous live telemetry.';
  }

  return createModeUnavailableResolvedData({
    preference,
    selectionReason,
    retrievedAt,
    stationName: 'Official Ground Station',
    providerId: 'cpcb',
    providerName: 'CPCB / State Pollution Control Board',
    sourceKind: 'official_ground_station',
    attribution: 'Central Pollution Control Board (data.gov.in)',
    limitations: ['Official regulatory feed currently unavailable or offline.'],
    aqiStandard,
    aqiCalculationNotes: 'Official measurements unavailable.',
    alternatives,
  });
}

/**
 * Mode C: OpenAQ Ground Network
 */
export function resolveOpenAqMode(
  preference: SourcePreference,
  sources: EnvironmentalSourceRecord[],
  modelSource: EnvironmentalSourceRecord | null,
  aqiStandard: AqiStandard,
  retrievedAt: string,
  alternatives: SourceAlternativeOption[],
  metrics: AtmosphericMetrics,
  nowMs: number
): ResolvedSourceData {
  const openAqSources = sources
    .filter((s) => s.providerId === 'openaq' && s.sourceKind !== 'atmospheric_model')
    .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));

  const reportingSource = openAqSources.find((s) => hasValidPm25(s, nowMs));

  if (reportingSource) {
    const network = reportingSource.provenance?.network || 'OpenAQ Ground Network';
    return buildResolvedSourceData({
      preference,
      resolvedSource: reportingSource,
      resolutionStatus: 'resolved',
      selectionReason: `Using OpenAQ monitoring station "${reportingSource.sourceName || reportingSource.name}" (${network}).`,
      isFallback: false,
      aqiStandard,
      retrievedAt,
      alternatives,
    });
  }

  if (preference.allowFallbackToModel && modelSource && hasValidPm25(modelSource, nowMs)) {
    return buildResolvedSourceData({
      preference,
      resolvedSource: modelSource,
      resolutionStatus: 'fallback',
      selectionReason: 'Fell back to CAMS Atmospheric Model because no OpenAQ monitors are reporting nearby.',
      isFallback: true,
      fallbackReason: 'OpenAQ ground network has no live observations within range.',
      aqiStandard,
      retrievedAt,
      alternatives,
    });
  }

  const isStale = hasStaleCandidate(openAqSources, nowMs);
  const selectionReason = isStale
    ? 'OpenAQ ground monitor observations are stale (>24h old) and cannot be presented as current.'
    : 'No OpenAQ monitoring stations are currently reporting measurements within range.';

  return createModeUnavailableResolvedData({
    preference,
    selectionReason,
    retrievedAt,
    stationName: 'OpenAQ Station',
    providerId: 'openaq',
    providerName: 'OpenAQ v3 Network',
    sourceKind: 'physical_observation',
    attribution: 'OpenAQ Community & Reference Network',
    limitations: ['OpenAQ ground measurements unavailable within current geographic bounds.'],
    aqiStandard,
    aqiCalculationNotes: 'OpenAQ data unavailable.',
    alternatives,
  });
}

/**
 * Mode D: Atmospheric Chemistry Model (CAMS)
 */
export function resolveAtmosphericModelMode(
  preference: SourcePreference,
  modelSource: EnvironmentalSourceRecord | null,
  aqiStandard: AqiStandard,
  retrievedAt: string,
  alternatives: SourceAlternativeOption[],
  metrics: AtmosphericMetrics,
  nowMs: number
): ResolvedSourceData {
  if (modelSource && hasValidPm25(modelSource, nowMs)) {
    return buildResolvedSourceData({
      preference,
      resolvedSource: modelSource,
      resolutionStatus: 'resolved',
      selectionReason: 'Using ECMWF CAMS Atmospheric Chemistry numerical model.',
      isFallback: false,
      aqiStandard,
      retrievedAt,
      alternatives,
    });
  }

  if (metrics.pm25 !== null && Number.isFinite(metrics.pm25) && metrics.pm25 >= 0 && metrics.status !== 'error') {
    return buildResolvedFromMetrics(
      preference,
      metrics,
      aqiStandard,
      retrievedAt,
      'Using ECMWF CAMS Atmospheric Chemistry model from telemetry.',
      alternatives
    );
  }

  return createUnavailableResolvedData(
    preference,
    'Atmospheric model telemetry is currently unavailable.',
    retrievedAt,
    aqiStandard
  );
}

/**
 * Mode E: Explicit Specific Station Selection
 */
export function resolveSpecificStationMode(
  preference: SourcePreference,
  sources: EnvironmentalSourceRecord[],
  modelSource: EnvironmentalSourceRecord | null,
  aqiStandard: AqiStandard,
  retrievedAt: string,
  alternatives: SourceAlternativeOption[],
  metrics: AtmosphericMetrics,
  nowMs: number
): ResolvedSourceData {
  if (!preference.stationId) {
    return resolveAutomaticMode(preference, sources, modelSource, aqiStandard, retrievedAt, alternatives, metrics, nowMs);
  }

  const targetStation = sources.find(
    (s) => s.id === preference.stationId || s.stationId === preference.stationId
  );

  // Check if station exists in current city telemetry
  if (targetStation) {
    // Spatial relevance check: if station is > 100km away, user switched cities
    if (targetStation.distanceKm !== null && targetStation.distanceKm > 100) {
      if (preference.allowFallbackToModel && modelSource && hasValidPm25(modelSource, nowMs)) {
        return buildResolvedSourceData({
          preference,
          resolvedSource: modelSource,
          resolutionStatus: 'fallback',
          selectionReason: `Selected station "${preference.stationName || preference.stationId}" is ${targetStation.distanceKm} km away. Fell back to CAMS Atmospheric Model.`,
          isFallback: true,
          fallbackReason: `Station ${preference.stationName || preference.stationId} is out of observation range (>100 km).`,
          aqiStandard,
          retrievedAt,
          alternatives,
        });
      }

      return createModeUnavailableResolvedData({
        preference,
        selectionReason: `Selected station "${preference.stationName || preference.stationId}" is ${targetStation.distanceKm} km away. Please select a station local to the active city.`,
        retrievedAt,
        stationId: preference.stationId,
        stationName: preference.stationName || targetStation.sourceName || targetStation.name || 'External Station',
        providerId: targetStation.providerId,
        providerName: targetStation.providerName,
        sourceKind: targetStation.sourceKind,
        distanceKm: targetStation.distanceKm,
        attribution: targetStation.attribution,
        limitations: ['Station is outside local atmospheric boundary layer.'],
        aqiStandard,
        aqiCalculationNotes: 'Station is geographically non-representative for this location.',
        alternatives,
      });
    }

    // Check station eligibility
    const eligibility = isSourceEligibleForPm25(targetStation, nowMs);
    if (eligibility.isEligible) {
      return buildResolvedSourceData({
        preference,
        resolvedSource: targetStation,
        resolutionStatus: 'resolved',
        selectionReason: `Using user-selected station "${targetStation.sourceName || targetStation.name}".`,
        isFallback: false,
        aqiStandard,
        retrievedAt,
        alternatives,
      });
    }

    // Station exists but reading is not eligible (stale, offline, unparseable)
    if (preference.allowFallbackToModel && modelSource && hasValidPm25(modelSource, nowMs)) {
      return buildResolvedSourceData({
        preference,
        resolvedSource: modelSource,
        resolutionStatus: 'fallback',
        selectionReason: `Selected station "${targetStation.sourceName || targetStation.name}" has no fresh measurement (${eligibility.reason}); fell back to CAMS Atmospheric Model.`,
        isFallback: true,
        fallbackReason: eligibility.reason || 'Selected station reading is not eligible.',
        aqiStandard,
        retrievedAt,
        alternatives,
      });
    }

    return createModeUnavailableResolvedData({
      preference,
      resolvedSource: targetStation,
      selectionReason: `Selected station "${targetStation.sourceName || targetStation.name}" is currently unavailable: ${eligibility.reason || 'No valid PM2.5 observation'}.`,
      observedAt: targetStation.observedAt ?? null,
      retrievedAt,
      stationId: targetStation.id,
      stationName: targetStation.sourceName || targetStation.name || 'Selected Station',
      providerId: targetStation.providerId,
      providerName: targetStation.providerName,
      sourceKind: targetStation.sourceKind,
      distanceKm: targetStation.distanceKm ?? null,
      attribution: targetStation.attribution,
      limitations: ['Live observation feed is currently offline or unpopulated.'],
      aqiStandard,
      aqiCalculationNotes: eligibility.reason || 'Selected station has no valid PM2.5 observation.',
      alternatives,
    });
  }

  // Station ID not found in current city sources (e.g. User switched cities)
  if (preference.allowFallbackToModel && modelSource && hasValidPm25(modelSource, nowMs)) {
    return buildResolvedSourceData({
      preference,
      resolvedSource: modelSource,
      resolutionStatus: 'fallback',
      selectionReason: `Selected station is not available for this city; fell back to CAMS Atmospheric Model.`,
      isFallback: true,
      fallbackReason: `Station ${preference.stationName || preference.stationId} is not in range of the current location.`,
      aqiStandard,
      retrievedAt,
      alternatives,
    });
  }

  return createModeUnavailableResolvedData({
    preference,
    selectionReason: `Selected station "${preference.stationName || preference.stationId}" is not available for this city.`,
    retrievedAt,
    stationId: preference.stationId,
    stationName: preference.stationName || preference.stationId,
    providerId: 'unknown',
    providerName: 'Custom Ground Station',
    sourceKind: 'physical_observation',
    attribution: 'Ground Monitoring Network',
    limitations: ['Station not present in current city coverage.'],
    aqiStandard,
    aqiCalculationNotes: 'Station not found.',
    alternatives,
  });
}
