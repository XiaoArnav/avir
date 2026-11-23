import { describe, it, expect } from 'vitest';
import {
  applyEpaBarkjohnCalibration,
  calibrateCommunitySensorReading,
  evaluateSensorCalibrationEligibility,
  getDeviceCalibrationStatus,
} from '@/domain/calibration-math';

describe('US EPA Barkjohn Humidity Calibration Formula', () => {
  it('corrects raw optical PM2.5 readings for hygroscopic growth using EPA equation', () => {
    // Equation: 0.524 * raw - 0.0862 * RH + 5.75
    // For raw = 100, RH = 60: 0.524 * 100 - 0.0862 * 60 + 5.75 = 52.4 - 5.172 + 5.75 = 52.978 -> 53.0
    const result = applyEpaBarkjohnCalibration(100, 60);

    expect(result).not.toBeNull();
    expect(result?.calibratedPm25).toBeCloseTo(53.0, 1);
    expect(result?.rawPm25).toBe(100);
    expect(result?.rhPercent).toBe(60);
    expect(result?.formulaName).toContain('Barkjohn');
  });

  it('preserves 0 ug/m3 clean air baseline without generating synthetic positive offset', () => {
    const result = applyEpaBarkjohnCalibration(0, 80);
    expect(result).not.toBeNull();
    expect(result?.calibratedPm25).toBe(0);
    expect(result?.rawPm25).toBe(0);
  });

  it('enforces non-negative physical concentration invariant', () => {
    // Low raw value with high humidity should never go below 0
    const result = applyEpaBarkjohnCalibration(2, 95);
    expect(result).not.toBeNull();
    expect(result?.calibratedPm25).toBeGreaterThanOrEqual(0);
  });

  it('returns null when input is null, undefined, or non-finite', () => {
    expect(applyEpaBarkjohnCalibration(null, 50)).toBeNull();
    expect(applyEpaBarkjohnCalibration(undefined, 50)).toBeNull();
    expect(applyEpaBarkjohnCalibration(NaN, 50)).toBeNull();
    expect(applyEpaBarkjohnCalibration(-10, 50)).toBeNull();
  });

  it('clamps extreme humidity values to 0-100% range', () => {
    const resultOver = applyEpaBarkjohnCalibration(100, 120);
    expect(resultOver?.rhPercent).toBe(100);

    const resultUnder = applyEpaBarkjohnCalibration(100, -20);
    expect(resultUnder?.rhPercent).toBe(0);
  });

  it('calibrateCommunitySensorReading formats metadata transparently', () => {
    const res = calibrateCommunitySensorReading(85.0, 65, 'pms5003');
    expect(res.isCalibrated).toBe(true);
    expect(res.calibratedPm25).toBeGreaterThan(0);
    expect(res.formula).toContain('Barkjohn');
    expect(res.formula).toContain('pms5003');
  });

  it('B.9: Missing humidity never silently becomes measured 50% RH', () => {
    const result = applyEpaBarkjohnCalibration(100, null);
    expect(result).not.toBeNull();
    expect(result?.rhPercent).toBeNull();
    expect(result?.applied).toBe(false);
    expect(result?.formulaName).toContain('Uncalibrated');
  });

  it('B.10: Calibration is disabled or qualified when required RH input is missing', () => {
    const res = calibrateCommunitySensorReading(75.0, undefined, 'sds011');
    expect(res.isCalibrated).toBe(false);
    expect(res.calibratedPm25).toBe(75.0); // Retains raw concentration
    expect(res.formula).toContain('Uncalibrated');
  });

  it('B.11: Raw sensor values remain distinguishable from calibrated values', () => {
    const rawVal = 120.0;
    const resCalibrated = calibrateCommunitySensorReading(rawVal, 75, 'sds011');
    const resUncalibrated = calibrateCommunitySensorReading(rawVal, null, 'sds011');

    expect(resCalibrated.isCalibrated).toBe(true);
    expect(resCalibrated.calibratedPm25).not.toBe(rawVal);

    expect(resUncalibrated.isCalibrated).toBe(false);
    expect(resUncalibrated.calibratedPm25).toBe(rawVal);
  });

  it('evaluates zero-value baseline: genuine zero is preserved but requires verified sensor model', () => {
    // 1. With verified sensor and RH, zero baseline is eligible and yields 0
    const resVerified = evaluateSensorCalibrationEligibility({
      sensorModel: 'Plantower PMS5003',
      hasLocalRelativeHumidity: true,
      relativeHumidityPercent: 50,
      rawPm25: 0,
      identityStatus: 'verified',
    });
    expect(resVerified.eligible).toBe(true);
    expect(resVerified.applied).toBe(true);
    expect(resVerified.calibratedPm25).toBe(0);
    expect(resVerified.rawPm25).toBe(0);

    // 2. With unsupported sensor, raw 0 is preserved without falsely claiming scientific calibration
    const resUnverified = evaluateSensorCalibrationEligibility({
      sensorModel: 'Unknown Custom Sensor',
      hasLocalRelativeHumidity: true,
      relativeHumidityPercent: 50,
      rawPm25: 0,
      identityStatus: 'unknown',
    });
    expect(resUnverified.eligible).toBe(false);
    expect(resUnverified.applied).toBe(false);
    expect(resUnverified.rawPm25).toBe(0);
    expect(resUnverified.calibratedPm25).toBeNull();
  });

  it('rejects double correction if firmware is already compensated', () => {
    const res = evaluateSensorCalibrationEligibility({
      sensorModel: 'Plantower PMS5003',
      isFirmwareCompensated: true,
      hasLocalRelativeHumidity: true,
      relativeHumidityPercent: 50,
      rawPm25: 45,
      identityStatus: 'verified',
    });
    expect(res.eligible).toBe(false);
    expect(res.reason).toBe('already_compensated');
    expect(res.calibratedPm25).toBeNull();
  });

  it('getDeviceCalibrationStatus maps evaluation fields faithfully', () => {
    const evaluation = evaluateSensorCalibrationEligibility({
      sensorModel: 'Plantower PMS5003',
      hasLocalRelativeHumidity: true,
      relativeHumidityPercent: 60,
      rawPm25: 100,
      identityStatus: 'verified',
    });
    const status = getDeviceCalibrationStatus(evaluation);
    expect(status.eligible).toBe(true);
    expect(status.applied).toBe(true);
    expect(status.rawValue).toBe(100);
    expect(status.correctedValue).toBeCloseTo(53.0, 1);
    expect(status.methodId).toBe('epa_barkjohn');
    expect(status.sourceReference).toContain('Barkjohn');
  });
});
