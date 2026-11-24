/**
 * Environmental Decision Context & Structured Explanation Engine (Phase 2)
 *
 * Aggregates validated, multi-modal environmental intelligence for personalized AI planning:
 * - City metadata & optional verified coordinates (never fabricated)
 * - Environmental data source provenance & freshness (never fabricated)
 * - Current pollutant concentrations & explicit AQI standard consistency
 * - Hourly forecast series & boundary layer dynamics
 * - Weather conditions (temperature, humidity, wind speed/direction)
 * - Active fire hotspots summary (context only, zero unverified causation)
 * - User activity schedule & generalized sensitivity tier
 * - Indoor air filtration & commute context
 *
 * Guarantees:
 * - Data Minimization: Zero raw medical records transmitted.
 * - Strict Invariant: Quantitative calculations remain deterministic.
 * - Zero Fabrication: Missing location, freshness, source type, or pollutant data stays null/unavailable.
 */

import { GeneralizedSensitivity } from '@/domain/planning-types';
import {
  ActivityEnvironment,
  calculateActivityDurationMinutes,
  parseTimeStringToMinutes,
} from '@/domain/routine-types';
import { ValidationResult } from '@/services/ai/plan-validator';

export type DecisionSourceType =
  | 'physical_monitor'
  | 'atmospheric_model'
  | 'derived_consensus'
  | 'client_supplied'
  | 'unknown';

export interface EnvironmentalDecisionContext {
  city: {
    name: string;
    latitude: number | null;
    longitude: number | null;
    country?: string | null;
    timezone?: string | null;
  };
  source: {
    provider: string; // e.g., 'CPCB', 'OpenAQ', 'Open-Meteo CAMS', 'Unavailable'
    sourceType?: DecisionSourceType;
    stationName?: string | null;
    distanceKm?: number | null;
    observationTime?: string | null;
    freshnessHours?: number | null;
    isModel: boolean | null;
    uncertaintyNotes?: string[];
  };
  currentPollutants: {
    pm25?: number | null;
    pm10?: number | null;
    aqi?: number | null;
    aqiStandard: 'cpcb' | 'epa' | 'unavailable';
    pm25Unit?: 'µg/m³' | 'ug/m3';
    pm10Unit?: 'µg/m³' | 'ug/m3';
    units?: {
      pm25?: 'µg/m³' | 'ug/m3';
      pm10?: 'µg/m³' | 'ug/m3';
    };
    category?: string | null;
    dominantPollutant?: string | null;
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
    id?: string;
    name?: string;
    timezone?: string;
    activities: Array<{
      id: string;
      name: string;
      startTime: string; // HH:mm
      endTime: string; // HH:mm
      locationType?: 'indoor' | 'outdoor' | 'in_transit';
      environment?: ActivityEnvironment;
      intensity?: 'resting' | 'light' | 'moderate' | 'vigorous';
    }>;
  };
  hourlyForecast?: Array<{
    time: string;
    pm25?: number | null;
    aqi?: number | null;
    windSpeedKmh?: number | null;
    boundaryLayerHeight?: number | null;
    units?: 'µg/m³' | 'ug/m3';
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
  explanationSource: 'hybrid_summary_llm' | 'llm_generated' | 'deterministic_fallback';
  summarySource?: 'llm_generated' | 'deterministic_fallback';
  recommendationsSource?: 'deterministic';
}

const VALID_SENSITIVITY_TIERS: readonly GeneralizedSensitivity[] = [
  'standard',
  'sensitive',
  'highly_sensitive',
];
const VALID_COMMUTE_MODES = ['walking', 'cycling', 'transit', 'driving', 'mixed'] as const;
const VALID_PURIFICATION_MODES = [
  'hepa_purifier',
  'ac_with_filter',
  'natural_ventilation',
  'unknown',
] as const;
const VALID_SOURCE_TYPES: readonly DecisionSourceType[] = [
  'physical_monitor',
  'atmospheric_model',
  'derived_consensus',
  'client_supplied',
  'unknown',
];
const VALID_VENTILATION_INDICES = ['good', 'moderate', 'poor', 'stagnant'] as const;
const VALID_PM_UNITS = ['µg/m³', 'ug/m3'] as const;
const VALID_LOCATION_TYPES = ['indoor', 'outdoor', 'in_transit'] as const;
const VALID_ENVIRONMENTS: readonly ActivityEnvironment[] = [
  'outdoor',
  'indoor_unfiltered',
  'indoor_clean',
  'transit_car',
  'transit_bus',
  'transit_metro',
  'transit_active',
];
const VALID_INTENSITIES = ['resting', 'light', 'moderate', 'vigorous'] as const;

const FORBIDDEN_RAW_MEDICAL_KEYS = [
  'profile',
  'hasAsthmaOrRespiratory',
  'hasCardiovascularCondition',
  'isPregnant',
  'isOutdoorWorker',
  'medicalHistory',
  'diagnosis',
  'diagnoses',
  'medications',
];

function isPlainObject(value: unknown): value is Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isFiniteInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function hasUnknownKeys(obj: Record<string, any>, allowed: readonly string[]): string[] {
  return Object.keys(obj).filter((k) => !allowed.includes(k));
}

function isUnverifiedProviderLabel(provider: string): boolean {
  const normalized = provider.trim().toLowerCase();
  return (
    /\b(unknown|unverified|unavailable)\b/.test(normalized) ||
    normalized === 'client-supplied ambient source'
  );
}

/**
 * Validates the EnvironmentalDecisionContext against strict scientific, temporal, and structural constraints.
 */
export function validateDecisionContext(context: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isPlainObject(context)) {
    return { isValid: false, errors: ['Decision context must be a plain non-null object.'] };
  }

