import { describe, it, expect } from 'vitest';
import {
  parseTimeStringToMinutes,
  formatMinutesToTimeString,
  calculateActivityDurationMinutes,
  validateRoutineActivity,
  validateDailySchedule,
  DailySchedule,
  RoutineActivity,
} from '@/domain/routine-types';
import {
  createDefaultSchedule,
  addActivityToSchedule,
  updateActivityInSchedule,
  deleteActivityFromSchedule,
  reorderActivitiesInSchedule,
  duplicateActivityInSchedule,
  findScheduleConflicts,
} from '@/services/routines/routine-manager';

describe('Step 11 — Routine Model & Time Arithmetic', () => {
  describe('Time Parsing and Normalization', () => {
    it('parses valid 24-hour time strings correctly', () => {
      expect(parseTimeStringToMinutes('00:00')).toBe(0);
      expect(parseTimeStringToMinutes('06:30')).toBe(390);
      expect(parseTimeStringToMinutes('12:00')).toBe(720);
      expect(parseTimeStringToMinutes('23:59')).toBe(1439);
    });

    it('rejects malformed or out-of-bounds time strings', () => {
      expect(() => parseTimeStringToMinutes('24:00')).toThrow(/Out-of-bounds/);
      expect(() => parseTimeStringToMinutes('12:60')).toThrow(/Out-of-bounds/);
      expect(() => parseTimeStringToMinutes('invalid')).toThrow(/Malformed/);
      expect(() => parseTimeStringToMinutes('')).toThrow(/Invalid/);
    });

    it('formats minutes from midnight to "HH:mm" with padding', () => {
      expect(formatMinutesToTimeString(0)).toBe('00:00');
      expect(formatMinutesToTimeString(390)).toBe('06:30');
      expect(formatMinutesToTimeString(720)).toBe('12:00');
      expect(formatMinutesToTimeString(1439)).toBe('23:59');
    });

    it('wraps modulo 1440 for midnight crossing correctly', () => {
      expect(formatMinutesToTimeString(1440)).toBe('00:00');
      expect(formatMinutesToTimeString(1500)).toBe('01:00'); // +60 mins past midnight
      expect(formatMinutesToTimeString(-60)).toBe('23:00'); // 1 hour before midnight
    });
  });

  describe('Activity Duration & Midnight Crossing', () => {
    it('calculates daytime duration correctly', () => {
      expect(calculateActivityDurationMinutes('07:00', '08:00')).toBe(60);
      expect(calculateActivityDurationMinutes('09:30', '18:00')).toBe(510);
      expect(calculateActivityDurationMinutes('13:15', '14:45')).toBe(90);
    });

    it('calculates duration across midnight accurately without negative values', () => {
      // 23:00 to 07:00 = 1 hour before midnight + 7 hours = 8 hours (480 mins)
      expect(calculateActivityDurationMinutes('23:00', '07:00')).toBe(480);
      // 22:30 to 06:30 = 90 mins before midnight + 390 mins = 480 mins
      expect(calculateActivityDurationMinutes('22:30', '06:30')).toBe(480);
      // 23:45 to 00:15 = 30 minutes
      expect(calculateActivityDurationMinutes('23:45', '00:15')).toBe(30);
    });
  });

  describe('Activity Validation', () => {
    it('accepts a valid structured activity', () => {
      const activity: RoutineActivity = {
        id: 'act-1',
        name: 'Morning Jog',
        startTime: '06:30',
        endTime: '07:30',
        durationMinutes: 60,
        intensity: 'vigorous',
        environment: 'outdoor',
        isFlexible: true,
        allowableStartRange: { earliest: '05:30', latest: '08:30' },
      };
      const result = validateRoutineActivity(activity);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects activity with empty name or missing times', () => {
      const invalid = validateRoutineActivity({
        name: '',
        startTime: 'invalid',
        endTime: '10:00',
      });
      expect(invalid.isValid).toBe(false);
      expect(invalid.errors.some(e => e.includes('name is required'))).toBe(true);
      expect(invalid.errors.some(e => e.includes('Invalid start time'))).toBe(true);
    });

    it('rejects invalid intensity or environment', () => {
      const invalid = validateRoutineActivity({
        name: 'Test',
        startTime: '10:00',
        endTime: '11:00',
        intensity: 'super_intense' as any,
        environment: 'space' as any,
      });
      expect(invalid.isValid).toBe(false);
      expect(invalid.errors.some(e => e.includes('Invalid intensity'))).toBe(true);
      expect(invalid.errors.some(e => e.includes('Invalid environment'))).toBe(true);
    });
  });

  describe('Schedule CRUD Operations', () => {
    it('creates a realistic default schedule for urban routines', () => {
      const schedule = createDefaultSchedule();
      expect(schedule.id).toBeDefined();
      expect(schedule.name).toBe('Default Urban Routine');
      expect(schedule.activities.length).toBeGreaterThanOrEqual(4);
      expect(schedule.timezone).toBe('Asia/Kolkata');
      const validation = validateDailySchedule(schedule);
      expect(validation.isValid).toBe(true);
    });

    it('adds a new activity and calculates duration automatically', () => {
      const schedule = createDefaultSchedule();
      const updated = addActivityToSchedule(schedule, {
        name: 'Evening Cycling',
        startTime: '18:30',
        endTime: '19:30',
        intensity: 'vigorous',
        environment: 'transit_active',
        isFlexible: true,
      });
      expect(updated.activities.some(a => a.name === 'Evening Cycling')).toBe(true);
      const added = updated.activities.find(a => a.name === 'Evening Cycling');
      expect(added?.durationMinutes).toBe(60);
      expect(added?.id).toBeDefined();
    });

    it('updates an existing activity in the schedule', () => {
      const schedule = createDefaultSchedule();
      const targetId = schedule.activities[0].id;
      const updated = updateActivityInSchedule(schedule, targetId, {
        name: 'Updated Activity Name',
        startTime: '07:00',
        endTime: '08:30',
      });
      const modified = updated.activities.find(a => a.id === targetId);
      expect(modified?.name).toBe('Updated Activity Name');
      expect(modified?.durationMinutes).toBe(90);
    });

    it('deletes an activity from the schedule', () => {
      const schedule = createDefaultSchedule();
      const targetId = schedule.activities[0].id;
      const initialCount = schedule.activities.length;
      const updated = deleteActivityFromSchedule(schedule, targetId);
      expect(updated.activities.length).toBe(initialCount - 1);
      expect(updated.activities.some(a => a.id === targetId)).toBe(false);
    });

    it('duplicates an activity with a new ID', () => {
      const schedule = createDefaultSchedule();
      const targetId = schedule.activities[0].id;
      const updated = duplicateActivityInSchedule(schedule, targetId);
      expect(updated.activities.length).toBe(schedule.activities.length + 1);
      const copy = updated.activities[updated.activities.length - 1];
      expect(copy.id).not.toBe(targetId);
      expect(copy.name).toContain('(Copy)');
    });

    it('reorders activities in schedule', () => {
      const schedule = createDefaultSchedule();
      const firstId = schedule.activities[0].id;
      const secondId = schedule.activities[1].id;
      const reordered = reorderActivitiesInSchedule(schedule, 0, 1);
      expect(reordered.activities[0].id).toBe(secondId);
      expect(reordered.activities[1].id).toBe(firstId);
    });

    it('detects schedule conflicts between overlapping fixed activities', () => {
      const schedule: DailySchedule = {
        id: 'test-sched',
        name: 'Test Overlaps',
        timezone: 'UTC',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        activities: [
          {
            id: 'fix-1',
            name: 'Office Shift 1',
            startTime: '09:00',
            endTime: '13:00',
            durationMinutes: 240,
            intensity: 'light',
            environment: 'indoor_unfiltered',
            isFlexible: false,
          },
          {
            id: 'fix-2',
            name: 'Office Shift 2 (Conflict)',
            startTime: '12:00',
            endTime: '15:00',
            durationMinutes: 180,
            intensity: 'light',
            environment: 'indoor_unfiltered',
            isFlexible: false,
          },
        ],
      };
      const conflicts = findScheduleConflicts(schedule);
      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts[0].description).toContain('overlaps');
    });
  });
});
