/**
 * Avir Core Domain Types & Interfaces
 * Rigorous Data-Provenance & Environmental Intelligence Model
 */

export type DataProvenance = 
  | 'observed'             // Direct ground monitor observation
  | 'modeled_forecast'     // Provider numerical atmospheric chemistry & weather model
  | 'derived_calculation'  // Mathematical calculation from verified inputs (e.g. CPCB NAQI from PM2.5)
  | 'estimated_outcome'    // Modeled personal inhalation estimate based on documented assumptions
  | 'unavailable';         // Measurement or parameter unavailable from provider

export type TelemetryStatus = 
  | 'loading' 
  | 'success' 
  | 'partial'
  | 'stale' 
  | 'unavailable' 
  | 'error';

export type FieldValidationStatus = 'valid' | 'unavailable' | 'rejected';

export interface TelemetryFieldMetadata<T = number> {
  value: T | null;
  unit: string;
  provider: string;
  classification: DataProvenance;
  status: FieldValidationStatus;
  rejectionReason?: string;
}

export interface AtmosphericFieldMeasurements {
  pm25: TelemetryFieldMetadata<number>;
  pm10: TelemetryFieldMetadata<number>;
  usAqi: TelemetryFieldMetadata<number>;
  boundaryLayerHeight: TelemetryFieldMetadata<number>;
  co?: TelemetryFieldMetadata<number>;
  no2?: TelemetryFieldMetadata<number>;
  so2?: TelemetryFieldMetadata<number>;
  o3?: TelemetryFieldMetadata<number>;
  temperature?: TelemetryFieldMetadata<number>;
  humidity?: TelemetryFieldMetadata<number>;
  windSpeed?: TelemetryFieldMetadata<number>;
  windDirection?: TelemetryFieldMetadata<number>;
}

export interface TelemetryLocationMetadata {
  latitude: number;
  longitude: number;
  cityName?: string;
  timezone: string;
}

export interface TelemetryCacheMetadata {
  isCached: boolean;
  isStale: boolean;
  originalTimestamp?: string;
  cachedAt?: string;
  ttlMs?: number;
}

export type GroundStationType = 'official_reference' | 'community_optical' | 'user_device';
export type GroundStationState = 'registry_only' | 'live_observation' | 'stale_observation' | 'measurement_unavailable';

export type GroundStationState =
  | 'registry_only'
  | 'live_observation'
  | 'stale_observation'
  | 'measurement_unavailable';

export interface GroundStationMetadata {
  stationId: string | number;
  stationName: string;
  distanceKm: number;
  latitude: number;
  longitude: number;
  provider: string; // e.g. "CPCB (Central Pollution Control Board)", "DPCC", "Sensor.Community", "AirGradient Local"
  stationType: GroundStationType;
  stationState?: GroundStationState;
  lastUpdated: string;
  observedAt?: string | null; // Genuine observation timestamp from source
  retrievedAt?: string;       // Timestamp when client/server fetched the data
  pm25: number | null;
  pm10: number | null;
  rawPm25?: number | null;
  isCalibrated?: boolean;
  calibrationFormula?: string;
  stationState?: GroundStationState;
  observedAt?: string | null;
  retrievedAt?: string;
  co?: number | null;
  no2?: number | null;
  so2?: number | null;
  o3?: number | null;
}

export interface GroundModelDelta {
  groundPm25: number;
  modelPm25: number;
  deltaPercent: number; // e.g. +65%
  divergenceType: 'ground_trapping' | 'model_overestimate' | 'aligned';
  narrative: string;
}

export type AQICategory = 
  | 'Good'
  | 'Moderate'
  | 'UnhealthySensitive'
  | 'Unhealthy'
  | 'VeryUnhealthy'
  | 'Hazardous'
  | 'Severe'
  | 'Unavailable';

export interface AQIBreakpoint {
  category: AQICategory;
  aqiMin: number;
  aqiMax: number;
  pm25Min: number;
  pm25Max: number;
  pm10Min: number;
  pm10Max: number;
  colorHex: string;
  advisoryText: string;
}

export interface HourlyAtmosphericPoint {
  time: string;           // Local ISO timestamp in target city's timezone
  hour: number;           // 0-23 in target city's wall-clock time
  pm25: number | null;
  usAqi: number | null;
  boundaryLayerHeight: number | null;
  temperature?: number | null;
  humidity?: number | null;
  windSpeed?: number | null;
  isForecast: boolean;    // true if future hour, false if past/current observation
  isSafeVentingWindow: boolean;
  isStagnantDispersion: boolean; // low boundary layer height (<200m)
}

export interface AtmosphericSourceFeed {
  id: string;
  sourceName: string;
  provider: string;
  provenance: DataProvenance;
  standard: string;
  description: string;
  coverage: string;
  isLive: boolean;
  lastUpdated?: string;
}

export interface MultiSourceTelemetryFeed {
  id: string;
  sourceName: string;
  provider: string;
  aqi: number;
  pm25: number;
  confidence: 'High' | 'Medium' | 'Calibrated';
  standard: 'US-EPA' | 'CPCB-NAQI' | 'EU-CAQI' | 'WHO-Reference';
  description: string;
  provenance: DataProvenance;
}

