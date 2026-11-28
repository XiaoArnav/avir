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
import {
  CPCB_SELECTION_RADIUS_KM,
  OPENAQ_SELECTION_RADIUS_KM,
  SPECIFIC_STATION_MAX_RADIUS_KM,
  evaluateMeasurementEligibility,
} from '@/config/environmental-sources';
import { ResolvedSourceData, SourcePreference } from './source-control-types';
import {
  hasValidPm25,
  isSourceEligibleForPm25,
  verifySourceDistance,
  withVerifiedDistance,
} from './source-eligibility';
import {
  SourceAlternativeOption,
  buildResolvedFromMetrics,
  buildResolvedSourceData,
  createModeUnavailableResolvedData,
  createUnavailableResolvedData,
} from './source-resolution-results';

function isOfficialNonOpenAqStation(src: EnvironmentalSourceRecord): boolean {
  return (src.sourceKind === 'official_ground_station' || src.providerId === 'cpcb') && src.providerId !== 'openaq';
}

function isOpenAqGroundStation(src: EnvironmentalSourceRecord): boolean {
  return (
    src.providerId === 'openaq' &&
    src.sourceKind !== 'atmospheric_model' &&
    src.status !== 'not_configured' &&
    src.status !== 'unreachable' &&
    src.status !== 'rejected' &&
    src.status !== 'error'
  );
}

function hasStaleCandidate(sources: EnvironmentalSourceRecord[], nowMs: number): boolean {
  return sources.some((s) => {
    if (s.status === 'stale') return true;
    const elig = evaluateMeasurementEligibility(s, 'pm25', nowMs);
    return !elig.eligible && elig.reason === 'stale';
  });
}

interface VerifiedCandidate {
  source: EnvironmentalSourceRecord;
  distanceKm: number;
}

function getEligibleSortedCandidates(
  sources: EnvironmentalSourceRecord[],
  predicate: (s: EnvironmentalSourceRecord) => boolean,
  metrics: AtmosphericMetrics,
  maxRadiusKm: number
): VerifiedCandidate[] {
  const candidates: VerifiedCandidate[] = [];
  for (const s of sources) {
    if (!predicate(s)) continue;
    const dist = verifySourceDistance(s, metrics, maxRadiusKm);
    if (!dist.isWithinRange || dist.distanceKm === null) continue;
    candidates.push({
      source: withVerifiedDistance(s, dist.distanceKm),
      distanceKm: dist.distanceKm,
    });
  }
  return candidates.sort((a, b) => a.distanceKm - b.distanceKm);
}

