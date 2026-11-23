/**
 * Avir Routine Manager Service
 * Step 11: Personal Routine CRUD, Scheduling, and Conflict Detection
 */

import {
  DailySchedule,
  RoutineActivity,
  calculateActivityDurationMinutes,
  parseTimeStringToMinutes,
  validateRoutineActivity,
} from '@/domain/routine-types';

/**
 * Creates a realistic default schedule for urban routines (e.g. Bengaluru/Delhi context).
 */
export function createDefaultSchedule(): DailySchedule {
  const nowIso = new Date().toISOString();
  return {
    id: 'default-urban-routine-v1',
    name: 'Default Urban Routine',
    timezone: 'Asia/Kolkata',
    createdAt: nowIso,
    updatedAt: nowIso,
    activities: [
      {
        id: 'act-morning-jog',
        name: 'Morning Jog / Outdoor Exercise',
        startTime: '06:30',
        endTime: '07:30',
        durationMinutes: 60,
        intensity: 'vigorous',
        environment: 'outdoor',
        isFlexible: true,
        allowableStartRange: { earliest: '05:30', latest: '09:00' },
        notes: 'Flexible morning outdoor cardio; sensitive to peak winter morning pollution.',
      },
      {
        id: 'act-commute-office',
        name: 'Morning Commute to Office',
        startTime: '08:45',
        endTime: '09:30',
        durationMinutes: 45,
        intensity: 'light',
        environment: 'transit_bus',
        isFlexible: false,
        notes: 'Fixed work arrival time.',
      },
      {
        id: 'act-work-office',
        name: 'Work at Office',
        startTime: '09:30',
        endTime: '18:00',
        durationMinutes: 510,
        intensity: 'light',
        environment: 'indoor_clean',
        isFlexible: false,
        notes: 'Commercial office building with central air handling.',
      },
      {
        id: 'act-commute-home',
        name: 'Evening Commute Home',
        startTime: '18:15',
        endTime: '19:00',
        durationMinutes: 45,
        intensity: 'light',
        environment: 'transit_bus',
        isFlexible: true,
        allowableStartRange: { earliest: '17:30', latest: '20:30' },
        notes: 'Flexible departure window depending on traffic and air quality.',
      },
      {
        id: 'act-evening-home',
        name: 'Evening at Home & Dinner',
        startTime: '19:30',
        endTime: '22:30',
        durationMinutes: 180,
        intensity: 'light',
        environment: 'indoor_unfiltered',
        isFlexible: true,
        allowableStartRange: { earliest: '19:00', latest: '23:00' },
        notes: 'Residential indoor time.',
      },
      {
        id: 'act-sleep',
        name: 'Night Sleep',
        startTime: '23:00',
        endTime: '06:30',
        durationMinutes: 450,
        intensity: 'resting',
        environment: 'indoor_clean',
        isFlexible: false,
        notes: 'Bedroom with indoor air cleaner running.',
      },
    ],
  };
}

/**
 * Adds an activity to a schedule with automatic duration calculation and ID generation.
 */
