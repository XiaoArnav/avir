/**
 * Environmental Decision Context & Structured Explanation Engine (Phase 2)
 * 
 * Aggregates validated, multi-modal environmental intelligence for personalized AI planning:
 * - City metadata & coordinates
 * - Environmental data source provenance & freshness
 * - Current pollutant concentrations & AQI standard
 * - Hourly forecast series & boundary layer dynamics
 * - Weather conditions (temperature, humidity, wind speed/direction)
 * - Active fire hotspots summary (context only, zero unverified causation)
 * - User activity schedule & generalized sensitivity tier
 * - Indoor air filtration & commute context
 * 
 * Guarantees:
 * - Data Minimization: Zero raw medical records transmitted.
 * - Strict Invariant: Quantitative calculations remain deterministic.
 * - Structured Qualitative Explanations: Every recommendation carries action, rationale,
 *   supporting data, applicable window, uncertainty disclosure, and alternative choices.
 */

import { GeneralizedSensitivity } from '@/domain/planning-types';
import { ValidationResult } from '@/services/ai/plan-validator';

export interface EnvironmentalDecisionContext {
  city: {
    name: string;
    latitude: number;
    longitude: number;
    country?: string;
    timezone?: string;
  };
  source: {
    provider: string; // e.g., 'CPCB', 'OpenAQ', 'Open-Meteo CAMS'
    stationName?: string;
    distanceKm?: number;
    observationTime?: string;
    freshnessHours?: number;
    isModel: boolean;
    uncertaintyNotes?: string[];
  };
  currentPollutants: {
    pm25?: number | null;
    pm10?: number | null;
    aqi?: number | null;
    aqiStandard: 'cpcb' | 'epa';
    category?: string;
    dominantPollutant?: string;
  };
  weather?: {
    temperatureC?: number | null;
    relativeHumidity?: number | null;
    windSpeedKmh?: number | null;
    windDirectionDeg?: number | null;
    ventilationIndex?: 'good' | 'moderate' | 'poor' | 'stagnant' | null;
  };
  fireHotspotSummary?: {
    regionalHotspotCount?: number;
    nearestHotspotKm?: number | null;
    disclaimer?: string;
  };
  userContext: {
    generalizedSensitivity: GeneralizedSensitivity;
    commuteMode?: 'walking' | 'cycling' | 'transit' | 'driving' | 'mixed';
    indoorAirPurification?: 'hepa_purifier' | 'ac_with_filter' | 'natural_ventilation' | 'unknown';
  };
  schedule?: {
    activities: Array<{
      id: string;
      name: string;
      startTime: string; // HH:mm
      endTime: string;   // HH:mm
      locationType: 'indoor' | 'outdoor' | 'in_transit';
      intensity?: 'light' | 'moderate' | 'vigorous';
    }>;
  };
  hourlyForecast?: Array<{
    time: string;
    pm25?: number | null;
    aqi?: number | null;
    windSpeedKmh?: number | null;
    boundaryLayerHeight?: number | null;
  }>;
}

export interface ActionableRecommendation {
  id: string;
  action: string;
  category: 'outdoor_activity' | 'commuting' | 'indoor_air' | 'sensitive_group' | 'sustainable_habit';
  why: string;
  supportingData: string;
  applicableWindow?: string;
  uncertainty: string;
  alternativeChoice: string;
  evidenceProvenance: string;
}

export interface StructuredPlanExplanation {
  situationSummary: string;
  actionableRecommendations: ActionableRecommendation[];
  scheduleAdjustments: Array<{
    activityName: string;
    originalTime: string;
    proposedTime: string;
    rationale: string;
  }>;
  indoorGuidance: {
    ventilationAdvice: string;
    filtrationAdvice: string;
    caution: string;
  };
  commuteAdvice: {
    recommendation: string;
    lowerExposureOption: string;
  };
  evidenceReferences: string[];
  uncertaintyDisclosure: string;
  safetyLimitations: string[];
  modelAttribution: string;
  generatedAt: string;
  isDeterministicVerified: boolean;
  explanationSource: 'llm_generated' | 'deterministic_fallback';
}

/**
 * Validates the EnvironmentalDecisionContext against strict safety constraints.
 */
