/**
 * Avir AI Planning Request Validator & Privacy Data Minimizer
 * Step 16 & Step 22: Request Schema Validation & Health Data Minimization
 * Cross-Phase Hardening: Eliminates Defect D-SEC-02 (Asymmetric Request Validation)
 */

import { GeneralizedSensitivity } from '@/domain/planning-types';
import { DailySchedule, validateDailySchedule } from '@/domain/routine-types';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Validates a modern Step 16+ plan request payload (schedule-based).
 */
export function validatePlanRequestPayload(payload: unknown): ValidationResult {
  const errors: string[] = [];
  const obj = asRecord(payload);

  if (!obj) {
    return { isValid: false, errors: ['Request body must be a non-null JSON object.'] };
  }

  // 1. City validation
  if (!obj.city || typeof obj.city !== 'string' || obj.city.trim().length === 0) {
    errors.push('City name is required and must be a non-empty string.');
  } else if (obj.city.length > 100) {
    errors.push('City name must not exceed 100 characters.');
  }

  // 2. Coordinates validation
  const coords = asRecord(obj.coordinates);
  if (
    !coords ||
    typeof coords.lat !== 'number' ||
    typeof coords.lng !== 'number' ||
    !Number.isFinite(coords.lat) ||
    !Number.isFinite(coords.lng) ||
    isNaN(coords.lat) ||
    isNaN(coords.lng)
  ) {
    errors.push('Coordinates must include numeric lat and lng properties.');
  } else {
    if (coords.lat < -90 || coords.lat > 90) {
      errors.push('Latitude must be between -90 and +90 degrees.');
    }
    if (coords.lng < -180 || coords.lng > 180) {
      errors.push('Longitude must be between -180 and +180 degrees.');
    }
  }

  // 3. Schedule validation
  const scheduleObj = asRecord(obj.schedule);
  if (!scheduleObj) {
    errors.push('A valid daily schedule object is required.');
  } else {
    if (Array.isArray(scheduleObj.activities)) {
      if (scheduleObj.activities.length > 15) {
        errors.push('Schedule activity count exceeds limit (maximum 15 activities allowed per request).');
      }
    }
    const scheduleValidation = validateDailySchedule(scheduleObj as unknown as DailySchedule);
    if (!scheduleValidation.isValid) {
      errors.push(...scheduleValidation.errors);
    }
  }

  // 4. Sensitivity tier validation
  const validTiers: GeneralizedSensitivity[] = ['standard', 'sensitive', 'highly_sensitive'];
  if (
    obj.generalizedSensitivity &&
    (typeof obj.generalizedSensitivity !== 'string' ||
      !(validTiers as string[]).includes(obj.generalizedSensitivity))
  ) {
    errors.push(
      `Invalid sensitivity tier "${String(obj.generalizedSensitivity)}". Expected one of: ${validTiers.join(', ')}.`
    );
  }

  // 5. Hourly forecast series validation if provided
  if (obj.hourlyForecast !== undefined && obj.hourlyForecast !== null) {
    if (!Array.isArray(obj.hourlyForecast)) {
      errors.push('Hourly forecast must be an array of forecast points.');
    } else if (obj.hourlyForecast.length > 72) {
      errors.push('Hourly forecast length cannot exceed 72 hours.');
    } else {
      for (let i = 0; i < obj.hourlyForecast.length; i++) {
        const pt = asRecord(obj.hourlyForecast[i]);
        if (!pt) {
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
export function validateLegacyPlanRequestPayload(payload: unknown): ValidationResult {
  const errors: string[] = [];
  const obj = asRecord(payload);

  if (!obj) {
    return { isValid: false, errors: ['Request body must be a non-null JSON object.'] };
  }

  // 1. City validation
  if (!obj.city || typeof obj.city !== 'string' || obj.city.trim().length === 0) {
    errors.push('City name is required and must be a non-empty string.');
  } else if (obj.city.length > 100) {
    errors.push('City name must not exceed 100 characters.');
  }

  // 2. Metrics validation
  const metrics = asRecord(obj.metrics);
  if (!metrics) {
    errors.push('Environmental metrics are required and must be an object.');
  } else {
    const { pm25, pm10, usAqi, no2, so2, co, o3 } = metrics;

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
        if (typeof val !== 'number' || !Number.isFinite(val) || isNaN(val) || val < 0) {
          errors.push(`${name.toUpperCase()} concentration must be a non-negative finite number.`);
        }
      }
    }
  }

  // 3. Room size validation
  if (obj.roomSizeSqFt !== undefined && obj.roomSizeSqFt !== null) {
    if (typeof obj.roomSizeSqFt !== 'number' || !Number.isFinite(obj.roomSizeSqFt) || isNaN(obj.roomSizeSqFt)) {
      errors.push('Room size must be a valid finite number.');
    } else if (obj.roomSizeSqFt < 20 || obj.roomSizeSqFt > 10000) {
      errors.push('Room size must be between 20 and 10,000 sq ft.');
    }
  }

  // 4. Custom routine validation
  if (obj.customRoutine !== undefined && obj.customRoutine !== null) {
    if (typeof obj.customRoutine !== 'string') {
      errors.push('Custom routine must be a string.');
    } else if (obj.customRoutine.length > 1000) {
      errors.push('Custom routine must not exceed 1000 characters.');
    }
  }

  // 5. Optional selected current-source ambient planning parameters
  if (obj.currentAmbientPm25 !== undefined && obj.currentAmbientPm25 !== null) {
    if (
      typeof obj.currentAmbientPm25 !== 'number' ||
      !Number.isFinite(obj.currentAmbientPm25) ||
      isNaN(obj.currentAmbientPm25)
    ) {
      errors.push('Selected ambient PM2.5 must be a valid finite number.');
    } else if (obj.currentAmbientPm25 < 0 || obj.currentAmbientPm25 > 2000) {
      errors.push('Selected ambient PM2.5 must be between 0 and 2000 µg/m³.');
    }
  }

  if (obj.currentAmbientUsAqi !== undefined && obj.currentAmbientUsAqi !== null) {
    if (
      typeof obj.currentAmbientUsAqi !== 'number' ||
      !Number.isFinite(obj.currentAmbientUsAqi) ||
      isNaN(obj.currentAmbientUsAqi)
    ) {
      errors.push('Selected ambient US AQI must be a valid finite number.');
    } else if (obj.currentAmbientUsAqi < 0 || obj.currentAmbientUsAqi > 1000) {
      errors.push('Selected ambient US AQI must be between 0 and 1000.');
    }
  }

  if (obj.currentAmbientCpcbAqi !== undefined && obj.currentAmbientCpcbAqi !== null) {
    if (
      typeof obj.currentAmbientCpcbAqi !== 'number' ||
      !Number.isFinite(obj.currentAmbientCpcbAqi) ||
      isNaN(obj.currentAmbientCpcbAqi)
    ) {
      errors.push('Selected ambient CPCB NAQI must be a valid finite number.');
    } else if (obj.currentAmbientCpcbAqi < 0 || obj.currentAmbientCpcbAqi > 1000) {
      errors.push('Selected ambient CPCB NAQI must be between 0 and 1000.');
    }
  }

  if (obj.currentAmbientSource !== undefined && obj.currentAmbientSource !== null) {
    if (typeof obj.currentAmbientSource !== 'string' || obj.currentAmbientSource.length > 200) {
      errors.push('Selected ambient source label must be a string under 200 characters.');
    }
  }

  if (obj.selectedSourceUnavailable !== undefined && obj.selectedSourceUnavailable !== null) {
    if (typeof obj.selectedSourceUnavailable !== 'boolean') {
      errors.push('selectedSourceUnavailable flag must be a boolean.');
    }
  }

  const validProvenances = ['observed', 'modeled_forecast', 'derived_calculation', 'estimated_outcome', 'unavailable'];
  if (
    obj.currentAmbientProvenance !== undefined &&
    obj.currentAmbientProvenance !== null &&
    (typeof obj.currentAmbientProvenance !== 'string' || !validProvenances.includes(obj.currentAmbientProvenance))
  ) {
    errors.push('Invalid currentAmbientProvenance classification.');
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

  const isHighRiskAge = ['infant', 'child', 'senior'].includes(profile.ageGroup ?? '');
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
