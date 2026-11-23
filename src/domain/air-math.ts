import {
  AQICategory,
  AqiEvidence,
  ActivityIntensity,
  UserVulnerabilityProfile,
  ExposureCalculation,
  CorsiRosenthalBoxSpec,
} from './types';
import {
  calculateSubIndex,
  getCpcbCategory,
  CpcbCategory,
} from './cpcb-naqi';

export { type CpcbCategory };

/**
 * Authoritative 2024 Revised US EPA PM2.5 24-Hour Breakpoint Table
 * Codified at 40 CFR Part 58, Appendix G (Federal Register 89 FR 16202, effective May 6, 2024).
 * Replaces the historical 12.0 µg/m³ primary annual/24-hr standard with the tightened 9.0 µg/m³ Good threshold.
 */
export interface EpaBreakpointDef {
  pollutant: 'pm25';
  unit: 'µg/m³';
  averagingPeriod: '24-hour';
  cLow: number;
  cHigh: number;
  iLow: number;
  iHigh: number;
  category: AQICategory;
  standardVersion: string;
  regulatorySource: string;
}

export const EPA_PM25_2024_BREAKPOINTS: readonly EpaBreakpointDef[] = [
  {
    pollutant: 'pm25',
    unit: 'µg/m³',
    averagingPeriod: '24-hour',
    cLow: 0.0,
    cHigh: 9.0,
    iLow: 0,
    iHigh: 50,
    category: 'Good',
    standardVersion: 'EPA 2024 PM NAAQS (40 CFR Part 58 App G, May 2024)',
    regulatorySource: 'US EPA Revised Air Quality Index for Particulate Matter',
  },
  {
    pollutant: 'pm25',
    unit: 'µg/m³',
    averagingPeriod: '24-hour',
    cLow: 9.1,
    cHigh: 35.4,
    iLow: 51,
    iHigh: 100,
    category: 'Moderate',
    standardVersion: 'EPA 2024 PM NAAQS (40 CFR Part 58 App G, May 2024)',
    regulatorySource: 'US EPA Revised Air Quality Index for Particulate Matter',
  },
  {
    pollutant: 'pm25',
    unit: 'µg/m³',
    averagingPeriod: '24-hour',
    cLow: 35.5,
    cHigh: 55.4,
    iLow: 101,
    iHigh: 150,
    category: 'UnhealthySensitive',
    standardVersion: 'EPA 2024 PM NAAQS (40 CFR Part 58 App G, May 2024)',
    regulatorySource: 'US EPA Revised Air Quality Index for Particulate Matter',
  },
  {
    pollutant: 'pm25',
    unit: 'µg/m³',
    averagingPeriod: '24-hour',
    cLow: 55.5,
    cHigh: 125.4,
    iLow: 151,
    iHigh: 200,
    category: 'Unhealthy',
    standardVersion: 'EPA 2024 PM NAAQS (40 CFR Part 58 App G, May 2024)',
    regulatorySource: 'US EPA Revised Air Quality Index for Particulate Matter',
  },
  {
    pollutant: 'pm25',
    unit: 'µg/m³',
    averagingPeriod: '24-hour',
    cLow: 125.5,
    cHigh: 225.4,
    iLow: 201,
    iHigh: 300,
    category: 'VeryUnhealthy',
    standardVersion: 'EPA 2024 PM NAAQS (40 CFR Part 58 App G, May 2024)',
    regulatorySource: 'US EPA Revised Air Quality Index for Particulate Matter',
  },
  {
    pollutant: 'pm25',
    unit: 'µg/m³',
    averagingPeriod: '24-hour',
    cLow: 225.5,
    cHigh: 325.4,
    iLow: 301,
    iHigh: 500,
    category: 'Hazardous',
    standardVersion: 'EPA 2024 PM NAAQS (40 CFR Part 58 App G, May 2024)',
    regulatorySource: 'US EPA Revised Air Quality Index for Particulate Matter',
  },
] as const;

/**
 * Historical US EPA PM2.5 24-Hour Breakpoint Table (1999/2012 NAAQS Standards)
 * In effect until May 6, 2024. Maintained for longitudinal data comparability.
 */
