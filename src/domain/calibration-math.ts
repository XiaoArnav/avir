/**
 * Scientific Calibration & Sensor Normalization Engine
 * Implements US EPA Barkjohn Humidity Correction and Optical Sensor Calibration.
 *
 * Reference:
 * Barkjohn, A. L., Gantt, B., & Clements, A. L. (2021).
 * "Development and evaluation of a nationwide correction equation for PurpleAir PM2.5 sensors."
 * Atmospheric Measurement Techniques, 14(6), 4617-4637.
 */

export interface CalibrationResult {
  rawPm25: number;
  calibratedPm25: number;
  rhPercent: number | null;
  correctionFactor: number; // calibratedPm25 / rawPm25 ratio
  formulaName: string;
  applied: boolean;
  notes?: string;
}

/**
 * Applies the US EPA Barkjohn nationwide humidity correction equation
 * to raw optical particle counter (OPC) readings (e.g. Plantower PMS5003, SDS011, SPS30).
 *
 * Equation:
 * PM2.5_corrected = 0.524 * PM2.5_raw - 0.0862 * RH + 5.75
 *
 * @param rawPm25 Raw particulate concentration in µg/m³
 * @param rhPercent Relative humidity in percent [0-100]. Must be authentic measured humidity.
 * @returns Calibrated PM2.5 concentration in µg/m³ or uncalibrated result when RH is unavailable.
 */
export function applyEpaBarkjohnCalibration(
  rawPm25: number | null | undefined,
  rhPercent: number | null | undefined
): CalibrationResult | null {
  if (rawPm25 === null || rawPm25 === undefined || !Number.isFinite(rawPm25) || rawPm25 < 0) {
    return null;
  }

  const hasValidRh = rhPercent !== null && rhPercent !== undefined && Number.isFinite(rhPercent);

  // If concentration is 0 (clean air), calibrated is 0
  if (rawPm25 === 0) {
    return {
      rawPm25: 0,
      calibratedPm25: 0,
      rhPercent: hasValidRh ? Math.min(100, Math.max(0, rhPercent!)) : null,
      correctionFactor: 1.0,
      formulaName: 'US EPA Barkjohn (Zero Baseline)',
      applied: true,
      notes: 'Clean zero concentration baseline preserved.',
    };
  }

  // Never invent 50% RH if ambient humidity is missing.
  // Barkjohn is strictly humidity-dependent: without measured RH, retain raw reading uncalibrated.
  if (!hasValidRh) {
    return {
      rawPm25: Math.round(rawPm25 * 10) / 10,
      calibratedPm25: Math.round(rawPm25 * 10) / 10,
      rhPercent: null,
      correctionFactor: 1.0,
      formulaName: 'Uncalibrated (Missing Ambient RH)',
      applied: false,
      notes: 'EPA Barkjohn de-humidification suspended because ambient relative humidity is unavailable.',
    };
  }

  const effectiveRh = Math.min(100, Math.max(0, rhPercent!));

  // Barkjohn equation
  let corrected = 0.524 * rawPm25 - 0.0862 * effectiveRh + 5.75;

  // Physical invariant: concentration cannot be negative
  corrected = Math.max(0, Math.round(corrected * 10) / 10);

  const ratio = rawPm25 > 0 ? Math.round((corrected / rawPm25) * 100) / 100 : 1.0;

  return {
    rawPm25: Math.round(rawPm25 * 10) / 10,
    calibratedPm25: corrected,
    rhPercent: effectiveRh,
    correctionFactor: ratio,
    formulaName: 'US EPA Barkjohn (2021)',
    applied: true,
    notes: `De-humidification applied at ${effectiveRh}% RH to eliminate hygroscopic aerosol particle swelling.`,
  };
}

/**
 * Calibrates low-cost community monitors (e.g., Sensor.Community, AirGradient, Project Vaayu)
 * using the nearest relative humidity reading.
 */
export function calibrateCommunitySensorReading(
  rawPm25: number | null | undefined,
  rhPercent: number | null | undefined,
  sensorType: 'pms5003' | 'sds011' | 'sps30' | 'generic_opc' = 'generic_opc'
): { calibratedPm25: number | null; isCalibrated: boolean; formula: string } {
  if (rawPm25 === null || rawPm25 === undefined || !Number.isFinite(rawPm25) || rawPm25 < 0) {
    return { calibratedPm25: null, isCalibrated: false, formula: 'none' };
  }

  const result = applyEpaBarkjohnCalibration(rawPm25, rhPercent);
  if (!result) {
    return { calibratedPm25: null, isCalibrated: false, formula: 'none' };
  }

  if (!result.applied) {
    return {
      calibratedPm25: result.rawPm25,
      isCalibrated: false,
      formula: 'Uncalibrated (RH unavailable)',
    };
  }

  return {
    calibratedPm25: result.calibratedPm25,
    isCalibrated: true,
    formula: `US EPA Barkjohn (${result.rhPercent}% RH, ${sensorType})`,
  };
}
