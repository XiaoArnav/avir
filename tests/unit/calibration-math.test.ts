import { describe, it, expect } from 'vitest';
import {
  applyEpaBarkjohnCalibration,
  calibrateCommunitySensorReading,
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
});
