import { describe, it, expect } from 'vitest';
import {
  calculateDailyScheduleExposure,
  calculateActivityInhaledMass,
  calculateExposureReduction,
} from '@/services/exposure/exposure-engine';
import { DailySchedule } from '@/domain/routine-types';

describe('Step 13 — Scientifically Defensible Exposure Engine', () => {
  describe('Inhaled Mass Physics Formulation', () => {
    it('calculates inhaled mass using EPA minute ventilation and duration', () => {
      // 60 minutes outdoor (ratio 1.0) vigorous (0.045 m³/min) at 100 µg/m³
      // Inhaled Mass = 100 µg/m³ * 0.045 m³/min * 60 min = 270 µg
      const mass = calculateActivityInhaledMass({
        ambientPM25: 100,
        durationMinutes: 60,
        intensity: 'vigorous',
        environment: 'outdoor',
      });
      expect(mass).toBe(270);
    });

    it('applies microenvironment ratio correctly to ambient concentration', () => {
      // 60 minutes indoor clean (ratio 0.20) resting (0.008 m³/min) at 100 µg/m³
      // C_micro = 20 µg/m³
      // Inhaled Mass = 20 * 0.008 * 60 = 9.6 µg
      const mass = calculateActivityInhaledMass({
        ambientPM25: 100,
        durationMinutes: 60,
        intensity: 'resting',
        environment: 'indoor_clean',
      });
      expect(mass).toBe(9.6);
    });

    it('supports custom user-overridden microenvironment ratio', () => {
      // Custom ratio = 0.10 (e.g. tightly sealed room with oversized HEPA)
      const mass = calculateActivityInhaledMass({
        ambientPM25: 100,
        durationMinutes: 60,
        intensity: 'resting',
        environment: 'indoor_clean',
        customMicroenvironmentRatio: 0.10,
      });
      expect(mass).toBe(4.8);
    });
  });

  describe('Elimination of B-004: Arbitrary Health Multipliers', () => {
    it('produces identical physical inhaled mass regardless of user clinical diagnosis', () => {
      // A person with asthma and a person without asthma inhale the exact same mass of air
      // for a given breathing rate and duration.
      const baseParams = {
        ambientPM25: 150,
        durationMinutes: 45,
        intensity: 'moderate' as const,
        environment: 'outdoor' as const,
      };

      const generalMass = calculateActivityInhaledMass(baseParams);
      // No arbitrary +0.55 or +0.40 multipliers exist in the physical calculation!
      // Inhaled Mass = 150 * 0.025 * 45 = 168.75 µg
      expect(generalMass).toBe(168.75);
    });
  });

  describe('Elimination of B-005: Cigarette Equivalence Removal', () => {
    it('does not include cigarette-equivalent metrics in calculation results', () => {
      const schedule: DailySchedule = {
        id: 'test-sched',
        name: 'Simple Day',
        timezone: 'UTC',
        createdAt: '2026-11-23T00:00:00Z',
        updatedAt: '2026-11-23T00:00:00Z',
        activities: [
          {
            id: 'act-1',
            name: 'Sleep',
            startTime: '00:00',
            endTime: '08:00',
            durationMinutes: 480,
            intensity: 'resting',
            environment: 'indoor_clean',
            isFlexible: false,
          },
        ],
      };

      const result = calculateDailyScheduleExposure(schedule, 80);
      expect((result as unknown as Record<string, unknown>).berkeleyCigarettes).toBeUndefined();
      expect((result as unknown as Record<string, unknown>).cigaretteFraction).toBeUndefined();
      expect(result.calculationMethod).toBe('discrete_time_integral');
      expect(result.totalInhaledMassUg).toBeGreaterThan(0);
    });
  });

  describe('Schedule Exposure Aggregation & Delta Mathematics', () => {
    it('aggregates daily routine activities into detailed exposure breakdown', () => {
      const schedule: DailySchedule = {
        id: 'test-sched',
        name: 'Full Day',
        timezone: 'UTC',
        createdAt: '2026-11-23T00:00:00Z',
        updatedAt: '2026-11-23T00:00:00Z',
        activities: [
          {
            id: 'act-run',
            name: 'Morning Run',
            startTime: '07:00',
            endTime: '08:00',
            durationMinutes: 60,
            intensity: 'vigorous',
            environment: 'outdoor',
            isFlexible: true,
          },
          {
            id: 'act-desk',
            name: 'Office Work',
            startTime: '09:00',
            endTime: '17:00',
            durationMinutes: 480,
            intensity: 'light',
            environment: 'indoor_clean',
            isFlexible: false,
          },
        ],
      };

      const report = calculateDailyScheduleExposure(schedule, 120);
      expect(report.activityBreakdowns).toHaveLength(2);
      expect(report.totalDurationHours).toBe(9); // 1h + 8h
      expect(report.totalInhaledMassUg).toBeGreaterThan(0);

      const runAct = report.activityBreakdowns.find(a => a.activityId === 'act-run');
      // Run: 120 * 0.045 * 60 = 324 µg
      expect(runAct?.inhaledMassUg).toBe(324);

      const deskAct = report.activityBreakdowns.find(a => a.activityId === 'act-desk');
      // Desk: 120 * 0.20 * 0.012 * 480 = 138.24 µg
      expect(deskAct?.inhaledMassUg).toBe(138.24);

      expect(report.totalInhaledMassUg).toBe(462.24);
    });

    it('calculates reduction metrics safely with zero division safeguards', () => {
      // Baseline 500 µg, Alternative 350 µg => 150 µg savings (30%)
      const standard = calculateExposureReduction(500, 350);
      expect(standard.absoluteSavingsUg).toBe(150);
      expect(standard.percentageSavings).toBe(30);

      // Baseline 0 µg => safely returns 0% rather than NaN or Infinity
      const zeroBase = calculateExposureReduction(0, 0);
      expect(zeroBase.absoluteSavingsUg).toBe(0);
      expect(zeroBase.percentageSavings).toBe(0);

      // Negative savings (alternative exposure is higher)
      const higher = calculateExposureReduction(300, 450);
      expect(higher.absoluteSavingsUg).toBe(-150);
      expect(higher.percentageSavings).toBe(-50);
    });
  });
});