  const allowedRootKeys = [
    'city',
    'source',
    'currentPollutants',
    'weather',
    'fireHotspotSummary',
    'userContext',
    'schedule',
    'hourlyForecast',
  ];
  const unexpectedRoot = hasUnknownKeys(context, allowedRootKeys);
  if (unexpectedRoot.length > 0) {
    errors.push(`Unexpected top-level decisionContext fields: ${unexpectedRoot.join(', ')}.`);
  }

  // 1. City & Coordinate validation
  if (!isPlainObject(context.city)) {
    errors.push('City object is required.');
  } else {
    const unexpectedCity = hasUnknownKeys(context.city, [
      'name',
      'latitude',
      'longitude',
      'country',
      'timezone',
    ]);
    if (unexpectedCity.length > 0) {
      errors.push(`Unexpected city fields: ${unexpectedCity.join(', ')}.`);
    }

    if (
      typeof context.city.name !== 'string' ||
      context.city.name.trim().length === 0 ||
      context.city.name.length > 120
    ) {
      errors.push('City name must be a non-empty string under 120 characters.');
    }

    const latProvided = context.city.latitude !== undefined && context.city.latitude !== null;
    const lngProvided = context.city.longitude !== undefined && context.city.longitude !== null;
    if (latProvided !== lngProvided) {
      errors.push('City latitude and longitude must both be provided or both omitted/null.');
    } else if (latProvided && lngProvided) {
      if (!isFiniteInRange(context.city.latitude, -90, 90)) {
        errors.push('City latitude must be a finite number between -90 and 90.');
      }
      if (!isFiniteInRange(context.city.longitude, -180, 180)) {
        errors.push('City longitude must be a finite number between -180 and 180.');
      }
    }

    if (context.city.country !== undefined && context.city.country !== null) {
      if (
        typeof context.city.country !== 'string' ||
        context.city.country.trim().length === 0 ||
        context.city.country.length > 100
      ) {
        errors.push('City country must be a non-empty string under 100 characters.');
      }
    }

    if (context.city.timezone !== undefined && context.city.timezone !== null) {
      if (
        typeof context.city.timezone !== 'string' ||
        context.city.timezone.trim().length === 0 ||
        context.city.timezone.length > 100 ||
        !isValidTimeZone(context.city.timezone.trim())
      ) {
        errors.push('City timezone must be a valid IANA timezone string.');
      }
    }
  }

