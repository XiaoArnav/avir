/**
 * Avir Commute Intelligence Service
 * Step 14: Dynamic Commute Scenario Comparison & Transparent Microenvironments
 * 
 * Replaces fixed 85%/75% reduction claims (B-003) and cigarette fraction claims (B-005)
 * with transparent, user-editable microenvironment factors and EPA minute ventilation rates.
 */

import {
  COMMUTE_MODE_PROFILES,
  CommuteComparisonReport,
  CommuteScenarioResult,
  CommuteTransitMode,
} from '@/domain/exposure-types';

export interface EvaluateCommuteParams {
  ambientPM25: number;
  durationMinutes: number;
  customRatios?: Partial<Record<CommuteTransitMode, number>>;
  distanceKm?: number;
}

/**
 * Calculates exposure and inhaled mass for a single commute mode.
 */
export function calculateCommuteModeExposure(
  mode: CommuteTransitMode,
  ambientPM25: number,
  durationMinutes: number,
  customRatio?: number
): CommuteScenarioResult {
  if (ambientPM25 < 0) {
    throw new Error('Ambient PM2.5 must be non-negative.');
  }
  if (durationMinutes <= 0) {
    throw new Error('Duration must be a strictly positive number of minutes.');
  }

  const profile = COMMUTE_MODE_PROFILES[mode];
  if (!profile) {
    throw new Error(`Unknown commute transit mode: ${mode}`);
  }

  const ratio = typeof customRatio === 'number' && customRatio >= 0 ? customRatio : profile.defaultRatio;
  const effectivePM25 = Math.round(ambientPM25 * ratio * 10) / 10;
  const ventilationRate = profile.ventilationRateM3Min;

  // Mass (µg) = effective PM2.5 (µg/m³) * ventilation rate (m³/min) * duration (min)
  const inhaledMassUg = Math.round(effectivePM25 * ventilationRate * durationMinutes * 100) / 100;

  return {
    mode,
    displayName: profile.displayName,
    durationMinutes,
    ambientPM25,
    microenvironmentRatio: ratio,
    effectivePM25,
    ventilationRateM3Min: ventilationRate,
    inhaledMassUg,
    relativeSavingsVsHighestPercent: 0, // Populated during multi-mode comparison
  };
}

/**
 * Evaluates and compares all supported transit modes for a given commute trip.
 */
export function evaluateCommuteScenarios(params: EvaluateCommuteParams): CommuteComparisonReport {
  const { ambientPM25, durationMinutes, customRatios, distanceKm } = params;

  if (ambientPM25 < 0) {
    throw new Error('Ambient PM2.5 must be non-negative.');
  }
  if (durationMinutes <= 0) {
    throw new Error('Duration must be a strictly positive number of minutes.');
  }

  const modes: CommuteTransitMode[] = [
    'walking',
    'cycling',
    'car_windows_open',
    'bus_standard',
    'bus_ac',
    'car_recirc_on',
    'metro',
  ];

  const scenarios: CommuteScenarioResult[] = modes.map(mode =>
    calculateCommuteModeExposure(mode, ambientPM25, durationMinutes, customRatios?.[mode])
  );

  // Find highest and lowest inhaled mass modes
  let highestMass = -Infinity;
  let lowestMass = Infinity;
  let highestMode: CommuteTransitMode = 'cycling';
  let lowestMode: CommuteTransitMode = 'metro';

  for (const s of scenarios) {
    if (s.inhaledMassUg > highestMass) {
      highestMass = s.inhaledMassUg;
      highestMode = s.mode;
    }
    if (s.inhaledMassUg < lowestMass) {
      lowestMass = s.inhaledMassUg;
      lowestMode = s.mode;
    }
  }

  // Calculate relative savings vs highest-exposure mode
  for (const s of scenarios) {
    if (highestMass > 0) {
      const diff = highestMass - s.inhaledMassUg;
      s.relativeSavingsVsHighestPercent = Math.round((diff / highestMass) * 1000) / 10;
    } else {
      s.relativeSavingsVsHighestPercent = 0;
    }
  }

  const maxAbsoluteDifferenceUg = Math.round((highestMass - lowestMass) * 100) / 100;

  return {
    ambientPM25,
    distanceKm,
    scenarios,
    lowestExposureMode: lowestMode,
    highestExposureMode: highestMode,
    maxAbsoluteDifferenceUg,
    calculatedAt: new Date().toISOString(),
  };
}
