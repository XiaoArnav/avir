/**
 * Avir Source Control & Provenance System
 * 
 * Provides type contracts for user-selected environmental sources,
 * scientific provenance, transparent resolution, and comparative auditing.
 */

import {
  EnvironmentalSourceRecord,
  EnvironmentalSourceKind,
  EnvironmentalSourceStatus,
} from '@/domain/types';

export type SourceSelectionMode =
  | 'automatic'          // Mode A: Deterministic best available choice
  | 'official_ground'    // Mode B: CPCB / CAAQMS reference monitors
  | 'openaq'             // Mode C: OpenAQ v3 ground network
  | 'atmospheric_model'  // Mode D: ECMWF CAMS / Open-Meteo numerical simulation
  | 'specific_station';  // Mode E: Explicitly chosen physical ground station

export interface SourcePreference {
  version: 1;
  mode: SourceSelectionMode;
  providerId?: string;   // 'cpcb' | 'openaq' | 'cams' | 'sensor_community'
  stationId?: string;    // canonical source id or upstream station id
  stationName?: string;  // human-readable station name for display
  allowFallbackToModel?: boolean; // explicit opt-in for model fallback when preferred source is unavailable
}

export type SourceResolutionStatus =
  | 'resolved'         // Target source successfully resolved with valid readings
  | 'fallback'         // User opted-in fallback applied with clear disclosure
  | 'unavailable'      // Preferred source is offline or has no data; no silent replacement
  | 'not_configured'   // Provider requires an API key that is not configured on the server
  | 'stale'            // Source data is older than 24 hours
  | 'no_coverage';     // No physical monitoring stations exist within geographic radius

export interface ResolvedSourceData {
  preference: SourcePreference;
  resolvedSource: EnvironmentalSourceRecord | null;
  resolutionStatus: SourceResolutionStatus;
  selectionReason: string;
  isFallback: boolean;
  fallbackReason?: string;
  // Core pollutant observation
  pollutant: 'pm25' | 'pm10';
  concentration: number | null;
  unit: string;
  observedAt: string | null;  // Actual observation timestamp from physical monitor
  validAt: string | null;     // Model valid timestamp or simulation period
  retrievedAt: string;        // Timestamp when data was retrieved from provider API
  averagingPeriodMinutes: number | null;
  qualityFlag: 'valid' | 'suspect' | 'calibrated' | 'raw' | 'rejected' | 'unavailable' | 'official_bulletin';
  // Station & Provenance Details
  stationId: string | null;
  stationName: string;
  providerId: string;
  providerName: string;
  networkName?: string | null;
  sourceKind: EnvironmentalSourceKind;
  distanceKm: number | null;
  isModel: boolean;
  attribution: string;
  limitations: string[];
  // Derived/Published AQI
  displayAqi: number | null;
  aqiStandard: 'cpcb' | 'epa';
  aqiCategory: string;
  aqiCategoryColor: string;
  isOfficialPublishedAqi: boolean;
  aqiCalculationNotes: string;
  // Alternatives when preferred source is offline
  availableAlternatives: Array<{
    mode: SourceSelectionMode;
    label: string;
    sourceId: string;
  }>;
}

export interface SourceCatalogItem {
  id: string;
  name: string;
  providerId: string;
  providerName: string;
  sourceKind: EnvironmentalSourceKind;
  distanceKm: number | null;
  pm25: number | null;
  pm10: number | null;
  observedAt: string | null;
  validAt: string | null;
  status: EnvironmentalSourceStatus;
  isAvailable: boolean;
  isStale: boolean;
  isReference: boolean;
  attribution: string;
}