  // 2. Source identity, classification, timestamp & freshness validation
  if (!isPlainObject(context.source)) {
    errors.push('Source object is required.');
  } else {
    const unexpectedSource = hasUnknownKeys(context.source, [
      'provider',
      'sourceType',
      'stationName',
      'distanceKm',
      'observationTime',
      'freshnessHours',
      'isModel',
      'uncertaintyNotes',
    ]);
    if (unexpectedSource.length > 0) {
      errors.push(`Unexpected source fields: ${unexpectedSource.join(', ')}.`);
    }

    if (
      typeof context.source.provider !== 'string' ||
      context.source.provider.trim().length === 0 ||
      context.source.provider.length > 200
    ) {
      errors.push('Source provider must be a non-empty string under 200 characters.');
    }

    if (
      context.source.isModel !== null &&
      typeof context.source.isModel !== 'boolean'
    ) {
      errors.push('Source isModel must be a boolean or null (when unknown).');
    }

    if (context.source.sourceType !== undefined && context.source.sourceType !== null) {
      if (!VALID_SOURCE_TYPES.includes(context.source.sourceType)) {
        errors.push(`Invalid sourceType "${context.source.sourceType}".`);
      } else if (context.source.sourceType === 'unknown' && context.source.isModel !== null) {
        errors.push('Unknown sourceType must keep isModel as null.');
      }
    }

    if (
      typeof context.source.provider === 'string' &&
      isUnverifiedProviderLabel(context.source.provider) &&
      context.source.isModel !== null
    ) {
      errors.push('Unknown or unavailable source provider cannot be classified as a model or physical monitor.');
    }

    if (context.source.stationName !== undefined && context.source.stationName !== null) {
      if (typeof context.source.stationName !== 'string' || context.source.stationName.length > 200) {
        errors.push('Source stationName must be a string under 200 characters.');
      }
    }

    if (context.source.distanceKm !== undefined && context.source.distanceKm !== null) {
      if (!isFiniteInRange(context.source.distanceKm, 0, 20038)) {
        errors.push('Source distanceKm must be a finite number between 0 and 20038.');
      }
    }

    if (context.source.observationTime !== undefined && context.source.observationTime !== null) {
      if (
        typeof context.source.observationTime !== 'string' ||
        context.source.observationTime.trim().length === 0 ||
        Number.isNaN(Date.parse(context.source.observationTime))
      ) {
        errors.push('Source observationTime must be a valid ISO-8601 timestamp string.');
      }
    }

    if (context.source.freshnessHours !== undefined && context.source.freshnessHours !== null) {
      if (!isFiniteInRange(context.source.freshnessHours, 0, 8760)) {
        errors.push('Source freshnessHours must be a finite non-negative number.');
      }
    }

    if (context.source.uncertaintyNotes !== undefined && context.source.uncertaintyNotes !== null) {
      if (
        !Array.isArray(context.source.uncertaintyNotes) ||
        context.source.uncertaintyNotes.length > 20 ||
        !context.source.uncertaintyNotes.every(
          (n) => typeof n === 'string' && n.length > 0 && n.length <= 300
        )
      ) {
        errors.push('Source uncertaintyNotes must be an array of non-empty strings.');
      }
    }
  }

