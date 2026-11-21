/**
 * Avir Core Domain Types & Interfaces
 */

export type AQICategory = 
  | 'Good'
  | 'Moderate'
  | 'UnhealthySensitive'
  | 'Unhealthy'
  | 'VeryUnhealthy'
  | 'Hazardous'
  | 'Severe';

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
  time: string;
  hour: number;
  pm25: number;
  usAqi: number;
  boundaryLayerHeight: number;
  isSafeVentingWindow: boolean;
  isThermalInversionTrap: boolean;
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
}

export interface EnsembleConsensusAnalysis {
  consensusAqi: number;
  consensusPm25: number;
  aqiMin: number;
  aqiMax: number;
  pm25Min: number;
  pm25Max: number;
  confidenceScorePercent: number; // e.g. 92%
  agreementLevel: 'High Consensus' | 'Moderate Variance' | 'Inversion Spread';
  deviationSpread: number; // +/- AQI
  feeds: MultiSourceTelemetryFeed[];
  summaryNote: string;
}

export interface AtmosphericMetrics {
  timestamp: string;
  usAqi: number;
  pm25: number;       // ug/m3
  pm10: number;       // ug/m3
  co?: number;        // ug/m3
  no2?: number;       // ug/m3
  so2?: number;       // ug/m3
  o3?: number;        // ug/m3
  temperature?: number; // °C
  humidity?: number;    // %
  windSpeed?: number;   // km/h
  windDirection?: number; // degrees
  boundaryLayerHeight: number; // meters
  isThermalInversionActive: boolean;
  isLive?: boolean;
  cpcbAqi?: number;
  cpcbCategory?: string;
  sourceAttribution?: string;
  hourlyForecast?: HourlyAtmosphericPoint[];
  ensemble?: EnsembleConsensusAnalysis;
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
  respiratoryRiskScore: number; // 0 - 100
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
  baselineExposureUg: number;
  optimizedTimeWindow: string;
  optimizedExposureUg: number;
  reductionPercentage: number;
  rationale: string;
}

export interface RecommendationPlan {
  city: string;
  generatedAt: string;
  metrics: AtmosphericMetrics;
  category: AQICategory;
  summaryAdvisory: string;
  routineShifts: RoutineItem[];
  corsiRosenthalBox: CorsiRosenthalBoxSpec;
  impactMetrics: {
    totalInhaledBaselineUg: number;
    totalInhaledOptimizedUg: number;
    netAvoidedPM25Ug: number;
    avoidedCigarettesMonthly: number;
    carbonSavedKgWeekly: number;
    respiratorySafetyScore: number;
  };
}
