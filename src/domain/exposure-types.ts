/**
 * Avir Exposure Domain Types & Physical Inhalation Contracts
 * Step 13: Inhaled Pollutant Mass Physics & Step 14: Commute Intelligence
 * 
 * Sourced from US EPA Exposure Factors Handbook (2011) and WHO Guidelines.
 */

import { ActivityEnvironment, ActivityIntensity } from './routine-types';

/**
 * Physiological minute ventilation rates (m³/min) for adults (~70kg)
 * Source: US EPA Exposure Factors Handbook (2011, Table 6-1).
 */
export const MINUTE_VENTILATION_RATES_M3_MIN: Record<ActivityIntensity, number> = {
  resting: 0.008,   // 8.0 L/min (Sleep / Reclining)
  light: 0.012,     // 12.0 L/min (Sedentary / Gentle movement)
  moderate: 0.025,  // 25.0 L/min (Brisk walk / Casual cycle)
  vigorous: 0.045,  // 45.0 L/min (Running / Intense cardio)
};

/**
 * Hourly ventilation rates (m³/h) derived strictly from minute rates * 60
 */
export const HOURLY_VENTILATION_RATES_M3_H: Record<ActivityIntensity, number> = {
  resting: 0.008 * 60,   // 0.48 m³/h
  light: 0.012 * 60,     // 0.72 m³/h
  moderate: 0.025 * 60,  // 1.50 m³/h
  vigorous: 0.045 * 60,  // 2.70 m³/h
};

/**
 * Microenvironment penetration & concentration ratios (C_micro / C_ambient).
 * Sourced from empirical indoor/in-cabin infiltration literature.
 */
export const DEFAULT_MICROENVIRONMENT_RATIOS: Record<ActivityEnvironment, number> = {
  outdoor: 1.00,             // Direct ambient exposure
  indoor_unfiltered: 0.75,   // Naturally ventilated residential envelope
  indoor_clean: 0.20,        // Active filtration achieving 3-5 ACH in sealed room
  transit_car: 0.30,         // Cabin with windows closed, recirculation ON
  transit_bus: 0.55,         // Air-conditioned municipal bus
  transit_metro: 0.25,       // Underground / sealed carriage with HVAC
  transit_active: 1.15,      // Near-roadway walking/cycling tailpipe plume
};

export interface ActivityExposureBreakdown {
  activityId: string;
  activityName: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  environment: ActivityEnvironment;
  intensity: ActivityIntensity;
  ambientConcentrationUgM3: number;
  microenvironmentRatio: number;
  effectiveConcentrationUgM3: number;
  ventilationRateM3Min: number;
  inhaledMassUg: number;
}

export interface InhaledMassCalculation {
  totalInhaledMassUg: number;
  totalDurationHours: number;
  averageAmbientConcentrationUgM3: number;
  averageEffectiveConcentrationUgM3: number;
  activityBreakdowns: ActivityExposureBreakdown[];
  calculatedAt: string;
  calculationMethod: 'discrete_time_integral';
  provenance: {
    source: string;
    assumptions: string[];
    isEstimated: true;
  };
}

export type CommuteTransitMode =
  | 'walking'
  | 'cycling'
  | 'car_windows_open'
  | 'car_recirc_on'
  | 'bus_standard'
  | 'bus_ac'
  | 'metro';

export interface CommuteModeProfile {
  mode: CommuteTransitMode;
  displayName: string;
  defaultRatio: number;
  intensity: ActivityIntensity;
  ventilationRateM3Min: number;
  description: string;
}

export const COMMUTE_MODE_PROFILES: Record<CommuteTransitMode, CommuteModeProfile> = {
  walking: {
    mode: 'walking',
    displayName: 'Walking (Roadway)',
    defaultRatio: 1.15,
    intensity: 'moderate',
    ventilationRateM3Min: 0.025,
    description: 'Direct roadway exposure with elevated ventilation due to walking exertion.',
  },
  cycling: {
    mode: 'cycling',
    displayName: 'Cycling',
    defaultRatio: 1.15,
    intensity: 'vigorous',
    ventilationRateM3Min: 0.045,
    description: 'Elevated inhalation volume during active roadway exertion.',
  },
  car_windows_open: {
    mode: 'car_windows_open',
    displayName: 'Car (Windows Down)',
    defaultRatio: 0.90,
    intensity: 'light',
    ventilationRateM3Min: 0.012,
    description: 'Ambient tailpipe exhaust intrusion through open vehicle windows.',
  },
  car_recirc_on: {
    mode: 'car_recirc_on',
    displayName: 'Car (AC / Cabin Recirculation)',
    defaultRatio: 0.30,
    intensity: 'light',
    ventilationRateM3Min: 0.012,
    description: 'Closed cabin with active recirculation and cabin particulate filter.',
  },
  bus_standard: {
    mode: 'bus_standard',
    displayName: 'Bus (Non-AC / Open Windows)',
    defaultRatio: 0.85,
    intensity: 'light',
    ventilationRateM3Min: 0.012,
    description: 'Naturally ventilated bus with roadway particle intrusion.',
  },
  bus_ac: {
    mode: 'bus_ac',
    displayName: 'Bus (Air-Conditioned)',
    defaultRatio: 0.55,
    intensity: 'light',
    ventilationRateM3Min: 0.012,
    description: 'Closed passenger cabin with standard commercial HVAC filtration.',
  },
  metro: {
    mode: 'metro',
    displayName: 'Metro / Rapid Transit',
    defaultRatio: 0.25,
    intensity: 'light',
    ventilationRateM3Min: 0.012,
    description: 'Sealed modern train carriages with continuous active air filtration.',
  },
};

export interface CommuteScenarioResult {
  mode: CommuteTransitMode;
  displayName: string;
  durationMinutes: number;
  ambientPM25: number;
  microenvironmentRatio: number;
  effectivePM25: number;
  ventilationRateM3Min: number;
  inhaledMassUg: number;
  relativeSavingsVsHighestPercent: number;
}

export interface CommuteComparisonReport {
  ambientPM25: number;
  distanceKm?: number;
  scenarios: CommuteScenarioResult[];
  lowestExposureMode: CommuteTransitMode;
  highestExposureMode: CommuteTransitMode;
  maxAbsoluteDifferenceUg: number;
  calculatedAt: string;
}