  // 3. Current Pollutants, Units & AQI Standard validation
  if (!isPlainObject(context.currentPollutants)) {
    errors.push('currentPollutants object is required.');
  } else {
    const unexpectedPollutants = hasUnknownKeys(context.currentPollutants, [
      'pm25',
      'pm10',
      'aqi',
      'aqiStandard',
      'pm25Unit',
      'pm10Unit',
      'units',
      'category',
      'dominantPollutant',
    ]);
    if (unexpectedPollutants.length > 0) {
      errors.push(`Unexpected currentPollutants fields: ${unexpectedPollutants.join(', ')}.`);
    }

    const { pm25, pm10, aqi, aqiStandard, pm25Unit, pm10Unit, units, category, dominantPollutant } =
      context.currentPollutants;

    if (pm25 !== undefined && pm25 !== null && !isFiniteInRange(pm25, 0, 2000)) {
      errors.push('Current PM2.5 must be a finite number between 0 and 2000 µg/m³.');
    }
    if (pm10 !== undefined && pm10 !== null && !isFiniteInRange(pm10, 0, 3000)) {
      errors.push('Current PM10 must be a finite number between 0 and 3000 µg/m³.');
    }
    if (aqi !== undefined && aqi !== null && !isFiniteInRange(aqi, 0, 1000)) {
      errors.push('Current AQI must be a finite number between 0 and 1000.');
    }

    const hasNumericAqi = aqi !== undefined && aqi !== null;
    if (hasNumericAqi) {
      if (aqiStandard !== 'cpcb' && aqiStandard !== 'epa') {
        errors.push('aqiStandard must be "cpcb" or "epa" when AQI value is provided.');
      }
    } else if (aqiStandard !== 'cpcb' && aqiStandard !== 'epa' && aqiStandard !== 'unavailable') {
      errors.push('aqiStandard must be "cpcb", "epa", or "unavailable".');
    }

    if (pm25Unit !== undefined && pm25Unit !== null && !VALID_PM_UNITS.includes(pm25Unit)) {
      errors.push(`Unsupported PM2.5 unit "${pm25Unit}". Expected "µg/m³" or "ug/m3".`);
    }
    if (pm10Unit !== undefined && pm10Unit !== null && !VALID_PM_UNITS.includes(pm10Unit)) {
      errors.push(`Unsupported PM10 unit "${pm10Unit}". Expected "µg/m³" or "ug/m3".`);
    }
    if (units !== undefined && units !== null) {
      if (!isPlainObject(units)) {
        errors.push('currentPollutants.units must be a plain object.');
      } else {
        if (units.pm25 !== undefined && units.pm25 !== null && !VALID_PM_UNITS.includes(units.pm25)) {
          errors.push(`Unsupported units.pm25 "${units.pm25}". Expected "µg/m³" or "ug/m3".`);
        }
        if (units.pm10 !== undefined && units.pm10 !== null && !VALID_PM_UNITS.includes(units.pm10)) {
          errors.push(`Unsupported units.pm10 "${units.pm10}". Expected "µg/m³" or "ug/m3".`);
        }
      }
    }

    if (category !== undefined && category !== null && (typeof category !== 'string' || category.length > 80)) {
      errors.push('currentPollutants.category must be a string under 80 characters.');
    }
    if (
      dominantPollutant !== undefined &&
      dominantPollutant !== null &&
      (typeof dominantPollutant !== 'string' || dominantPollutant.length > 40)
    ) {
      errors.push('currentPollutants.dominantPollutant must be a string under 40 characters.');
    }
  }

  // 4. User context & generalized sensitivity tier validation
  if (!isPlainObject(context.userContext)) {
    errors.push('userContext is required.');
  } else {
    const rawMedicalFound = FORBIDDEN_RAW_MEDICAL_KEYS.filter((k) => k in context.userContext);
    if (rawMedicalFound.length > 0) {
      errors.push(`Raw medical keys are not permitted in userContext: ${rawMedicalFound.join(', ')}.`);
    }

    const unexpectedUser = hasUnknownKeys(context.userContext, [
      'generalizedSensitivity',
      'commuteMode',
      'indoorAirPurification',
    ]);
    if (unexpectedUser.length > 0) {
      errors.push(`Unexpected userContext fields: ${unexpectedUser.join(', ')}.`);
    }

    if (!VALID_SENSITIVITY_TIERS.includes(context.userContext.generalizedSensitivity)) {
      errors.push(
        `Invalid sensitivity tier "${context.userContext.generalizedSensitivity}". Expected one of: ${VALID_SENSITIVITY_TIERS.join(', ')}.`
      );
    }

    if (
      context.userContext.commuteMode !== undefined &&
      context.userContext.commuteMode !== null &&
      !VALID_COMMUTE_MODES.includes(context.userContext.commuteMode)
    ) {
      errors.push(`Invalid commuteMode "${context.userContext.commuteMode}".`);
    }

    if (
      context.userContext.indoorAirPurification !== undefined &&
      context.userContext.indoorAirPurification !== null &&
      !VALID_PURIFICATION_MODES.includes(context.userContext.indoorAirPurification)
    ) {
      errors.push(`Invalid indoorAirPurification "${context.userContext.indoorAirPurification}".`);
    }
  }