/**
 * Mode A: Automatic Selection Policy
 * Deterministic ranking:
 * 1. Fresh official reference ground stations (CPCB) <= 35km
 * 2. Verified physical ground monitors (OpenAQ) <= 25km
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
  // 1. Look for fresh official CPCB/regulatory reference station within 35 km
  const officialStations = getEligibleSortedCandidates(
    sources,
    (s) => s.sourceKind === 'official_ground_station' && s.providerId !== 'openaq' && hasValidPm25(s, nowMs),
    metrics,
    CPCB_SELECTION_RADIUS_KM
  );

  if (officialStations.length > 0) {
    const selected = officialStations[0].source;
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

  // 2. Look for verified OpenAQ physical ground station within 25 km
  const openAqStations = getEligibleSortedCandidates(
    sources,
    (s) => isOpenAqGroundStation(s) && hasValidPm25(s, nowMs),
    metrics,
    OPENAQ_SELECTION_RADIUS_KM
  );

  if (openAqStations.length > 0) {
    const selected = openAqStations[0].source;
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
  const officialInRange = getEligibleSortedCandidates(
    sources,
    isOfficialNonOpenAqStation,
    metrics,
    CPCB_SELECTION_RADIUS_KM
  );

  const reportingEntry = officialInRange.find((entry) => hasValidPm25(entry.source, nowMs));

  if (reportingEntry) {
    const reportingStation = reportingEntry.source;
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
  const inRangeSources = officialInRange.map((entry) => entry.source);
  const isStale = hasStaleCandidate(inRangeSources, nowMs);
  const isRegistryOnly = inRangeSources.length > 0;

  let selectionReason = `No official regulatory stations are located within observation range (${CPCB_SELECTION_RADIUS_KM} km) of this city.`;
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
  const isNotConfigured = sources.some((s) => s.providerId === 'openaq' && s.status === 'not_configured');
  const allOpenAqCandidates = sources.filter(isOpenAqGroundStation);
  const openAqInRange = getEligibleSortedCandidates(
    allOpenAqCandidates,
    () => true,
    metrics,
    OPENAQ_SELECTION_RADIUS_KM
  );

  const reportingEntry = openAqInRange.find((entry) => hasValidPm25(entry.source, nowMs));

  if (reportingEntry) {
    const reportingSource = reportingEntry.source;
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

  const inRangeSources = openAqInRange.map((entry) => entry.source);
  const isStale = hasStaleCandidate(inRangeSources, nowMs);
  let selectionReason = `No OpenAQ monitoring stations are currently reporting measurements within ${OPENAQ_SELECTION_RADIUS_KM} km range.`;
  if (isNotConfigured && allOpenAqCandidates.length === 0) {
    selectionReason = 'OPENAQ_API_KEY is not configured on the server; OpenAQ ground monitoring is currently disabled.';
  } else if (isStale) {
    selectionReason = 'OpenAQ ground monitor observations are stale (>24h old) and cannot be presented as current.';
  } else if (allOpenAqCandidates.length > 0 && openAqInRange.length === 0) {
    selectionReason = `OpenAQ ground monitors are outside the documented ${OPENAQ_SELECTION_RADIUS_KM} km selection radius or have unverified location coordinates.`;
  }

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
    const distanceCheck = verifySourceDistance(targetStation, metrics);
    const verifiedDistanceKm = distanceCheck.distanceKm;
    const stationWithVerifiedDistance = withVerifiedDistance(targetStation, verifiedDistanceKm);

    // Spatial relevance check: if station is > 100km away, user switched cities
    if (verifiedDistanceKm !== null && verifiedDistanceKm > SPECIFIC_STATION_MAX_RADIUS_KM) {
      if (preference.allowFallbackToModel && modelSource && hasValidPm25(modelSource, nowMs)) {
        return buildResolvedSourceData({
          preference,
          resolvedSource: modelSource,
          resolutionStatus: 'fallback',
          selectionReason: `Selected station "${preference.stationName || preference.stationId}" is ${verifiedDistanceKm} km away. Fell back to CAMS Atmospheric Model.`,
          isFallback: true,
          fallbackReason: `Station ${preference.stationName || preference.stationId} is out of observation range (>${SPECIFIC_STATION_MAX_RADIUS_KM} km).`,
          aqiStandard,
          retrievedAt,
          alternatives,
        });
      }

      return createModeUnavailableResolvedData({
        preference,
        selectionReason: `Selected station "${preference.stationName || preference.stationId}" is ${verifiedDistanceKm} km away. Please select a station local to the active city.`,
        retrievedAt,
        stationId: preference.stationId,
        stationName: preference.stationName || targetStation.sourceName || targetStation.name || 'External Station',
        providerId: targetStation.providerId,
        providerName: targetStation.providerName,
        sourceKind: targetStation.sourceKind,
        distanceKm: verifiedDistanceKm,
        attribution: targetStation.attribution,
        limitations: ['Station is outside local atmospheric boundary layer.'],
        aqiStandard,
        aqiCalculationNotes: 'Station is geographically non-representative for this location.',
        alternatives,
      });
    }

    // Check station eligibility
    const eligibility = isSourceEligibleForPm25(stationWithVerifiedDistance, nowMs);
    if (eligibility.isEligible) {
      const hasUnverifiedDistance =
        stationWithVerifiedDistance.sourceKind !== 'user_hardware' && verifiedDistanceKm === null;
      const stationForResult = hasUnverifiedDistance
        ? {
            ...stationWithVerifiedDistance,
            distanceKm: null,
            provenance: {
              ...stationWithVerifiedDistance.provenance,
              limitations: [
                ...(stationWithVerifiedDistance.provenance?.limitations || []),
                'Station distance could not be verified from active location coordinates.',
              ],
            },
          }
        : stationWithVerifiedDistance;

      return buildResolvedSourceData({
        preference,
        resolvedSource: stationForResult,
        resolutionStatus: 'resolved',
        selectionReason: hasUnverifiedDistance
          ? `Using user-selected station "${stationForResult.sourceName || stationForResult.name}" (station distance is unverified).`
          : `Using user-selected station "${stationForResult.sourceName || stationForResult.name}".`,
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
      resolvedSource: stationWithVerifiedDistance,
      selectionReason: `Selected station "${targetStation.sourceName || targetStation.name}" is currently unavailable: ${eligibility.reason || 'No valid PM2.5 observation'}.`,
      observedAt: targetStation.observedAt ?? null,
      retrievedAt,
      stationId: targetStation.id,
      stationName: targetStation.sourceName || targetStation.name || 'Selected Station',
      providerId: targetStation.providerId,
      providerName: targetStation.providerName,
      sourceKind: targetStation.sourceKind,
      distanceKm: verifiedDistanceKm,
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
