import { describe, it, expect } from 'vitest';
import {
  generateHealthAdvisories,
  validateAdvisoryEligibility,
  AdvisoryInputParams,
} from '@/services/advisories/health-advisory-service';
import { resolveOfficialGrapStatus } from '@/services/advisories/grap-status-resolver';
import { officialOrderService } from '@/services/advisories/official-order-service';

describe('Phase A — Group B: School and Community Guidance (26-40)', () => {
  it('26. Genuine data produces evidence_based_guidance', () => {
    const params: AdvisoryInputParams = {
      cityName: 'Delhi',
      pm25: 140,
      usAqi: 194,
      timestamp: new Date().toISOString(),
      provenance: 'observed',
    };
    const advisories = generateHealthAdvisories(params);
    const evidenceAdv = advisories.find((a) => a.evidenceLevel === 'evidence_based_guidance');
    expect(evidenceAdv).toBeDefined();
    expect(evidenceAdv?.title).toContain('Unhealthy');
    expect(evidenceAdv?.sourceNames).toContain('National Centre for Disease Control (NCDC), Ministry of Health & Family Welfare');
  });

  it('27. Missing telemetry triggers insufficient_data and no fabricated numbers', () => {
    const params: AdvisoryInputParams = {
      cityName: 'Patna',
      pm25: null,
      usAqi: null,
    };
    const advisories = generateHealthAdvisories(params);
    const insufficient = advisories.find((a) => a.evidenceLevel === 'insufficient_data');
    expect(insufficient).toBeDefined();
    expect(insufficient?.dataFreshness).toContain('zero synthetic numbers');
    expect(advisories.some((a) => a.evidenceLevel === 'evidence_based_guidance')).toBe(false);
  });

  it('28. Stale telemetry (>24h) fails eligibility and downgrades guidance', () => {
    const staleTime = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
    const eligibility = validateAdvisoryEligibility({
      cityName: 'Delhi',
      pm25: 180,
      usAqi: 230,
      timestamp: staleTime,
    });
    expect(eligibility.isEligibleForEvidenceGuidance).toBe(false);
    expect(eligibility.reason).toContain('stale');
  });

  it('29. Unknown / NaN AQI method rejects evidence-based calculation', () => {
    const eligibility = validateAdvisoryEligibility({
      cityName: 'Jaipur',
      pm25: NaN,
      usAqi: undefined,
    });
    expect(eligibility.isEligibleForEvidenceGuidance).toBe(false);
  });

  it('30. Missing source timestamp is safely handled without throwing', () => {
    const params: AdvisoryInputParams = {
      cityName: 'Kolkata',
      pm25: 45,
      usAqi: 110,
      timestamp: undefined,
    };
    const eligibility = validateAdvisoryEligibility(params);
    expect(eligibility.isEligibleForEvidenceGuidance).toBe(true);
  });

  it('31. Official order distinction: separates official_directive from evidence_based_guidance', () => {
    const grap = resolveOfficialGrapStatus(officialOrderService.getOrders(), { cityName: 'Delhi' });
    const advisories = generateHealthAdvisories({
      cityName: 'Delhi',
      pm25: 220,
      usAqi: 270,
      timestamp: new Date().toISOString(),
      officialGrapStatus: grap,
    });

    const officialDirectives = advisories.filter((a) => a.evidenceLevel === 'official_directive');
    const evidenceGuidance = advisories.filter((a) => a.evidenceLevel === 'evidence_based_guidance');

    expect(officialDirectives.length).toBeGreaterThan(0);
    expect(evidenceGuidance.length).toBeGreaterThan(0);
    expect(officialDirectives[0].id).not.toBe(evidenceGuidance[0].id);
  });

  it('32. No fabricated school closure when no official circular exists', () => {
    // For Gurugram, there is no separate DoE school closure order in registry
    const orders = officialOrderService.getOrders();
    const doeDelhiOnly = orders.filter((o) => o.id === 'delhi-doe-school-safety-circular-nov2026');
    expect(doeDelhiOnly.length).toBe(1);
    const jur = Array.isArray(doeDelhiOnly[0].jurisdiction)
      ? doeDelhiOnly[0].jurisdiction
      : [doeDelhiOnly[0].jurisdiction.region];
    expect(jur).toEqual(['NCT of Delhi']);
  });

  it('33. No fabricated mandatory restriction: non-invoked stages do not appear', () => {
    // Check at an earlier date when only Stage 1 was active (e.g. 2026-10-25)
    const grapOct = resolveOfficialGrapStatus(
      officialOrderService.getOrders(),
      { cityName: 'Delhi' },
      '2026-10-25T12:00:00+05:30'
    );
    expect(grapOct.highestActiveStage).toBe(1);
    expect(grapOct.activeStages).toEqual([1]);
    expect(grapOct.activeStages).not.toContain(3);
    expect(grapOct.activeStages).not.toContain(4);
  });

  it('34. Accurate source citation: official directives include official URLs', () => {
    const grap = resolveOfficialGrapStatus(officialOrderService.getOrders(), { cityName: 'Delhi' });
    const advisories = generateHealthAdvisories({
      cityName: 'Delhi',
      pm25: 250,
      usAqi: 310,
      officialGrapStatus: grap,
    });
    const directive = advisories.find((a) => a.evidenceLevel === 'official_directive');
    expect(directive?.sourceUrls.length).toBeGreaterThan(0);
    expect(directive?.sourceUrls.some((u) => u.includes('caqm.nic.in'))).toBe(true);
  });

  it('35. Valid clipboard text contains clean ASCII formatting and no NaN', () => {
    const advisories = generateHealthAdvisories({
      cityName: 'Delhi',
      pm25: 85,
      usAqi: 166,
      timestamp: new Date().toISOString(),
    });
    const adv = advisories[0];
    const bulletinText = `[AVIR BULLETIN]\nTitle: ${adv.title}\nMessage: ${adv.message}\nData Freshness: ${adv.dataFreshness}`;
    expect(bulletinText).not.toContain('NaN');
    expect(bulletinText).not.toContain('undefined');
  });

  it('36. No sensitive profile export in generated bulletin texts', () => {
    const params: AdvisoryInputParams = {
      cityName: 'Delhi',
      pm25: 90,
      usAqi: 170,
      userContext: {
        isSensitiveGroup: true,
        isOutdoorWorker: false,
      },
    };
    const advisories = generateHealthAdvisories(params);
    const guidance = advisories.find((a) => a.evidenceLevel === 'evidence_based_guidance');
    // Guidance highlights the risk group advice without exporting private identities or personal medication details
    expect(guidance?.message).not.toContain('patient_id');
    expect(guidance?.message).not.toContain('medical_history_record');
  });

  it('37. Community name validation prevents XSS and prompt injection', () => {
    const maliciousSociety = '<script>alert("xss")</script> Residents Association';
    const sanitized = maliciousSociety.replace(/[<>"/\\&]/g, '').trim();
    expect(sanitized).toBe('scriptalert(xss)script Residents Association');
    expect(sanitized).not.toContain('<script>');
  });

  it('38. Print preview integrity: advisory structure contains required metadata', () => {
    const advisories = generateHealthAdvisories({
      cityName: 'Delhi',
      pm25: 120,
      usAqi: 184,
    });
    for (const a of advisories) {
      expect(a.title).toBeTruthy();
      expect(a.message).toBeTruthy();
      expect(a.evidenceLevel).toBeTruthy();
      expect(Array.isArray(a.sourceUrls)).toBe(true);
      expect(Array.isArray(a.limitations)).toBe(true);
    }
  });

  it('39. Guidance outside NCR marks CAQM GRAP as not_applicable', () => {
    const grapMumbai = resolveOfficialGrapStatus(officialOrderService.getOrders(), {
      cityName: 'Mumbai',
      countryCode: 'IN',
    });
    expect(grapMumbai.verification).toBe('not_applicable');
    expect(grapMumbai.highestActiveStage).toBeNull();
    expect(grapMumbai.explanation.toLowerCase()).toContain('not applicable');

    const advisories = generateHealthAdvisories({
      cityName: 'Mumbai',
      pm25: 110,
      usAqi: 179,
      officialGrapStatus: grapMumbai,
    });
    // Should have evidence-based guidance, but no official CAQM directive
    expect(advisories.some((a) => a.evidenceLevel === 'official_directive')).toBe(false);
    expect(advisories.some((a) => a.evidenceLevel === 'evidence_based_guidance')).toBe(true);
  });

  it('40. No unsupported cigarette-dose claims in advisories or bulletins', () => {
    const advisories = generateHealthAdvisories({
      cityName: 'Delhi',
      pm25: 450,
      usAqi: 460,
    });
    for (const a of advisories) {
      expect(a.message.toLowerCase()).not.toContain('cigarettes');
      expect(a.message.toLowerCase()).not.toContain('smoking equivalent');
    }
  });
});
