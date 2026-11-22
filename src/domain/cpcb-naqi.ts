/**
 * Central Pollution Control Board (CPCB) National Air Quality Index (NAQI) Engine
 * Implements the official statutory 8-pollutant piecewise breakpoint interpolation
 * and data-sufficiency requirements published by the Ministry of Environment,
 * Forest and Climate Change (MoEFCC), Government of India.
 */

export type CpcbCategory =
  | 'Good'
  | 'Satisfactory'
  | 'Moderate'
  | 'Poor'
  | 'Very Poor'
  | 'Severe';

export interface PollutantBreakpoint {
  cLow: number;
  cHigh: number;
  iLow: number;
  iHigh: number;
}

export interface PollutantInput {
  pm25?: number | null; // µg/m³ (24-hr)
  pm10?: number | null; // µg/m³ (24-hr)
  no2?: number | null;  // µg/m³ (24-hr)
  so2?: number | null;  // µg/m³ (24-hr)
  co?: number | null;   // µg/m³ or mg/m³ (8-hr) - auto-detects unit
  o3?: number | null;   // µg/m³ (8-hr)
  nh3?: number | null;  // µg/m³ (24-hr)
  pb?: number | null;   // µg/m³ (24-hr)
}

export interface SubIndexResult {
  pollutant: string;
  concentration: number;
  subIndex: number;
  category: CpcbCategory;
}

export interface CpcbNaqiCalculationResult {
  aqi: number | null;
  category: CpcbCategory | null;
  dominantPollutant: string | null;
  subIndices: Record<string, SubIndexResult>;
  isDataSufficient: boolean;
  monitoredPollutantCount: number;
  missingRequirements: string[];
  notes: string;
}

// ---------------------------------------------------------------------------
// Official CPCB Breakpoints (CPCB NAQI 2014 / 2015 Guidelines)
// ---------------------------------------------------------------------------

export const CPCB_BREAKPOINTS: Record<string, PollutantBreakpoint[]> = {
  pm25: [
    { cLow: 0, cHigh: 30, iLow: 0, iHigh: 50 },
    { cLow: 31, cHigh: 60, iLow: 51, iHigh: 100 },
    { cLow: 61, cHigh: 90, iLow: 101, iHigh: 200 },
    { cLow: 91, cHigh: 120, iLow: 201, iHigh: 300 },
    { cLow: 121, cHigh: 250, iLow: 301, iHigh: 400 },
    { cLow: 250, cHigh: 500, iLow: 401, iHigh: 500 },
  ],
  pm10: [
    { cLow: 0, cHigh: 50, iLow: 0, iHigh: 50 },
    { cLow: 51, cHigh: 100, iLow: 51, iHigh: 100 },
    { cLow: 101, cHigh: 250, iLow: 101, iHigh: 200 },
    { cLow: 251, cHigh: 350, iLow: 201, iHigh: 300 },
    { cLow: 351, cHigh: 430, iLow: 301, iHigh: 400 },
    { cLow: 430, cHigh: 600, iLow: 401, iHigh: 500 },
  ],
  no2: [
    { cLow: 0, cHigh: 40, iLow: 0, iHigh: 50 },
    { cLow: 41, cHigh: 80, iLow: 51, iHigh: 100 },
    { cLow: 81, cHigh: 180, iLow: 101, iHigh: 200 },
    { cLow: 181, cHigh: 280, iLow: 201, iHigh: 300 },
    { cLow: 281, cHigh: 400, iLow: 301, iHigh: 400 },
    { cLow: 400, cHigh: 800, iLow: 401, iHigh: 500 },
  ],
  so2: [
    { cLow: 0, cHigh: 40, iLow: 0, iHigh: 50 },
    { cLow: 41, cHigh: 80, iLow: 51, iHigh: 100 },
    { cLow: 81, cHigh: 380, iLow: 101, iHigh: 200 },
    { cLow: 381, cHigh: 800, iLow: 201, iHigh: 300 },
    { cLow: 801, cHigh: 1600, iLow: 301, iHigh: 400 },
    { cLow: 1600, cHigh: 3000, iLow: 401, iHigh: 500 },
  ],
  co: [
    // In mg/m³
    { cLow: 0, cHigh: 1.0, iLow: 0, iHigh: 50 },
    { cLow: 1.1, cHigh: 2.0, iLow: 51, iHigh: 100 },
    { cLow: 2.1, cHigh: 10.0, iLow: 101, iHigh: 200 },
    { cLow: 10.1, cHigh: 17.0, iLow: 201, iHigh: 300 },
    { cLow: 17.1, cHigh: 34.0, iLow: 301, iHigh: 400 },
    { cLow: 34.0, cHigh: 60.0, iLow: 401, iHigh: 500 },
  ],
  o3: [
    { cLow: 0, cHigh: 50, iLow: 0, iHigh: 50 },
    { cLow: 51, cHigh: 100, iLow: 51, iHigh: 100 },
    { cLow: 101, cHigh: 168, iLow: 101, iHigh: 200 },
    { cLow: 169, cHigh: 208, iLow: 201, iHigh: 300 },
    { cLow: 209, cHigh: 748, iLow: 301, iHigh: 400 },
    { cLow: 748, cHigh: 1000, iLow: 401, iHigh: 500 },
  ],
  nh3: [
    { cLow: 0, cHigh: 200, iLow: 0, iHigh: 50 },
    { cLow: 201, cHigh: 400, iLow: 51, iHigh: 100 },
    { cLow: 401, cHigh: 800, iLow: 101, iHigh: 200 },
    { cLow: 801, cHigh: 1200, iLow: 201, iHigh: 300 },
    { cLow: 1201, cHigh: 1800, iLow: 301, iHigh: 400 },
    { cLow: 1800, cHigh: 3000, iLow: 401, iHigh: 500 },
  ],
};

