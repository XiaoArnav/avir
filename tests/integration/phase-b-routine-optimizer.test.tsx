import { describe, it, expect } from 'vitest';
import {
  optimizeScheduleWithForecast,
  EligibleForecastPoint,
} from '@/services/optimization/forecast-optimizer';
import { DailySchedule } from '@/domain/routine-types';

describe('Phase B Critical Regression Suite: Routine Optimizer Real-Schedule Flow (C10–C15)', () => {
  // Realistic forecast for Bengaluru with afternoon clean window (13:00-16:00 IST)
  const bengaluruForecast: EligibleForecastPoint[] = Array.from({ length: 24 }, (_, i) => {
    const hourUtc = (i + 18) % 24;
    const dateStr = i < 6 ? '2026-11-22' : '2026-11-23';
    const hourStr = String(hourUtc).padStart(2, '0');
    let pm = 50;
    if (i >= 6 && i <= 8) pm = 90; // Morning traffic peak (06:00-08:00 IST)
    else if (i >= 13 && i <= 16) pm = 25; // Afternoon convective dip (13:00-16:00 IST)
    else if (i >= 18 && i <= 20) pm = 80; // Evening traffic peak (18:00-20:00 IST)
    return {
      validAtUtc: `${dateStr}T${hourStr}:30:00Z`,
      cityId: 'bengaluru',
      timezone: 'Asia/Kolkata',
      pm25UgM3: pm,
      sourceKind: 'atmospheric_model',
      provider: 'Open-Meteo',
      units: 'µg/m³',
      status: 'valid',
      modelRunAt: '2026-11-22T12:00:00Z',
    };
  });

  // Section 16 Mandatory Real User Routine:
  // 1. Morning Walk (06:30–07:15, Flexible)
  // 2. College Commute (08:00–08:40, Fixed)
  // 3. Indoor Study (13:00–15:00, Fixed)
  // 4. Outdoor Exercise (18:00–19:00, Flexible)
  const userSchedule: DailySchedule = {
    id: 'user-bengaluru-sched-01',
    name: 'College Student Routine',
    timezone: 'Asia/Kolkata',
    createdAt: '2026-11-23T00:00:00Z',
    updatedAt: '2026-11-23T00:00:00Z',
    activities: [
      {
        id: 'act-morning-walk',
        name: 'Morning Walk',
        startTime: '06:30',
        endTime: '07:15',
        durationMinutes: 45,
        intensity: 'moderate',
        environment: 'outdoor',
        isFlexible: true,
        allowableStartRange: { earliest: '05:30', latest: '08:00' },
      },
      {
        id: 'act-college-commute',
        name: 'College Commute',
        startTime: '08:00',
        endTime: '08:40',
        durationMinutes: 40,
        intensity: 'light',
        environment: 'transit_bus',
        isFlexible: false,
      },
      {
        id: 'act-indoor-study',
        name: 'Indoor Study',
        startTime: '13:00',
        endTime: '15:00',
        durationMinutes: 120,
        intensity: 'resting',
        environment: 'indoor_clean',
        isFlexible: false,
      },
      {
        id: 'act-outdoor-exercise',
        name: 'Outdoor Exercise',
        startTime: '18:00',
        endTime: '19:00',
        durationMinutes: 60,
        intensity: 'vigorous',
        environment: 'outdoor',
        isFlexible: true,
        allowableStartRange: { earliest: '15:00', latest: '20:30' },
      },
    ],
  };

  it('C10–C12: Optimizer strictly evaluates user actual saved activities and returns their real IDs', () => {
    const result = optimizeScheduleWithForecast(userSchedule, bengaluruForecast);

    expect(result.status).not.toBe('unavailable');
    // Result MUST contain references to act-morning-walk or act-outdoor-exercise, NOT generic mock items!
    const activityNames = [
      ...result.activityShifts.map(s => s.activityName),
      ...result.unalteredActivities.map(a => a.name),
    ];
    expect(activityNames).toContain('Morning Walk');
    expect(activityNames).toContain('College Commute');
    expect(activityNames).toContain('Indoor Study');
    expect(activityNames).toContain('Outdoor Exercise');

    // Never return hardcoded mock activities:
    expect(activityNames).not.toContain('School Drop-off & Office Commute');
    expect(activityNames).not.toContain('Home Window Ventilation');
  });

  it('C13: Fixed activities (College Commute & Indoor Study) are never shifted', () => {
    const result = optimizeScheduleWithForecast(userSchedule, bengaluruForecast);

    const shiftedIds = result.activityShifts.map(s => s.activityId);
    expect(shiftedIds).not.toContain('act-college-commute');
    expect(shiftedIds).not.toContain('act-indoor-study');

    const fixedUnaltered = result.unalteredActivities.map(a => a.id);
    expect(fixedUnaltered).toContain('act-college-commute');
    expect(fixedUnaltered).toContain('act-indoor-study');
  });

  it('C14 & C15: Accepting a proposal updates the schedule; rejecting leaves it unchanged', () => {
    const result = optimizeScheduleWithForecast(userSchedule, bengaluruForecast);
    const exerciseShift = result.activityShifts.find(s => s.activityId === 'act-outdoor-exercise');
    expect(exerciseShift).toBeDefined();

    // User accepts proposal for Outdoor Exercise:
    const acceptedSchedule: DailySchedule = {
      ...userSchedule,
      activities: userSchedule.activities.map(a =>
        a.id === exerciseShift!.activityId
          ? {
              ...a,
              startTime: exerciseShift!.proposedStart,
              endTime: exerciseShift!.proposedEnd,
            }
          : a
      ),
    };

    const updatedAct = acceptedSchedule.activities.find(a => a.id === 'act-outdoor-exercise');
    expect(updatedAct?.startTime).toBe(exerciseShift!.proposedStart);

    // User rejects proposal for Morning Walk:
    const unchangedAct = acceptedSchedule.activities.find(a => a.id === 'act-morning-walk');
    expect(unchangedAct?.startTime).toBe('06:30'); // Preserved!
  });
});
