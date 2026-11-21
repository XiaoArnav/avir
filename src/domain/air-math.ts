import {
  AQICategory,
  ActivityIntensity,
  UserVulnerabilityProfile,
  ExposureCalculation,
  CorsiRosenthalBoxSpec,
} from './types';

// EPA / CPCB Standard Breakpoints for PM2.5
interface BreakpointDef {
  cLow: number;
  cHigh: number;
  iLow: number;
  iHigh: number;
}

const PM25_BREAKPOINTS: BreakpointDef[] = [
  { cLow: 0.0, cHigh: 12.0, iLow: 0, iHigh: 50 },
  { cLow: 12.1, cHigh: 35.4, iLow: 51, iHigh: 100 },
  { cLow: 35.5, cHigh: 55.4, iLow: 101, iHigh: 150 },
  { cLow: 55.5, cHigh: 150.4, iLow: 151, iHigh: 200 },
  { cLow: 150.5, cHigh: 250.4, iLow: 201, iHigh: 300 },
  { cLow: 250.5, cHigh: 350.4, iLow: 301, iHigh: 400 },
  { cLow: 350.5, cHigh: 500.0, iLow: 401, iHigh: 500 },
];

/**
 * Calculates standardized AQI from PM2.5 concentration (ug/m3) using linear breakpoint interpolation.
 */