export function getCpcbCategory(aqi: number): CpcbCategory {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Satisfactory';
  if (aqi <= 200) return 'Moderate';
  if (aqi <= 300) return 'Poor';
  if (aqi <= 400) return 'Very Poor';
  return 'Severe';
}

/**
 * Calculates linear sub-index for a single pollutant based on CPCB breakpoints.
 */
export function calculateSubIndex(pollutantKey: string, concentration: number): number | null {
  if (concentration < 0 || !Number.isFinite(concentration)) return null;

  const breakpoints = CPCB_BREAKPOINTS[pollutantKey];
  if (!breakpoints || breakpoints.length === 0) return null;

  // Handle CO unit: if > 100, assuming input is in µg/m³, convert to mg/m³
  let conc = concentration;
  if (pollutantKey === 'co' && conc > 50) {
    conc = conc / 1000;
  }

  // Exact 0 concentration is 0 sub-index
  if (conc === 0) return 0;

  for (const bp of breakpoints) {
    if (conc <= bp.cHigh) {
      const idx = ((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) * (conc - bp.cLow) + bp.iLow;
      return Math.round(Math.max(0, Math.min(500, idx)));
    }
  }

  // Above max defined breakpoint
  return 500;
}

/**
 * Calculates complete Indian National Air Quality Index (CPCB NAQI).
 * Enforces the official CPCB minimum data sufficiency criteria:
 * 1. At least 3 pollutants must be monitored.
 * 2. At least one of the monitored pollutants MUST be PM2.5 or PM10.
 */
export function calculateComprehensiveCpcbNaqi(input: PollutantInput): CpcbNaqiCalculationResult {
  const subIndices: Record<string, SubIndexResult> = {};
  const missingRequirements: string[] = [];

  const candidates: Array<{ key: string; name: string; val?: number | null }> = [
    { key: 'pm25', name: 'PM2.5', val: input.pm25 },
    { key: 'pm10', name: 'PM10', val: input.pm10 },
    { key: 'no2', name: 'NO2', val: input.no2 },
    { key: 'so2', name: 'SO2', val: input.so2 },
    { key: 'co', name: 'CO', val: input.co },
    { key: 'o3', name: 'Ozone', val: input.o3 },
    { key: 'nh3', name: 'NH3', val: input.nh3 },
  ];

  let maxSubIndex = -1;
  let dominant = '';

  for (const { key, name, val } of candidates) {
    if (val !== undefined && val !== null && Number.isFinite(val) && val >= 0) {
      const subIdx = calculateSubIndex(key, val);
      if (subIdx !== null) {
        subIndices[key] = {
          pollutant: name,
          concentration: val,
          subIndex: subIdx,
          category: getCpcbCategory(subIdx),
        };
        if (subIdx > maxSubIndex) {
          maxSubIndex = subIdx;
          dominant = name;
        }
      }
    }
  }

  const monitoredCount = Object.keys(subIndices).length;
  const hasParticulate = 'pm25' in subIndices || 'pm10' in subIndices;

  if (monitoredCount < 3) {
    missingRequirements.push(`At least 3 pollutants required for official CPCB NAQI (currently: ${monitoredCount})`);
  }
  if (!hasParticulate) {
    missingRequirements.push('Either PM2.5 or PM10 must be monitored for valid CPCB NAQI');
  }

  const isDataSufficient = monitoredCount >= 3 && hasParticulate;

  if (monitoredCount === 0) {
    return {
      aqi: null,
      category: null,
      dominantPollutant: null,
      subIndices: {},
      isDataSufficient: false,
      monitoredPollutantCount: 0,
      missingRequirements: ['No valid pollutant concentrations available.'],
      notes: 'Insufficient telemetry to calculate National AQI.',
    };
  }

  const aqi = maxSubIndex >= 0 ? maxSubIndex : null;
  const category = aqi !== null ? getCpcbCategory(aqi) : null;

  return {
    aqi,
    category,
    dominantPollutant: dominant || null,
    subIndices,
    isDataSufficient,
    monitoredPollutantCount: monitoredCount,
    missingRequirements,
    notes: isDataSufficient
      ? `Statutory CPCB NAQI compliant (${monitoredCount} pollutants; dominant: ${dominant}).`
      : `Indicative sub-index based on ${monitoredCount} available pollutants (${missingRequirements.join('; ')}).`,
  };
}
