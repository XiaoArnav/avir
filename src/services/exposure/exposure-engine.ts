/**
 * Avir Exposure Engine Service
 * Step 13: Scientifically Defensible Inhaled Pollutant Mass Physics
 * 
 * Replaces unscientific health multipliers (B-004) and cigarette equivalence (B-005)
 * with the classical physical time integral of concentration, ventilation, and microenvironment penetration.
 */

import {
  ActivityEnvironment,
  ActivityIntensity,
  DailySchedule,
  RoutineActivity,
  calculateActivityDurationMinutes,
} from '@/domain/routine-types';
import {
  ActivityExposureBreakdown,
  DEFAULT_MICROENVIRONMENT_RATIOS,
  InhaledMassCalculation,
  MINUTE_VENTILATION_RATES_M3_MIN,
} from '@/domain/exposure-types';

export interface ActivityInhaledMassParams {
  ambientPM25: number;
  durationMinutes: number;
  intensity: ActivityIntensity;
  environment: ActivityEnvironment;
  customMicroenvironmentRatio?: number;
}

/**
 * Calculates physical inhaled mass in micrograms (µg) for a single activity.
 * 
 * Equation:
 * Inhaled Mass (µg) = C_ambient * η_micro * V_E * Δt
 * where:
 * - C_ambient is in µg/m³
 * - η_micro is unitless microenvironment ratio
 * - V_E is minute ventilation rate in m³/min (US EPA Exposure Factors Handbook)
 * - Δt is duration in minutes
 */
export function calculateActivityInhaledMass(params: ActivityInhaledMassParams): number {
  const {
    ambientPM25,
    durationMinutes,
    intensity,
    environment,
    customMicroenvironmentRatio,
  } = params;

  if (ambientPM25 < 0 || durationMinutes <= 0) {
    return 0;
  }

  const ratio =
    typeof customMicroenvironmentRatio === 'number' && customMicroenvironmentRatio >= 0
      ? customMicroenvironmentRatio
      : (DEFAULT_MICROENVIRONMENT_RATIOS[environment] ?? 1.0);

  const effectiveConcentration = ambientPM25 * ratio;
  const minuteVentilation = MINUTE_VENTILATION_RATES_M3_MIN[intensity] || 0.012;

  // µg/m³ * m³/min * min = µg
  const massUg = effectiveConcentration * minuteVentilation * durationMinutes;
  return Math.round(massUg * 100) / 100;
}

/**
 * Calculates the comprehensive physical exposure report for an entire DailySchedule.
 */
export function calculateDailyScheduleExposure(
  schedule: DailySchedule,
  ambientPM25: number,
  customRatios?: Partial<Record<ActivityEnvironment, number>>
): InhaledMassCalculation {
  const isInvalidAmbient =
    ambientPM25 === null ||
    ambientPM25 === undefined ||
    typeof ambientPM25 !== 'number' ||
    isNaN(ambientPM25) ||
    ambientPM25 < 0;

  if (isInvalidAmbient) {
    let totalDurationMinutes = 0;
    for (const activity of schedule.activities) {
      totalDurationMinutes += calculateActivityDurationMinutes(activity.startTime, activity.endTime);
    }
    return {
      status: 'unavailable',
      reason: 'A valid PM2.5 measurement or forecast is required to estimate exposure.',
      totalInhaledMassUg: null,
      totalDurationHours: Math.round((totalDurationMinutes / 60) * 10) / 10,
      averageAmbientConcentrationUgM3: null,
      averageEffectiveConcentrationUgM3: null,
      activityBreakdowns: [],
      calculatedAt: new Date().toISOString(),
      calculationMethod: 'discrete_time_integral',
      provenance: {
        source: 'US EPA Exposure Factors Handbook (2011)',
        assumptions: ['Exposure calculation unavailable due to missing or invalid PM2.5 data.'],
        isEstimated: false,
      },
    };
  }

  const activityBreakdowns: ActivityExposureBreakdown[] = [];
  let totalInhaledMassUg = 0;
  let totalDurationMinutes = 0;
  let weightedEffectiveSum = 0;

  for (const activity of schedule.activities) {
    const duration = calculateActivityDurationMinutes(activity.startTime, activity.endTime);
    const ratio =
      customRatios?.[activity.environment] ??
      (DEFAULT_MICROENVIRONMENT_RATIOS[activity.environment] ?? 1.0);

    const effectiveConcentration = Math.round(ambientPM25 * ratio * 10) / 10;
    const ventilationRate = MINUTE_VENTILATION_RATES_M3_MIN[activity.intensity] || 0.012;
    const activityMass = calculateActivityInhaledMass({
      ambientPM25,
      durationMinutes: duration,
      intensity: activity.intensity,
      environment: activity.environment,
      customMicroenvironmentRatio: ratio,
    });

    activityBreakdowns.push({
      activityId: activity.id,
      activityName: activity.name,
      startTime: activity.startTime,
      endTime: activity.endTime,
      durationMinutes: duration,
      environment: activity.environment,
      intensity: activity.intensity,
      ambientConcentrationUgM3: ambientPM25,
      microenvironmentRatio: ratio,
      effectiveConcentrationUgM3: effectiveConcentration,
      ventilationRateM3Min: ventilationRate,
      inhaledMassUg: activityMass,
    });

    totalInhaledMassUg += activityMass;
    totalDurationMinutes += duration;
    weightedEffectiveSum += effectiveConcentration * duration;
  }

  const averageEffectiveConcentrationUgM3 =
    totalDurationMinutes > 0
      ? Math.round((weightedEffectiveSum / totalDurationMinutes) * 10) / 10
      : 0;

  return {
    status: 'available',
    totalInhaledMassUg: Math.round(totalInhaledMassUg * 100) / 100,
    totalDurationHours: Math.round((totalDurationMinutes / 60) * 10) / 10,
    averageAmbientConcentrationUgM3: ambientPM25,
    averageEffectiveConcentrationUgM3,
    activityBreakdowns,
    calculatedAt: new Date().toISOString(),
    calculationMethod: 'discrete_time_integral',
    provenance: {
      source: 'US EPA Exposure Factors Handbook (2011)',
      assumptions: [
        'Adult average inhalation rates (~70 kg body mass).',
        'Physical mass of PM2.5 inhaled; zero unscientific clinical multipliers applied.',
        'Cigarette equivalence is excluded from primary health dosages.',
      ],
      isEstimated: true,
    },
  };
}

/**
 * Calculates exposure reduction metrics between baseline and alternative scenario.
 */
export function calculateExposureReduction(
  baselineMassUg: number,
  alternativeMassUg: number
): { absoluteSavingsUg: number; percentageSavings: number } {
  const absoluteSavingsUg = Math.round((baselineMassUg - alternativeMassUg) * 100) / 100;
  if (baselineMassUg <= 0) {
    return { absoluteSavingsUg: 0, percentageSavings: 0 };
  }
  const percentageSavings = Math.round((absoluteSavingsUg / baselineMassUg) * 1000) / 10;
  return {
    absoluteSavingsUg,
    percentageSavings,
  };
}