export function calculateAQIFromPM25(pm25: number): number {
  if (pm25 <= 0) return 0;
  if (pm25 >= 500) return 500;

  for (const bp of PM25_BREAKPOINTS) {
    if (pm25 <= bp.cHigh) {
      const aqi = ((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) * (pm25 - bp.cLow) + bp.iLow;
      return Math.round(aqi);
    }
  }

  return 500;
}

/**
 * Maps numerical AQI to clinical and public health advisory categories.
 */
export function getAQICategory(aqi: number): AQICategory {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'UnhealthySensitive';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'VeryUnhealthy';
  return 'Hazardous';
}

/**
 * Calculates daily cigarette equivalence from PM2.5 (ug/m3) using Berkeley Earth toxicology:
 * ~22 ug/m3 PM2.5 inhaled over 24 hours is toxicologically equivalent to 1 cigarette.
 */
export function calculateCigaretteEquivalence(pm25: number): number {
  if (pm25 <= 0) return 0;
  return Math.round((pm25 / 22.0) * 10) / 10;
}

export interface GrapStageInfo {
  stage: 'Stage I' | 'Stage II' | 'Stage III' | 'Stage IV' | 'Normal';
  label: string;
  color: string;
  badgeBg: string;
  advisory: string;
}

/**
 * Maps Indian AQI to CAQM Graded Response Action Plan (GRAP) emergency stages.
 */
export function getGrapStage(aqi: number): GrapStageInfo {
  if (aqi > 450) {
    return {
      stage: 'Stage IV',
      label: 'Stage IV (Severe+ / Emergency)',
      color: 'text-rose-400',
      badgeBg: 'bg-rose-500/20 border-rose-500/50 text-rose-300',
      advisory: 'Ban on commercial truck entry, 50% office WFH, hybrid/closed physical schools.',
    };
  }
  if (aqi >= 401) {
    return {
      stage: 'Stage III',
      label: 'Stage III (Severe Smog)',
      color: 'text-purple-400',
      badgeBg: 'bg-purple-500/20 border-purple-500/50 text-purple-300',
      advisory: 'Ban on non-essential construction, BS-III petrol & BS-IV diesel vehicle restrictions.',
    };
  }
  if (aqi >= 301) {
    return {
      stage: 'Stage II',
      label: 'Stage II (Very Poor)',
      color: 'text-orange-400',
      badgeBg: 'bg-orange-500/20 border-orange-500/50 text-orange-300',
      advisory: 'Mechanical vacuum sweeping, diesel generator restrictions, increased parking fees.',
    };
  }
  if (aqi >= 201) {
    return {
      stage: 'Stage I',
      label: 'Stage I (Poor)',
      color: 'text-yellow-400',
      badgeBg: 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300',
      advisory: 'Anti-dust water sprinkling on road corridors, strict fines on open trash burning.',
    };
  }
  return {
    stage: 'Normal',
    label: 'Normal Ambient Air',
    color: 'text-emerald-400',
    badgeBg: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300',
    advisory: 'Standard baseline monitoring; outdoor activities permissible for healthy individuals.',
  };
}

/**
 * Evaluates whether a meteorological thermal inversion layer is trapping ground pollutants.
 * Inversion criteria: nocturnal/early-morning contraction of planetary boundary layer (< 200m).
 */
export function isThermalInversion(boundaryLayerHeight: number, hour: number): boolean {
  if (boundaryLayerHeight < 150) return true;
  const isNocturnalOrMorning = hour >= 20 || hour <= 9;
  return isNocturnalOrMorning && boundaryLayerHeight < 250;
}

// Ventilation volume rates by physical intensity (m3/hour)
const VENTILATION_RATES: Record<ActivityIntensity, number> = {
  resting: 0.45,
  light_walk: 0.8,
  moderate_activity: 1.5,
  intense_exercise: 2.8,
};

/**
 * Calculates cumulative inhaled PM2.5 mass and applies demographic vulnerability weighting.
 */
export function calculateInhaledPM25(
  pm25Concentration: number,
  durationHours: number,
  intensity: ActivityIntensity,
  profile: UserVulnerabilityProfile
): ExposureCalculation {
  const ventilationRate = VENTILATION_RATES[intensity] || 0.8;
  const inhaledMicrograms = pm25Concentration * ventilationRate * durationHours;

  // Calculate vulnerability multiplier based on respiratory/cardiovascular susceptibility
  let multiplier = 1.0;
  if (profile.ageGroup === 'infant') multiplier += 0.5;
  else if (profile.ageGroup === 'child') multiplier += 0.35;
  else if (profile.ageGroup === 'senior') multiplier += 0.3;

  if (profile.hasAsthmaOrRespiratory) multiplier += 0.55;
  if (profile.hasCardiovascularCondition) multiplier += 0.4;
  if (profile.isPregnant) multiplier += 0.35;
  if (profile.isOutdoorWorker) multiplier += 0.2;

  const weightedExposure = inhaledMicrograms * multiplier;

  // Berkeley Earth 24-hr cigarette equivalent for this ambient exposure level
  const equivalentCigarettes = calculateBerkeleyCigarettes(pm25Concentration) * (durationHours / 24);

  // Respiratory Risk Score normalized 0 - 100 against acute severe inhalation threshold (600 ug)
  const riskScore = Math.min(100, Math.round((weightedExposure / 600) * 100));

  return {
    inhaledPM25Micrograms: Math.round(inhaledMicrograms * 10) / 10,
    vulnerabilityWeightedExposure: Math.round(weightedExposure * 10) / 10,
    equivalentCigarettesDay: Math.round(equivalentCigarettes * 10) / 10,
    respiratoryRiskScore: riskScore,
  };
}

/**
 * Berkeley Earth epidemiological formula converting PM2.5 exposure to cigarette equivalents.
 * Benchmark: 22 ug/m3 for 24 hours ~= 1 cigarette.
 */
export function calculateBerkeleyCigarettes(pm25Concentration: number): number {
  if (pm25Concentration <= 0) return 0;
  return Math.round((pm25Concentration / 22.0) * 10) / 10;
}

/**
 * Models the physics and performance of a DIY Corsi-Rosenthal Box air cleaner.
 */
export function calculateCorsiRosenthalBox(
  roomVolumeM3: number,
  numberOfFilters: 4 | 5 = 4
): CorsiRosenthalBoxSpec {
  // CADR benchmark: 4-filter delivers ~480 CFM; 5-filter delivers ~580 CFM
  const estimatedCADR_CFM = numberOfFilters === 5 ? 580 : 490;
  const estimatedCADR_M3H = Math.round(estimatedCADR_CFM * 1.699); // 1 CFM = 1.699 m3/hr

  const airChangesPerHour = Math.round((estimatedCADR_M3H / Math.max(1, roomVolumeM3)) * 10) / 10;

  // Particle clearance half-life in minutes: t_half = (ln(2) / ACH) * 60
  const clearingHalfLifeMinutes = Math.round((Math.LN2 / Math.max(0.1, airChangesPerHour)) * 60 * 10) / 10;

  // Material cost in INR: Box Fan ~1400 INR + MERV-13 Filters ~350 INR each + Tape ~150 INR
  const estimatedCostINR = numberOfFilters === 5 ? 3350 : 2950;

  return {
    fanType: '20_inch_box_fan',
    filterType: 'MERV_13',
    numberOfFilters,
    estimatedCADR_CFM,
    estimatedCADR_M3H,
    roomVolumeM3,
    airChangesPerHour,
    clearingHalfLifeMinutes,
    estimatedCostINR,
  };
}

/**
 * Calculates exposure savings and percentage reduction achieved by shifting activity times.
 */
export function calculateRoutineShiftSavings(
  baselinePM25: number,
  optimizedPM25: number,
  durationHours: number,
  intensity: ActivityIntensity
) {
  const ventilationRate = VENTILATION_RATES[intensity] || 0.8;
  const baselineInhaled = baselinePM25 * ventilationRate * durationHours;
  const optimizedInhaled = optimizedPM25 * ventilationRate * durationHours;
  const avoidedMicrograms = Math.max(0, baselineInhaled - optimizedInhaled);

  const reductionPercentage = baselineInhaled > 0 
    ? Math.round(((baselineInhaled - optimizedInhaled) / baselineInhaled) * 1000) / 10 
    : 0;

  // Avoided cigarettes over a 30-day month
  const avoidedCigarettesDaily = (baselinePM25 - optimizedPM25) / 22.0 * (durationHours / 24);
  const avoidedCigarettesMonthly = Math.max(0, Math.round(avoidedCigarettesDaily * 30 * 10) / 10);

  return {
    baselineInhaled: Math.round(baselineInhaled * 10) / 10,
    optimizedInhaled: Math.round(optimizedInhaled * 10) / 10,
    avoidedMicrograms: Math.round(avoidedMicrograms * 10) / 10,
    reductionPercentage,
    avoidedCigarettesMonthly,
  };
}