  // 5. Weather validation
  if (context.weather !== undefined && context.weather !== null) {
    if (!isPlainObject(context.weather)) {
      errors.push('Weather must be a plain object when provided.');
    } else {
      const unexpectedWeather = hasUnknownKeys(context.weather, [
        'temperatureC',
        'relativeHumidity',
        'windSpeedKmh',
        'windDirectionDeg',
        'ventilationIndex',
      ]);
      if (unexpectedWeather.length > 0) {
        errors.push(`Unexpected weather fields: ${unexpectedWeather.join(', ')}.`);
      }

      const { temperatureC, relativeHumidity, windSpeedKmh, windDirectionDeg, ventilationIndex } =
        context.weather;
      if (temperatureC !== undefined && temperatureC !== null && !isFiniteInRange(temperatureC, -80, 70)) {
        errors.push('Weather temperature must be a finite number between -80 and 70 °C.');
      }
      if (
        relativeHumidity !== undefined &&
        relativeHumidity !== null &&
        !isFiniteInRange(relativeHumidity, 0, 100)
      ) {
        errors.push('Weather relative humidity must be a finite number between 0 and 100%.');
      }
      if (windSpeedKmh !== undefined && windSpeedKmh !== null && !isFiniteInRange(windSpeedKmh, 0, 300)) {
        errors.push('Weather wind speed must be a finite number between 0 and 300 km/h.');
      }
      if (
        windDirectionDeg !== undefined &&
        windDirectionDeg !== null &&
        !isFiniteInRange(windDirectionDeg, 0, 360)
      ) {
        errors.push('Weather wind direction must be a finite number between 0 and 360 degrees.');
      }
      if (
        ventilationIndex !== undefined &&
        ventilationIndex !== null &&
        !VALID_VENTILATION_INDICES.includes(ventilationIndex)
      ) {
        errors.push(`Invalid weather ventilationIndex "${ventilationIndex}".`);
      }
    }
  }

  // 6. Optional Fire Hotspot summary validation
  if (context.fireHotspotSummary !== undefined && context.fireHotspotSummary !== null) {
    if (!isPlainObject(context.fireHotspotSummary)) {
      errors.push('fireHotspotSummary must be a plain object when provided.');
    } else {
      const { regionalHotspotCount, nearestHotspotKm, disclaimer } = context.fireHotspotSummary;
      if (
        regionalHotspotCount !== undefined &&
        regionalHotspotCount !== null &&
        (!isFiniteInRange(regionalHotspotCount, 0, 100000) || !Number.isInteger(regionalHotspotCount))
      ) {
        errors.push('regionalHotspotCount must be a non-negative integer.');
      }
      if (
        nearestHotspotKm !== undefined &&
        nearestHotspotKm !== null &&
        !isFiniteInRange(nearestHotspotKm, 0, 20038)
      ) {
        errors.push('nearestHotspotKm must be a finite non-negative number.');
      }
      if (disclaimer !== undefined && disclaimer !== null && (typeof disclaimer !== 'string' || disclaimer.length > 500)) {
        errors.push('fireHotspotSummary.disclaimer must be a string under 500 characters.');
      }
    }
  }

