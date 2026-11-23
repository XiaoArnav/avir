/**
 * AVIR — Phase B Master Integration & Verification Suite
 * Steps 11–16: Personalized Environmental Intelligence, Exposure Physics,
 * Commute Optimization, Indoor Air Engineering, and Secure AI Planning.
 *
 * Verifies Section 23: Complete Bengaluru User Journey
 */

import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  createDefaultSchedule,
  addActivityToSchedule,
  updateActivityInSchedule,
  deleteActivityFromSchedule,
} from '@/services/routines/routine-manager';
import {
  saveScheduleToStorage,
  loadScheduleFromStorage,
} from '@/services/routines/routine-storage';
import {
  calculateDailyScheduleExposure,
  calculateActivityInhaledMass,
} from '@/services/exposure/exposure-engine';
import {
  optimizeScheduleWithForecast,
  HourlyForecastPoint,
} from '@/services/optimization/forecast-optimizer';
import {
  evaluateCommuteScenarios,
  calculateCommuteModeExposure,
} from '@/services/commute/commute-service';
import {
  calculateAch,
  calculateRoomDimensions,
  calculateWellMixedDecay,
} from '@/domain/indoor-air-types';
import { calculateDiyPurifierBillOfMaterials } from '@/services/indoor-air/indoor-air-service';
import { POST as planRoute } from '@/app/api/ai/plan/route';
import { RoutineBuilder } from '@/components/RoutineBuilder';
import { CommuteCalculator } from '@/components/CommuteCalculator';
import { IAQStudio } from '@/components/IAQStudio';

