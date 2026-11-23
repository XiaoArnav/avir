/**
 * Avir AI Planning Request Validator & Privacy Data Minimizer
 * Step 16 & Step 22: Request Schema Validation & Health Data Minimization
 * Cross-Phase Hardening: Eliminates Defect D-SEC-02 (Asymmetric Request Validation)
 */

import { GeneralizedSensitivity, PlanApiRequestPayload } from '@/domain/planning-types';
import { validateDailySchedule } from '@/domain/routine-types';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validates a modern Step 16+ plan request payload (schedule-based).
 */
export function validatePlanRequestPayload(payload: any): ValidationResult {
  const errors: string[] = [];

  if (!payload || typeof payload !== 'object') {
    return { isValid: false, errors: ['Request body must be a non-null JSON object.'] };
  }

  // 1. City validation
  if (!payload.city || typeof payload.city !== 'string' || payload.city.trim().length === 0) {
    errors.push('City name is required and must be a non-empty string.');
  } else if (payload.city.length > 100) {
    errors.push('City name must not exceed 100 characters.');
  }

  // 2. Coordinates validation
  if (
    !payload.coordinates ||
    typeof payload.coordinates !== 'object' ||
    typeof payload.coordinates.lat !== 'number' ||
    typeof payload.coordinates.lng !== 'number' ||
    !Number.isFinite(payload.coordinates.lat) ||
    !Number.isFinite(payload.coordinates.lng) ||
    isNaN(payload.coordinates.lat) ||
    isNaN(payload.coordinates.lng)
  ) {
    errors.push('Coordinates must include numeric lat and lng properties.');
  } else {
    if (payload.coordinates.lat < -90 || payload.coordinates.lat > 90) {
      errors.push('Latitude must be between -90 and +90 degrees.');
    }
    if (payload.coordinates.lng < -180 || payload.coordinates.lng > 180) {
      errors.push('Longitude must be between -180 and +180 degrees.');
    }
  }

  // 3. Schedule validation
  if (!payload.schedule || typeof payload.schedule !== 'object') {
    errors.push('A valid daily schedule object is required.');
  } else {
    if (Array.isArray(payload.schedule.activities)) {
      if (payload.schedule.activities.length > 15) {
        errors.push('Schedule activity count exceeds limit (maximum 15 activities allowed per request).');
      }
    }
    const scheduleValidation = validateDailySchedule(payload.schedule);
    if (!scheduleValidation.isValid) {
      errors.push(...scheduleValidation.errors);
    }
  }

  // 4. Sensitivity tier validation
  const validTiers: GeneralizedSensitivity[] = ['standard', 'sensitive', 'highly_sensitive'];
  if (payload.generalizedSensitivity && !validTiers.includes(payload.generalizedSensitivity)) {
    errors.push(`Invalid sensitivity tier "${payload.generalizedSensitivity}". Expected one of: ${validTiers.join(', ')}.`);
  }

  // 5. Hourly forecast series validation if provided
  if (payload.hourlyForecast !== undefined && payload.hourlyForecast !== null) {
    if (!Array.isArray(payload.hourlyForecast)) {
      errors.push('Hourly forecast must be an array of forecast points.');
    } else if (payload.hourlyForecast.length > 72) {
      errors.push('Hourly forecast length cannot exceed 72 hours.');
    } else {
      for (let i = 0; i < payload.hourlyForecast.length; i++) {
        const pt = payload.hourlyForecast[i];
        if (!pt || typeof pt !== 'object') {
          errors.push(`Forecast point at index ${i} must be an object.`);
          break;
        }
        if (pt.pm25 !== undefined && pt.pm25 !== null) {
          if (typeof pt.pm25 !== 'number' || !Number.isFinite(pt.pm25) || isNaN(pt.pm25) || pt.pm25 < 0) {
            errors.push(`Forecast point at index ${i} has invalid PM2.5 value.`);
            break;
          }
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a legacy Phase A plan generation request payload.
 * Eliminates Defect D-SEC-02 (Asymmetric Request Validation).
 */
export function validateLegacyPlanRequestPayload(payload: any): ValidationResult {
  const errors: string[] = [];

  if (!payload || typeof payload !== 'object') {
    return { isValid: false, errors: ['Request body must be a non-null JSON object.'] };
  }

  // 1. City validation
  if (!payload.city || typeof payload.city !== 'string' || payload.city.trim().length === 0) {
    errors.push('City name is required and must be a non-empty string.');
  } else if (payload.city.length > 100) {
    errors.push('City name must not exceed 100 characters.');
  }

  // 2. Metrics validation
  if (!payload.metrics || typeof payload.metrics !== 'object') {
    errors.push('Environmental metrics are required and must be an object.');
  } else {
    const { pm25, pm10, usAqi, no2, so2, co, o3 } = payload.metrics;

    // Check pm25
    if (pm25 !== undefined && pm25 !== null) {
      if (typeof pm25 !== 'number' || !Number.isFinite(pm25) || isNaN(pm25)) {
        errors.push('PM2.5 must be a valid finite number.');
      } else if (pm25 < 0 || pm25 > 2000) {
        errors.push('PM2.5 concentration must be between 0 and 2000 µg/m³.');
      }
    }

    // Check pm10
    if (pm10 !== undefined && pm10 !== null) {
      if (typeof pm10 !== 'number' || !Number.isFinite(pm10) || isNaN(pm10)) {
        errors.push('PM10 must be a valid finite number.');
      } else if (pm10 < 0 || pm10 > 3000) {
        errors.push('PM10 concentration must be between 0 and 3000 µg/m³.');
      }
    }

    // Check usAqi
    if (usAqi !== undefined && usAqi !== null) {
      if (typeof usAqi !== 'number' || !Number.isFinite(usAqi) || isNaN(usAqi)) {
        errors.push('US AQI must be a valid finite number.');
      } else if (usAqi < 0 || usAqi > 1000) {
        errors.push('US AQI must be between 0 and 1000.');
      }
    }

    // Check gaseous pollutants if present
    for (const [name, val] of Object.entries({ no2, so2, co, o3 })) {
      if (val !== undefined && val !== null) {
        if (typeof val !== 'number' || !Number.isFinite(val) || isNaN(val) || (val as number) < 0) {
          errors.push(`${name.toUpperCase()} concentration must be a non-negative finite number.`);
        }
      }
    }
  }

  // 3. Room size validation
  if (payload.roomSizeSqFt !== undefined && payload.roomSizeSqFt !== null) {
    if (typeof payload.roomSizeSqFt !== 'number' || !Number.isFinite(payload.roomSizeSqFt) || isNaN(payload.roomSizeSqFt)) {
      errors.push('Room size must be a valid finite number.');
    } else if (payload.roomSizeSqFt < 20 || payload.roomSizeSqFt > 10000) {
      errors.push('Room size must be between 20 and 10,000 sq ft.');
    }
  }

  // 4. Custom routine validation
  if (payload.customRoutine !== undefined && payload.customRoutine !== null) {
    if (typeof payload.customRoutine !== 'string') {
      errors.push('Custom routine must be a string.');
    } else if (payload.customRoutine.length > 1000) {
      errors.push('Custom routine must not exceed 1000 characters.');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Transforms sensitive clinical health records into a generalized sensitivity category.
 * Eliminates Defect B-011 (Sensitive Profile Transmission).
 * 
 * Never serializes or passes raw disease names (Asthma, COPD, Angina, Pregnancy) to external LLMs.
 */
export function sanitizeUserHealthContext(profile: {
  hasAsthmaOrRespiratory?: boolean;
  hasCardiovascularCondition?: boolean;
  isPregnant?: boolean;
  ageGroup?: string;
}): GeneralizedSensitivity {
  if (!profile) return 'standard';

  const isHighRiskAge = profile.ageGroup === 'child' || profile.ageGroup === 'senior';
  const hasMultipleConditions =
    (profile.hasAsthmaOrRespiratory && profile.hasCardiovascularCondition) ||
    (profile.hasAsthmaOrRespiratory && profile.isPregnant) ||
    (profile.hasCardiovascularCondition && profile.isPregnant);

  if (hasMultipleConditions || (isHighRiskAge && (profile.hasAsthmaOrRespiratory || profile.hasCardiovascularCondition))) {
    return 'highly_sensitive';
  }

  if (profile.hasAsthmaOrRespiratory || profile.hasCardiovascularCondition || profile.isPregnant || isHighRiskAge) {
    return 'sensitive';
  }

  return 'standard';
}