export const EPA_PM25_HISTORICAL_BREAKPOINTS: readonly EpaBreakpointDef[] = [
  {
    pollutant: 'pm25',
    unit: 'µg/m³',
    averagingPeriod: '24-hour',
    cLow: 0.0,
    cHigh: 12.0,
    iLow: 0,
    iHigh: 50,
    category: 'Good',
    standardVersion: 'EPA 2012 PM NAAQS (historical)',
    regulatorySource: 'US EPA Historical Air Quality Index for Particulate Matter',
  },
  {
    pollutant: 'pm25',
    unit: 'µg/m³',
    averagingPeriod: '24-hour',
    cLow: 12.1,
    cHigh: 35.4,
    iLow: 51,
    iHigh: 100,
    category: 'Moderate',
    standardVersion: 'EPA 2012 PM NAAQS (historical)',
    regulatorySource: 'US EPA Historical Air Quality Index for Particulate Matter',
  },
  {
    pollutant: 'pm25',
    unit: 'µg/m³',
    averagingPeriod: '24-hour',
    cLow: 35.5,
    cHigh: 55.4,
    iLow: 101,
    iHigh: 150,
    category: 'UnhealthySensitive',
    standardVersion: 'EPA 2012 PM NAAQS (historical)',
    regulatorySource: 'US EPA Historical Air Quality Index for Particulate Matter',
  },
  {
    pollutant: 'pm25',
    unit: 'µg/m³',
    averagingPeriod: '24-hour',
    cLow: 55.5,
    cHigh: 150.4,
    iLow: 151,
    iHigh: 200,
    category: 'Unhealthy',
    standardVersion: 'EPA 2012 PM NAAQS (historical)',
    regulatorySource: 'US EPA Historical Air Quality Index for Particulate Matter',
  },
  {
    pollutant: 'pm25',
    unit: 'µg/m³',
    averagingPeriod: '24-hour',
    cLow: 150.5,
    cHigh: 250.4,
    iLow: 201,
    iHigh: 300,
    category: 'VeryUnhealthy',
    standardVersion: 'EPA 2012 PM NAAQS (historical)',
    regulatorySource: 'US EPA Historical Air Quality Index for Particulate Matter',
  },
  {
    pollutant: 'pm25',
    unit: 'µg/m³',
    averagingPeriod: '24-hour',
    cLow: 250.5,
    cHigh: 350.4,
    iLow: 301,
    iHigh: 400,
    category: 'Hazardous',
    standardVersion: 'EPA 2012 PM NAAQS (historical)',
    regulatorySource: 'US EPA Historical Air Quality Index for Particulate Matter',
  },
  {
    pollutant: 'pm25',
    unit: 'µg/m³',
    averagingPeriod: '24-hour',
    cLow: 350.5,
    cHigh: 500.4,
    iLow: 401,
    iHigh: 500,
    category: 'Hazardous',
    standardVersion: 'EPA 2012 PM NAAQS (historical)',
    regulatorySource: 'US EPA Historical Air Quality Index for Particulate Matter',
  },
] as const;

/**
 * Truncates PM2.5 concentrations to 1 decimal place (0.1 µg/m³) per 40 CFR Part 58 App G.
 * Eliminates IEEE-754 representation anomalies prior to truncation.
 */
export function truncatePm25Concentration(pm25: number): number {
  if (!Number.isFinite(pm25) || pm25 < 0) return NaN;
  return Math.floor(Number(pm25.toFixed(6)) * 10) / 10;
}

/**
 * Calculates genuine Indian National Air Quality Index (NAQI) sub-index per CPCB standard.
 * Uses linear interpolation across CPCB sub-index breakpoints via shared cpcb-naqi primitives.
 * Rejects missing or invalid input without defaulting to 'Good'.
 *
 * Strict Provenance:
 * Single or two-pollutant sub-indices are ALWAYS indicative sub-indices (isIndicativeSubIndex: true),
 * NEVER complete indices (isCompleteIndex: false), and NEVER officially published (isOfficialPublished: false).
 */
export function calculateCpcbNaqi(
  pm25?: number | null,
  pm10?: number | null
): {
  aqi: number | null;
  category: CpcbCategory | 'Unavailable';
  isIndicativeSubIndex: boolean;
  isCompleteIndex: boolean;
  isOfficialPublished: boolean;
} {
  const hasPm25 = pm25 !== null && pm25 !== undefined && Number.isFinite(pm25) && pm25 >= 0;
  const hasPm10 = pm10 !== null && pm10 !== undefined && Number.isFinite(pm10) && pm10 >= 0;

  if (!hasPm25 && !hasPm10) {
    return { aqi: null, category: 'Unavailable', isIndicativeSubIndex: false, isCompleteIndex: false, isOfficialPublished: false };
  }

  const pm25Idx = hasPm25 ? calculateSubIndex('pm25', pm25!) : null;
  const pm10Idx = hasPm10 ? calculateSubIndex('pm10', pm10!) : null;

  if (pm25Idx === null && pm10Idx === null) {
    return { aqi: null, category: 'Unavailable', isIndicativeSubIndex: false, isCompleteIndex: false, isOfficialPublished: false };
  }

  const aqi = Math.max(pm25Idx ?? -1, pm10Idx ?? -1);
  if (aqi < 0) {
    return { aqi: null, category: 'Unavailable', isIndicativeSubIndex: false, isCompleteIndex: false, isOfficialPublished: false };
  }

  const category = getCpcbCategory(aqi);
  return { aqi, category, isIndicativeSubIndex: true, isCompleteIndex: false, isOfficialPublished: false };
}

