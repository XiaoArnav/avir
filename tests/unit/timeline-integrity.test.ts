import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  calculateCigaretteEquivalence,
  calculateCpcbNaqi,
  getGrapStage,
  getAQICategory,
} from '@/domain/air-math';
import { analyzeDiurnalWindows } from '@/domain/advanced-air-math';

describe('AtmosphereHero Zero-Fabrication & Timeline Integrity', () => {
  it('strictly eliminates synthetic sine-wave generators from AtmosphereHero component', () => {
    const heroFilePath = path.resolve(__dirname, '../../src/components/AtmosphereHero.tsx');
    const heroCode = fs.readFileSync(heroFilePath, 'utf-8');

    // DEF-01: No synthetic Math.sin curve
    expect(heroCode).not.toContain('Math.sin');
    // DEF-02: No hardcoded static claim of 12:30 PM - 3:30 PM
    expect(heroCode).not.toContain('12:30 PM - 3:30 PM');
    // DEF-03: No fabricated gas defaults
    expect(heroCode).not.toContain("'4,228'");
    expect(heroCode).not.toContain("'117.5'");
    expect(heroCode).not.toContain("'104.5'");
    expect(heroCode).not.toContain("'17.0'");
  });

  it('correctly calculates cigarette equivalence and handles null safely', () => {
    expect(calculateCigaretteEquivalence(110)).toBe(5);
    expect(calculateCigaretteEquivalence(0)).toBe(0);
    expect(calculateCigaretteEquivalence(null)).toBeNull();
    expect(calculateCigaretteEquivalence(undefined)).toBeNull();
  });

  it('evaluates CPCB NAQI and CAQM GRAP stages with null safety', () => {
    expect(calculateCpcbNaqi(null, null)).toEqual({ aqi: null, category: 'Unavailable', isIndicativeSubIndex: false });
    expect(calculateCpcbNaqi(150, 200).aqi).toBeGreaterThan(0);

    const grapUnavail = getGrapStage(null);
    expect(grapUnavail.stage).toBe('Unavailable');
    expect(grapUnavail.label).toContain('Unverified');

    const grapNormal = getGrapStage(50);
    expect(grapNormal.stage).toBe('Normal');

    const grapSevere = getGrapStage(420);
    expect(grapSevere.stage).toBe('Stage III');
  });

  it('maps AQI categories with null fallback to conservative alert without crashing', () => {
    expect(getAQICategory(null)).toBe('Unavailable');
    expect(getAQICategory(25)).toBe('Good');
    expect(getAQICategory(75)).toBe('Moderate');
    expect(getAQICategory(125)).toBe('UnhealthySensitive');
    expect(getAQICategory(175)).toBe('Unhealthy');
    expect(getAQICategory(250)).toBe('VeryUnhealthy');
    expect(getAQICategory(350)).toBe('Hazardous');
  });

  it('analyzes diurnal forecast safely when empty', () => {
    const result = analyzeDiurnalWindows([]);
    expect(result.hourlyPoints).toHaveLength(0);
    expect(result.bestVentingWindow).toBeDefined();
    expect(result.worstInversionWindow).toBeDefined();
  });
});
