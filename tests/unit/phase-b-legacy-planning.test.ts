import { describe, it, expect } from 'vitest';
import { generateLocalHeuristicPlan } from '@/services/ai-assistant-service';

describe('Phase B Critical Regression Suite: Legacy Planning Replacement (C16–C19)', () => {
  const sampleMetrics = {
    status: 'success' as const,
    provenance: 'modeled_forecast' as const,
    retrievedAt: '2026-11-23T06:00:00Z',
    timezone: 'Asia/Kolkata',
    isLive: true,
    pm25: 140,
    pm10: 220,
    usAqi: 195,
    boundaryLayerHeight: 350,
    isThermalInversionActive: false,
    timestamp: '2026-11-23T06:00:00Z',
    hourlyForecast: [],
  };

  const sampleProfile = {
    ageGroup: 'adult' as const,
    hasAsthmaOrRespiratory: false,
    hasCardiovascularCondition: false,
    isPregnant: false,
    isOutdoorWorker: false,
  };

  it('C16: Legacy planner does NOT apply a fixed 75% commute reduction without data', () => {
    const plan = generateLocalHeuristicPlan({
      city: 'Delhi-NCR',
      metrics: sampleMetrics,
      profile: sampleProfile,
    });

    const commuteShift = plan.routineShifts.find(s => s.activityName.includes('Commute'));
    if (commuteShift) {
      // Must NOT be unconditionally hardcoded 75%
      expect(commuteShift.reductionPercentage).not.toBe(75);
    }
  });

  it('C17: Legacy planner does NOT hardcode "13:30 - 14:15" when forecast is missing', () => {
    const plan = generateLocalHeuristicPlan({
      city: 'Delhi-NCR',
      metrics: { ...sampleMetrics, hourlyForecast: [] },
      profile: sampleProfile,
    });

    const ventShift = plan.routineShifts.find(s => s.activityName.includes('Ventilation'));
    if (ventShift) {
      expect(ventShift.optimizedTimeWindow).not.toBe('13:30 - 14:15');
      expect(ventShift.isOptimizationAvailable).toBe(false);
    }
  });

  it('C18: Legacy planner completely eliminates cigarette equivalence metrics', () => {
    const plan = generateLocalHeuristicPlan({
      city: 'Delhi-NCR',
      metrics: sampleMetrics,
      profile: sampleProfile,
    });

    expect((plan as unknown as Record<string, unknown>).avoidedCigarettesDaily).toBeUndefined();
    expect((plan as unknown as Record<string, unknown>).avoidedCigarettesMonthly).toBeUndefined();
    if (plan.impactMetrics) {
      expect((plan.impactMetrics as unknown as Record<string, unknown>).avoidedCigarettesDaily).toBeUndefined();
      expect((plan.impactMetrics as unknown as Record<string, unknown>).avoidedCigarettesMonthly).toBeUndefined();
    }
  });

  it('C19: Legacy planner does NOT assert unsupported thermal-inversion claims when unverified', () => {
    const plan = generateLocalHeuristicPlan({
      city: 'Delhi-NCR',
      metrics: { ...sampleMetrics, isThermalInversionActive: false, boundaryLayerHeight: null },
      profile: sampleProfile,
    });

    expect(plan.summaryAdvisory).not.toContain('Ground thermal inversion is ACTIVE');
    expect(plan.summaryAdvisory).not.toContain('Ground thermal inversion is DISSIPATING');
  });
});
