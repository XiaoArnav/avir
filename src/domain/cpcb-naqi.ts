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

import { AqiEvidence, AqiMethod } from './types';

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
  units?: Record<string, string | null>;
  averagingPeriods?: Record<string, number | null>;
  is24HourAveraged?: boolean;
  sourceProvider?: string | null;
  isOfficialPublished?: boolean;
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
  isCompleteIndex: boolean;
  monitoredPollutantCount: number;
  missingRequirements: string[];
  notes: string;
  classification: CpcbClassification;
  isOfficialPublished: boolean;
  evidence: AqiEvidence;
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
    // Lead in µg/m³ (24-hr average) - CPCB NAQI Schedule (MoEFCC Guidelines 2014)
    // Discrete regulatory breakpoint intervals (0-0.5, 0.6-1.0, 1.1-2.0, 2.1-3.0, 3.1-3.5, 3.6-5.0):
    // Band 1 (Good): 0 to 0.5 -> 0 to 50
    // Band 2 (Satisfactory): 0.6 to 1.0 -> 51 to 100
    // Band 3 (Moderate): 1.1 to 2.0 -> 101 to 200
    // Band 4 (Poor): 2.1 to 3.0 -> 201 to 300
    // Band 5 (Very Poor): 3.1 to 3.5 -> 301 to 400
    // Band 6 (Severe): 3.6 to 5.0 -> 401 to 500 (resolves overlapping boundary at 3.5)
    { cLow: 0, cHigh: 0.5, iLow: 0, iHigh: 50 },
    { cLow: 0.6, cHigh: 1.0, iLow: 51, iHigh: 100 },
    { cLow: 1.1, cHigh: 2.0, iLow: 101, iHigh: 200 },
    { cLow: 2.1, cHigh: 3.0, iLow: 201, iHigh: 300 },
    { cLow: 3.1, cHigh: 3.5, iLow: 301, iHigh: 400 },
    { cLow: 3.6, cHigh: 5.0, iLow: 401, iHigh: 500 },
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
 * Strict Invariants:
 * 1. CO requires an explicit unit ('mg/m3' or 'ug/m3'). Untyped CO returns null.
 * 2. Never applies numeric magnitude heuristics (>50) to infer units.
 * 3. Particulates and criteria gases require valid µg/m³ units when unit is provided.
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
  if (concentration === null || concentration === undefined || !Number.isFinite(concentration) || concentration < 0) {
    return null;
  }

  const key = pollutantKey.toLowerCase().trim();
  const breakpoints = CPCB_BREAKPOINTS[key];
  if (!breakpoints || breakpoints.length === 0) return null;

  let conc = concentration;

  // Handle CO unit: CPCB standard breakpoints are defined in mg/m³.
  // Strict invariant: CO requires an explicit verified unit.
  // Never guess unit from numerical magnitude (eliminates `if (!unit && conc > 50)`).
  if (key === 'co') {
    if (!unit) {
      // Untyped CO without explicit unit must not contribute to AQI calculations
      return null;
    }
    const u = unit.toLowerCase().trim();
    if (u === 'ug/m3' || u === 'µg/m³' || u === 'ug/m^3' || u === 'micrograms/m3') {
      conc = conc / 1000;
    } else if (u === 'mg/m3' || u === 'mg/m³' || u === 'mg/m^3' || u === 'milligrams/m3') {
      conc = concentration;
    } else {
      // Unsupported or unverified unit for CO
      return null;
    }
  } else if (unit) {
    // For non-CO criteria pollutants, standard unit must be µg/m³
    const u = unit.toLowerCase().trim();
    if (u !== 'ug/m3' && u !== 'µg/m³' && u !== 'ug/m^3' && u !== 'micrograms/m3') {
      // Unsupported unit for particulate or non-CO gas (e.g. ppm, mg/m3 for PM2.5)
      return null;
    }
  }

  // Exact 0 concentration is 0 sub-index
  if (conc === 0) return 0;

  for (const bp of breakpoints) {
    if (conc <= bp.cHigh) {
      const effectiveC = Math.max(bp.cLow, conc);
      const idx = ((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) * (effectiveC - bp.cLow) + bp.iLow;
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
 * 3. Enforces pollutant-specific averaging periods (24-hr for PM/NO2/SO2/NH3/Pb, 8-hr for CO/O3).
 * 4. Distinguishes statutory compliance from indicative snapshots.
 */
export function calculateComprehensiveCpcbNaqi(input: PollutantInput): CpcbNaqiCalculationResult {
  const subIndices: Record<string, SubIndexResult> = {};
  const missingRequirements: string[] = [];

  const candidates: Array<{
    key: string;
    name: string;
    val?: number | null;
    unit: string | null;
    avgPeriod: string;
  }> = [
    { key: 'pm25', name: 'PM2.5', val: input.pm25, unit: input.units?.pm25 || 'µg/m³', avgPeriod: '24-hr' },
    { key: 'pm10', name: 'PM10', val: input.pm10, unit: input.units?.pm10 || 'µg/m³', avgPeriod: '24-hr' },
    { key: 'no2', name: 'NO2', val: input.no2, unit: input.units?.no2 || 'µg/m³', avgPeriod: '24-hr' },
    { key: 'so2', name: 'SO2', val: input.so2, unit: input.units?.so2 || 'µg/m³', avgPeriod: '24-hr' },
    {
      key: 'co',
      name: 'CO',
      val: input.co,
      unit: input.coUnit || input.units?.co || null,
      avgPeriod: '8-hr',
    },
    { key: 'o3', name: 'Ozone', val: input.o3, unit: input.units?.o3 || 'µg/m³', avgPeriod: '8-hr' },
    { key: 'nh3', name: 'NH3', val: input.nh3, unit: input.units?.nh3 || 'µg/m³', avgPeriod: '24-hr' },
    { key: 'pb', name: 'Lead', val: input.pb, unit: input.units?.pb || 'µg/m³', avgPeriod: '24-hr' },
  ];

  let maxSubIndex = -1;
  let dominant = '';

  for (const { key, name, val, unit, avgPeriod } of candidates) {
    if (val !== undefined && val !== null && Number.isFinite(val) && val >= 0) {
      // CO strictly requires explicit unit; other pollutants require verified µg/m³
      const subIdx = calculateSubIndex(key, val, unit);
      if (subIdx !== null && unit !== null) {
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
    const evidence: AqiEvidence = {
      indexValue: null,
      standard: 'IN_CPCB',
      method: 'unavailable',
      classification: 'unavailable',
      sourceProvider: input.sourceProvider || null,
      pollutantCount: 0,
      averagingVerified: false,
      isOfficialPublished: false,
      missingRequirements: ['No valid pollutant concentrations available.'],
      standardVersion: 'CPCB NAQI (MoEFCC Guidelines 2014-2015)',
      notes: 'Insufficient telemetry to calculate National AQI.',
    };

    return {
      aqi: null,
      category: null,
      dominantPollutant: null,
      subIndices: {},
      isDataSufficient: false,
      isCompleteIndex: false,
      monitoredPollutantCount: 0,
      missingRequirements: ['No valid pollutant concentrations available.'],
      notes: 'Insufficient telemetry to calculate National AQI.',
      classification: 'unavailable',
      isOfficialPublished: false,
      evidence,
    };
  }

  const aqi = maxSubIndex >= 0 ? maxSubIndex : null;
  const category = aqi !== null ? getCpcbCategory(aqi) : null;

  // Check averaging period requirements (Section 10 CPCB Guidelines):
  // Statutory compliance requires affirmative evidence:
  // - 24-hr (1440 min or 24 h; minimum 16 hours / 960 min data sufficiency) for PM2.5, PM10, NO2, SO2, NH3, Pb.
  // - 8-hr (480 min or 8 h) for CO, O3.
  let isAveragingVerified = false;
  const countedKeys = Object.keys(subIndices);
  const hasEightHourPollutant = countedKeys.includes('co') || countedKeys.includes('o3');

  if (input.averagingPeriods) {
    let allCountedMatch = true;
    for (const countedKey of countedKeys) {
      const period = input.averagingPeriods[countedKey];
      if (period === undefined || period === null) {
        allCountedMatch = false;
        break;
      }
      if (countedKey === 'co' || countedKey === 'o3') {
        if (period !== 480 && period !== 8) {
          allCountedMatch = false;
          break;
        }
      } else {
        // Must represent at least 16 hours (>= 960 minutes, or >= 16 hours) up to 24 hours (1440 min)
        const is24HrEquivalent =
          (period >= 16 && period <= 24) || (period >= 960 && period <= 1440);
        if (!is24HrEquivalent) {
          allCountedMatch = false;
          break;
        }
      }
    }
    isAveragingVerified = allCountedMatch && countedKeys.length > 0;
  } else if (input.is24HourAveraged === true) {
    // Legacy boolean cannot bypass CO/O3 8-hour requirement (Section 10, Test 51)
    if (!hasEightHourPollutant && countedKeys.length > 0) {
      isAveragingVerified = true;
    } else {
      isAveragingVerified = false;
    }
  }

  let classification: CpcbClassification = 'indicative_subindex';
  if (isDataSufficient && isAveragingVerified) {
    classification = 'statutory_compliant';
  } else if (isDataSufficient && !isAveragingVerified) {
    classification = 'indicative_snapshot';
  }

  // Strict Official Publication Provenance Check (AQI-02):
  // A local mathematical calculation cannot claim official publication without verified CPCB bulletin provenance.
  const isVerifiedOfficialProvenance = Boolean(
    input.isOfficialPublished === true &&
    input.sourceProvider &&
    (
      input.sourceProvider.toLowerCase().includes('cpcb') ||
      input.sourceProvider.toLowerCase().includes('central pollution control board') ||
      input.sourceProvider.toLowerCase().includes('official_bulletin')
    ) &&
    !input.sourceProvider.toLowerCase().includes('open-meteo') &&
    !input.sourceProvider.toLowerCase().includes('sensor.community') &&
    !input.sourceProvider.toLowerCase().includes('purpleair') &&
    !input.sourceProvider.toLowerCase().includes('local')
  );

  if (input.isOfficialPublished === true && !isVerifiedOfficialProvenance) {
    missingRequirements.push('Official publication flag rejected: unverified publication provenance.');
  }

  const isOfficialPublished = isVerifiedOfficialProvenance;
  const method: AqiMethod = isOfficialPublished
    ? 'cpcb_official_published'
    : classification === 'statutory_compliant'
    ? 'cpcb_statutory_eligible'
    : aqi !== null
    ? 'cpcb_derived_indicative'
    : 'unavailable';

  const notes = classification === 'statutory_compliant'
    ? `Statutory CPCB NAQI compliant (${monitoredCount} pollutants; dominant: ${dominant}).`
    : classification === 'indicative_snapshot'
    ? `Indicative snapshot AQI (${monitoredCount} pollutants monitored, but instantaneous/hourly snapshot rather than verified statutory 24-hr/8-hr averages).`
    : `Indicative sub-index based on ${monitoredCount} available pollutants (${missingRequirements.join('; ')}).`;

  const evidence: AqiEvidence = {
    indexValue: aqi,
    standard: 'IN_CPCB',
    method,
    classification,
    sourceProvider: input.sourceProvider || null,
    pollutantCount: monitoredCount,
    averagingVerified: isAveragingVerified,
    isOfficialPublished,
    missingRequirements,
    standardVersion: 'CPCB NAQI (MoEFCC Guidelines 2014-2015)',
    notes,
  };

  return {
    aqi,
    category,
    dominantPollutant: dominant || null,
    subIndices,
    isDataSufficient,
    isCompleteIndex: isDataSufficient,
    monitoredPollutantCount: monitoredCount,
    missingRequirements,
    classification,
    isOfficialPublished,
    notes,
    evidence,
  };
}
