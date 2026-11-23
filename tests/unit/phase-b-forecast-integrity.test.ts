import { describe, it, expect } from 'vitest';
import {
  validateForecastEligibility,
  calculateInhaledMassForIntervals,
  optimizeScheduleWithForecast,
  EligibleForecastPoint,
  IntervalExposureResult,
} from '@/services/optimization/forecast-optimizer';
import { DailySchedule } from '@/domain/routine-types';

describe('Phase B Critical Regression Suite: Forecast & Temporal Integrity', () => {
  // Base 24h eligible forecast for Bengaluru (Asia/Kolkata, UTC+05:30)
  const baseDate = '2026-11-23';
  const kolkataPoints: EligibleForecastPoint[] = Array.from({ length: 24 }, (_, i) => {
    // 00:00 to 23:00 IST = 2026-11-22T18:30:00Z to 2026-11-23T17:30:00Z
    const hourUtc = (i + 18) % 24;
    const dateStr = i < 6 ? '2026-11-22' : '2026-11-23';
    const hourStr = String(hourUtc).padStart(2, '0');
    return {
      validAtUtc: `${dateStr}T${hourStr}:30:00Z`,
      cityId: 'bengaluru',
      timezone: 'Asia/Kolkata',
      pm25UgM3: 40 + (i % 10),
      sourceKind: 'atmospheric_model',
      provider: 'Open-Meteo',
      units: 'µg/m³',
      status: 'valid',
      modelRunAt: '2026-11-22T12:00:00Z',
    };
  });

  describe('C01: No ?? 100 Pollution Fallback & Explicit Unavailable State', () => {
    it('Case A: Activity 08:30-09:30 with 08:00 present but 09:00 missing returns unavailable (NOT 100 µg/m³)', () => {
      // Create forecast with 09:00 IST missing
      const forecastWithGap = kolkataPoints.filter((_, idx) => idx !== 9); // Remove hour 9 (09:00 IST)

      const result: IntervalExposureResult = calculateInhaledMassForIntervals({
        startIso: '2026-11-23T08:30:00+05:30',
        endIso: '2026-11-23T09:30:00+05:30',
        intensity: 'moderate',
        environment: 'outdoor',
        forecastPoints: forecastWithGap,
        timezone: 'Asia/Kolkata',
      });

      expect(result.status).toBe('unavailable');
      if (result.status === 'unavailable') {
        expect(result.reason).toContain('Missing forecast coverage');
        expect(result.missingIntervals.length).toBeGreaterThan(0);
      }
      // MUST NOT return 100 or fabricated number
      expect((result as any).inhaledMassUg).toBeUndefined();
    });

    it('Case C: PM2.5 genuinely 0 µg/m³ is valid and preserved as 0 µg inhaled', () => {
      const cleanPoints: EligibleForecastPoint[] = kolkataPoints.map(p => ({
        ...p,
        pm25UgM3: 0,
      }));

      const result = calculateInhaledMassForIntervals({
        startIso: '2026-11-23T07:00:00+05:30',
        endIso: '2026-11-23T08:00:00+05:30',
        intensity: 'light',
        environment: 'outdoor',
        forecastPoints: cleanPoints,
        timezone: 'Asia/Kolkata',
      });

      expect(result.status).toBe('available');
      if (result.status === 'available') {
        expect(result.effectiveConcentrationUgM3).toBe(0);
        expect(result.inhaledMassUg).toBe(0);
      }
    });

    it('Case D: PM2.5 null, undefined, NaN, or negative is rejected', () => {
      const invalidPoints = kolkataPoints.map((p, idx) =>
        idx === 5 ? { ...p, pm25UgM3: -15 } : p
      );
      const eligibility = validateForecastEligibility(invalidPoints, 'bengaluru');
      expect(eligibility.isEligible).toBe(false);
      expect(eligibility.reason).toContain('Invalid or negative PM2.5');
    });

    it('Case E: Duplicate timestamps with conflicting values are rejected without arbitrary overwrite', () => {
      const duplicatePoints = [
        ...kolkataPoints,
        {
          ...kolkataPoints[3],
          pm25UgM3: 150, // conflicting duplicate
        },
      ];
      const eligibility = validateForecastEligibility(duplicatePoints, 'bengaluru');
      expect(eligibility.isEligible).toBe(false);
      expect(eligibility.reason).toContain('Duplicate timestamp');
    });
  });

  describe('C03–C07: Full UTC Timestamps, Timezone, City Identity & Units', () => {
    it('C04: Rejects forecast belonging to a different city', () => {
      const delhiPoints: EligibleForecastPoint[] = kolkataPoints.map(p => ({
        ...p,
        cityId: 'delhi',
      }));
      const eligibility = validateForecastEligibility(delhiPoints, 'bengaluru');
      expect(eligibility.isEligible).toBe(false);
      expect(eligibility.reason).toContain('City mismatch');
    });

    it('C05: Rejects unsupported units (e.g. ppm or ppb)', () => {
      const ppmPoints: any[] = kolkataPoints.map(p => ({
        ...p,
        units: 'ppm',
      }));
      const eligibility = validateForecastEligibility(ppmPoints, 'bengaluru');
      expect(eligibility.isEligible).toBe(false);
      expect(eligibility.reason).toContain('Unsupported units');
    });

    it('C06: Rejects non-consecutive series when required interval coverage has gaps', () => {
      // 12 points with 2-hour gaps
      const gappedPoints = kolkataPoints.filter((_, idx) => idx % 2 === 0);
      const result = calculateInhaledMassForIntervals({
        startIso: '2026-11-23T06:00:00+05:30',
        endIso: '2026-11-23T09:00:00+05:30',
        intensity: 'moderate',
        environment: 'outdoor',
        forecastPoints: gappedPoints,
        timezone: 'Asia/Kolkata',
      });
      expect(result.status).toBe('unavailable');
    });

    it('Distinguishes 08:00 today from 08:00 tomorrow via unambiguous UTC instants', () => {
      const today0800Iso = '2026-11-23T02:30:00Z'; // 08:00 IST today
      const tomorrow0800Iso = '2026-11-24T02:30:00Z'; // 08:00 IST tomorrow

      const multiDayPoints: EligibleForecastPoint[] = [
        ...kolkataPoints,
        {
          validAtUtc: tomorrow0800Iso,
          cityId: 'bengaluru',
          timezone: 'Asia/Kolkata',
          pm25UgM3: 95,
          sourceKind: 'atmospheric_model',
          provider: 'Open-Meteo',
          units: 'µg/m³',
          status: 'valid',
          modelRunAt: '2026-11-22T12:00:00Z',
        },
      ];

      const eligibility = validateForecastEligibility(multiDayPoints, 'bengaluru');
      expect(eligibility.isEligible).toBe(true);
    });
  });

  describe('C08: Multi-Hour Exposure Integration with Exact Interval Overlap', () => {
    it('integrates 08:30-10:15 across individual hourly slices (30m + 60m + 15m)', () => {
      // Setup distinct PM2.5 per hour:
      // Hour 8 (08:00-09:00): 60 µg/m³
      // Hour 9 (09:00-10:00): 120 µg/m³
      // Hour 10 (10:00-11:00): 180 µg/m³
      const steppedPoints: EligibleForecastPoint[] = kolkataPoints.map((p, idx) => {
        let pm = 50;
        if (idx === 8) pm = 60;
        if (idx === 9) pm = 120;
        if (idx === 10) pm = 180;
        return { ...p, pm25UgM3: pm };
      });

      // Activity: 08:30 to 10:15 (duration 105 mins)
      // Intensity: light (0.012 m³/min), Environment: outdoor (ratio 1.0)
      // Slice 1: 08:30 to 09:00 = 30 mins * 60 µg/m³ * 0.012 m³/min = 21.6 µg
      // Slice 2: 09:00 to 10:00 = 60 mins * 120 µg/m³ * 0.012 m³/min = 86.4 µg
      // Slice 3: 10:00 to 10:15 = 15 mins * 180 µg/m³ * 0.012 m³/min = 32.4 µg
      // Expected Total Mass = 21.6 + 86.4 + 32.4 = 140.4 µg
      const result = calculateInhaledMassForIntervals({
        startIso: '2026-11-23T08:30:00+05:30',
        endIso: '2026-11-23T10:15:00+05:30',
        intensity: 'light',
        environment: 'outdoor',
        forecastPoints: steppedPoints,
        timezone: 'Asia/Kolkata',
      });

      expect(result.status).toBe('available');
      if (result.status === 'available') {
        expect(result.durationMinutes).toBe(105);
        expect(result.inhaledMassUg).toBeCloseTo(140.4, 1);
        expect(result.slices).toHaveLength(3);
        expect(result.slices[0].durationMinutes).toBe(30);
        expect(result.slices[1].durationMinutes).toBe(60);
        expect(result.slices[2].durationMinutes).toBe(15);
      }
    });
  });
});
