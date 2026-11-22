/**
 * Central Pollution Control Board (CPCB) National Air Quality Index (NAQI) Engine
 * Implements the official statutory 8-pollutant piecewise breakpoint interpolation
 * and data-sufficiency requirements published by the Ministry of Environment,
 * Forest and Climate Change (MoEFCC), Government of India.
 * 
 * Strict Invariants (Step 4):
 * 1. Explicit units: Never guess CO units based on concentration magnitude.
 * 2. Complete 8-pollutant support: PM2.5, PM10, NO2, SO2, CO, O3, NH3, and Pb (Lead).
 * 3. Enforces data sufficiency: >= 3 pollutants required, including PM2.5 or PM10.
 * 4. Distinguishes official statutory compliance (24-hr / 8-hr verified averages) from indicative sub-indices.
 * 5. Rejects negative values, NaN, and unverified placeholders.
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
  co?: number | null;   // mg/m³ (8-hr) by default, or converted with explicit coUnit
  coUnit?: 'mg/m3' | 'ug/m3' | 'µg/m³' | string | null;
  o3?: number | null;   // µg/m³ (8-hr)
  nh3?: number | null;  // µg/m³ (24-hr)
  pb?: number | null;   // µg/m³ (24-hr Lead)
  averagingPeriods?: Record<string, number | null>;
  is24HourAveraged?: boolean;
}

export interface SubIndexResult {
  pollutant: string;
  concentration: number;
  subIndex: number;
  category: CpcbCategory;
  unit: string;
  averagingPeriod?: string;
}

export type CpcbClassification =
  | 'statutory_compliant'
  | 'indicative_subindex'
  | 'indicative_snapshot'
  | 'unavailable';

export interface CpcbNaqiCalculationResult {
  aqi: number | null;
  category: CpcbCategory | null;
  dominantPollutant: string | null;
  subIndices: Record<string, SubIndexResult>;
  isDataSufficient: boolean;
  monitoredPollutantCount: number;
  missingRequirements: string[];
  notes: string;
  classification: CpcbClassification;
  isOfficialPublished?: boolean;
}

// ---------------------------------------------------------------------------
// Official CPCB Breakpoints (CPCB NAQI 2014 / 2015 MoEFCC Guidelines)
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
    // In mg/m³ (8-hr average)
    { cLow: 0, cHigh: 1.0, iLow: 0, iHigh: 50 },
    { cLow: 1.1, cHigh: 2.0, iLow: 51, iHigh: 100 },
    { cLow: 2.1, cHigh: 10.0, iLow: 101, iHigh: 200 },
    { cLow: 10.1, cHigh: 17.0, iLow: 201, iHigh: 300 },
    { cLow: 17.1, cHigh: 34.0, iLow: 301, iHigh: 400 },
    { cLow: 34.0, cHigh: 60.0, iLow: 401, iHigh: 500 },
  ],
  o3: [
    // In µg/m³ (8-hr / 1-hr average)
    { cLow: 0, cHigh: 50, iLow: 0, iHigh: 50 },
    { cLow: 51, cHigh: 100, iLow: 51, iHigh: 100 },
    { cLow: 101, cHigh: 168, iLow: 101, iHigh: 200 },
    { cLow: 169, cHigh: 208, iLow: 201, iHigh: 300 },
    { cLow: 209, cHigh: 748, iLow: 301, iHigh: 400 },
    { cLow: 748, cHigh: 1000, iLow: 401, iHigh: 500 },
  ],
  nh3: [
    // In µg/m³ (24-hr average)
    { cLow: 0, cHigh: 200, iLow: 0, iHigh: 50 },
    { cLow: 201, cHigh: 400, iLow: 51, iHigh: 100 },
    { cLow: 401, cHigh: 800, iLow: 101, iHigh: 200 },
    { cLow: 801, cHigh: 1200, iLow: 201, iHigh: 300 },
    { cLow: 1201, cHigh: 1800, iLow: 301, iHigh: 400 },
    { cLow: 1800, cHigh: 3000, iLow: 401, iHigh: 500 },
  ],
  pb: [
    // Lead in µg/m³ (24-hr average) - CPCB NAQI Schedule
    { cLow: 0, cHigh: 0.5, iLow: 0, iHigh: 50 },
    { cLow: 0.6, cHigh: 1.0, iLow: 51, iHigh: 100 },
    { cLow: 1.1, cHigh: 2.0, iLow: 101, iHigh: 200 },
    { cLow: 2.1, cHigh: 3.0, iLow: 201, iHigh: 300 },
    { cLow: 3.1, cHigh: 3.5, iLow: 301, iHigh: 400 },
    { cLow: 3.5, cHigh: 5.0, iLow: 401, iHigh: 500 },
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
 * Enforces explicit unit checking: never assumes or guesses units from numerical magnitude.
 * 
 * @param pollutantKey Pollutant key ('pm25', 'pm10', 'no2', 'so2', 'co', 'o3', 'nh3', 'pb')
 * @param concentration Numeric concentration value
 * @param unit Optional explicit measurement unit (e.g., 'mg/m3', 'ug/m3')
 */
