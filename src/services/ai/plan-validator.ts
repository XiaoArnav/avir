/**
 * Avir AI Planning Request Validator & Privacy Data Minimizer
 * Step 16: Request Schema Validation & Health Data Minimization
 */

import { GeneralizedSensitivity, PlanApiRequestPayload } from '@/domain/planning-types';
import { validateDailySchedule } from '@/domain/routine-types';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validates the incoming HTTP request payload against strict schema constraints.
 * Eliminates Defect B-012 (Incomplete Input Validation).
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
