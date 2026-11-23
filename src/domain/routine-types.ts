/**
 * Avir Routine Domain Types & Schedule Contracts
 * Step 11: Personal Routine Builder & Time Management
 */

export type ActivityIntensity = 'resting' | 'light' | 'moderate' | 'vigorous';

export type ActivityEnvironment = 
  | 'outdoor'
  | 'indoor_unfiltered'
  | 'indoor_clean'
  | 'transit_car'
  | 'transit_bus'
  | 'transit_metro'
  | 'transit_active';

export interface AllowableStartRange {
  /** Earliest allowed start time in "HH:mm" 24h format */
  earliest: string;
  /** Latest allowed start time in "HH:mm" 24h format */
  latest: string;
}

export interface RoutineActivity {
  id: string;
  name: string;
  startTime: string; // "HH:mm" 24h format
  endTime: string;   // "HH:mm" 24h format
  durationMinutes: number;
  intensity: ActivityIntensity;
  environment: ActivityEnvironment;
  isFlexible: boolean;
  allowableStartRange?: AllowableStartRange;
  daysOfWeek?: number[]; // 0 = Sunday, 1 = Monday, ... 6 = Saturday
  notes?: string;
}

export interface DailySchedule {
  id: string;
  name: string;
  activities: RoutineActivity[];
  timezone: string; // e.g. "Asia/Kolkata", "UTC"
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

/**
 * Converts a 24-hour "HH:mm" string into minutes from midnight (0–1439).
 */
export function parseTimeStringToMinutes(timeStr: string): number {
  if (!timeStr || typeof timeStr !== 'string') {
    throw new Error(`Invalid time string: ${timeStr}`);
  }
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    throw new Error(`Malformed time format "${timeStr}". Expected "HH:mm".`);
  }
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Out-of-bounds time values "${timeStr}". Hours: 0-23, Minutes: 0-59.`);
  }
  return hours * 60 + minutes;
}

/**
 * Converts minutes from midnight into a 24-hour "HH:mm" formatted string.
 * Handles modulo 1440 for midnight wrapping.
 */
export function formatMinutesToTimeString(totalMinutes: number): string {
  const normalized = ((Math.floor(totalMinutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Calculates duration in minutes between start and end time.
 * Correctly accounts for midnight crossing (e.g. 23:00 to 01:00 is 120 minutes).
 */
export function calculateActivityDurationMinutes(startTime: string, endTime: string): number {
  const startMins = parseTimeStringToMinutes(startTime);
  const endMins = parseTimeStringToMinutes(endTime);
  if (endMins >= startMins) {
    return endMins - startMins;
  }
  // Crosses midnight (e.g. 23:30 to 06:30 => (1440 - 1410) + 390 = 420 mins)
  return (1440 - startMins) + endMins;
}

/**
 * Validates a RoutineActivity against structural and physical constraints.
 */
export function validateRoutineActivity(activity: Partial<RoutineActivity>): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!activity.name || activity.name.trim().length === 0) {
    errors.push('Activity name is required.');
  } else if (activity.name.length > 80) {
    errors.push('Activity name must not exceed 80 characters.');
  }

  if (!activity.startTime) {
    errors.push('Start time is required.');
  } else {
    try {
      parseTimeStringToMinutes(activity.startTime);
    } catch (e: any) {
      errors.push(`Invalid start time: ${e.message}`);
    }
  }

  if (!activity.endTime) {
    errors.push('End time is required.');
  } else {
    try {
      parseTimeStringToMinutes(activity.endTime);
    } catch (e: any) {
      errors.push(`Invalid end time: ${e.message}`);
    }
  }

  if (activity.startTime && activity.endTime) {
    try {
      const duration = calculateActivityDurationMinutes(activity.startTime, activity.endTime);
      if (duration === 0) {
        errors.push('Activity duration must be greater than 0 minutes.');
      } else if (duration > 1440) {
        errors.push('Activity duration cannot exceed 24 hours (1440 minutes).');
      }
    } catch {
      // already caught by time parsing
    }
  }

  const validIntensities: ActivityIntensity[] = ['resting', 'light', 'moderate', 'vigorous'];
  if (!activity.intensity || !validIntensities.includes(activity.intensity)) {
    errors.push(`Invalid intensity: ${activity.intensity}. Must be one of: ${validIntensities.join(', ')}.`);
  }

  const validEnvironments: ActivityEnvironment[] = [
    'outdoor',
    'indoor_unfiltered',
    'indoor_clean',
    'transit_car',
    'transit_bus',
    'transit_metro',
    'transit_active',
  ];
  if (!activity.environment || !validEnvironments.includes(activity.environment)) {
    errors.push(`Invalid environment: ${activity.environment}. Must be one of: ${validEnvironments.join(', ')}.`);
  }

  if (activity.isFlexible && activity.allowableStartRange) {
    try {
      const earliest = parseTimeStringToMinutes(activity.allowableStartRange.earliest);
      const latest = parseTimeStringToMinutes(activity.allowableStartRange.latest);
      if (earliest === latest) {
        errors.push('Allowable start range earliest and latest cannot be identical for flexible activities.');
      }
    } catch (e: any) {
      errors.push(`Invalid allowable start range: ${e.message}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates an entire DailySchedule for internal consistency.
 */
export function validateDailySchedule(schedule: DailySchedule): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!schedule.id || schedule.id.trim().length === 0) {
    errors.push('Schedule ID is required.');
  }
  if (!schedule.name || schedule.name.trim().length === 0) {
    errors.push('Schedule name is required.');
  }
  if (!Array.isArray(schedule.activities)) {
    errors.push('Activities must be an array.');
    return { isValid: false, errors };
  }
  if (schedule.activities.length === 0) {
    errors.push('Schedule must contain at least one activity.');
  }

  schedule.activities.forEach((act, index) => {
    const actValidation = validateRoutineActivity(act);
    if (!actValidation.isValid) {
      errors.push(`Activity ${index + 1} ("${act.name || 'unnamed'}"): ${actValidation.errors.join('; ')}`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}