export function addActivityToSchedule(
  schedule: DailySchedule,
  newActivity: Omit<RoutineActivity, 'id' | 'durationMinutes'> & { id?: string; durationMinutes?: number }
): DailySchedule {
  const duration = calculateActivityDurationMinutes(newActivity.startTime, newActivity.endTime);
  const activity: RoutineActivity = {
    ...newActivity,
    id: newActivity.id || `act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    durationMinutes: duration,
  };

  const validation = validateRoutineActivity(activity);
  if (!validation.isValid) {
    throw new Error(`Cannot add invalid activity: ${validation.errors.join('; ')}`);
  }

  return {
    ...schedule,
    updatedAt: new Date().toISOString(),
    activities: [...schedule.activities, activity],
  };
}

/**
 * Updates an existing activity in a schedule.
 */
export function updateActivityInSchedule(
  schedule: DailySchedule,
  activityId: string,
  updates: Partial<Omit<RoutineActivity, 'id'>>
): DailySchedule {
  const existing = schedule.activities.find(a => a.id === activityId);
  if (!existing) {
    throw new Error(`Activity with ID "${activityId}" not found in schedule.`);
  }

  const updatedActivity: RoutineActivity = {
    ...existing,
    ...updates,
    id: existing.id,
  };

  // Recalculate duration if times changed
  if (updates.startTime || updates.endTime) {
    updatedActivity.durationMinutes = calculateActivityDurationMinutes(
      updatedActivity.startTime,
      updatedActivity.endTime
    );
  }

  const validation = validateRoutineActivity(updatedActivity);
  if (!validation.isValid) {
    throw new Error(`Cannot update activity: ${validation.errors.join('; ')}`);
  }

  return {
    ...schedule,
    updatedAt: new Date().toISOString(),
    activities: schedule.activities.map(a => (a.id === activityId ? updatedActivity : a)),
  };
}

/**
 * Deletes an activity by ID from the schedule.
 */
export function deleteActivityFromSchedule(schedule: DailySchedule, activityId: string): DailySchedule {
  return {
    ...schedule,
    updatedAt: new Date().toISOString(),
    activities: schedule.activities.filter(a => a.id !== activityId),
  };
}

/**
 * Duplicates an existing activity, generating a new ID and appending "(Copy)".
 */
export function duplicateActivityInSchedule(schedule: DailySchedule, activityId: string): DailySchedule {
  const existing = schedule.activities.find(a => a.id === activityId);
  if (!existing) {
    throw new Error(`Activity with ID "${activityId}" not found.`);
  }

  const duplicate: RoutineActivity = {
    ...existing,
    id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name: `${existing.name} (Copy)`,
  };

  return {
    ...schedule,
    updatedAt: new Date().toISOString(),
    activities: [...schedule.activities, duplicate],
  };
}

/**
 * Reorders activities in the schedule array.
 */
export function reorderActivitiesInSchedule(
  schedule: DailySchedule,
  fromIndex: number,
  toIndex: number
): DailySchedule {
  if (
    fromIndex < 0 ||
    fromIndex >= schedule.activities.length ||
    toIndex < 0 ||
    toIndex >= schedule.activities.length
  ) {
    return schedule;
  }

  const activities = [...schedule.activities];
  const [removed] = activities.splice(fromIndex, 1);
  activities.splice(toIndex, 0, removed);

  return {
    ...schedule,
    updatedAt: new Date().toISOString(),
    activities,
  };
}

export interface ScheduleConflict {
  activityIdA: string;
  activityIdB: string;
  description: string;
}

/**
 * Checks for hard time collisions between fixed activities.
 */
export function findScheduleConflicts(schedule: DailySchedule): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const fixed = schedule.activities.filter(a => !a.isFlexible);

  for (let i = 0; i < fixed.length; i++) {
    for (let j = i + 1; j < fixed.length; j++) {
      const a = fixed[i];
      const b = fixed[j];

      const aStart = parseTimeStringToMinutes(a.startTime);
      const aEnd = aStart + calculateActivityDurationMinutes(a.startTime, a.endTime);
      const bStart = parseTimeStringToMinutes(b.startTime);
      const bEnd = bStart + calculateActivityDurationMinutes(b.startTime, b.endTime);

      // Check overlap in single-day 0..2880 space
      const overlaps = Math.max(aStart, bStart) < Math.min(aEnd, bEnd);
      if (overlaps) {
        conflicts.push({
          activityIdA: a.id,
          activityIdB: b.id,
          description: `Fixed activity "${a.name}" (${a.startTime}-${a.endTime}) overlaps with fixed activity "${b.name}" (${b.startTime}-${b.endTime}).`,
        });
      }
    }
  }

  return conflicts;
}
