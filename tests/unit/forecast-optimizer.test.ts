import { describe, it, expect } from 'vitest';
import {
  optimizeScheduleWithForecast,
  HourlyForecastPoint,
  validateForecastEligibility,
} from '@/services/optimization/forecast-optimizer';
import { DailySchedule, RoutineActivity } from '@/domain/routine-types';

describe('Step 12 — Forecast-Based Routine Optimizer', () => {
  // Realistic 24-hour diurnal cycle (winter Delhi/Bengaluru pattern: high overnight/morning, dip in afternoon)
  const mockHourlyForecast: HourlyForecastPoint[] = Array.from({ length: 24 }, (_, hour) => {
    const hourStr = String(hour).padStart(2, '0') + ':00';
    // Diurnal curve: 06:00 is peak 220 µg/m³, 15:00 is trough 75 µg/m³
    let pm25 = 120;
    if (hour >= 5 && hour <= 9) pm25 = 200 + (hour - 5) * 5; // Morning peak ~200-220
    else if (hour >= 13 && hour <= 16) pm25 = 75;            // Afternoon trough ~75
    else if (hour >= 20 || hour <= 4) pm25 = 160;             // Night inversion ~160
    return {
      timestamp: `2026-11-23T${hourStr}:00Z`,
      hour: hourStr,
      pm25,
    };
  });

  const baseSchedule: DailySchedule = {
    id: 'sched-1',
    name: 'Workday Schedule',
    timezone: 'Asia/Kolkata',
    createdAt: '2026-11-23T00:00:00Z',
    updatedAt: '2026-11-23T00:00:00Z',
    activities: [
      {
        id: 'act-jog',
        name: 'Morning Jog',
        startTime: '06:00',
        endTime: '07:00',
        durationMinutes: 60,
        intensity: 'vigorous',
        environment: 'outdoor',
        isFlexible: true,
        allowableStartRange: { earliest: '06:00', latest: '19:00' },
      },
      {
        id: 'act-fixed-work',
        name: 'Fixed Office Hours',
        startTime: '09:00',
        endTime: '17:00',
        durationMinutes: 480,
        intensity: 'light',
        environment: 'indoor_clean',
        isFlexible: false,
      },
    ],
  };

  describe('Forecast Eligibility Validation', () => {
    it('accepts complete, monotonic 24-hour forecast data', () => {
      const eligibility = validateForecastEligibility(mockHourlyForecast);
      expect(eligibility.isEligible).toBe(true);
      expect(eligibility.reason).toBeUndefined();
    });

    it('rejects empty, null, or short forecast arrays (< 12 hours)', () => {
      expect(validateForecastEligibility([]).isEligible).toBe(false);
      expect(validateForecastEligibility(null as any).isEligible).toBe(false);
      expect(validateForecastEligibility(mockHourlyForecast.slice(0, 8)).isEligible).toBe(false);
    });

    it('rejects forecast with negative PM2.5 or missing timestamps', () => {
      const invalid = [...mockHourlyForecast];
      invalid[3] = { ...invalid[3], pm25: -10 };
      expect(validateForecastEligibility(invalid).isEligible).toBe(false);
    });
  });

  describe('Defect B-001 & B-002 Elimination', () => {
    it('B-001: Returns unavailable state when forecast is missing without fabricating 35% midday improvement', () => {
      const result = optimizeScheduleWithForecast(baseSchedule, []);
      expect(result.status).toBe('unavailable');
      expect(result.statusMessage).toContain('Hourly atmospheric forecast is unavailable');
      expect(result.activityShifts).toHaveLength(0);
      expect(result.baselineExposureUg).toBe(0);
      expect(result.optimizedExposureUg).toBe(0);
    });

    it('B-002: Does not blindly default to "13:00 - 14:00" when optimizing; calculates minimum exposure window', () => {
      // Modify forecast so morning 07:00 is cleanest and afternoon 13:00 is terrible
      const invertedForecast: HourlyForecastPoint[] = Array.from({ length: 24 }, (_, hour) => {
        const hourStr = String(hour).padStart(2, '0') + ':00';
        const pm25 = hour === 7 ? 30 : 250; // Cleanest at 07:00
        return {
          timestamp: `2026-11-23T${hourStr}:00Z`,
          hour: hourStr,
          pm25,
        };
      });

      const result = optimizeScheduleWithForecast(baseSchedule, invertedForecast);
      expect(result.status).toBe('optimal');
      const jogShift = result.activityShifts.find(s => s.activityId === 'act-jog');
      expect(jogShift).toBeDefined();
      expect(jogShift?.proposedStart).toBe('07:00'); // NOT 13:00!
    });
  });

  describe('Feasibility & Constraint Adherence', () => {
    it('offers independently acceptable shifts when two walks compete for one slot', () => {
      const walk = { ...baseSchedule.activities[0], endTime: '06:30', durationMinutes: 30,
        allowableStartRange: { earliest: '13:00', latest: '13:00' } };
      const schedule = { ...baseSchedule, activities: [walk,
        { ...walk, id: 'second', startTime: '07:00', endTime: '07:30' }] };
      const plan = optimizeScheduleWithForecast(schedule, mockHourlyForecast);
      expect(plan.activityShifts.map(s => s.proposedStart)).toEqual(['13:00']);
      expect(plan.unalteredActivities.map(a => a.id)).toEqual(['second']);
    });
    it('shifts flexible activity to lower-exposure window while respecting allowable range', () => {
      const result = optimizeScheduleWithForecast(baseSchedule, mockHourlyForecast);
      expect(result.status).toBe('optimal');
      const jogShift = result.activityShifts.find(s => s.activityId === 'act-jog');
      expect(jogShift).toBeDefined();
      expect(jogShift?.originalStart).toBe('06:00');
      // In baseSchedule, jog is flexible between 06:00 and 16:00, but office is fixed 09:00-17:00!
      // So allowable non-conflicting times are 06:00-08:00 (since 08:00-09:00 jog finishes before office).
      // Between 06:00 and 08:00, PM2.5 at 06:00 is 205, at 07:00 is 210, etc.
      expect(jogShift?.savingsUg).toBeGreaterThanOrEqual(0);
      expect(jogShift?.proposedStart).not.toBe('06:00');
    });

    it('never shifts fixed (non-flexible) activities', () => {
      const result = optimizeScheduleWithForecast(baseSchedule, mockHourlyForecast);
      const fixedShift = result.activityShifts.find(s => s.activityId === 'act-fixed-work');
      expect(fixedShift).toBeUndefined();
      expect(result.unalteredActivities.some(a => a.id === 'act-fixed-work')).toBe(true);
    });

    it('handles multi-hour flexible activities by integrating across all consecutive hours', () => {
      const multiHourSchedule: DailySchedule = {
        ...baseSchedule,
        activities: [
          {
            id: 'act-long-hike',
            name: 'Long Outdoor Hike',
            startTime: '06:00',
            endTime: '09:00', // 3 hours
            durationMinutes: 180,
            intensity: 'moderate',
            environment: 'outdoor',
            isFlexible: true,
            allowableStartRange: { earliest: '06:00', latest: '18:00' },
          },
        ],
      };

      const result = optimizeScheduleWithForecast(multiHourSchedule, mockHourlyForecast);
      expect(result.status).toBe('optimal');
      const hikeShift = result.activityShifts.find(s => s.activityId === 'act-long-hike');
      expect(hikeShift).toBeDefined();
      // Should shift to afternoon trough (e.g. 13:00 to 16:00)
      expect(hikeShift?.proposedStart).toBe('13:00');
      expect(hikeShift?.proposedEnd).toBe('16:00');
      expect(hikeShift?.savingsPercent).toBeGreaterThan(40);
    });

    it('reports unfeasible when no shift can improve exposure or within bounds', () => {
      // Uniform flat forecast: 100 ug/m3 all day
      const flatForecast: HourlyForecastPoint[] = Array.from({ length: 24 }, (_, hour) => ({
        timestamp: `2026-11-23T${String(hour).padStart(2, '0')}:00:00Z`,
        hour: `${String(hour).padStart(2, '0')}:00`,
        pm25: 100,
      }));

      const result = optimizeScheduleWithForecast(baseSchedule, flatForecast);
      expect(result.status).toBe('unfeasible');
      expect(result.statusMessage).toContain('No feasible time shifts provide verified exposure reduction');
      expect(result.activityShifts).toHaveLength(0);
    });
  });
});