  // 7. Optional Schedule & Activity start/end time validation
  if (context.schedule !== undefined && context.schedule !== null) {
    if (!isPlainObject(context.schedule)) {
      errors.push('Schedule must be a plain object when provided.');
    } else if (!Array.isArray(context.schedule.activities)) {
      errors.push('Schedule activities must be an array.');
    } else if (context.schedule.activities.length === 0 || context.schedule.activities.length > 15) {
      errors.push('Schedule activities must contain between 1 and 15 entries.');
    } else {
      for (let i = 0; i < context.schedule.activities.length; i++) {
        const act = context.schedule.activities[i];
        if (!isPlainObject(act)) {
          errors.push(`Schedule activity at index ${i} must be a plain object.`);
          break;
        }
        if (typeof act.id !== 'string' || act.id.trim().length === 0 || act.id.length > 80) {
          errors.push(`Schedule activity ${i} requires a non-empty string id.`);
        }
        if (typeof act.name !== 'string' || act.name.trim().length === 0 || act.name.length > 100) {
          errors.push(`Schedule activity ${i} requires a non-empty string name.`);
        }

        let validTimes = true;
        try {
          parseTimeStringToMinutes(act.startTime);
        } catch {
          errors.push(`Schedule activity ${i} has invalid startTime "${act.startTime}".`);
          validTimes = false;
        }
        try {
          parseTimeStringToMinutes(act.endTime);
        } catch {
          errors.push(`Schedule activity ${i} has invalid endTime "${act.endTime}".`);
          validTimes = false;
        }
        if (validTimes) {
          const duration = calculateActivityDurationMinutes(act.startTime, act.endTime);
          if (duration <= 0 || duration > 1440) {
            errors.push(`Schedule activity ${i} must have a positive duration under 24 hours.`);
          }
        }

        const hasLocType = act.locationType !== undefined && act.locationType !== null;
        const hasEnv = act.environment !== undefined && act.environment !== null;
        if (!hasLocType && !hasEnv) {
          errors.push(`Schedule activity ${i} must specify locationType or environment.`);
        }
        if (hasLocType && !VALID_LOCATION_TYPES.includes(act.locationType)) {
          errors.push(`Schedule activity ${i} has invalid locationType "${act.locationType}".`);
        }
        if (hasEnv && !VALID_ENVIRONMENTS.includes(act.environment)) {
          errors.push(`Schedule activity ${i} has invalid environment "${act.environment}".`);
        }
        if (act.intensity !== undefined && act.intensity !== null && !VALID_INTENSITIES.includes(act.intensity)) {
          errors.push(`Schedule activity ${i} has invalid intensity "${act.intensity}".`);
        }
      }
    }
  }

  // 8. Optional Hourly Forecast timestamps, ordering, duplicates & values validation
  if (context.hourlyForecast !== undefined && context.hourlyForecast !== null) {
    if (!Array.isArray(context.hourlyForecast)) {
      errors.push('hourlyForecast must be an array when provided.');
    } else if (context.hourlyForecast.length > 168) {
      errors.push('hourlyForecast length cannot exceed 168 entries.');
    } else {
      const seenEpochs = new Set<number>();
      let prevEpoch = -Infinity;

      for (let i = 0; i < context.hourlyForecast.length; i++) {
        const pt = context.hourlyForecast[i];
        if (!isPlainObject(pt)) {
          errors.push(`Forecast entry at index ${i} must be a plain object.`);
          break;
        }

        if (typeof pt.time !== 'string' || pt.time.trim().length === 0) {
          errors.push(`Forecast entry at index ${i} must include a valid timestamp string.`);
          break;
        }
        const epoch = Date.parse(pt.time);
        if (Number.isNaN(epoch)) {
          errors.push(`Forecast entry at index ${i} has unparseable timestamp "${pt.time}".`);
          break;
        }
        if (seenEpochs.has(epoch)) {
          errors.push(`Duplicate forecast timestamp "${pt.time}" at index ${i}.`);
          break;
        }
        if (epoch < prevEpoch) {
          errors.push(`Out-of-order forecast timestamp "${pt.time}" at index ${i}.`);
          break;
        }
        seenEpochs.add(epoch);
        prevEpoch = epoch;

        if (pt.pm25 !== undefined && pt.pm25 !== null && !isFiniteInRange(pt.pm25, 0, 2000)) {
          errors.push(`Forecast entry at index ${i} has invalid PM2.5 value.`);
          break;
        }
        if (pt.aqi !== undefined && pt.aqi !== null && !isFiniteInRange(pt.aqi, 0, 1000)) {
          errors.push(`Forecast entry at index ${i} has invalid AQI value.`);
          break;
        }
        if (
          pt.windSpeedKmh !== undefined &&
          pt.windSpeedKmh !== null &&
          !isFiniteInRange(pt.windSpeedKmh, 0, 300)
        ) {
          errors.push(`Forecast entry at index ${i} has invalid windSpeedKmh value.`);
          break;
        }
        if (
          pt.boundaryLayerHeight !== undefined &&
          pt.boundaryLayerHeight !== null &&
          !isFiniteInRange(pt.boundaryLayerHeight, 0, 10000)
        ) {
          errors.push(`Forecast entry at index ${i} has invalid boundaryLayerHeight value.`);
          break;
        }
        if (pt.units !== undefined && pt.units !== null && !VALID_PM_UNITS.includes(pt.units)) {
          errors.push(`Forecast entry at index ${i} has unsupported units "${pt.units}".`);
          break;
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