/**
 * Calculates standardized US EPA AQI from PM2.5 concentration (µg/m³) using linear breakpoint interpolation.
 * Supports both 2024 revised standard (default) and historical 1999/2012 NAAQS standard.
 */
export function calculateEpaPm25Aqi(
  pm25?: number | null,
  standardVersion: '2024' | 'historical' = '2024'
): number | null {
  if (pm25 === null || pm25 === undefined || !Number.isFinite(pm25) || pm25 < 0) {
    return null;
  }

  const truncated = truncatePm25Concentration(pm25);
  if (Number.isNaN(truncated) || truncated < 0) return null;
  if (truncated === 0) return 0;

  const breakpoints = standardVersion === 'historical'
    ? EPA_PM25_HISTORICAL_BREAKPOINTS
    : EPA_PM25_2024_BREAKPOINTS;

  for (const bp of breakpoints) {
    if (truncated <= bp.cHigh || (standardVersion === '2024' && bp.category === 'Hazardous')) {
      const aqi = ((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) * (truncated - bp.cLow) + bp.iLow;
      return Math.round(aqi);
    }
  }

  // Concentrations above highest defined breakpoint (500.4 µg/m³) capped at 500
  return 500;
}

/**
 * Calculates standardized US EPA AQI from PM2.5 concentration (µg/m³) using linear breakpoint interpolation.
 * Strictly implements 2024 EPA PM NAAQS revised breakpoints (0-9.0 Good, 9.1-35.4 Moderate, etc.).
 *
 * Rules:
 * 1. Concentrations are truncated to 1 decimal place (0.1 µg/m³) before interpolation.
 * 2. Negative concentrations, NaN, Infinity, null, and undefined return null.
 * 3. Exact 0 concentration returns 0.
 * 4. Above 325.4 µg/m³ the hazardous slope continues per EPA Table 6, footnote 4.
 */
export function calculateAQIFromPM25(pm25?: number | null): number | null {
  return calculateEpaPm25Aqi(pm25, '2024');
}

/**
 * Calculates detailed EPA PM2.5 AQI with full scientific provenance and evidence metadata.
 */
export function calculateDetailedEpaPm25Aqi(
  pm25?: number | null,
  standardVersion: '2024' | 'historical' = '2024'
): {
  aqi: number | null;
  category: AQICategory;
  truncatedConcentration: number | null;
  isBeyondAqi: boolean;
  evidence: AqiEvidence;
} {
  const aqi = calculateEpaPm25Aqi(pm25, standardVersion);
  const category = getAQICategory(aqi);
  const truncated = pm25 !== null && pm25 !== undefined && Number.isFinite(pm25) && pm25 >= 0
    ? truncatePm25Concentration(pm25)
    : null;
  const isBeyondAqi = truncated !== null && truncated > (standardVersion === 'historical' ? 500.4 : 325.4);

  const stdName = standardVersion === 'historical'
    ? 'EPA 2012 PM NAAQS (historical)'
    : 'EPA 2024 PM NAAQS (40 CFR Part 58 App G, May 2024)';

  let notes = aqi !== null ? `Calculated via ${stdName}.` : 'Invalid or missing PM2.5 concentration.';
  if (isBeyondAqi) {
    notes = standardVersion === 'historical' ? 'Historical index capped at 500.' : 'Index extrapolated above 500 using EPA Table 6, footnote 4.';
  }

  return {
    aqi,
    category,
    truncatedConcentration: truncated,
    isBeyondAqi,
    evidence: {
      indexValue: aqi,
      standard: 'US_EPA',
      method: aqi !== null ? 'epa_pm25_24h_subindex' : 'unavailable',
      classification: aqi !== null ? 'derived_subindex' : 'unavailable',
      sourceProvider: null,
      pollutantCount: aqi !== null ? 1 : 0,
      averagingVerified: false,
      isOfficialPublished: false,
      missingRequirements: aqi === null ? ['Valid non-negative PM2.5 concentration required.'] : [],
      standardVersion: stdName,
      notes,
    },
  };
}

/**
 * Maps numerical AQI to clinical and public health advisory categories.
 * Strictly preserves genuine unavailability: missing or invalid AQI returns 'Unavailable' rather than 'Hazardous'.
 */
export function getAQICategory(aqi?: number | null): AQICategory {
  if (aqi === null || aqi === undefined || !Number.isFinite(aqi) || aqi < 0) return 'Unavailable';
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
export function calculateCigaretteEquivalence(pm25?: number | null): number | null {
  if (pm25 === null || pm25 === undefined) return null;
  if (pm25 <= 0) return 0;
  return Math.round((pm25 / 22.0) * 10) / 10;
}

export interface GrapStageInfo {
  stage: 'Stage I' | 'Stage II' | 'Stage III' | 'Stage IV' | 'Normal' | 'Unavailable';
  label: string;
  color: string;
  badgeBg: string;
  advisory: string;
  isStatutoryOrderVerified: boolean;
  benchmarkType: 'indicative_threshold' | 'unverified';
}

/**
 * Maps numerical AQI to CAQM Graded Response Action Plan (GRAP) threshold criteria.
 * Important: This evaluates numerical threshold equivalence only.
 * Formal statutory enforcement requires an authentic notification from CAQM.
 * To resolve legally binding official GRAP status, use resolveOfficialGrapStatus().
 */
export function getIndicativeGrapThreshold(aqi?: number | null): GrapStageInfo {
  if (aqi === null || aqi === undefined || !Number.isFinite(aqi) || aqi < 0) {
    return {
      stage: 'Unavailable',
      label: 'GRAP Status Unverified',
      color: 'text-stone-400',
      badgeBg: 'bg-stone-500/10 border-stone-500/20 text-stone-400',
      advisory: 'Awaiting verified atmospheric telemetry for numerical threshold evaluation.',
      isStatutoryOrderVerified: false,
      benchmarkType: 'unverified',
    };
  }
  if (aqi > 450) {
    return {
      stage: 'Stage IV',
      label: 'Stage IV Numerical Threshold (Indicative)',
      color: 'text-rose-400',
      badgeBg: 'bg-rose-500/20 border-rose-500/50 text-rose-300',
      advisory: 'Ambient index exceeds CAQM Stage IV numerical criteria (AQI > 450). Statutory enforcement depends on formal CAQM gazette notification.',
      isStatutoryOrderVerified: false,
      benchmarkType: 'indicative_threshold',
    };
  }
  if (aqi >= 401) {
    return {
      stage: 'Stage III',
      label: 'Stage III Numerical Threshold (Indicative)',
      color: 'text-purple-400',
      badgeBg: 'bg-purple-500/20 border-purple-500/50 text-purple-300',
      advisory: 'Ambient index reaches CAQM Stage III criteria (AQI 401–450). General guideline: avoid outdoor exertion and minimize non-essential driving.',
      isStatutoryOrderVerified: false,
      benchmarkType: 'indicative_threshold',
    };
  }
  if (aqi >= 301) {
    return {
      stage: 'Stage II',
      label: 'Stage II Numerical Threshold (Indicative)',
      color: 'text-orange-400',
      badgeBg: 'bg-orange-500/20 border-orange-500/50 text-orange-300',
      advisory: 'Ambient index reaches CAQM Stage II criteria (AQI 301–400). General guideline: enhance indoor filtration and avoid peak inversion windows.',
      isStatutoryOrderVerified: false,
      benchmarkType: 'indicative_threshold',
    };
  }
  if (aqi >= 201) {
    return {
      stage: 'Stage I',
      label: 'Stage I Numerical Threshold (Indicative)',
      color: 'text-yellow-400',
      badgeBg: 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300',
      advisory: 'Ambient index reaches CAQM Stage I criteria (AQI 201–300). General guideline: suppress local dust and curb open burning.',
      isStatutoryOrderVerified: false,
      benchmarkType: 'indicative_threshold',
    };
  }
  return {
    stage: 'Normal',
    label: 'Normal Ambient Air Benchmark',
    color: 'text-emerald-400',
    badgeBg: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300',
    advisory: 'Ambient index is below emergency GRAP activation thresholds (AQI ≤ 200).',
    isStatutoryOrderVerified: false,
    benchmarkType: 'indicative_threshold',
  };
}

/**
 * Backward-compatible alias for getIndicativeGrapThreshold.
 * Note: Purely evaluates numerical criteria; does not determine statutory legal orders.
 */
export const getGrapStage = getIndicativeGrapThreshold;

/**
 * Evaluates whether a meteorological thermal inversion layer is trapping ground pollutants.
 * Inversion criteria: nocturnal/early-morning contraction of planetary boundary layer (< 200m).
 * Safely handles null or undefined boundary layer heights without artificial numeric defaults.
 */
export function isThermalInversion(boundaryLayerHeight: number | null | undefined, hour: number): boolean {
  if (boundaryLayerHeight === null || boundaryLayerHeight === undefined || !Number.isFinite(boundaryLayerHeight)) {
    return false;
  }
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