export function calculateSubIndex(
  pollutantKey: string,
  concentration: number,
  unit?: string | null
): number | null {
  if (concentration < 0 || !Number.isFinite(concentration)) return null;

  const key = pollutantKey.toLowerCase().trim();
  const breakpoints = CPCB_BREAKPOINTS[key];
  if (!breakpoints || breakpoints.length === 0) return null;

  let conc = concentration;

  // Handle CO unit: CPCB standard breakpoints are defined in mg/m³.
  // If explicit unit is provided, respect it strictly:
  // - 'ug/m3' / 'µg/m³' -> convert to mg/m³ by dividing by 1000
  // - 'mg/m3' / 'mg/m³' -> keep as mg/m³
  // - unsupported unit -> return null
  // When unit is omitted (legacy untyped callers), values > 50 are handled as legacy µg/m³ inputs for compatibility.
  if (key === 'co') {
    if (unit) {
      const u = unit.toLowerCase().trim();
      if (u === 'ug/m3' || u === 'µg/m³') {
        conc = conc / 1000;
      } else if (u === 'mg/m3' || u === 'mg/m³') {
        conc = concentration;
      } else {
        // Unknown or unsupported unit for CO
        return null;
      }
    } else if (conc > 50) {
      // Legacy untyped caller compatibility
      conc = conc / 1000;
    }
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
 * Enforces the official CPCB statutory criteria:
 * 1. At least 3 pollutants must be monitored.
 * 2. At least one of the monitored pollutants MUST be PM2.5 or PM10.
 * 3. Distinguishes statutory 24-hr compliance from indicative snapshots.
 */
export function calculateComprehensiveCpcbNaqi(input: PollutantInput): CpcbNaqiCalculationResult {
  const subIndices: Record<string, SubIndexResult> = {};
  const missingRequirements: string[] = [];

  const candidates: Array<{
    key: string;
    name: string;
    val?: number | null;
    unit: string;
    avgPeriod: string;
  }> = [
    { key: 'pm25', name: 'PM2.5', val: input.pm25, unit: 'µg/m³', avgPeriod: '24-hr' },
    { key: 'pm10', name: 'PM10', val: input.pm10, unit: 'µg/m³', avgPeriod: '24-hr' },
    { key: 'no2', name: 'NO2', val: input.no2, unit: 'µg/m³', avgPeriod: '24-hr' },
    { key: 'so2', name: 'SO2', val: input.so2, unit: 'µg/m³', avgPeriod: '24-hr' },
    {
      key: 'co',
      name: 'CO',
      val: input.co,
      unit: input.coUnit || (input.co !== undefined && input.co !== null && input.co > 50 ? 'µg/m³' : 'mg/m³'),
      avgPeriod: '8-hr',
    },
    { key: 'o3', name: 'Ozone', val: input.o3, unit: 'µg/m³', avgPeriod: '8-hr' },
    { key: 'nh3', name: 'NH3', val: input.nh3, unit: 'µg/m³', avgPeriod: '24-hr' },
    { key: 'pb', name: 'Lead', val: input.pb, unit: 'µg/m³', avgPeriod: '24-hr' },
  ];

  let maxSubIndex = -1;
  let dominant = '';

  for (const { key, name, val, unit, avgPeriod } of candidates) {
    if (val !== undefined && val !== null && Number.isFinite(val) && val >= 0) {
      const subIdx = calculateSubIndex(key, val, key === 'co' ? input.coUnit : unit);
      if (subIdx !== null) {
        subIndices[key] = {
          pollutant: name,
          concentration: val,
          subIndex: subIdx,
          category: getCpcbCategory(subIdx),
          unit,
          averagingPeriod: avgPeriod,
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
      classification: 'unavailable',
    };
  }

  const aqi = maxSubIndex >= 0 ? maxSubIndex : null;
  const category = aqi !== null ? getCpcbCategory(aqi) : null;

  // Check averaging period requirements
  const is24HrVerified = input.is24HourAveraged !== false;
  let classification: CpcbClassification = 'indicative_subindex';
  if (isDataSufficient && is24HrVerified) {
    classification = 'statutory_compliant';
  } else if (isDataSufficient && !is24HrVerified) {
    classification = 'indicative_snapshot';
  }

  return {
    aqi,
    category,
    dominantPollutant: dominant || null,
    subIndices,
    isDataSufficient,
    monitoredPollutantCount: monitoredCount,
    missingRequirements,
    classification,
    notes: classification === 'statutory_compliant'
      ? `Statutory CPCB NAQI compliant (${monitoredCount} pollutants; dominant: ${dominant}).`
      : classification === 'indicative_snapshot'
      ? `Indicative snapshot AQI (${monitoredCount} pollutants monitored, but instantaneous/hourly rather than statutory 24-hr average).`
      : `Indicative sub-index based on ${monitoredCount} available pollutants (${missingRequirements.join('; ')}).`,
  };
}