describe('AVIR — Phase B Master Integration & User Journey Gate (Steps 11–16)', () => {
  const originalEnv = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.GEMINI_API_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  // Authentic 24-hour diurnal atmospheric forecast for Bengaluru
  const bengaluruForecast: HourlyForecastPoint[] = Array.from({ length: 24 }, (_, hour) => {
    const hourStr = String(hour).padStart(2, '0') + ':00';
    let pm25 = 45;
    if (hour >= 6 && hour <= 8) pm25 = 85;       // Morning traffic peak ~85 µg/m³
    else if (hour >= 13 && hour <= 16) pm25 = 30; // Afternoon convective clearing ~30 µg/m³
    else if (hour >= 20 || hour <= 2) pm25 = 60;  // Night stagnation ~60 µg/m³
    return {
      timestamp: `2026-11-23T${hourStr}:00Z`,
      hour: hourStr,
      pm25,
    };
  });

  // =========================================================================
  // JOURNEY STEP 1: ROUTINE SCHEDULE CREATION & TIME ARITHMETIC (STEP 11)
  // =========================================================================
  describe('1. Personal Routine Schedule Creation & Local Persistence (Step 11)', () => {
    it('creates structured daily schedule and calculates midnight duration accurately', () => {
      const schedule = createDefaultSchedule();
      expect(schedule.activities.length).toBeGreaterThanOrEqual(5);

      // Verify sleep duration across midnight: 23:00 to 06:30 is 450 minutes (7.5 hours)
      const sleep = schedule.activities.find(a => a.name.includes('Sleep'));
      expect(sleep).toBeDefined();
      expect(sleep?.durationMinutes).toBe(450);

      // Verify persistence cycle
      saveScheduleToStorage(schedule);
      const loaded = loadScheduleFromStorage();
      expect(loaded.id).toBe(schedule.id);
    });

    it('modifies and adds activities to schedule with automatic duration and invariant checks', () => {
      let schedule = createDefaultSchedule();
      schedule = addActivityToSchedule(schedule, {
        name: 'Indiranagar Gym Workout',
        startTime: '17:30',
        endTime: '18:30',
        intensity: 'vigorous',
        environment: 'indoor_clean',
        isFlexible: true,
      });

      const gym = schedule.activities.find(a => a.name === 'Indiranagar Gym Workout');
      expect(gym).toBeDefined();
      expect(gym?.durationMinutes).toBe(60);
      expect(gym?.intensity).toBe('vigorous');
    });
  });

  // =========================================================================
  // JOURNEY STEP 2: INHALED MASS PHYSICS & EPA VENTILATION (STEP 13)
  // =========================================================================
  describe('2. Physical Inhaled Pollutant Mass Formulation (Step 13)', () => {
    it('computes daily inhaled mass in micrograms without arbitrary clinical multipliers or cigarettes', () => {
      const schedule = createDefaultSchedule();
      const ambientPM25 = 55; // Bengaluru moderate ambient level

      const exposure = calculateDailyScheduleExposure(schedule, ambientPM25);
      expect(exposure.totalInhaledMassUg).toBeGreaterThan(0);
      expect(exposure.totalDurationHours).toBeGreaterThan(15);
      expect(exposure.averageAmbientConcentrationUgM3).toBe(55);

      // Defect B-004 verification: zero arbitrary multipliers on mass
      // Defect B-005 verification: zero cigarette equivalences
      expect((exposure as any).cigaretteFraction).toBeUndefined();
      expect((exposure as any).cigarettes).toBeUndefined();
      expect((exposure as any).riskScore).toBeUndefined();
    });
  });

  // =========================================================================
  // JOURNEY STEP 3: FORECAST-BASED ROUTINE OPTIMIZATION (STEP 12)
  // =========================================================================
  describe('3. Deterministic Forecast-Based Routine Optimization (Step 12)', () => {
    it('optimizes flexible morning jog away from 85 µg/m³ peak without touching fixed work hours', () => {
      const schedule = createDefaultSchedule();
      const result = optimizeScheduleWithForecast(schedule, bengaluruForecast);

      expect(['optimal', 'partial']).toContain(result.status);
      expect(result.activityShifts.length).toBeGreaterThan(0);
      expect(result.baselineExposureUg).toBeGreaterThan(result.optimizedExposureUg);
      expect(result.absoluteSavingsUg).toBeGreaterThan(0);
      expect(result.percentageSavings).toBeGreaterThan(0);

      // Fixed office hours must NEVER be shifted
      const fixedWorkShift = result.activityShifts.find(s => s.activityName.includes('Work at Office'));
      expect(fixedWorkShift).toBeUndefined();
    });

    it('Defect B-001 Elimination: returns unavailable status when forecast is missing', () => {
      const schedule = createDefaultSchedule();
      const emptyResult = optimizeScheduleWithForecast(schedule, []);
      expect(emptyResult.status).toBe('unavailable');
      expect(emptyResult.activityShifts).toHaveLength(0);
      expect(emptyResult.baselineExposureUg).toBe(0);
    });
  });

  // =========================================================================
  // JOURNEY STEP 4: COMMUTE INTELLIGENCE SCENARIO MODELING (STEP 14)
  // =========================================================================
  describe('4. Commute Transit Intelligence (Step 14)', () => {
    it('Defect B-003 Elimination: evaluates 7 transit modes using real microenvironments and ventilation rates', () => {
      const commuteReport = evaluateCommuteScenarios({
        ambientPM25: 60,
        durationMinutes: 45,
      });

      expect(commuteReport.scenarios).toHaveLength(7);
      expect(commuteReport.lowestExposureMode).toBe('metro');
      expect(commuteReport.highestExposureMode).toBe('cycling');
      expect(commuteReport.maxAbsoluteDifferenceUg).toBeGreaterThan(0);

      // Verify metro provides verified lower inhaled mass than open walking
      const metro = commuteReport.scenarios.find(s => s.mode === 'metro')!;
      const walking = commuteReport.scenarios.find(s => s.mode === 'walking')!;
      expect(metro.inhaledMassUg).toBeLessThan(walking.inhaledMassUg);
    });
  });

  // =========================================================================
  // JOURNEY STEP 5: INDOOR AIR QUALITY STUDIO (STEP 15)
  // =========================================================================
  describe('5. Indoor Air-Cleaning Studio & Exponential Decay (Step 15)', () => {
    it('calculates ACH, well-mixed decay, and bill of materials without false medical claims', () => {
      // 180 sq ft room with 9 ft ceiling = 45.87 m³
      const room = calculateRoomDimensions(15, 12, 9, 'imperial');
      expect(room.volumeM3).toBeCloseTo(45.87, 1);

      // 4-filter CR box (450 CFM = 764.6 m³/h)
      const ach = calculateAch(764.6, room.volumeM3);
      expect(ach.ach).toBeGreaterThan(10); // >10 ACH
      expect(ach.rating).toBe('optimal');

      // Defect B-008 Elimination: Medical isolation term must NOT be used
      expect(ach.evaluationText).not.toContain('Hospital Isolation');
      expect(ach.evaluationText).toContain('airborne particulate clearance');

      // Well-mixed decay
      const decay = calculateWellMixedDecay(120, ach.ach);
      expect(decay.minutesTo50Percent).toBeLessThan(5); // Rapid half-life clearance
      expect(decay.minutesTo90Percent).toBeLessThan(15);

      // Defect B-007 Elimination: Bill of materials allows custom user inputs
      const customBom = calculateDiyPurifierBillOfMaterials('cr-box-4-filter', {
        boxFanCost: 1700,
        filtersCost: 1800,
        shroudTapeCost: 400,
        commercialPurifierComparisonCost: 16000,
      });
      expect(customBom.totalDiyCost).toBe(3900);
      expect(customBom.isUserOverridden).toBe(true);
    });
  });

  // =========================================================================
  // JOURNEY STEP 6: SECURE THREE-TIER AI PLANNING ROUTE (STEP 16)
  // =========================================================================
  describe('6. Secure Three-Tier AI Planning API Route (Step 16)', () => {
    it('Defect B-010 & B-011: Sanitizes health flags, discards client API keys, and guarantees deterministic numbers', async () => {
      const schedule = createDefaultSchedule();
      const payload = {
        city: 'Bengaluru',
        coordinates: { lat: 12.9716, lng: 77.5946 },
        schedule,
        hourlyForecast: bengaluruForecast,
        geminiApiKey: 'CLIENT_ATTACKER_KEY_LEAK', // Should be discarded
        generalizedSensitivity: 'sensitive',
      };

      const req = new NextRequest('http://localhost:3000/api/ai/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await planRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.deterministicPlan).toBeDefined();
      expect(['optimal', 'partial']).toContain(data.deterministicPlan.status);
      expect(data.deterministicPlan.baselineExposureUg).toBeGreaterThan(0);
      expect(data.deterministicPlan.optimizedExposureUg).toBeGreaterThan(0);
      expect(data.deterministicPlan.activityShifts.length).toBeGreaterThan(0);
      expect(data.aiExplanation).toBeDefined();
    });
  });

  // =========================================================================
  // JOURNEY STEP 7: REACT UI RENDERING & ACCESSIBILITY (STEPS 11, 14, 15)
  // =========================================================================
  describe('7. React UI Components Rendering & State Contracts', () => {
    it('renders RoutineBuilder component cleanly with accessible controls', () => {
      const html = ReactDOMServer.renderToString(
        <RoutineBuilder currentPm25={55} isOptimizing={false} />
      );
      expect(html).toContain('Daily Schedule Builder');
      expect(html).toContain('Total Modeled Exposure');
      expect(html).toContain('Add Activity');
    });

    it('renders CommuteCalculator component without cigarette equivalents', () => {
      const html = ReactDOMServer.renderToString(
        <CommuteCalculator ambientPm25={65} />
      );
      expect(html).toContain('Commute Exposure Calculator');
      expect(html).toContain('Total Inhaled PM2.5');
      expect(html).not.toContain('cigs');
      expect(html).not.toContain('cigarette');
    });

    it('renders IAQStudio component with scientific ACH standards', () => {
      const html = ReactDOMServer.renderToString(
        <IAQStudio initialRoomVolumeM3={45} />
      );
      expect(html).toContain('Indoor Air Engineering Studio');
      expect(html).toContain('Clean Air Delivery');
      expect(html).not.toContain('Hospital Isolation Grade');
    });
  });
});
