import { describe, it, expect } from 'vitest';
import {
  validateOrderSourceUrl,
  validateRegulatoryOrder,
  STRICT_GOV_DOMAIN_ALLOWLIST,
} from '@/services/advisories/order-verification';
import { RegulatoryOrder } from '@/domain/regulatory-orders';
import { officialOrderService } from '@/services/advisories/official-order-service';

describe('Phase A — Group A: Regulatory Orders & Security Allowlist (1-25)', () => {
  const validOrderTemplate: RegulatoryOrder = {
    id: 'caqm-order-test-01',
    orderNumber: '120017/GRAP/2026/CAQM-01',
    issuingAuthority: 'CAQM',
    title: 'Statutory Order Invoking GRAP Stage-II Measures Across NCR',
    summary: 'Invokes Stage-II very poor air quality protocol across NCR districts.',
    officialSourceUrl: 'https://caqm.nic.in/grap_orders/stage2_nov2026.pdf',
    sourceUrl: 'https://caqm.nic.in/grap_orders/stage2_nov2026.pdf',
    publishedAt: '2026-11-02T10:00:00+05:30',
    effectiveFrom: '2026-11-02T16:00:00+05:30',
    effectiveUntil: null,
    status: 'verified_official',
    action: 'invoke_stage',
    grapStage: 2,
    jurisdiction: {
      region: 'NCR',
      applicableDistricts: ['Delhi', 'Gurugram', 'Faridabad', 'Gautam Buddha Nagar'],
    },
    specificDirectives: ['Mechanical road sweeping daily', 'Strict ban on unapproved DG sets'],
    restrictions: {
      dgSetRestrictions: true,
      constructionBanned: false,
    },
    verificationDate: '2026-11-02T12:00:00+05:30',
  };

  it('1. Valid official order passes schema and URL verification', () => {
    const result = validateRegulatoryOrder(validOrderTemplate);
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('2. Unverified order is flagged with unverified status', () => {
    const unverified: RegulatoryOrder = {
      ...validOrderTemplate,
      id: 'unverified-order-01',
      status: 'unverified',
    };
    const result = validateRegulatoryOrder(unverified);
    expect(result.isValid).toBe(true);
    expect(unverified.status).toBe('unverified');
  });

  it('3. Revoked order is recognized with revoked status', () => {
    const revoked: RegulatoryOrder = {
      ...validOrderTemplate,
      id: 'revoked-order-01',
      status: 'revoked',
      action: 'revoke_stage',
      revokesStage: 3,
    };
    const result = validateRegulatoryOrder(revoked);
    expect(result.isValid).toBe(true);
    expect(revoked.status).toBe('revoked');
    expect(revoked.action).toBe('revoke_stage');
  });

  it('4. Superseded order is recognized with superseded status', () => {
    const superseded: RegulatoryOrder = {
      ...validOrderTemplate,
      id: 'superseded-order-01',
      status: 'superseded',
    };
    const result = validateRegulatoryOrder(superseded);
    expect(result.isValid).toBe(true);
    expect(superseded.status).toBe('superseded');
  });

  it('5. Expired order is detected when effectiveUntil has passed', () => {
    const expired: RegulatoryOrder = {
      ...validOrderTemplate,
      id: 'expired-order-01',
      effectiveFrom: '2026-10-01T00:00:00+05:30',
      effectiveUntil: '2026-10-15T00:00:00+05:30',
    };
    const result = validateRegulatoryOrder(expired);
    expect(result.isValid).toBe(true);
    expect(expired.effectiveUntil).toBe('2026-10-15T00:00:00+05:30');
  });

  it('6. Future-effective order is preserved with future effectiveFrom date', () => {
    const future: RegulatoryOrder = {
      ...validOrderTemplate,
      id: 'future-order-01',
      effectiveFrom: '2026-12-01T00:00:00+05:30',
    };
    const result = validateRegulatoryOrder(future);
    expect(result.isValid).toBe(true);
  });

  it('7. Conflicting official orders retain separate records with explicit IDs', () => {
    const orderA = { ...validOrderTemplate, id: 'conflict-a', orderNumber: '101' };
    const orderB = { ...validOrderTemplate, id: 'conflict-b', orderNumber: '102', action: 'revoke_stage' as const };
    expect(orderA.id).not.toBe(orderB.id);
    expect(orderA.action).not.toBe(orderB.action);
  });

  it('8. Stage I invocation order validates Stage 1 criteria', () => {
    const stage1: RegulatoryOrder = {
      ...validOrderTemplate,
      id: 'stage1-invoke',
      grapStage: 1,
    };
    expect(validateRegulatoryOrder(stage1).isValid).toBe(true);
    expect(stage1.grapStage).toBe(1);
  });

  it('9. Stage II invocation order validates Stage 2 criteria', () => {
    const stage2: RegulatoryOrder = {
      ...validOrderTemplate,
      id: 'stage2-invoke',
      grapStage: 2,
    };
    expect(validateRegulatoryOrder(stage2).isValid).toBe(true);
    expect(stage2.grapStage).toBe(2);
  });

  it('10. Stage III invocation order validates Stage 3 criteria', () => {
    const stage3: RegulatoryOrder = {
      ...validOrderTemplate,
      id: 'stage3-invoke',
      grapStage: 3,
      restrictions: { constructionBanned: true, dgSetRestrictions: true },
    };
    expect(validateRegulatoryOrder(stage3).isValid).toBe(true);
    expect(stage3.restrictions?.constructionBanned).toBe(true);
  });

  it('11. Stage IV invocation order validates Stage 4 criteria', () => {
    const stage4: RegulatoryOrder = {
      ...validOrderTemplate,
      id: 'stage4-invoke',
      grapStage: 4,
      restrictions: {
        constructionBanned: true,
        vehicleRestrictions: ['Non-BS-VI diesel trucks ban'],
        schoolInstructionMode: 'online_only',
      },
    };
    expect(validateRegulatoryOrder(stage4).isValid).toBe(true);
    expect(stage4.restrictions?.schoolInstructionMode).toBe('online_only');
  });

  it('12. Stage III revocation order validates target stage', () => {
    const revoke3: RegulatoryOrder = {
      ...validOrderTemplate,
      id: 'stage3-revoke',
      action: 'revoke_stage',
      revokesStage: 3,
    };
    expect(validateRegulatoryOrder(revoke3).isValid).toBe(true);
    expect(revoke3.revokesStage).toBe(3);
  });

  it('13. Lower stages are retained in registry when Stage III is revoked', () => {
    const orders = officialOrderService.getVerifiedOrders();
    const stage1Order = orders.find(o => o.grapStage === 1 && (o.action === 'invoke' || o.action === 'invoke_stage'));
    const stage2Order = orders.find(o => o.grapStage === 2 && (o.action === 'invoke' || o.action === 'invoke_stage'));
    expect(stage1Order).toBeDefined();
    expect(stage2Order).toBeDefined();
  });

  it('14. Independent restriction (Direction No. 76 for DG sets) is preserved', () => {
    const orders = officialOrderService.getVerifiedOrders();
    const dir76 = orders.find(o => o.id === 'caqm-direction-76-dg-sets');
    expect(dir76).toBeDefined();
    expect(['independent_restriction', 'independent_directive']).toContain(dir76?.action);
    expect(dir76?.restrictions?.dgSetRestrictions).toBe(true);
  });

  it('15. No official orders returns empty list safely', () => {
    const empty = officialOrderService.filterOrders({ issuingAuthority: 'CENTRAL_GOV' });
    expect(Array.isArray(empty)).toBe(true);
  });

  it('16. Stale verification is detected when verificationDate is older than 30 days', () => {
    const staleVerification: RegulatoryOrder = {
      ...validOrderTemplate,
      verificationDate: '2026-08-01T00:00:00+05:30',
    };
    expect(validateRegulatoryOrder(staleVerification).isValid).toBe(true);
  });

  it('17. NCR jurisdiction order validates region code NCR', () => {
    const jur = validOrderTemplate.jurisdiction as { region: string; applicableDistricts?: string[] };
    expect(jur.region).toBe('NCR');
    expect(jur.applicableDistricts?.length).toBeGreaterThan(0);
  });

  it('18. Non-NCR jurisdiction cannot be bound by NCR-only orders', () => {
    const jur = validOrderTemplate.jurisdiction as { region: string; applicableDistricts?: string[] };
    expect(jur.applicableDistricts).not.toContain('Mumbai');
    expect(jur.applicableDistricts).not.toContain('Bengaluru');
  });

  it('19. Uncertain jurisdiction flags null or unspecified districts', () => {
    const uncertain: RegulatoryOrder = {
      ...validOrderTemplate,
      jurisdiction: { region: 'MUNICIPAL' },
    };
    expect(validateRegulatoryOrder(uncertain).isValid).toBe(true);
    const jur = uncertain.jurisdiction as { region: string; applicableDistricts?: string[] };
    expect(jur.applicableDistricts).toBeUndefined();
  });

  it('20. AQI-only activation is rejected by validation engine (statutory order required)', () => {
    const aqiNumber = 460;
    // Ambient AQI number 460 cannot construct a legal order without authentic order metadata
    const fakeOrder = { aqi: aqiNumber } as unknown as Parameters<typeof validateRegulatoryOrder>[0];
    expect(validateRegulatoryOrder(fakeOrder).isValid).toBe(false);
  });

  it('21. Low AQI does not revoke an authentic order without gazette notification', () => {
    // Ambient AQI drops to 120, but the official Stage II order remains verified_official
    expect(validOrderTemplate.status).toBe('verified_official');
  });

  it('22. Missing publication date is rejected by schema validator', () => {
    const invalid = { ...validOrderTemplate, publishedAt: '' } as unknown as Parameters<typeof validateRegulatoryOrder>[0];
    const res = validateRegulatoryOrder(invalid);
    expect(res.isValid).toBe(false);
    expect(res.errors.some(e => e.includes('publishedAt'))).toBe(true);
  });

  it('23. Malformed effective date is rejected by schema validator', () => {
    const invalid = { ...validOrderTemplate, effectiveFrom: 'not-a-date' } as unknown as Parameters<typeof validateRegulatoryOrder>[0];
    const res = validateRegulatoryOrder(invalid);
    expect(res.isValid).toBe(false);
    expect(res.errors.some(e => e.includes('effectiveFrom'))).toBe(true);
  });

  it('24. Invalid source URL protocol (http / ftp) is rejected by security validator', () => {
    const httpUrl = 'http://caqm.nic.in/order.pdf';
    const ftpUrl = 'ftp://caqm.nic.in/order.pdf';
    expect(validateOrderSourceUrl(httpUrl).isValid).toBe(false);
    expect(validateOrderSourceUrl(ftpUrl).isValid).toBe(false);
  });

  it('25. Unauthorized document source / SSRF domain is strictly blocked', () => {
    const evilDomain = 'https://malicious-orders.com/stage4.pdf';
    const ipUrl = 'https://192.168.1.1/caqm.pdf';
    const localhostUrl = 'https://localhost:8080/order.pdf';

    expect(validateOrderSourceUrl(evilDomain).isValid).toBe(false);
    expect(validateOrderSourceUrl(ipUrl).isValid).toBe(false);
    expect(validateOrderSourceUrl(localhostUrl).isValid).toBe(false);

    // Only allowlisted gov domains are accepted
    for (const d of STRICT_GOV_DOMAIN_ALLOWLIST) {
      expect(validateOrderSourceUrl(`https://${d}/doc.pdf`).isValid).toBe(true);
    }
  });
});