export interface EnsembleConsensusAnalysis {
  primaryModel: string;
  weatherModel: string;
  consensusAqi: number | null;
  consensusPm25: number | null;
  aqiMin: number | null;
  aqiMax: number | null;
  pm25Min: number | null;
  pm25Max: number | null;
  confidenceScorePercent: number | null;
  agreementLevel: string;
  deviationSpread: number | null;
  feeds: MultiSourceTelemetryFeed[];
  summaryNote: string;
  provenanceNote: string;
  isUnavailable?: boolean;
  isSingleModelActive?: boolean;
}

export interface MetricAvailability {
  aqi: boolean;
  pm25: boolean;
  pm10: boolean;
  weather: boolean;
  blh: boolean;
  forecast: boolean;
}

export interface AtmosphericMetrics {
  status: TelemetryStatus;
  provenance: DataProvenance;
  timestamp: string;          // ISO string of provider observation/forecast time
  retrievedAt: string;        // ISO string when data was fetched by client/server
  timezone: string;           // City's local timezone (e.g. 'Asia/Kolkata')
  cityName?: string;
  latitude?: number;
  longitude?: number;
  
  usAqi: number | null;       // Standard US EPA 0-500 AQI, null if unavailable
  pm25: number | null;        // Fine particulate in µg/m³, null if unavailable
  pm10: number | null;        // Respirable particulate in µg/m³, null if unavailable
  
  // Trace gaseous pollutants (µg/m³) - optional based on provider availability
  co?: number | null;
  no2?: number | null;
  so2?: number | null;
  o3?: number | null;
  
  // Ambient weather
  temperature?: number | null; // °C
  humidity?: number | null;    // % RH
  windSpeed?: number | null;   // km/h
  windDirection?: number | null; // degrees 0-360
  boundaryLayerHeight: number | null; // meters (PBL mixing depth), null if unavailable
  
  // Atmospheric dispersion assessment
  isThermalInversionActive: boolean; // poor ground dispersion / stable boundary layer
  isLive: boolean;
  isStale?: boolean;
  errorMessage?: string;
  
  // Section 1 Telemetry Contract Metadata
  fields?: AtmosphericFieldMeasurements;
  location?: TelemetryLocationMetadata;
  cacheMetadata?: TelemetryCacheMetadata;
  freshness?: 'fresh' | 'stale' | 'expired' | 'unavailable';
  errorType?: 'network' | 'timeout' | 'rate_limit' | 'validation' | 'unknown';

  // Live Ground Truth Station & Multi-Source Delta
  groundStation?: GroundStationMetadata | null;
  groundModelDelta?: GroundModelDelta | null;

  cpcbAqi?: number | null;
  cpcbCategory?: string | null;
  cpcbStatus?: 'statutory_compliant' | 'indicative_subindex' | 'unavailable';
  sourceAttribution?: string;
  hourlyForecast?: HourlyAtmosphericPoint[];
  ensemble?: EnsembleConsensusAnalysis;
  availability?: MetricAvailability;
}

export type ActivityIntensity = 'resting' | 'light_walk' | 'moderate_activity' | 'intense_exercise';

export interface UserVulnerabilityProfile {
  ageGroup: 'infant' | 'child' | 'adult' | 'senior';
  hasAsthmaOrRespiratory: boolean;
  hasCardiovascularCondition: boolean;
  isPregnant: boolean;
  isOutdoorWorker: boolean;
}

export interface ExposureCalculation {
  inhaledPM25Micrograms: number;
  vulnerabilityWeightedExposure: number;
  equivalentCigarettesDay: number;
  respiratoryRiskScore: number;
}

export interface CorsiRosenthalBoxSpec {
  fanType: '20_inch_box_fan';
  filterType: 'MERV_13' | 'MERV_14';
  numberOfFilters: 4 | 5;
  estimatedCADR_CFM: number;
  estimatedCADR_M3H: number;
  roomVolumeM3: number;
  airChangesPerHour: number;
  clearingHalfLifeMinutes: number;
  estimatedCostINR: number;
}

export interface RoutineItem {
  id: string;
  timeWindow: string; // e.g. "06:30 - 07:30"
  activityName: string;
  intensity: ActivityIntensity;
  isOutdoor: boolean;
  baselineExposureUg: number | null;
  optimizedTimeWindow: string | null;
  optimizedExposureUg: number | null;
  reductionPercentage: number | null;
  rationale: string;
  isOptimizationAvailable: boolean;
}

export interface RecommendationPlan {
  city: string;
  generatedAt: string;
  metrics: AtmosphericMetrics;
  category: AQICategory;
  summaryAdvisory: string;
  routineShifts: RoutineItem[];
  corsiRosenthalBox: CorsiRosenthalBoxSpec;
  isAiGenerated?: boolean;
  impactMetrics: {
    totalInhaledBaselineUg: number | null;
    totalInhaledOptimizedUg: number | null;
    netAvoidedPM25Ug: number | null;
    avoidedCigarettesMonthly: number | null;
    carbonSavedKgWeekly?: number | null;
    respiratorySafetyScore?: number | null;
    isImpactCalculated: boolean;
    calculationNote?: string;
  };
}
