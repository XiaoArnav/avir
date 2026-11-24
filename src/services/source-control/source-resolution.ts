/**
 * Source Resolution Engine
 * 
 * Evaluates user source preferences against active environmental telemetry,
 * enforcing zero-fabrication, deterministic selection, transparent provenance,
 * and no silent fallback.
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

/**
 * Resolves the active environmental source according to user preference and available telemetry.
 */
export function resolveSource(
  preference: SourcePreference,
  metrics: AtmosphericMetrics | null,
  aqiStandard: AqiStandard = 'cpcb'
): ResolvedSourceData {
  const currentRetrievedAt = new Date().toISOString();

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
      return resolveOfficialGroundMode(preference, sources, modelSource, aqiStandard, currentRetrievedAt, alternatives, metrics);

    case 'openaq':
      return resolveOpenAqMode(preference, sources, modelSource, aqiStandard, currentRetrievedAt, alternatives, metrics);

    case 'atmospheric_model':
      return resolveAtmosphericModelMode(preference, modelSource, aqiStandard, currentRetrievedAt, alternatives, metrics);

    case 'specific_station':
      return resolveSpecificStationMode(preference, sources, modelSource, aqiStandard, currentRetrievedAt, alternatives, metrics);

    case 'automatic':
    default:
      return resolveAutomaticMode(preference, sources, modelSource, aqiStandard, currentRetrievedAt, alternatives, metrics);
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
  metrics: AtmosphericMetrics
): ResolvedSourceData {
  // 1. Look for fresh official reference station within 35km
  const officialStations = sources.filter(
    (s) =>
      s.sourceKind === 'official_ground_station' &&
      (s.distanceKm === null || s.distanceKm <= 35) &&
      hasValidPm25(s)
  );

  if (officialStations.length > 0) {
    // Sort by shortest distance
    officialStations.sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
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
  const openAqStations = sources.filter(
    (s) =>
      s.providerId === 'openaq' &&
      s.sourceKind !== 'atmospheric_model' &&
      (s.distanceKm === null || s.distanceKm <= 35) &&
      hasValidPm25(s)
  );

  if (openAqStations.length > 0) {
    openAqStations.sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
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
  if (modelSource && hasValidPm25(modelSource)) {
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
  if (metrics.pm25 !== null) {
    return buildResolvedFromMetrics(preference, metrics, aqiStandard, retrievedAt, 'Atmospheric model selected from primary telemetry stream.', alternatives);
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
  metrics: AtmosphericMetrics
): ResolvedSourceData {
  const officialStations = sources.filter(
    (s) => s.sourceKind === 'official_ground_station' || s.providerId === 'cpcb'
  );

  const reportingStation = officialStations.find(hasValidPm25);

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
  if (preference.allowFallbackToModel && modelSource && hasValidPm25(modelSource)) {
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
  const isRegistryOnly = officialStations.length > 0;
  return {
    preference,
    resolvedSource: null,
    resolutionStatus: 'unavailable',
    selectionReason: isRegistryOnly
      ? 'Official CPCB stations are registered in this city but are awaiting continuous live telemetry.'
      : 'No official regulatory stations are located within observation range of this city.',
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
  metrics: AtmosphericMetrics
): ResolvedSourceData {
  const openAqSources = sources.filter(
    (s) => s.providerId === 'openaq' && s.sourceKind !== 'atmospheric_model'
  );

  const reportingSource = openAqSources.find(hasValidPm25);

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

  if (preference.allowFallbackToModel && modelSource && hasValidPm25(modelSource)) {
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

  return {
    preference,
    resolvedSource: null,
    resolutionStatus: 'unavailable',
    selectionReason: 'No OpenAQ monitoring stations are currently reporting measurements within range.',
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
  metrics: AtmosphericMetrics
): ResolvedSourceData {
  if (modelSource && hasValidPm25(modelSource)) {
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

  if (metrics.pm25 !== null) {
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
  metrics: AtmosphericMetrics
): ResolvedSourceData {
  if (!preference.stationId) {
    // No station ID specified, fall back to automatic resolution
    return resolveAutomaticMode(preference, sources, modelSource, aqiStandard, retrievedAt, alternatives, metrics);
  }

  const targetStation = sources.find(
    (s) => s.id === preference.stationId || s.stationId === preference.stationId
  );

  // Check if station exists in current city telemetry
  if (targetStation) {
    // Spatial relevance check: if station is > 100km away, user switched cities
    if (targetStation.distanceKm !== null && targetStation.distanceKm > 100) {
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

    if (hasValidPm25(targetStation)) {
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

    // Station exists but has no live PM2.5 measurement
    return {
      preference,
      resolvedSource: targetStation,
      resolutionStatus: 'unavailable',
      selectionReason: `Selected station "${targetStation.sourceName || targetStation.name}" has no continuous live feed at this time.`,
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
      aqiCalculationNotes: 'Selected station has no valid PM2.5 observation.',
      availableAlternatives: alternatives,
    };
  }

  // Station ID not found in current city sources (e.g. User switched cities)
  if (preference.allowFallbackToModel && modelSource && hasValidPm25(modelSource)) {
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
 * Helper to check if an EnvironmentalSourceRecord has a valid, non-negative PM2.5 measurement.
 */
function hasValidPm25(src: EnvironmentalSourceRecord): boolean {
  if (!src || !src.measurements) return false;
  const pm25 = src.measurements.find((m) => m.pollutant === 'pm25');
  return Boolean(
    pm25 && pm25.value !== null && Number.isFinite(pm25.value) && pm25.value >= 0
  );
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

  if (aqiStandard === 'cpcb') {
    if (aqiM && aqiM.value !== null) {
      displayAqi = aqiM.value;
      isOfficialPublishedAqi = true;
      aqiCalculationNotes = 'Official regulatory bulletin reported by provider.';
    } else if (concentration !== null) {
      const cpcbResult = calculateComprehensiveCpcbNaqi({
        pm25: concentration,
        pm10: pm10M?.value ?? null,
        is24HourAveraged: Boolean(pm25M?.averagingPeriodMinutes === 1440),
      });
      displayAqi = cpcbResult.aqi;
      isOfficialPublishedAqi = false;
      aqiCalculationNotes =
        cpcbResult.evidence.missingRequirements.length > 0
          ? 'Indicative CPCB sub-index calculated from PM2.5. Not an official 24-hr statutory bulletin.'
          : 'CPCB sub-index calculated from available in-situ observations.';
    }
  } else {
    // US EPA standard
    if (concentration !== null) {
      displayAqi = calculateAQIFromPM25(concentration);
      aqiCalculationNotes = 'US EPA PM2.5 sub-index (40 CFR Part 58, 2024 standard).';
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
    observedAt: resolvedSource.observedAt ?? resolvedSource.measuredAt ?? null,
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
