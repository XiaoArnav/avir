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
import {
  AqiStandard,
  getCpcbCategory,
  getEpaCategory,
} from '@/services/geo/geographic-observation-adapter';
import {
  SourcePreference,
  ResolvedSourceData,
  SourceSelectionMode,
} from './source-control-types';
import { calculateComprehensiveCpcbNaqi } from '@/domain/cpcb-naqi';
import { calculateAQIFromPM25 } from '@/domain/air-math';
import {
  evaluateMeasurementEligibility,
  MAX_OBSERVATION_AGE_HOURS,
} from '@/config/environmental-sources';

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
  const alternatives: Array<{ mode: SourceSelectionMode; label: string; sourceId: string }> = [];
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

/**
 * Mode A: Automatic Selection Policy
 * Deterministic ranking:
 * 1. Fresh official reference ground stations (CPCB) <= 35km
 * 2. Verified physical ground monitors (OpenAQ) <= 35km
 * 3. Verified numerical atmospheric chemistry model (Open-Meteo CAMS)
 */
function resolveAutomaticMode(
  preference: SourcePreference,
  sources: EnvironmentalSourceRecord[],
  modelSource: EnvironmentalSourceRecord | null,
  aqiStandard: AqiStandard,
  retrievedAt: string,
  alternatives: Array<{ mode: SourceSelectionMode; label: string; sourceId: string }>,
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
function resolveOfficialGroundMode(
  preference: SourcePreference,
  sources: EnvironmentalSourceRecord[],
  modelSource: EnvironmentalSourceRecord | null,
  aqiStandard: AqiStandard,
  retrievedAt: string,
  alternatives: Array<{ mode: SourceSelectionMode; label: string; sourceId: string }>,
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
  const isStale = officialStations.some((s) => {
    if (s.status === 'stale') return true;
    const elig = evaluateMeasurementEligibility(s, 'pm25', nowMs);
    return !elig.eligible && elig.reason === 'stale';
  });
  const isRegistryOnly = officialStations.length > 0;

  let selectionReason = 'No official regulatory stations are located within observation range of this city.';
  if (isStale) {
    selectionReason = 'Official CPCB station observations are stale (>24h old) and cannot be presented as current.';
  } else if (isRegistryOnly) {
    selectionReason = 'Official CPCB stations are registered in this city but are awaiting continuous live telemetry.';
  }

  return {
    preference,
    resolvedSource: null,
    resolutionStatus: 'unavailable',
    selectionReason,
    isFallback: false,
    pollutant: 'pm25',
    concentration: null,
    unit: 'µg/m³',
    observedAt: null,
    validAt: null,
    retrievedAt,
    averagingPeriodMinutes: null,
    qualityFlag: 'unavailable',
    stationId: null,
    stationName: 'Official Ground Station',
    providerId: 'cpcb',
    providerName: 'CPCB / State Pollution Control Board',
    sourceKind: 'official_ground_station',
    distanceKm: null,
    isModel: false,
    attribution: 'Central Pollution Control Board (data.gov.in)',
    limitations: ['Official regulatory feed currently unavailable or offline.'],
    displayAqi: null,
    aqiStandard,
    aqiCategory: 'Unavailable',
    aqiCategoryColor: '#64748B',
    isOfficialPublishedAqi: false,
    aqiCalculationNotes: 'Official measurements unavailable.',
    availableAlternatives: alternatives,
  };
}

/**
 * Mode C: OpenAQ Ground Network
 */
function resolveOpenAqMode(
  preference: SourcePreference,
  sources: EnvironmentalSourceRecord[],
  modelSource: EnvironmentalSourceRecord | null,
  aqiStandard: AqiStandard,
  retrievedAt: string,
  alternatives: Array<{ mode: SourceSelectionMode; label: string; sourceId: string }>,
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

  const isStale = openAqSources.some((s) => {
    if (s.status === 'stale') return true;
    const elig = evaluateMeasurementEligibility(s, 'pm25', nowMs);
    return !elig.eligible && elig.reason === 'stale';
  });
  const selectionReason = isStale
    ? 'OpenAQ ground monitor observations are stale (>24h old) and cannot be presented as current.'
    : 'No OpenAQ monitoring stations are currently reporting measurements within range.';

  return {
    preference,
    resolvedSource: null,
    resolutionStatus: 'unavailable',
    selectionReason,
    isFallback: false,
    pollutant: 'pm25',
    concentration: null,
    unit: 'µg/m³',
    observedAt: null,
    validAt: null,
    retrievedAt,
    averagingPeriodMinutes: null,
    qualityFlag: 'unavailable',
    stationId: null,
    stationName: 'OpenAQ Station',
    providerId: 'openaq',
    providerName: 'OpenAQ v3 Network',
    sourceKind: 'physical_observation',
    distanceKm: null,
    isModel: false,
    attribution: 'OpenAQ Community & Reference Network',
    limitations: ['OpenAQ ground measurements unavailable within current geographic bounds.'],
    displayAqi: null,
    aqiStandard,
    aqiCategory: 'Unavailable',
    aqiCategoryColor: '#64748B',
    isOfficialPublishedAqi: false,
    aqiCalculationNotes: 'OpenAQ data unavailable.',
    availableAlternatives: alternatives,
  };
}

/**
 * Mode D: Atmospheric Chemistry Model (CAMS)
 */
function resolveAtmosphericModelMode(
  preference: SourcePreference,
  modelSource: EnvironmentalSourceRecord | null,
  aqiStandard: AqiStandard,
  retrievedAt: string,
  alternatives: Array<{ mode: SourceSelectionMode; label: string; sourceId: string }>,
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
function resolveSpecificStationMode(
  preference: SourcePreference,
  sources: EnvironmentalSourceRecord[],
  modelSource: EnvironmentalSourceRecord | null,
  aqiStandard: AqiStandard,
  retrievedAt: string,
  alternatives: Array<{ mode: SourceSelectionMode; label: string; sourceId: string }>,
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

      return {
        preference,
        resolvedSource: null,
        resolutionStatus: 'unavailable',
        selectionReason: `Selected station "${preference.stationName || preference.stationId}" is ${targetStation.distanceKm} km away. Please select a station local to the active city.`,
        isFallback: false,
        pollutant: 'pm25',
        concentration: null,
        unit: 'µg/m³',
        observedAt: null,
        validAt: null,
        retrievedAt,
        averagingPeriodMinutes: null,
        qualityFlag: 'unavailable',
        stationId: preference.stationId,
        stationName: preference.stationName || targetStation.sourceName || targetStation.name || 'External Station',
        providerId: targetStation.providerId,
        providerName: targetStation.providerName,
        sourceKind: targetStation.sourceKind,
        distanceKm: targetStation.distanceKm,
        isModel: false,
        attribution: targetStation.attribution,
        limitations: ['Station is outside local atmospheric boundary layer.'],
        displayAqi: null,
        aqiStandard,
        aqiCategory: 'Unavailable',
        aqiCategoryColor: '#64748B',
        isOfficialPublishedAqi: false,
        aqiCalculationNotes: 'Station is geographically non-representative for this location.',
        availableAlternatives: alternatives,
      };
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

    return {
      preference,
      resolvedSource: targetStation,
      resolutionStatus: 'unavailable',
      selectionReason: `Selected station "${targetStation.sourceName || targetStation.name}" is currently unavailable: ${eligibility.reason || 'No valid PM2.5 observation'}.`,
      isFallback: false,
      pollutant: 'pm25',
      concentration: null,
      unit: 'µg/m³',
      observedAt: targetStation.observedAt ?? null,
      validAt: null,
      retrievedAt,
      averagingPeriodMinutes: null,
      qualityFlag: 'unavailable',
      stationId: targetStation.id,
      stationName: targetStation.sourceName || targetStation.name || 'Selected Station',
      providerId: targetStation.providerId,
      providerName: targetStation.providerName,
      sourceKind: targetStation.sourceKind,
      distanceKm: targetStation.distanceKm ?? null,
      isModel: false,
      attribution: targetStation.attribution,
      limitations: ['Live observation feed is currently offline or unpopulated.'],
      displayAqi: null,
      aqiStandard,
      aqiCategory: 'Unavailable',
      aqiCategoryColor: '#64748B',
      isOfficialPublishedAqi: false,
      aqiCalculationNotes: eligibility.reason || 'Selected station has no valid PM2.5 observation.',
      availableAlternatives: alternatives,
    };
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

  return {
    preference,
    resolvedSource: null,
    resolutionStatus: 'unavailable',
    selectionReason: `Selected station "${preference.stationName || preference.stationId}" is not available for this city.`,
    isFallback: false,
    pollutant: 'pm25',
    concentration: null,
    unit: 'µg/m³',
    observedAt: null,
    validAt: null,
    retrievedAt,
    averagingPeriodMinutes: null,
    qualityFlag: 'unavailable',
    stationId: preference.stationId,
    stationName: preference.stationName || preference.stationId,
    providerId: 'unknown',
    providerName: 'Custom Ground Station',
    sourceKind: 'physical_observation',
    distanceKm: null,
    isModel: false,
    attribution: 'Ground Monitoring Network',
    limitations: ['Station not present in current city coverage.'],
    displayAqi: null,
    aqiStandard,
    aqiCategory: 'Unavailable',
    aqiCategoryColor: '#64748B',
    isOfficialPublishedAqi: false,
    aqiCalculationNotes: 'Station not found.',
    availableAlternatives: alternatives,
  };
}

/**
 * Builds ResolvedSourceData from an EnvironmentalSourceRecord with scientifically honest AQI derivation.
 */
function buildResolvedSourceData(params: {
  preference: SourcePreference;
  resolvedSource: EnvironmentalSourceRecord;
  resolutionStatus: 'resolved' | 'fallback';
  selectionReason: string;
  isFallback: boolean;
  fallbackReason?: string;
  aqiStandard: AqiStandard;
  retrievedAt: string;
  alternatives: Array<{ mode: SourceSelectionMode; label: string; sourceId: string }>;
}): ResolvedSourceData {
  const {
    preference,
    resolvedSource,
    resolutionStatus,
    selectionReason,
    isFallback,
    fallbackReason,
    aqiStandard,
    retrievedAt,
    alternatives,
  } = params;

  const pm25M = resolvedSource.measurements?.find((m) => m.pollutant === 'pm25');
  const pm10M = resolvedSource.measurements?.find((m) => m.pollutant === 'pm10');
  const aqiM = resolvedSource.measurements?.find((m) => m.pollutant === 'aqi_derived');

  const concentration = pm25M?.value ?? null;
  const isModel = resolvedSource.sourceKind === 'atmospheric_model';

  let displayAqi: number | null = null;
  let isOfficialPublishedAqi = false;
  let aqiCalculationNotes = '';

  // Defect 4: Strict Official Publication Logic
  // An AQI is officially published ONLY when verified trusted source metadata proves
  // it was explicitly published by the regulatory authority under the selected standard.
  // Never infer official status from provider name alone, aqi_derived, fresh status, or local calculation.
  const hasOfficialBulletinProof = Boolean(
    resolvedSource.sourceKind === 'official_ground_station' &&
    (resolvedSource.provenance?.isOfficialBulletin === true || resolvedSource.metadata?.isOfficialBulletin === true) &&
    aqiM &&
    aqiM.value !== null &&
    Number.isFinite(aqiM.value) &&
    aqiM.qualityFlag === 'official_bulletin'
  );

  if (hasOfficialBulletinProof && aqiM) {
    displayAqi = aqiM.value;
    isOfficialPublishedAqi = true;
    aqiCalculationNotes = `Official regulatory bulletin published by ${resolvedSource.providerName || 'regulatory authority'}.`;
  } else if (aqiStandard === 'cpcb') {
    isOfficialPublishedAqi = false;
    if (concentration !== null) {
      const is24Hr = Boolean(pm25M?.averagingPeriodMinutes === 1440);
      const cpcbResult = calculateComprehensiveCpcbNaqi({
        pm25: concentration,
        pm10: pm10M?.value ?? null,
        is24HourAveraged: is24Hr,
      });
      displayAqi = cpcbResult.aqi;
      if (cpcbResult.classification === 'statutory_compliant' && is24Hr) {
        aqiCalculationNotes = 'Statutory 24-hour CPCB NAQI calculation with compliant data sufficiency.';
      } else {
        aqiCalculationNotes = 'Indicative CPCB sub-index derived from in-situ measurements. Not an officially published bulletin.';
      }
    }
  } else {
    // US EPA standard
    isOfficialPublishedAqi = false;
    if (concentration !== null) {
      displayAqi = calculateAQIFromPM25(concentration);
      aqiCalculationNotes = 'Derived US EPA PM2.5 sub-index (40 CFR Part 58, 2024 standard). Not an officially published AQI.';
    }
  }

  const cat =
    aqiStandard === 'cpcb'
      ? getCpcbCategory(displayAqi)
      : getEpaCategory(displayAqi);
  const category = cat.label;
  const categoryColor = cat.color;

  return {
    preference,
    resolvedSource,
    resolutionStatus,
    selectionReason,
    isFallback,
    fallbackReason,
    pollutant: 'pm25',
    concentration,
    unit: pm25M?.unit || 'µg/m³',
    observedAt: pm25M?.observedAt ?? resolvedSource.observedAt ?? resolvedSource.measuredAt ?? null,
    validAt: resolvedSource.validAt ?? null,
    retrievedAt,
    averagingPeriodMinutes: pm25M?.averagingPeriodMinutes ?? null,
    qualityFlag: pm25M?.qualityFlag ?? 'valid',
    stationId: resolvedSource.id,
    stationName: resolvedSource.sourceName || resolvedSource.name || 'Station',
    providerId: resolvedSource.providerId,
    providerName: resolvedSource.providerName || resolvedSource.provider || resolvedSource.providerId,
    networkName: resolvedSource.provenance?.network || null,
    sourceKind: resolvedSource.sourceKind,
    distanceKm: resolvedSource.distanceKm ?? null,
    isModel,
    attribution: resolvedSource.attribution || resolvedSource.provenance?.licenseOrAttribution || 'Open Data',
    limitations: resolvedSource.provenance?.limitations || [],
    displayAqi,
    aqiStandard,
    aqiCategory: category,
    aqiCategoryColor: categoryColor,
    isOfficialPublishedAqi,
    aqiCalculationNotes,
    availableAlternatives: alternatives,
  };
}

/**
 * Builds ResolvedSourceData directly from AtmosphericMetrics when model source record is unbundled.
 */
function buildResolvedFromMetrics(
  preference: SourcePreference,
  metrics: AtmosphericMetrics,
  aqiStandard: AqiStandard,
  retrievedAt: string,
  selectionReason: string,
  alternatives: Array<{ mode: SourceSelectionMode; label: string; sourceId: string }>
): ResolvedSourceData {
  const concentration = metrics.pm25;
  const displayAqi =
    aqiStandard === 'cpcb'
      ? (metrics.cpcbAqi ?? null)
      : (metrics.usAqi ?? null);

  const cat =
    aqiStandard === 'cpcb'
      ? getCpcbCategory(displayAqi)
      : getEpaCategory(displayAqi);
  const category = cat.label;
  const categoryColor = cat.color;

  return {
    preference,
    resolvedSource: null,
    resolutionStatus: 'resolved',
    selectionReason,
    isFallback: false,
    pollutant: 'pm25',
    concentration,
    unit: 'µg/m³',
    observedAt: null,
    validAt: metrics.timestamp || null,
    retrievedAt,
    averagingPeriodMinutes: 60,
    qualityFlag: 'valid',
    stationId: 'cams_global',
    stationName: 'ECMWF CAMS Global Model',
    providerId: 'open_meteo',
    providerName: 'Open-Meteo Air Quality (CAMS Global)',
    sourceKind: 'atmospheric_model',
    distanceKm: null,
    isModel: true,
    attribution: 'ECMWF Copernicus Atmosphere Monitoring Service',
    limitations: ['Gridded spatial model (approx ~11 km resolution); not a physical surface station.'],
    displayAqi,
    aqiStandard,
    aqiCategory: category,
    aqiCategoryColor: categoryColor,
    isOfficialPublishedAqi: false,
    aqiCalculationNotes: 'Modeled atmospheric concentration sub-index.',
    availableAlternatives: alternatives,
  };
}

/**
 * Helper to construct an honest unavailable resolution response.
 */
function createUnavailableResolvedData(
  preference: SourcePreference,
  reason: string,
  retrievedAt: string,
  aqiStandard: AqiStandard
): ResolvedSourceData {
  return {
    preference,
    resolvedSource: null,
    resolutionStatus: 'unavailable',
    selectionReason: reason,
    isFallback: false,
    pollutant: 'pm25',
    concentration: null,
    unit: 'µg/m³',
    observedAt: null,
    validAt: null,
    retrievedAt,
    averagingPeriodMinutes: null,
    qualityFlag: 'unavailable',
    stationId: null,
    stationName: 'Unavailable',
    providerId: 'none',
    providerName: 'None',
    sourceKind: 'atmospheric_model',
    distanceKm: null,
    isModel: false,
    attribution: 'Avir Environmental Intelligence',
    limitations: ['No active data feed available for current selection.'],
    displayAqi: null,
    aqiStandard,
    aqiCategory: 'Unavailable',
    aqiCategoryColor: '#64748B',
    isOfficialPublishedAqi: false,
    aqiCalculationNotes: 'Telemetry currently unavailable.',
    availableAlternatives: [],
  };
}
