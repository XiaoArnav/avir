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

export interface CalibrationEligibilityCriteria {
  sensorModel?: string | null;
  isFirmwareCompensated?: boolean;
  hasLocalRelativeHumidity: boolean;
  relativeHumidityPercent?: number | null;
  rawPm25: number | null;
  rhMeasuredAt?: string | null;
  pmMeasuredAt?: string | null;
}

export interface SensorCalibrationEvaluation {
  eligible: boolean;
  reason?: string;
  recommendedMethod: 'epa_barkjohn' | 'none';
  calibratedPm25: number | null;
  rawPm25: number | null;
  formulaName: string;
}

/**
 * Supported low-cost optical particulate sensor models verified for Barkjohn correction.
 */
export const BARKJOHN_ELIGIBLE_SENSOR_MODELS = [
  'plantower pms5003',
  'plantower pms5003t',
  'pms5003',
  'pms5003t',
  'nova sds011',
  'sds011',
];

/**
 * Checks whether a given sensor model is eligible for EPA Barkjohn correction.
 */
export function isSensorModelBarkjohnEligible(model?: string | null): boolean {
  if (!model) return false;
  const normalized = model.toLowerCase().trim();
  return BARKJOHN_ELIGIBLE_SENSOR_MODELS.some((m) => normalized.includes(m));
}

/**
 * Evaluates full scientific eligibility for sensor calibration.
 * Prevents double-calibration, enforces genuine local humidity, and verifies sensor models.
 */
export function evaluateSensorCalibrationEligibility(
  criteria: CalibrationEligibilityCriteria
): SensorCalibrationEvaluation {
  const {
    sensorModel,
    isFirmwareCompensated,
    hasLocalRelativeHumidity,
    relativeHumidityPercent,
    rawPm25,
    rhMeasuredAt,
    pmMeasuredAt,
  } = criteria;

  if (rawPm25 === null || rawPm25 === undefined || !Number.isFinite(rawPm25) || rawPm25 < 0) {
    return {
      eligible: false,
      reason: 'invalid_raw_pm25',
      recommendedMethod: 'none',
      calibratedPm25: null,
      rawPm25: null,
      formulaName: 'Invalid sensor output',
    };
  }

  // Preserve clean air zero baseline
  if (rawPm25 === 0) {
    return {
      eligible: true,
      recommendedMethod: 'epa_barkjohn',
      calibratedPm25: 0,
      rawPm25: 0,
      formulaName: 'US EPA Barkjohn (Zero Baseline)',
    };
  }

  // Prevent double calibration if firmware has already compensated the reading
  if (isFirmwareCompensated) {
    return {
      eligible: false,
      reason: 'already_compensated',
      recommendedMethod: 'none',
      calibratedPm25: null,
      rawPm25,
      formulaName: 'Firmware compensated output — external correction withheld',
    };
  }

  // Check sensor model eligibility
  if (!isSensorModelBarkjohnEligible(sensorModel)) {
    return {
      eligible: false,
      reason: 'unsupported_sensor_model',
      recommendedMethod: 'none',
      calibratedPm25: null,
      rawPm25,
      formulaName: 'Raw sensor measurement — calibration not verified for this hardware model',
    };
  }

  // Verify genuine local relative humidity
  if (
    !hasLocalRelativeHumidity ||
    relativeHumidityPercent === null ||
    relativeHumidityPercent === undefined ||
    !Number.isFinite(relativeHumidityPercent)
  ) {
    return {
      eligible: false,
      reason: 'missing_humidity',
      recommendedMethod: 'none',
      calibratedPm25: null,
      rawPm25,
      formulaName: 'Raw sensor measurement — ambient relative humidity unavailable',
    };
  }

  // Check timestamp compatibility if both timestamps are provided
  if (rhMeasuredAt && pmMeasuredAt) {
    const rhTime = new Date(rhMeasuredAt).getTime();
    const pmTime = new Date(pmMeasuredAt).getTime();
    if (!isNaN(rhTime) && !isNaN(pmTime)) {
      const deltaMinutes = Math.abs(rhTime - pmTime) / 60000;
      if (deltaMinutes > 15) {
        return {
          eligible: false,
          reason: 'incompatible_timestamps',
          recommendedMethod: 'none',
          calibratedPm25: null,
          rawPm25,
          formulaName: 'Raw sensor measurement — humidity timestamp skew exceeds 15 minutes',
        };
      }
    }
  }

  // Apply EPA Barkjohn calibration
  const calResult = applyEpaBarkjohnCalibration(rawPm25, relativeHumidityPercent);
  if (!calResult || !calResult.applied) {
    return {
      eligible: false,
      reason: 'calculation_failed',
      recommendedMethod: 'none',
      calibratedPm25: null,
      rawPm25,
      formulaName: 'Raw sensor measurement — calibration not applied',
    };
  }

  return {
    eligible: true,
    recommendedMethod: 'epa_barkjohn',
    calibratedPm25: calResult.calibratedPm25,
    rawPm25,
    formulaName: `US EPA Barkjohn (${calResult.rhPercent}% RH, ${sensorModel || 'PMS5003'})`,
  };
}

/**
 * Applies the US EPA Barkjohn nationwide humidity correction equation
 * to raw optical particle counter (OPC) readings (e.g. Plantower PMS5003, SDS011).
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

  // Barkjohn equation: 0.524 * PM2.5_raw - 0.0862 * RH + 5.75
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
