/**
 * Avir Indoor Air Quality (IAQ) Domain Types & Physics Contracts
 * Step 15: Indoor Air-Cleaning Studio
 * 
 * Standards: ASHRAE Standard 62.2, AHAM AC-1 (CADR), ASTM E741.
 */

export const CFM_TO_M3_PER_HOUR = 1.699011;
export const M3_PER_HOUR_TO_CFM = 0.588578;
export const SQFT_TO_M2 = 0.092903;
export const M2_TO_SQFT = 10.7639;

export interface RoomDimensions {
  unit: 'metric' | 'imperial';
  length: number;  // meters or feet
  width: number;   // meters or feet
  height: number;  // meters or feet
  floorAreaM2: number;
  volumeM3: number;
}

export interface AirCleanerSpec {
  id: string;
  name: string;
  cadrCfm: number;
  cadrM3PerHour: number;
  powerWatts?: number;
  noiseDb?: number;
  isDiy: boolean;
  filterType: 'MERV13' | 'HEPA' | 'EPA_E11' | 'Custom';
  description: string;
}

export type AchRating = 'insufficient' | 'marginal' | 'good' | 'optimal';

export interface AchCalculationResult {
  ach: number;
  roomVolumeM3: number;
  cadrM3PerHour: number;
  cadrCfm: number;
  rating: AchRating;
  evaluationText: string;
}

export interface DecayDataPoint {
  minute: number;
  concentrationUgM3: number;
  fractionRemaining: number;
}

export interface WellMixedDecayResult {
  initialConcentrationUgM3: number;
  totalLossRatePerHour: number; // ACH + natural deposition
  minutesTo50Percent: number;
  minutesTo90Percent: number;
  minutesTo99Percent: number;
  timeSeries: DecayDataPoint[];
  assumptions: string[];
}

export interface IaqCostBreakdown {
  boxFanCost: number;
  filtersCost: number;
  shroudTapeCost: number;
  totalDiyCost: number;
  commercialPurifierComparisonCost: number;
  currency: string;
  lastUpdated: string;
  isUserOverridden: boolean;
}

/**
 * Calculates room volume in cubic meters from length, width, height.
 */
export function calculateRoomDimensions(
  length: number,
  width: number,
  height: number,
  unit: 'metric' | 'imperial'
): RoomDimensions {
  if (length <= 0 || width <= 0 || height <= 0) {
    throw new Error('Room dimensions must be strictly positive numbers.');
  }

  if (unit === 'imperial') {
    const floorAreaSqFt = length * width;
    const volumeCuFt = floorAreaSqFt * height;
    const floorAreaM2 = floorAreaSqFt * SQFT_TO_M2;
    const volumeM3 = volumeCuFt * (SQFT_TO_M2 * 0.3048);
    return {
      unit,
      length,
      width,
      height,
      floorAreaM2: Math.round(floorAreaM2 * 100) / 100,
      volumeM3: Math.round(volumeM3 * 100) / 100,
    };
  } else {
    const floorAreaM2 = length * width;
    const volumeM3 = floorAreaM2 * height;
    return {
      unit,
      length,
      width,
      height,
      floorAreaM2: Math.round(floorAreaM2 * 100) / 100,
      volumeM3: Math.round(volumeM3 * 100) / 100,
    };
  }
}

/**
 * Converts CADR between CFM and m³/h.
 */
export function convertCadr(value: number, fromUnit: 'cfm' | 'm3h'): { cfm: number; m3h: number } {
  if (value < 0) throw new Error('CADR cannot be negative.');
  if (fromUnit === 'cfm') {
    return {
      cfm: Math.round(value),
      m3h: Math.round(value * CFM_TO_M3_PER_HOUR * 10) / 10,
    };
  } else {
    return {
      cfm: Math.round(value * M3_PER_HOUR_TO_CFM),
      m3h: Math.round(value * 10) / 10,
    };
  }
}

/**
 * Computes Air Changes per Hour (ACH) and scientific rating.
 */
export function calculateAch(cadrM3PerHour: number, roomVolumeM3: number): AchCalculationResult {
  if (roomVolumeM3 <= 0) throw new Error('Room volume must be positive.');
  if (cadrM3PerHour < 0) throw new Error('CADR cannot be negative.');

  const ach = Math.round((cadrM3PerHour / roomVolumeM3) * 100) / 100;
  const cadrCfm = Math.round(cadrM3PerHour * M3_PER_HOUR_TO_CFM);

  let rating: AchRating = 'insufficient';
  let evaluationText = '';

  if (ach < 2.0) {
    rating = 'insufficient';
    evaluationText = 'Below the recommended baseline for effective aerosol reduction.';
  } else if (ach < 4.0) {
    rating = 'marginal';
    evaluationText = 'Meets minimum standard residential ventilation guidelines.';
  } else if (ach < 6.0) {
    rating = 'good';
    evaluationText = 'Achieves robust classroom and office clean air standards (ASHRAE/CDC).';
  } else {
    rating = 'optimal';
    evaluationText = 'Exceeds 6 ACH clean air delivery, providing rapid airborne particulate clearance.';
  }

  return {
    ach,
    roomVolumeM3,
    cadrM3PerHour,
    cadrCfm,
    rating,
    evaluationText,
  };
}

/**
 * Computes well-mixed first-order exponential decay.
 * @param initialPM25 Starting concentration (µg/m³)
 * @param ach Air changes per hour from filtration
 * @param naturalDepositionRate Background loss rate (default 0.10/h)
 * @param horizonMinutes Total minutes to project (default 120m)
 */
export function calculateWellMixedDecay(
  initialPM25: number,
  ach: number,
  naturalDepositionRate: number = 0.10,
  horizonMinutes: number = 120
): WellMixedDecayResult {
  if (initialPM25 < 0) throw new Error('Initial concentration cannot be negative.');
  if (ach < 0) throw new Error('ACH cannot be negative.');

  const totalLossRate = ach + Math.max(0, naturalDepositionRate);

  // t_fraction = ln(1 / fraction) / K
  // t in hours, multiply by 60 for minutes
  const minutesTo50Percent = totalLossRate > 0 ? Math.round((Math.LN2 / totalLossRate) * 60) : Infinity;
  const minutesTo90Percent = totalLossRate > 0 ? Math.round((Math.LN10 / totalLossRate) * 60) : Infinity;
  const minutesTo99Percent = totalLossRate > 0 ? Math.round(((Math.log(100)) / totalLossRate) * 60) : Infinity;

  const timeSeries: DecayDataPoint[] = [];
  const step = Math.max(1, Math.floor(horizonMinutes / 24)); // sample ~25 points

  for (let m = 0; m <= horizonMinutes; m += step) {
    const tHours = m / 60;
    const fractionRemaining = Math.exp(-totalLossRate * tHours);
    const concentration = Math.round(initialPM25 * fractionRemaining * 10) / 10;
    timeSeries.push({
      minute: m,
      concentrationUgM3: concentration,
      fractionRemaining: Math.round(fractionRemaining * 1000) / 1000,
    });
  }

  return {
    initialConcentrationUgM3: initialPM25,
    totalLossRatePerHour: Math.round(totalLossRate * 100) / 100,
    minutesTo50Percent,
    minutesTo90Percent,
    minutesTo99Percent,
    timeSeries,
    assumptions: [
      'Ideal spatial air uniformity (well-mixed single room).',
      'Windows and doors sealed against direct outdoor infiltration.',
      'Zero continuous indoor particle emissions (no cooking, smoking, or burning).',
    ],
  };
}
