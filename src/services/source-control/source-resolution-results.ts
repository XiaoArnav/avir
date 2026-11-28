/**
 * Resolved Source Data Result Builders
 *
 * Constructs scientifically honest ResolvedSourceData records from verified source records,
 * unbundled atmospheric telemetry, or unavailable states while strictly separating official
 * regulatory bulletins from locally derived CPCB and US EPA sub-indices.
 */

import {
  AtmosphericMetrics,
  EnvironmentalSourceKind,
  EnvironmentalSourceRecord,
} from '@/domain/types';
import {
  AqiStandard,
  getCpcbCategory,
  getEpaCategory,
} from '@/services/geo/geographic-observation-adapter';
import {
  ResolvedSourceData,
  SourcePreference,
  SourceSelectionMode,
} from './source-control-types';
import { calculateComprehensiveCpcbNaqi } from '@/domain/cpcb-naqi';
import { calculateAQIFromPM25 } from '@/domain/air-math';

export interface SourceAlternativeOption {
  mode: SourceSelectionMode;
  label: string;
  sourceId: string;
}

export interface BuildResolvedSourceDataParams {
  preference: SourcePreference;
  resolvedSource: EnvironmentalSourceRecord;
  resolutionStatus: 'resolved' | 'fallback';
  selectionReason: string;
  isFallback: boolean;
  fallbackReason?: string;
  aqiStandard: AqiStandard;
  retrievedAt: string;
  alternatives: SourceAlternativeOption[];
}

export interface UnavailableSourceModeParams {
  preference: SourcePreference;
  resolvedSource?: EnvironmentalSourceRecord | null;
  selectionReason: string;
  observedAt?: string | null;
  retrievedAt: string;
  stationId?: string | null;
  stationName: string;
  providerId: string;
  providerName: string;
  sourceKind: EnvironmentalSourceKind;
  distanceKm?: number | null;
  attribution: string;
  limitations: string[];
  aqiStandard: AqiStandard;
  aqiCalculationNotes: string;
  alternatives?: SourceAlternativeOption[];
}

/**
 * Builds ResolvedSourceData from an EnvironmentalSourceRecord with scientifically honest AQI derivation.
 */
export function buildResolvedSourceData(params: BuildResolvedSourceDataParams): ResolvedSourceData {
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
export function buildResolvedFromMetrics(
  preference: SourcePreference,
  metrics: AtmosphericMetrics,
  aqiStandard: AqiStandard,
  retrievedAt: string,
  selectionReason: string,
  alternatives: SourceAlternativeOption[]
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
 * Constructs a mode-specific unavailable ResolvedSourceData response without silent fallback.
 */
export function createModeUnavailableResolvedData(
  params: UnavailableSourceModeParams
): ResolvedSourceData {
  return {
    preference: params.preference,
    resolvedSource: params.resolvedSource ?? null,
    resolutionStatus: 'unavailable',
    selectionReason: params.selectionReason,
    isFallback: false,
    pollutant: 'pm25',
    concentration: null,
    unit: 'µg/m³',
    observedAt: params.observedAt ?? null,
    validAt: null,
    retrievedAt: params.retrievedAt,
    averagingPeriodMinutes: null,
    qualityFlag: 'unavailable',
    stationId: params.stationId ?? null,
    stationName: params.stationName,
    providerId: params.providerId,
    providerName: params.providerName,
    sourceKind: params.sourceKind,
    distanceKm: params.distanceKm ?? null,
    isModel: false,
    attribution: params.attribution,
    limitations: params.limitations,
    displayAqi: null,
    aqiStandard: params.aqiStandard,
    aqiCategory: 'Unavailable',
    aqiCategoryColor: '#64748B',
    isOfficialPublishedAqi: false,
    aqiCalculationNotes: params.aqiCalculationNotes,
    availableAlternatives: params.alternatives ?? [],
  };
}

/**
 * Helper to construct an honest unavailable resolution response.
 */
export function createUnavailableResolvedData(
  preference: SourcePreference,
  reason: string,
  retrievedAt: string,
  aqiStandard: AqiStandard
): ResolvedSourceData {
  return createModeUnavailableResolvedData({
    preference,
    selectionReason: reason,
    retrievedAt,
    stationName: 'Unavailable',
    providerId: 'none',
    providerName: 'None',
    sourceKind: 'atmospheric_model',
    attribution: 'Avir Environmental Intelligence',
    limitations: ['No active data feed available for current selection.'],
    aqiStandard,
    aqiCalculationNotes: 'Telemetry currently unavailable.',
    alternatives: [],
  });
}
