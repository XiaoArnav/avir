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

export type GroundStationState =
  | 'registry_only'
  | 'live_observation'
  | 'stale_observation'
  | 'measurement_unavailable';

export interface VerifiedStationIdentity {
  internalId: string;
  sourceProvider: string;
  officialStationId: string | null;
  stationName: string;
  operatingAgency: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  registryVerified: boolean;
  sourceReference: string;
}

export type OfficialProviderStatus =
  | 'available'
  | 'not_configured'
  | 'unauthorized'
  | 'rate_limited'
  | 'no_coverage'
  | 'stale'
  | 'upstream_error'
  | 'schema_changed'
  | 'unavailable'
  | 'partial'
  | 'untimed';

export interface OfficialGroundProviderResult {
  providerId: string;
  status: OfficialProviderStatus;
  sources: EnvironmentalSourceRecord[];
  retrievedAt: string;
  observedThrough: string | null;
  activeStationCount: number;
  activePm25Count: number;
  activePm10Count: number;
  availableStationCount?: number;
  isPartial?: boolean;
  totalReported?: number;
  totalFetched?: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface GroundStationMetadata {
  stationId: string | number;
  stationName: string;
  distanceKm: number | null;
  latitude: number | null;
  longitude: number | null;
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
  co?: number | null;
  no2?: number | null;
  so2?: number | null;
  o3?: number | null;
}

export interface GroundModelDelta {
  groundPm25: number;
  modelPm25: number;
  deltaPercent: number; // e.g. +65%
  divergenceType: 'ground_trapping' | 'model_overestimate' | 'aligned' | 'higher_than_model' | 'lower_than_model';
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

export type AqiMethod =
  | 'provider_reported'
  | 'epa_pm25_24h_subindex'
  | 'epa_pm25_nowcast'
  | 'cpcb_official_published'
  | 'cpcb_derived_indicative'
  | 'cpcb_statutory_eligible'
  | 'unavailable';

export interface AqiEvidence {
  indexValue: number | null;
  standard: 'US_EPA' | 'IN_CPCB';
  method: AqiMethod;
  classification: string;
  sourceProvider: string | null;
  pollutantCount: number;
  averagingVerified: boolean;
  isOfficialPublished: boolean;
  missingRequirements: string[];
  standardVersion: string;
  notes?: string;
}

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
  relativeHumidity?: number | null;
  windSpeed?: number | null;
  isForecast: boolean;    // true if future hour, false if past/current observation
  isSafeVentingWindow?: boolean;
  isStagnantDispersion?: boolean; // low boundary layer height (<200m)
  validAtUtc?: string;
  timezone?: string;
  localDisplayTime?: string;
  localDisplayDate?: string;
  completeness?: 'complete' | 'partial' | 'unavailable';
  sourceAttribution?: string;
  isModel?: boolean;
}

// ---------------------------------------------------------------------------
// Canonical Environmental Multi-Source & Provenance Model (Step 3/24)
// ---------------------------------------------------------------------------

export type EnvironmentalSourceKind =
  | 'physical_observation'
  | 'official_ground_station'
  | 'atmospheric_model'
  | 'community_optical'
  | 'user_hardware'
  | 'satellite_reanalysis'
  | 'derived_standard';

export type EnvironmentalSourceStatus =
  | 'active'
  | 'fresh'
  | 'stale'
  | 'unavailable'
  | 'rejected'
  | 'unreachable'
  | 'error'
  | 'not_configured'
  | 'registry_only';

export interface SourceMeasurement {
  value: number | null;
  pollutant: 'pm25' | 'pm10' | 'o3' | 'no2' | 'so2' | 'co' | 'nh3' | 'pb' | 'aqi_derived';
  unit: string;
  averagingPeriodMinutes?: number | null;
  observedAt?: string | null;
  validAt?: string | null;
  receivedAt?: string | null;
  rawUncalibratedValue?: number | null;
  calibrationApplied?: string | null;
  qualityFlag?: 'valid' | 'suspect' | 'calibrated' | 'raw' | 'rejected';
  min?: number | null;
  max?: number | null;
}

export interface EnvironmentalSourceRecord {
  id: string;
  providerId: string;
  providerName: string;
  provider?: string;
  upstreamProviderId?: string | null;
  datasetId?: string | null;
  stationId?: string | null;
  sourceName: string;
  name?: string;
  sourceKind: EnvironmentalSourceKind;
  providerKind?: EnvironmentalSourceKind;
  status: EnvironmentalSourceStatus;
  latitude: number | null;
  longitude: number | null;
  distanceKm: number | null;
  coordinates?: {
    latitude: number;
    longitude: number;
    distanceKm?: number | null;
  } | null;
  observedAt: string | null;
  measuredAt?: string | null;
  validAt?: string | null;
  retrievedAt: string | null;
  ingestedAt?: string;
  modelRunAt?: string | null;
  measurements: SourceMeasurement[];
  attribution: string;
  explanation?: string | null;
  errorCode?: string | null;
  provenance: {
    network?: string | null;
    licenseOrAttribution: string;
    url?: string | null;
    reportingLatencyMinutes?: number | null;
    isModel: boolean;
    limitations: string[];
  };
}

export type SourceComparisonStatus =
  | 'insufficient_sources'
  | 'incompatible'
  | 'comparable'
  | 'partial';

export type SourceComparisonMode =
  | 'mode_a_single_source'
  | 'mode_b_incompatible'
  | 'mode_c_comparable';

export interface ComparedSourceItem {
  sourceId: string;
  provider: string;
  name: string;
  value: number;
  unit: string;
  measuredAt: string | null;
  validAt?: string | null;
  distanceKm?: number | null;
  averagingPeriodMinutes?: number | null;
  kind: EnvironmentalSourceKind;
  isModel?: boolean;
}

export interface SourceComparison {
  targetPollutant: 'pm25' | 'pm10';
  mode: SourceComparisonMode;
  status: SourceComparisonStatus;
  sourcesCompared: ComparedSourceItem[];
  eligibleSourceIds: string[];
  excludedSourceIds: string[];
  reasons: string[];
  incompatibilityReasons?: string[];
  absoluteDifferenceUgM3: number | null;
  absoluteDifference?: number | null;
  relativeDifferencePercent: number | null;
  minConcentration: number | null;
  maxConcentration: number | null;
  summary: string;
  divergenceReason?: string | null;
  comparedAt: string | null;
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
  cpcbStatus?: 'statutory_compliant' | 'indicative_subindex' | 'indicative_snapshot' | 'unavailable';
  aqiEvidence?: AqiEvidence;
  cpcbEvidence?: AqiEvidence;
  sourceAttribution?: string;
  hourlyForecast?: HourlyAtmosphericPoint[];
  ensemble?: EnsembleConsensusAnalysis;
  availability?: MetricAvailability;

  // Genuine Multi-Source Monitoring & Provenance (Step 3/24)
  environmentalSources?: EnvironmentalSourceRecord[];
  sourceComparison?: SourceComparison | null;
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
    avoidedCigarettesMonthly?: number | null;
    carbonSavedKgWeekly?: number | null;
    respiratorySafetyScore?: number | null;
    isImpactCalculated: boolean;
    calculationNote?: string;
  };
}
