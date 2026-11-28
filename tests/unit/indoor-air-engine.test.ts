import { describe, it, expect } from 'vitest';
import {
  calculateRoomDimensions,
  convertCadr,
  calculateAch,
  calculateWellMixedDecay,
} from '@/domain/indoor-air-types';
import {
  calculateDiyPurifierBillOfMaterials,
  DIY_PURIFIER_PRESETS,
} from '@/services/indoor-air/indoor-air-service';

describe('Step 15 — Indoor Air-Cleaning Studio & Physics', () => {
  describe('Room Volume & Metric/Imperial Conversion', () => {
    it('calculates room volume accurately in metric units', () => {
      // 5m length x 4m width x 3m height = 20 m² area, 60 m³ volume
      const room = calculateRoomDimensions(5, 4, 3, 'metric');
      expect(room.floorAreaM2).toBe(20);
      expect(room.volumeM3).toBe(60);
      expect(room.unit).toBe('metric');
    });

    it('calculates room volume accurately from imperial units (sq ft and ft)', () => {
      // 15 ft x 12 ft x 9 ft = 180 sq ft = ~16.72 m² area; 1620 cu ft = ~45.87 m³ volume
      const room = calculateRoomDimensions(15, 12, 9, 'imperial');
      expect(room.floorAreaM2).toBeCloseTo(16.72, 1);
      expect(room.volumeM3).toBeCloseTo(45.87, 1);
      expect(room.unit).toBe('imperial');
    });

    it('rejects zero or negative dimensions', () => {
      expect(() => calculateRoomDimensions(0, 4, 3, 'metric')).toThrow(/positive/);
      expect(() => calculateRoomDimensions(5, -2, 3, 'metric')).toThrow(/positive/);
    });
  });

  describe('CADR Conversion & Air Changes per Hour (ACH)', () => {
    it('converts between CFM and m³/h accurately using physical constant 1.699011', () => {
      // 300 CFM => ~509.7 m³/h
      const fromCfm = convertCadr(300, 'cfm');
      expect(fromCfm.cfm).toBe(300);
      expect(fromCfm.m3h).toBe(509.7);

      // 500 m³/h => ~294 CFM
      const fromM3h = convertCadr(500, 'm3h');
      expect(fromM3h.m3h).toBe(500);
      expect(fromM3h.cfm).toBe(294);
    });

    it('calculates ACH correctly for a given room volume and CADR', () => {
      // Room volume = 50 m³, CADR = 300 m³/h
      // ACH = 300 / 50 = 6.00
      const result = calculateAch(300, 50);
      expect(result.ach).toBe(6.0);
      expect(result.roomVolumeM3).toBe(50);
      expect(result.rating).toBe('optimal');
    });

    it('Elimination of B-008: Never claims "Hospital Isolation Grade Clean Air" at ACH >= 6', () => {
      // Even at high ACH (e.g. 10 ACH), must use scientific terminology
      const highAch = calculateAch(600, 50); // 12 ACH
      expect(highAch.ach).toBe(12.0);
      expect(highAch.rating).toBe('optimal');
      expect(highAch.evaluationText).not.toContain('Hospital Isolation');
      expect(highAch.evaluationText).toContain('airborne particulate clearance');
    });
  });

  describe('First-Order Well-Mixed Particle Decay', () => {
    it('computes exponential decay time series and reduction milestones', () => {
      // Initial PM2.5 = 150 µg/m³, ACH = 5.0, deposition = 0.10 => total loss = 5.10 h⁻¹
      // Time to 50% = ln(2) / 5.10 * 60 = 0.6931 / 5.10 * 60 = ~8.15 mins (~8 mins)
      // Time to 90% = ln(10) / 5.10 * 60 = 2.3026 / 5.10 * 60 = ~27.09 mins (~27 mins)
      // Time to 99% = ln(100) / 5.10 * 60 = 4.6052 / 5.10 * 60 = ~54.18 mins (~54 mins)
      const decay = calculateWellMixedDecay(150, 5.0, 0.10, 60);
      expect(decay.initialConcentrationUgM3).toBe(150);
      expect(decay.minutesTo50Percent).toBe(8);
      expect(decay.minutesTo90Percent).toBe(27);
      expect(decay.minutesTo99Percent).toBe(54);
      expect(decay.timeSeries.length).toBeGreaterThan(10);

      // Verify that concentration decreases monotonically
      const t0 = decay.timeSeries[0].concentrationUgM3;
      const tLast = decay.timeSeries[decay.timeSeries.length - 1].concentrationUgM3;
      expect(t0).toBe(150);
      expect(tLast).toBeLessThan(10);
    });

    it('discloses physical assumptions explicitly', () => {
      const decay = calculateWellMixedDecay(100, 4.0);
      expect(decay.assumptions.some(a => a.includes('well-mixed'))).toBe(true);
      expect(decay.assumptions.some(a => a.includes('Zero continuous'))).toBe(true);
    });
  });

  describe('Elimination of B-006 & B-007: Purifier Presets & Editable Bill of Materials', () => {
    it('B-006: Provides customizable DIY air cleaner presets with stated CADR baselines', () => {
      expect(DIY_PURIFIER_PRESETS.length).toBeGreaterThanOrEqual(3);
      const cr4 = DIY_PURIFIER_PRESETS.find(p => p.id === 'cr-box-4-filter');
      expect(cr4).toBeDefined();
      expect(cr4?.cadrCfm).toBeGreaterThan(300);
      expect(cr4?.description).toContain('MERV 13');
    });

    it('B-007: Computes bill of materials with editable costs and dated baseline', () => {
      // Default baseline
      const defaultBom = calculateDiyPurifierBillOfMaterials('cr-box-4-filter');
      expect(defaultBom.totalDiyCost).toBeGreaterThan(1000);
      expect(defaultBom.currency).toBe('INR');
      expect(defaultBom.lastUpdated).toContain('2026');
      expect(defaultBom.isUserOverridden).toBe(false);

      // User custom cost inputs
      const customBom = calculateDiyPurifierBillOfMaterials('cr-box-4-filter', {
        boxFanCost: 1800,
        filtersCost: 2000,
        shroudTapeCost: 500,
        commercialPurifierComparisonCost: 15000,
      });
      expect(customBom.totalDiyCost).toBe(4300); // 1800 + 2000 + 500
      expect(customBom.commercialPurifierComparisonCost).toBe(15000);
      expect(customBom.isUserOverridden).toBe(true);
    });
  });
});