export function validateDecisionContext(context: any): ValidationResult {
  const errors: string[] = [];

  if (!context || typeof context !== 'object') {
    return { isValid: false, errors: ['Decision context must be a non-null object.'] };
  }

  // 1. City validation
  if (!context.city || typeof context.city !== 'object') {
    errors.push('City object is required.');
  } else {
    if (!context.city.name || typeof context.city.name !== 'string' || context.city.name.trim().length === 0) {
      errors.push('City name is required.');
    }
    if (typeof context.city.latitude !== 'number' || !Number.isFinite(context.city.latitude) ||
        context.city.latitude < -90 || context.city.latitude > 90) {
      errors.push('City latitude must be a valid number between -90 and 90.');
    }
    if (typeof context.city.longitude !== 'number' || !Number.isFinite(context.city.longitude) ||
        context.city.longitude < -180 || context.city.longitude > 180) {
      errors.push('City longitude must be a valid number between -180 and 180.');
    }
  }

  // 2. Source validation
  if (!context.source || typeof context.source !== 'object') {
    errors.push('Source object is required.');
  } else {
    if (!context.source.provider || typeof context.source.provider !== 'string') {
      errors.push('Source provider must be specified.');
    }
    if (context.source.freshnessHours !== undefined && context.source.freshnessHours !== null) {
      if (typeof context.source.freshnessHours !== 'number' || context.source.freshnessHours < 0) {
        errors.push('Source freshnessHours must be a non-negative number.');
      }
    }
  }

  // 3. Current Pollutants validation
  if (!context.currentPollutants || typeof context.currentPollutants !== 'object') {
    errors.push('currentPollutants object is required.');
  } else {
    const { pm25, pm10, aqi, aqiStandard } = context.currentPollutants;
    if (pm25 !== undefined && pm25 !== null && (typeof pm25 !== 'number' || pm25 < 0 || pm25 > 2000)) {
      errors.push('Current PM2.5 must be between 0 and 2000 µg/m³.');
    }
    if (pm10 !== undefined && pm10 !== null && (typeof pm10 !== 'number' || pm10 < 0 || pm10 > 3000)) {
      errors.push('Current PM10 must be between 0 and 3000 µg/m³.');
    }
    if (aqi !== undefined && aqi !== null && (typeof aqi !== 'number' || aqi < 0 || aqi > 1000)) {
      errors.push('Current AQI must be between 0 and 1000.');
    }
    if (aqiStandard !== 'cpcb' && aqiStandard !== 'epa') {
      errors.push('aqiStandard must be either "cpcb" or "epa".');
    }
  }

  // 4. User context validation
  if (!context.userContext || typeof context.userContext !== 'object') {
    errors.push('userContext is required.');
  } else {
    const validTiers: GeneralizedSensitivity[] = ['standard', 'sensitive', 'highly_sensitive'];
    if (!validTiers.includes(context.userContext.generalizedSensitivity)) {
      errors.push(`Invalid sensitivity tier "${context.userContext.generalizedSensitivity}". Expected one of: ${validTiers.join(', ')}.`);
    }
  }

  // 5. Weather validation
  if (context.weather && typeof context.weather === 'object') {
    const { temperatureC, relativeHumidity, windSpeedKmh, windDirectionDeg } = context.weather;
    if (temperatureC !== undefined && temperatureC !== null && (typeof temperatureC !== 'number' || temperatureC < -80 || temperatureC > 70)) {
      errors.push('Weather temperature must be between -80 and 70 °C.');
    }
    if (relativeHumidity !== undefined && relativeHumidity !== null && (typeof relativeHumidity !== 'number' || relativeHumidity < 0 || relativeHumidity > 100)) {
      errors.push('Weather relative humidity must be between 0 and 100%.');
    }
    if (windSpeedKmh !== undefined && windSpeedKmh !== null && (typeof windSpeedKmh !== 'number' || windSpeedKmh < 0 || windSpeedKmh > 300)) {
      errors.push('Weather wind speed must be between 0 and 300 km/h.');
    }
    if (windDirectionDeg !== undefined && windDirectionDeg !== null && (typeof windDirectionDeg !== 'number' || windDirectionDeg < 0 || windDirectionDeg > 360)) {
      errors.push('Weather wind direction must be between 0 and 360 degrees.');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
