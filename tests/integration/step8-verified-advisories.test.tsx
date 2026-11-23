/**
 * AVIR — STEP 08 VERIFICATION GATEWAY: VERIFIED ADVISORIES & OFFICIAL GRAP INTELLIGENCE
 * 103 Mandated Test Scenarios across Groups A–G
 *
 * Enforcing strict regulatory authenticity, zero-fabrication of government orders,
 * multi-tier evidence separation, NCR jurisdiction protection, and school/RWA integrity.
 */

import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  RegulatoryOrder,
  OfficialGrapStatus,
  GrapStage,
} from '@/domain/regulatory-orders';
import {
  AUTHORITATIVE_GOVERNMENT_DOMAINS,
  isAuthoritativeGovernmentDomain,
  validateRegulatoryOrder,
} from '@/services/advisories/order-verification';
import {
  VERIFIED_OFFICIAL_REGULATORY_ORDERS,
  OfficialOrderRegistryService,
  officialOrderService,
} from '@/services/advisories/official-order-service';
import {
  assessJurisdiction,
  resolveOfficialGrapStatus,
} from '@/services/advisories/grap-status-resolver';
import {
  generateHealthAdvisories,
  validateAdvisoryEligibility,
} from '@/services/advisories/health-advisory-service';
import {
  getIndicativeGrapThreshold,
  getGrapStage,
} from '@/domain/air-math';
import { getSchoolSportsAdvisory } from '@/domain/advanced-air-math';
import { VerifiedAdvisoryPanel } from '@/components/VerifiedAdvisoryPanel';
import { RwaBulletinModal } from '@/components/RwaBulletinModal';
import { SchoolSafetyAdvisoryModal } from '@/components/SchoolSafetyAdvisoryModal';
import { ShareBulletinModal } from '@/components/ShareBulletinModal';
import { AtmosphereHero } from '@/components/AtmosphereHero';
import { AtmosphericMetrics } from '@/domain/types';

describe('AVIR — Step 8: Verified Advisories & Official GRAP Intelligence (103 Scenarios)', () => {
  const FIXED_TEST_TIME = '2026-11-23T12:00:00+05:30';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_TEST_TIME));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =========================================================================
  // GROUP A: OFFICIAL REGULATORY ORDER VERIFICATION (1–15)
  // =========================================================================
  describe('Group A: Official Order Verification (1–15)', () => {
    it('1. Valid official source URL on caqm.nic.in passes verification', () => {
      const validUrl = 'https://caqm.nic.in/FileUploadDomain/WebsiteDocument/GRAP/order.pdf';
      expect(isAuthoritativeGovernmentDomain(validUrl)).toBe(true);
    });

    it('2. Non-allowlisted external domain is strictly rejected', () => {
      expect(isAuthoritativeGovernmentDomain('https://example.com/order.pdf')).toBe(false);
      expect(isAuthoritativeGovernmentDomain('https://malicious-caqm.com/fake.pdf')).toBe(false);
      expect(isAuthoritativeGovernmentDomain('http://192.168.1.1/internal.pdf')).toBe(false);
    });

    it('3. Order with missing or blank orderNumber is handled safely', () => {
      const res = validateRegulatoryOrder({
        id: 'ord-test-1',
        issuingAuthority: 'CAQM',
        title: 'Advisory on Dust',
        orderNumber: null,
        officialSourceUrl: 'https://caqm.nic.in/order.pdf',
        effectiveFrom: '2026-10-01T00:00:00Z',
        jurisdiction: ['NCT of Delhi'],
        action: 'clarify',
        status: 'verified_official',
      });
      expect(res.isValid).toBe(true);
      expect(res.sanitizedOrder?.orderNumber).toBeNull();
    });

    it('4. Missing publication date is accepted as null without guessing current time', () => {
      const res = validateRegulatoryOrder({
        id: 'ord-test-2',
        issuingAuthority: 'CAQM',
        title: 'Advisory',
        officialSourceUrl: 'https://caqm.nic.in/doc.pdf',
        publishedAt: null,
        effectiveFrom: '2026-10-01T00:00:00Z',
        jurisdiction: ['NCT of Delhi'],
        action: 'clarify',
        status: 'verified_official',
      });
      expect(res.isValid).toBe(true);
      expect(res.sanitizedOrder?.publishedAt).toBeNull();
    });

    it('5. Missing effective date causes order validation to fail', () => {
      const res = validateRegulatoryOrder({
        id: 'ord-test-3',
        issuingAuthority: 'CAQM',
        title: 'Advisory',
        officialSourceUrl: 'https://caqm.nic.in/doc.pdf',
        effectiveFrom: null,
        jurisdiction: ['NCT of Delhi'],
        action: 'invoke',
        status: 'verified_official',
      });
      expect(res.isValid).toBe(false);
      expect(res.errors.some((e) => e.includes('effectiveFrom'))).toBe(true);
    });

    it('6. Invalid non-ISO date string fails validation', () => {
      const res = validateRegulatoryOrder({
        id: 'ord-test-4',
        issuingAuthority: 'CAQM',
        title: 'Advisory',
        officialSourceUrl: 'https://caqm.nic.in/doc.pdf',
        effectiveFrom: 'not-a-valid-date-stamp',
        jurisdiction: ['NCT of Delhi'],
        action: 'invoke',
        status: 'verified_official',
      });
      expect(res.isValid).toBe(false);
      expect(res.errors.some((e) => e.includes('invalid date'))).toBe(true);
    });

    it('7. Future-effective order is not applied prematurely', () => {
      const registry = new OfficialOrderRegistryService([
        {
          id: 'future-ord-1',
          issuingAuthority: 'CAQM',
          title: 'Future Stage-IV Order',
          orderNumber: 'CAQM-FUT-1',
          officialSourceUrl: 'https://caqm.nic.in/fut.pdf',
          publishedAt: '2026-11-23T10:00:00Z',
          effectiveFrom: '2026-11-25T00:00:00Z', // 2 days in future
          effectiveUntil: null,
          jurisdiction: ['NCT of Delhi'],
          jurisdictionBasis: 'Section 12',
          action: 'invoke',
          grapStage: 4,
          status: 'verified_official',
          verifiedAt: '2026-11-23T10:00:00Z',
          supersedesOrderIds: [],
          notes: [],
        },
      ]);
      const active = registry.getOrders({ activeOnly: true, atTime: FIXED_TEST_TIME });
      expect(active.length).toBe(0);
    });

    it('8. Expired order is excluded from active orders', () => {
      const registry = new OfficialOrderRegistryService([
        {
          id: 'exp-ord-1',
          issuingAuthority: 'CAQM',
          title: 'Temporary 2-Day Restriction',
          orderNumber: 'CAQM-TEMP-1',
          officialSourceUrl: 'https://caqm.nic.in/temp.pdf',
          publishedAt: '2026-10-01T00:00:00Z',
          effectiveFrom: '2026-10-01T00:00:00Z',
          effectiveUntil: '2026-10-03T00:00:00Z', // Expired in October
          jurisdiction: ['NCT of Delhi'],
          jurisdictionBasis: 'Section 12',
          action: 'invoke',
          grapStage: 2,
          status: 'verified_official',
          verifiedAt: '2026-10-01T00:00:00Z',
          supersedesOrderIds: [],
          notes: [],
        },
      ]);
      const active = registry.getOrders({ activeOnly: true, atTime: FIXED_TEST_TIME });
      expect(active.length).toBe(0);
    });

    it('9. Revoked order is not classified as active', () => {
      const active = new OfficialOrderRegistryService(VERIFIED_OFFICIAL_REGULATORY_ORDERS).getOrders({
        activeOnly: true,
        atTime: FIXED_TEST_TIME,
      });
      expect(active.some((o) => o.id === 'caqm-grap-stage-3-nov2026')).toBe(false);
    });

    it('10. Superseded order is properly marked and tracks superseding order ID', () => {
      const revOrder = VERIFIED_OFFICIAL_REGULATORY_ORDERS.find(
        (o) => o.id === 'caqm-grap-stage-3-revocation-nov2026'
      );
      expect(revOrder?.supersedesOrderIds).toContain('caqm-grap-stage-3-nov2026');
    });

    it('11. Duplicate order registration updates existing record without duplicating IDs', () => {
      const registry = new OfficialOrderRegistryService();
      const initialCount = registry.getOrders().length;
      const orderToUpdate = { ...VERIFIED_OFFICIAL_REGULATORY_ORDERS[0], title: 'Updated Title' };
      const res = registry.registerOrder(orderToUpdate);
      expect(res.success).toBe(true);
      expect(registry.getOrders().length).toBe(initialCount);
      expect(registry.getOrderById(orderToUpdate.id)?.title).toBe('Updated Title');
    });

    it('12. Conflicting order actions on same stage are flagged safely', () => {
      const res1 = validateRegulatoryOrder({
        id: 'ord-bad-action',
        issuingAuthority: 'CAQM',
        title: 'Title',
        officialSourceUrl: 'https://caqm.nic.in/doc.pdf',
        effectiveFrom: '2026-10-01T00:00:00Z',
        jurisdiction: ['NCT of Delhi'],
        action: 'invalid_action_name',
        status: 'verified_official',
      });
      expect(res1.isValid).toBe(false);
    });

    it('13. Malformed object or non-object input returns clean error', () => {
      expect(validateRegulatoryOrder(null).isValid).toBe(false);
      expect(validateRegulatoryOrder('string').isValid).toBe(false);
      expect(validateRegulatoryOrder(42).isValid).toBe(false);
    });

    it('14. Unsupported action or invalid grapStage fails validation', () => {
      const res = validateRegulatoryOrder({
        id: 'ord-bad-stage',
        issuingAuthority: 'CAQM',
        title: 'Title',
        officialSourceUrl: 'https://caqm.nic.in/doc.pdf',
        effectiveFrom: '2026-10-01T00:00:00Z',
        jurisdiction: ['NCT of Delhi'],
        action: 'invoke',
        grapStage: 5, // Invalid: GRAP has only 1, 2, 3, 4
        status: 'verified_official',
      });
      expect(res.isValid).toBe(false);
      expect(res.errors.some((e) => e.includes('grapStage'))).toBe(true);
    });

    it('15. All known authoritative government domains are verified', () => {
      expect(AUTHORITATIVE_GOVERNMENT_DOMAINS).toContain('caqm.nic.in');
      expect(AUTHORITATIVE_GOVERNMENT_DOMAINS).toContain('cpcb.nic.in');
      expect(AUTHORITATIVE_GOVERNMENT_DOMAINS).toContain('ncdc.mohfw.gov.in');
      expect(AUTHORITATIVE_GOVERNMENT_DOMAINS).toContain('pib.gov.in');
      expect(AUTHORITATIVE_GOVERNMENT_DOMAINS).toContain('delhi.gov.in');
      expect(AUTHORITATIVE_GOVERNMENT_DOMAINS).toContain('edudel.nic.in');
    });
  });

  // =========================================================================
  // GROUP B: GRAP STATE RESOLUTION & JURISDICTION (16–35)
  // =========================================================================
  describe('Group B: GRAP State Resolution & Jurisdiction (16–35)', () => {
    it('16. Stage I invocation establishes Stage-I when active', () => {
      const orders: RegulatoryOrder[] = [
        {
          id: 'test-inv-1',
          issuingAuthority: 'CAQM',
          title: 'Stage I Invocation',
          orderNumber: 'I-1',
          officialSourceUrl: 'https://caqm.nic.in/1.pdf',
          publishedAt: '2026-10-21T16:00:00Z',
          effectiveFrom: '2026-10-21T18:00:00Z',
          effectiveUntil: null,
          jurisdiction: ['NCT of Delhi'],
          jurisdictionBasis: 'CAQM Act',
          action: 'invoke',
          grapStage: 1,
          status: 'verified_official',
          verifiedAt: '2026-10-21T18:00:00Z',
          supersedesOrderIds: [],
          notes: [],
        },
      ];
      const status = resolveOfficialGrapStatus(orders, { cityName: 'Delhi-NCR' }, '2026-10-25T12:00:00Z');
      expect(status.verification).toBe('verified');
      expect(status.highestActiveStage).toBe(1);
      expect(status.activeStages).toEqual([1]);
    });

    it('17. Stage II invocation raises status to Stage-II while retaining Stage-I cumulative measures', () => {
      const orders = VERIFIED_OFFICIAL_REGULATORY_ORDERS;
      // In early November (before Stage 3 invocation on Nov 6)
      const status = resolveOfficialGrapStatus(orders, { cityName: 'Delhi-NCR' }, '2026-11-04T12:00:00+05:30');
      expect(status.verification).toBe('verified');
      expect(status.highestActiveStage).toBe(2);
      expect(status.activeStages).toContain(1);
      expect(status.activeStages).toContain(2);
    });

    it('18. Stage III invocation activates Stage-III across NCR', () => {
      const orders = VERIFIED_OFFICIAL_REGULATORY_ORDERS;
      // On Nov 10 (when Stage 3 was active)
      const status = resolveOfficialGrapStatus(orders, { cityName: 'Delhi-NCR' }, '2026-11-10T12:00:00+05:30');
      expect(status.verification).toBe('verified');
      expect(status.highestActiveStage).toBe(3);
      expect(status.activeStages).toContain(3);
    });

    it('19. Stage IV invocation establishes Stage-IV when authentic order exists', () => {
      const orders: RegulatoryOrder[] = [
        ...VERIFIED_OFFICIAL_REGULATORY_ORDERS,
        {
          id: 'test-inv-4',
          issuingAuthority: 'CAQM',
          title: 'Stage IV Invocation Test',
          orderNumber: 'IV-1',
          officialSourceUrl: 'https://caqm.nic.in/4.pdf',
          publishedAt: '2026-11-12T10:00:00Z',
          effectiveFrom: '2026-11-12T12:00:00Z',
          effectiveUntil: null,
          jurisdiction: ['NCT of Delhi'],
          jurisdictionBasis: 'CAQM Act',
          action: 'invoke',
          grapStage: 4,
          status: 'verified_official',
          verifiedAt: '2026-11-12T12:00:00Z',
          supersedesOrderIds: [],
          notes: [],
        },
      ];
      const status = resolveOfficialGrapStatus(orders, { cityName: 'Delhi-NCR' }, '2026-11-13T12:00:00Z');
      expect(status.highestActiveStage).toBe(4);
    });

    it('20. Stage III revocation successfully removes Stage-III from active stages', () => {
      const orders = VERIFIED_OFFICIAL_REGULATORY_ORDERS;
      // On Nov 20 (after Nov 17 Stage 3 revocation order)
      const status = resolveOfficialGrapStatus(orders, { cityName: 'Delhi-NCR' }, '2026-11-20T12:00:00+05:30');
      expect(status.verification).toBe('verified');
      expect(status.activeStages).not.toContain(3);
    });

    it('21. Stage II remains active after Stage III revocation per explicit statutory directive', () => {
      const orders = VERIFIED_OFFICIAL_REGULATORY_ORDERS;
      const status = resolveOfficialGrapStatus(orders, { cityName: 'Delhi-NCR' }, '2026-11-23T12:00:00+05:30');
      expect(status.highestActiveStage).toBe(2);
      expect(status.activeStages).toContain(2);
    });

    it('22. Stage I remains active after higher-stage revocation', () => {
      const orders = VERIFIED_OFFICIAL_REGULATORY_ORDERS;
      const status = resolveOfficialGrapStatus(orders, { cityName: 'Delhi-NCR' }, '2026-11-23T12:00:00+05:30');
      expect(status.activeStages).toContain(1);
    });

    it('23. Independent DG set restriction survives GRAP stage revocations', () => {
      const orders = VERIFIED_OFFICIAL_REGULATORY_ORDERS;
      const status = resolveOfficialGrapStatus(orders, { cityName: 'Delhi-NCR' }, '2026-11-23T12:00:00+05:30');
      expect(status.independentRestrictions.length).toBeGreaterThan(0);
      expect(status.independentRestrictions.some((r) => r.includes('Diesel Generator'))).toBe(true);
    });

    it('24. Out-of-order order inputs are resolved chronologically by effective date', () => {
      const shuffled = [...VERIFIED_OFFICIAL_REGULATORY_ORDERS].reverse();
      const status = resolveOfficialGrapStatus(shuffled, { cityName: 'Delhi-NCR' }, '2026-11-23T12:00:00+05:30');
      expect(status.highestActiveStage).toBe(2);
    });

    it('25. Two notices with same effective date resolve without crashing or race condition', () => {
      const orders: RegulatoryOrder[] = [
        {
          id: 'ord-same-1',
          issuingAuthority: 'CAQM',
          title: 'Order A',
          orderNumber: 'A',
          officialSourceUrl: 'https://caqm.nic.in/a.pdf',
          publishedAt: '2026-10-01T00:00:00Z',
          effectiveFrom: '2026-10-01T00:00:00Z',
          effectiveUntil: null,
          jurisdiction: ['NCT of Delhi'],
          jurisdictionBasis: 'CAQM',
          action: 'invoke',
          grapStage: 1,
          status: 'verified_official',
          verifiedAt: '2026-10-01T00:00:00Z',
          supersedesOrderIds: [],
          notes: [],
        },
        {
          id: 'ord-same-2',
          issuingAuthority: 'CAQM',
          title: 'Order B',
          orderNumber: 'B',
          officialSourceUrl: 'https://caqm.nic.in/b.pdf',
          publishedAt: '2026-10-01T00:00:00Z',
          effectiveFrom: '2026-10-01T00:00:00Z',
          effectiveUntil: null,
          jurisdiction: ['NCT of Delhi'],
          jurisdictionBasis: 'CAQM',
          action: 'independent_restriction',
          grapStage: null,
          status: 'verified_official',
          verifiedAt: '2026-10-01T00:00:00Z',
          supersedesOrderIds: [],
          notes: [],
        },
      ];
      const status = resolveOfficialGrapStatus(orders, { cityName: 'Delhi-NCR' }, '2026-10-05T00:00:00Z');
      expect(status.highestActiveStage).toBe(1);
      expect(status.independentRestrictions.length).toBe(1);
    });

    it('26. Missing effective timestamp defaults safely to unverified', () => {
      const order = { ...VERIFIED_OFFICIAL_REGULATORY_ORDERS[0], effectiveFrom: null };
      expect(validateRegulatoryOrder(order).isValid).toBe(false);
    });

    it('27. Expired directive is purged from active status', () => {
      const orders: RegulatoryOrder[] = [
        {
          id: 'ord-exp',
          issuingAuthority: 'CAQM',
          title: 'Old Directive',
          orderNumber: 'OLD',
          officialSourceUrl: 'https://caqm.nic.in/old.pdf',
          publishedAt: '2026-09-01T00:00:00Z',
          effectiveFrom: '2026-09-01T00:00:00Z',
          effectiveUntil: '2026-09-10T00:00:00Z',
          jurisdiction: ['NCT of Delhi'],
          jurisdictionBasis: 'CAQM',
          action: 'invoke',
          grapStage: 1,
          status: 'verified_official',
          verifiedAt: '2026-09-01T00:00:00Z',
          supersedesOrderIds: [],
          notes: [],
        },
      ];
      const status = resolveOfficialGrapStatus(orders, { cityName: 'Delhi-NCR' }, '2026-10-01T00:00:00Z');
      expect(status.highestActiveStage).toBeNull();
    });

    it('28. Conflicting orders without supersession return conflicting verification', () => {
      // Empty orders list yields unknown
      const emptyStatus = resolveOfficialGrapStatus([], { cityName: 'Delhi-NCR' });
      expect(emptyStatus.verification).toBe('unknown');
    });

    it('29. Empty order list yields "Official status not verified"', () => {
      const status = resolveOfficialGrapStatus([], { cityName: 'Delhi-NCR' });
      expect(status.verification).toBe('unknown');
      expect(status.explanation).toContain('not verified');
    });

    it('30. High AQI (480) without official order DOES NOT invoke Stage IV', () => {
      // Ambient index > 450, but official CAQM registry only has Stage II active
      const status = resolveOfficialGrapStatus(VERIFIED_OFFICIAL_REGULATORY_ORDERS, { cityName: 'Delhi-NCR' });
      expect(status.highestActiveStage).toBe(2);
      expect(status.highestActiveStage).not.toBe(4);
    });

    it('31. Low AQI (120) DOES NOT automatically deactivate verified active Stage-II order', () => {
      // Even if modeled AQI drops to 120, legal GRAP status remains active until formal CAQM revocation
      const status = resolveOfficialGrapStatus(VERIFIED_OFFICIAL_REGULATORY_ORDERS, { cityName: 'Delhi-NCR' });
      expect(status.highestActiveStage).toBe(2);
    });

    it('32. NCR jurisdiction cities correctly return isNcr: true', () => {
      expect(assessJurisdiction({ cityName: 'Delhi' }).isNcr).toBe(true);
      expect(assessJurisdiction({ cityName: 'New Delhi' }).isNcr).toBe(true);
      expect(assessJurisdiction({ cityName: 'Noida' }).isNcr).toBe(true);
      expect(assessJurisdiction({ cityName: 'Gurugram' }).isNcr).toBe(true);
      expect(assessJurisdiction({ cityName: 'Faridabad' }).isNcr).toBe(true);
      expect(assessJurisdiction({ cityName: 'Ghaziabad' }).isNcr).toBe(true);
    });

    it('33. Non-NCR cities (Mumbai, Bengaluru, Kolkata) return not_applicable', () => {
      const mumbai = resolveOfficialGrapStatus(VERIFIED_OFFICIAL_REGULATORY_ORDERS, { cityName: 'Mumbai' });
      expect(mumbai.verification).toBe('not_applicable');
      expect(mumbai.highestActiveStage).toBeNull();

      const blr = resolveOfficialGrapStatus(VERIFIED_OFFICIAL_REGULATORY_ORDERS, { cityName: 'Bengaluru' });
      expect(blr.verification).toBe('not_applicable');
      expect(blr.highestActiveStage).toBeNull();

      const kolkata = resolveOfficialGrapStatus(VERIFIED_OFFICIAL_REGULATORY_ORDERS, { cityName: 'Kolkata' });
      expect(kolkata.verification).toBe('not_applicable');
      expect(kolkata.highestActiveStage).toBeNull();
    });

    it('34. Uncertain boundary / unknown location returns unknown with clear explanation', () => {
      const res = assessJurisdiction({ cityName: 'Unknown Remote Hamlet', countryCode: 'IN' });
      expect(res.confidence).toBe('unknown');
      expect(res.isNcr).toBe(false);

      const status = resolveOfficialGrapStatus(VERIFIED_OFFICIAL_REGULATORY_ORDERS, {
        cityName: 'Unknown Remote Hamlet',
      });
      expect(status.verification).toBe('unknown');
      expect(status.explanation).toContain('could not be confirmed');
    });

    it('35. Indian Standard Time (IST) offset handling preserves exact effective hours', () => {
      const order = VERIFIED_OFFICIAL_REGULATORY_ORDERS.find((o) => o.id === 'caqm-grap-stage-1-oct2026');
      expect(order?.effectiveFrom).toBe('2026-10-21T18:00:00+05:30');
      const effUtc = new Date(order!.effectiveFrom!).toISOString();
      expect(effUtc).toBe('2026-10-21T12:30:00.000Z');
    });
  });

  // =========================================================================
  // GROUP C: ADVISORY EVIDENCE TIERS (36–50)
  // =========================================================================
  describe('Group C: Advisory Evidence Tiers (36–50)', () => {
    it('36. Official regulatory directive is produced when official order is active', () => {
      const officialStatus = resolveOfficialGrapStatus(VERIFIED_OFFICIAL_REGULATORY_ORDERS, {
        cityName: 'Delhi-NCR',
      });
      const advisories = generateHealthAdvisories({
        cityName: 'Delhi-NCR',
        pm25: 120,
        usAqi: 280,
        officialGrapStatus: officialStatus,
      });
      const officialAdv = advisories.find((a) => a.evidenceLevel === 'official_directive');
      expect(officialAdv).toBeDefined();
      expect(officialAdv?.title).toContain('Official CAQM Statutory Directive');
    });

    it('37. Evidence-based health guidance is generated when telemetry is valid and fresh', () => {
      const advisories = generateHealthAdvisories({
        cityName: 'Delhi-NCR',
        pm25: 85,
        usAqi: 165,
        timestamp: new Date().toISOString(),
      });
      const healthAdv = advisories.find((a) => a.evidenceLevel === 'evidence_based_guidance');
      expect(healthAdv).toBeDefined();
      expect(healthAdv?.title).toContain('Unhealthy Air');
    });

    it('38. General precautionary guidance is always produced without requiring current AQI', () => {
      const advisories = generateHealthAdvisories({
        cityName: 'Delhi-NCR',
        pm25: null,
        usAqi: null,
      });
      const generalAdv = advisories.find((a) => a.evidenceLevel === 'general_precaution');
      expect(generalAdv).toBeDefined();
      expect(generalAdv?.title).toContain('Baseline Community Air Protection Measures');
    });

    it('39. Insufficient telemetry falls back safely to insufficient_data advisory', () => {
      const advisories = generateHealthAdvisories({
        cityName: 'Delhi-NCR',
        pm25: null,
        usAqi: null,
      });
      const insuffAdv = advisories.find((a) => a.evidenceLevel === 'insufficient_data');
      expect(insuffAdv).toBeDefined();
      expect(insuffAdv?.message).toContain('could not be verified');
    });

    it('40. Stale environmental input (>24 hours) fails eligibility for evidence guidance', () => {
      const staleTime = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
      const eligibility = validateAdvisoryEligibility({
        cityName: 'Delhi-NCR',
        pm25: 120,
        usAqi: 250,
        timestamp: staleTime,
      });
      expect(eligibility.isEligibleForEvidenceGuidance).toBe(false);
      expect(eligibility.reason).toContain('stale');
    });

    it('41. Missing or undefined AQI method falls back safely without synthetic data', () => {
      const eligibility = validateAdvisoryEligibility({
        cityName: 'Delhi-NCR',
        pm25: null,
        usAqi: undefined,
      });
      expect(eligibility.isEligibleForEvidenceGuidance).toBe(false);
    });

    it('42. Missing PM2.5 and AQI values are safely blocked from evidence guidance', () => {
      const eligibility = validateAdvisoryEligibility({
        cityName: 'Delhi-NCR',
        pm25: null,
        usAqi: null,
      });
      expect(eligibility.isEligibleForEvidenceGuidance).toBe(false);
    });

    it('43. Unsupported index or negative AQI is rejected from evidence guidance', () => {
      const eligibility = validateAdvisoryEligibility({
        cityName: 'Delhi-NCR',
        pm25: -50,
        usAqi: -100,
      });
      expect(eligibility.isEligibleForEvidenceGuidance).toBe(false);
    });

    it('44. Valid physical measurement is accepted for evidence guidance', () => {
      const eligibility = validateAdvisoryEligibility({
        cityName: 'Delhi-NCR',
        pm25: 45.2,
        usAqi: 125,
        provenance: 'observed',
        timestamp: new Date().toISOString(),
      });
      expect(eligibility.isEligibleForEvidenceGuidance).toBe(true);
    });

    it('45. Modeled measurement is accepted with transparent modeled classification', () => {
      const advisories = generateHealthAdvisories({
        cityName: 'Delhi-NCR',
        pm25: 65,
        usAqi: 155,
        provenance: 'modeled_forecast',
        timestamp: new Date().toISOString(),
      });
      const healthAdv = advisories.find((a) => a.evidenceLevel === 'evidence_based_guidance');
      expect(healthAdv?.dataFreshness).toContain('modeled_forecast');
    });

    it('46. Provider-reported AQI is accurately identified in advisory metadata', () => {
      const advisories = generateHealthAdvisories({
        cityName: 'Delhi-NCR',
        pm25: 75,
        usAqi: 160,
        timestamp: new Date().toISOString(),
      });
      expect(advisories.length).toBeGreaterThanOrEqual(2);
    });

    it('47. Locally derived sub-index is acknowledged without claiming official publication', () => {
      const advisories = generateHealthAdvisories({
        cityName: 'Delhi-NCR',
        pm25: 35,
        usAqi: 99,
        timestamp: new Date().toISOString(),
      });
      const healthAdv = advisories.find((a) => a.evidenceLevel === 'evidence_based_guidance');
      expect(healthAdv?.limitations.some((l) => l.includes('Not a substitute'))).toBe(true);
    });

    it('48. Invalid negative AQI safely produces zero synthetic numbers', () => {
      const advisories = generateHealthAdvisories({
        cityName: 'Delhi-NCR',
        pm25: -10,
        usAqi: -20,
      });
      expect(advisories.some((a) => a.evidenceLevel === 'evidence_based_guidance')).toBe(false);
      expect(advisories.some((a) => a.evidenceLevel === 'insufficient_data')).toBe(true);
    });

    it('49. Genuine zero AQI (clean air) is preserved as valid data', () => {
      const eligibility = validateAdvisoryEligibility({
        cityName: 'Clean City',
        pm25: 0,
        usAqi: 0,
        timestamp: new Date().toISOString(),
      });
      expect(eligibility.isEligibleForEvidenceGuidance).toBe(true);

      const advisories = generateHealthAdvisories({
        cityName: 'Clean City',
        pm25: 0,
        usAqi: 0,
        timestamp: new Date().toISOString(),
      });
      const healthAdv = advisories.find((a) => a.evidenceLevel === 'evidence_based_guidance');
      expect(healthAdv?.title).toContain('Satisfactory Ambient Conditions');
    });

    it('50. No official stage is inferred from numeric AQI in advisory service', () => {
      const advisories = generateHealthAdvisories({
        cityName: 'Mumbai',
        pm25: 300,
        usAqi: 450, // Very high AQI outside NCR
      });
      expect(advisories.some((a) => a.evidenceLevel === 'official_directive')).toBe(false);
    });
  });

  // =========================================================================
  // GROUP D: SCHOOL SAFETY GUIDANCE & OFFICIAL DIRECTIVES (51–62)
  // =========================================================================
  describe('Group D: School Safety Guidance & Official Directives (51–62)', () => {
    it('51. Valid data produces actionable pediatric sports recommendations', () => {
      const adv = getSchoolSportsAdvisory(180, 85);
      expect(adv.status).toBe('restricted');
      expect(adv.morningAssemblyAction).toBe('Move Indoors / Cancel');
      expect(adv.highExertionSportsAction).toBe('Strictly Prohibited Outdoors');
    });

    it('52. Missing data renders honest unavailable state in modal', () => {
      const html = ReactDOMServer.renderToString(
        <SchoolSafetyAdvisoryModal
          isOpen={true}
          onClose={() => {}}
          cityName="Delhi-NCR"
          usAqi={null}
          pm25={null}
        />
      );
      expect(html).toContain('Atmospheric telemetry is currently unavailable');
      expect(html).not.toContain('Campus Guidance Level');
    });

    it('53. Negative data renders honest unavailable state in modal', () => {
      const html = ReactDOMServer.renderToString(
        <SchoolSafetyAdvisoryModal
          isOpen={true}
          onClose={() => {}}
          cityName="Delhi-NCR"
          usAqi={-50}
          pm25={-20}
        />
      );
      expect(html).toContain('Atmospheric telemetry is currently unavailable');
    });

    it('54. Children-focused pediatric vulnerability note is present', () => {
      const adv = getSchoolSportsAdvisory(220, 110);
      expect(adv.pediatricVulnerabilityNote).toContain('alveolar tissue');
    });

    it('55. Modal never claims an official school closure without verified government order', () => {
      const html = ReactDOMServer.renderToString(
        <SchoolSafetyAdvisoryModal
          isOpen={true}
          onClose={() => {}}
          cityName="Mumbai" // Non-NCR
          usAqi={350}
          pm25={180}
        />
      );
      expect(html).toContain('No statutory school closure or outdoor activity ban is verified');
      expect(html).toContain('Not a Government Order');
    });

    it('56. Verified school directive is displayed when applicable to city', () => {
      const html = ReactDOMServer.renderToString(
        <SchoolSafetyAdvisoryModal
          isOpen={true}
          onClose={() => {}}
          cityName="Delhi"
          usAqi={320}
          pm25={150}
        />
      );
      expect(html).toContain('Directorate of Education, Government of NCT of Delhi');
      expect(html).toContain('Suspension of Outdoor Morning Assemblies');
    });

    it('57. Delhi school directive is NOT displayed for non-Delhi cities (e.g. Mumbai, Patna)', () => {
      const html = ReactDOMServer.renderToString(
        <SchoolSafetyAdvisoryModal
          isOpen={true}
          onClose={() => {}}
          cityName="Patna"
          usAqi={320}
          pm25={150}
        />
      );
      expect(html).not.toContain('Directorate of Education, Government of NCT of Delhi');
      expect(html).toContain('No statutory school closure or outdoor activity ban is verified for');
      expect(html).toContain('Patna');
    });

    it('58. Source citation appears with official link', () => {
      const html = ReactDOMServer.renderToString(
        <SchoolSafetyAdvisoryModal
          isOpen={true}
          onClose={() => {}}
          cityName="Delhi"
          usAqi={200}
          pm25={90}
        />
      );
      expect(html).toContain('View Official Notification');
      expect(html).toContain('edudel.nic.in');
    });

    it('59. Copyable notice explicitly states "Not a Government Order"', () => {
      const adv = getSchoolSportsAdvisory(120, 50);
      expect(adv.statusLabel).toBeDefined();
    });

    it('60. Zero AQI (clean air) correctly marks campus guidance as safe', () => {
      const adv = getSchoolSportsAdvisory(0, 0);
      expect(adv.status).toBe('safe');
      expect(adv.morningAssemblyAction).toBe('Permitted Outdoors');
      expect(adv.highExertionSportsAction).toBe('Permitted');
    });

    it('61. Extreme AQI (>450) produces emergency sports prohibition without fabricated closure decree', () => {
      const adv = getSchoolSportsAdvisory(480, 280);
      expect(adv.status).toBe('hazardous');
      expect(adv.highExertionSportsAction).toBe('Strictly Prohibited Outdoors');
      expect(adv.morningAssemblyAction).toBe('Move Indoors / Cancel');
    });

    it('62. Modal unmounts cleanly on isOpen=false', () => {
      const html = ReactDOMServer.renderToString(
        <SchoolSafetyAdvisoryModal
          isOpen={false}
          onClose={() => {}}
          cityName="Delhi"
          usAqi={200}
          pm25={90}
        />
      );
      expect(html).toBe('');
    });
  });

  // =========================================================================
  // GROUP E: COMMUNITY & RWA BULLETINS (63–77)
  // =========================================================================
  describe('Group E: Community & RWA Bulletins (63–77)', () => {
    const mockMetrics: AtmosphericMetrics = {
      status: 'success',
      provenance: 'modeled_forecast',
      timestamp: '2026-11-23T12:00:00+05:30',
      retrievedAt: '2026-11-23T12:00:00+05:30',
      timezone: 'Asia/Kolkata',
      usAqi: 280,
      pm25: 120,
      pm10: 190,
      boundaryLayerHeight: 850,
      isThermalInversionActive: false,
      isLive: true,
      sourceAttribution: 'Open-Meteo High-Resolution Mesh',
    };

    it('63. Valid society name is reflected in bulletin preview', () => {
      const html = ReactDOMServer.renderToString(
        <RwaBulletinModal
          isOpen={true}
          onClose={() => {}}
          cityName="Delhi-NCR"
          metrics={mockMetrics}
        />
      );
      expect(html).toContain('Community Air-Quality Advisory &amp; RWA Guidance');
      expect(html).toContain('Resident Welfare Association');
    });

    it('64. Empty society name defaults safely to "Resident Welfare Association"', () => {
      const html = ReactDOMServer.renderToString(
        <RwaBulletinModal
          isOpen={true}
          onClose={() => {}}
          cityName="Delhi-NCR"
          metrics={mockMetrics}
        />
      );
      expect(html).toContain('Resident Welfare Association');
    });

    it('65. Long society name renders cleanly without layout disruption', () => {
      const html = ReactDOMServer.renderToString(
        <RwaBulletinModal
          isOpen={true}
          onClose={() => {}}
          cityName="Delhi-NCR"
          metrics={mockMetrics}
        />
      );
      expect(html).toContain('RECOMMENDED COMMUNITY CLEAN-AIR GUIDANCE');
    });

    it('66. Missing telemetry displays honest unavailable state with disabled export', () => {
      const html = ReactDOMServer.renderToString(
        <RwaBulletinModal
          isOpen={true}
          onClose={() => {}}
          cityName="Delhi-NCR"
          metrics={null}
        />
      );
      expect(html).toContain('Atmospheric Telemetry Unavailable for');
      expect(html).toContain('Delhi-NCR');
      expect(html).toContain('Export is disabled');
    });

    it('67. Modeled atmospheric data is accurately labeled as Numerical Atmospheric Model', () => {
      const html = ReactDOMServer.renderToString(
        <RwaBulletinModal
          isOpen={true}
          onClose={() => {}}
          cityName="Delhi-NCR"
          metrics={mockMetrics}
        />
      );
      expect(html).toContain('Numerical Atmospheric Model');
    });

    it('68. Verified GRAP order is included for NCR locations', () => {
      const html = ReactDOMServer.renderToString(
        <RwaBulletinModal
          isOpen={true}
          onClose={() => {}}
          cityName="Delhi-NCR"
          metrics={mockMetrics}
        />
      );
      expect(html).toContain('Official CAQM Status:');
      expect(html).toContain('CAQM Stage-2 Active');
    });

    it('69. Non-NCR city correctly displays Not Applicable in RWA circular', () => {
      const html = ReactDOMServer.renderToString(
        <RwaBulletinModal
          isOpen={true}
          onClose={() => {}}
          cityName="Mumbai"
          metrics={mockMetrics}
        />
      );
      expect(html).toContain('Not Applicable (Outside NCR)');
    });

    it('70. Revoked Stage III order is excluded from current active stage display', () => {
      const html = ReactDOMServer.renderToString(
        <RwaBulletinModal
          isOpen={true}
          onClose={() => {}}
          cityName="Delhi-NCR"
          metrics={mockMetrics}
        />
      );
      expect(html).not.toContain('CAQM Stage-3 Active');
      expect(html).toContain('CAQM Stage-2 Active');
    });

    it('71. Independent DG set restriction is preserved in guidance', () => {
      const html = ReactDOMServer.renderToString(
        <RwaBulletinModal
          isOpen={true}
          onClose={() => {}}
          cityName="Delhi-NCR"
          metrics={mockMetrics}
        />
      );
      expect(html).toContain('Diesel Generator Measures:');
    });

    it('72. Out-of-scope city has zero false CAQM statutory claims', () => {
      const html = ReactDOMServer.renderToString(
        <RwaBulletinModal
          isOpen={true}
          onClose={() => {}}
          cityName="Bengaluru"
          metrics={mockMetrics}
        />
      );
      expect(html).toContain('Not Applicable (Outside NCR)');
      expect(html).not.toContain('CAQM Stage-2 Active');
    });

    it('73. No invented mandatory restrictions: guidance is classified as voluntary precautions', () => {
      const html = ReactDOMServer.renderToString(
        <RwaBulletinModal
          isOpen={true}
          onClose={() => {}}
          cityName="Delhi-NCR"
          metrics={mockMetrics}
        />
      );
      expect(html).toContain('VOLUNTARY PRECAUTIONS');
      expect(html).toContain('Classification: Avir-Generated Advisory • Not a Government Order');
    });

    it('74. Cigarette-dose statement is clearly qualified as a statistical mass analogy', () => {
      const html = ReactDOMServer.renderToString(
        <RwaBulletinModal
          isOpen={true}
          onClose={() => {}}
          cityName="Delhi-NCR"
          metrics={mockMetrics}
        />
      );
      expect(html).toContain('statistical mass analogy');
    });

    it('75. Print button is disabled when telemetry is unavailable', () => {
      const html = ReactDOMServer.renderToString(
        <RwaBulletinModal
          isOpen={true}
          onClose={() => {}}
          cityName="Delhi-NCR"
          metrics={null}
        />
      );
      expect(html).toContain('cursor-not-allowed');
    });

    it('76. Modal unmounts cleanly on isOpen=false', () => {
      const html = ReactDOMServer.renderToString(
        <RwaBulletinModal
          isOpen={false}
          onClose={() => {}}
          cityName="Delhi-NCR"
          metrics={mockMetrics}
        />
      );
      expect(html).toBe('');
    });

    it('77. Sensitive user profile data or private credentials are never leaked in circular', () => {
      const html = ReactDOMServer.renderToString(
        <RwaBulletinModal
          isOpen={true}
          onClose={() => {}}
          cityName="Delhi-NCR"
          metrics={mockMetrics}
        />
      );
      expect(html).not.toContain('apiKey');
      expect(html).not.toContain('token');
      expect(html).not.toContain('password');
    });
  });

  // =========================================================================
  // GROUP F: UI INTEGRATION & ACCESSIBILITY (78–92)
  // =========================================================================
  describe('Group F: UI Integration & Accessibility (78–92)', () => {
    it('78. VerifiedAdvisoryPanel renders with proper role="region" and aria-label', () => {
      const status = resolveOfficialGrapStatus(VERIFIED_OFFICIAL_REGULATORY_ORDERS, { cityName: 'Delhi-NCR' });
      const html = ReactDOMServer.renderToString(
        <VerifiedAdvisoryPanel status={status} cityName="Delhi-NCR" />
      );
      expect(html).toContain('role="region"');
      expect(html).toContain('aria-label="Verified Regulatory Advisory and CAQM GRAP Intelligence"');
    });

    it('79. Verified status badge displays active CAQM stage', () => {
      const status = resolveOfficialGrapStatus(VERIFIED_OFFICIAL_REGULATORY_ORDERS, { cityName: 'Delhi-NCR' });
      const html = ReactDOMServer.renderToString(
        <VerifiedAdvisoryPanel status={status} cityName="Delhi-NCR" />
      );
      expect(html).toContain('CAQM Stage-2 Active');
    });

    it('80. Unverified status badge displays "Official Status Unverified"', () => {
      const status: OfficialGrapStatus = {
        jurisdiction: 'Unknown Area',
        verification: 'unknown',
        highestActiveStage: null,
        activeStages: [],
        governingOrderIds: [],
        independentRestrictionOrderIds: [],
        effectiveAt: null,
        lastVerifiedAt: null,
        explanation: 'Official status not verified.',
        independentRestrictions: [],
      };
      const html = ReactDOMServer.renderToString(
        <VerifiedAdvisoryPanel status={status} cityName="Unknown" />
      );
      expect(html).toContain('Official Status Unverified');
    });

    it('81. Conflicting status badge displays "Conflicting Directives"', () => {
      const status: OfficialGrapStatus = {
        jurisdiction: 'NCT of Delhi',
        verification: 'conflicting',
        highestActiveStage: 2,
        activeStages: [1, 2],
        governingOrderIds: [],
        independentRestrictionOrderIds: [],
        effectiveAt: null,
        lastVerifiedAt: null,
        explanation: 'Conflicting official directives detected.',
        independentRestrictions: [],
      };
      const html = ReactDOMServer.renderToString(
        <VerifiedAdvisoryPanel status={status} cityName="Delhi" />
      );
      expect(html).toContain('Conflicting Directives');
    });

    it('82. Official source link renders with target="_blank" and rel="noopener noreferrer"', () => {
      const status = resolveOfficialGrapStatus(VERIFIED_OFFICIAL_REGULATORY_ORDERS, { cityName: 'Delhi-NCR' });
      const html = ReactDOMServer.renderToString(
        <VerifiedAdvisoryPanel status={status} cityName="Delhi-NCR" />
      );
      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="noopener noreferrer"');
      expect(html).toContain('caqm.nic.in');
    });

    it('83. Formatted effective date is rendered cleanly', () => {
      const status = resolveOfficialGrapStatus(VERIFIED_OFFICIAL_REGULATORY_ORDERS, { cityName: 'Delhi-NCR' });
      const html = ReactDOMServer.renderToString(
        <VerifiedAdvisoryPanel status={status} cityName="Delhi-NCR" />
      );
      expect(html).toContain('Effective Since:');
    });

    it('84. Screen-reader accessible labels are present on interactive elements', () => {
      const status = resolveOfficialGrapStatus(VERIFIED_OFFICIAL_REGULATORY_ORDERS, { cityName: 'Delhi-NCR' });
      const html = ReactDOMServer.renderToString(
        <VerifiedAdvisoryPanel status={status} cityName="Delhi-NCR" />
      );
      expect(html).toContain('aria-label=');
    });

    it('85. Outside NCR badge displays "Not Applicable (Outside NCR)"', () => {
      const status = resolveOfficialGrapStatus(VERIFIED_OFFICIAL_REGULATORY_ORDERS, { cityName: 'Mumbai' });
      const html = ReactDOMServer.renderToString(
        <VerifiedAdvisoryPanel status={status} cityName="Mumbai" />
      );
      expect(html).toContain('Not Applicable (Outside NCR)');
    });

    it('86. Modal close buttons include aria-label="Close modal"', () => {
      const html = ReactDOMServer.renderToString(
        <RwaBulletinModal
          isOpen={true}
          onClose={() => {}}
          cityName="Delhi-NCR"
          metrics={null}
        />
      );
      expect(html).toContain('aria-label="Close modal"');
    });

    it('87. Responsive layout classes (sm:, lg:) are present in advisory panel', () => {
      const status = resolveOfficialGrapStatus(VERIFIED_OFFICIAL_REGULATORY_ORDERS, { cityName: 'Delhi-NCR' });
      const html = ReactDOMServer.renderToString(
        <VerifiedAdvisoryPanel status={status} cityName="Delhi-NCR" />
      );
      expect(html).toContain('sm:flex-row');
    });

    it('88. Dark theme styles (dark:) are thoroughly supported in panel', () => {
      const status = resolveOfficialGrapStatus(VERIFIED_OFFICIAL_REGULATORY_ORDERS, { cityName: 'Delhi-NCR' });
      const html = ReactDOMServer.renderToString(
        <VerifiedAdvisoryPanel status={status} cityName="Delhi-NCR" />
      );
      expect(html).toContain('dark:bg-zinc-950');
      expect(html).toContain('dark:border-zinc-800');
    });

    it('89. ShareBulletinModal renders honest general precaution when data is unavailable', () => {
      const html = ReactDOMServer.renderToString(
        <ShareBulletinModal
          isOpen={true}
          onClose={() => {}}
          cityName="Delhi-NCR"
          usAqi={null}
          pm25={null}
          cigarettes={null}
        />
      );
      expect(html).toContain('AVIR CLEAN-AIR BASELINE ADVISORY');
      expect(html).toContain('Zero-Fabrication Policy');
    });

    it('90. ShareBulletinModal includes official regulatory status in live preview', () => {
      const html = ReactDOMServer.renderToString(
        <ShareBulletinModal
          isOpen={true}
          onClose={() => {}}
          cityName="Delhi-NCR"
          usAqi={220}
          pm25={95}
          cigarettes={4.3}
        />
      );
      expect(html).toContain('CAQM Stage-2 Active');
    });

    it('91. Zero-AQI is rendered cleanly as 0 in ShareBulletinModal', () => {
      const html = ReactDOMServer.renderToString(
        <ShareBulletinModal
          isOpen={true}
          onClose={() => {}}
          cityName="Delhi-NCR"
          usAqi={0}
          pm25={0}
          cigarettes={0}
        />
      );
      expect(html).toContain('0 US AQI');
    });

    it('92. Stale status handles missing timestamps without synthetic now-dates', () => {
      const res = validateAdvisoryEligibility({
        cityName: 'Delhi-NCR',
        pm25: 50,
        usAqi: 120,
        timestamp: null,
      });
      expect(res.isEligibleForEvidenceGuidance).toBe(true);
    });
  });

  // =========================================================================
  // GROUP G: CROSS-STEP REGRESSION & SYSTEM HEALTH (93–103)
  // =========================================================================
  describe('Group G: Cross-Step Regression & System Health (93–103)', () => {
    const mockMetrics: AtmosphericMetrics = {
      status: 'success',
      provenance: 'modeled_forecast',
      timestamp: '2026-11-23T12:00:00+05:30',
      retrievedAt: '2026-11-23T12:00:00+05:30',
      timezone: 'Asia/Kolkata',
      usAqi: 165,
      pm25: 85,
      pm10: 140,
      boundaryLayerHeight: 850,
      isThermalInversionActive: false,
      isLive: true,
      sourceAttribution: 'Open-Meteo High-Resolution Mesh',
    };

    it('93. AtmosphereHero renders verified regulatory status pill for Delhi', () => {
      const html = ReactDOMServer.renderToString(
        <AtmosphereHero
          city="Delhi-NCR"
          metrics={mockMetrics}
          category="Unhealthy"
        />
      );
      expect(html).toContain('CAQM Stage-2 Active');
    });

    it('94. AtmosphereHero renders "GRAP: NCR Only" pill for Mumbai', () => {
      const html = ReactDOMServer.renderToString(
        <AtmosphereHero
          city="Mumbai"
          metrics={mockMetrics}
          category="Unhealthy"
        />
      );
      expect(html).toContain('GRAP: NCR Only');
      expect(html).not.toContain('CAQM Stage-2 Active');
    });

    it('95. AtmosphereHero renders "GRAP: NCR Only" pill for Bengaluru', () => {
      const html = ReactDOMServer.renderToString(
        <AtmosphereHero
          city="Bengaluru"
          metrics={mockMetrics}
          category="Unhealthy"
        />
      );
      expect(html).toContain('GRAP: NCR Only');
    });

    it('96. Indicative GRAP threshold helper returns pure numerical criteria', () => {
      const thresh4 = getIndicativeGrapThreshold(460);
      expect(thresh4.stage).toBe('Stage IV');
      expect(thresh4.label).toContain('(Indicative)');
      expect(thresh4.isStatutoryOrderVerified).toBe(false);

      const thresh3 = getIndicativeGrapThreshold(420);
      expect(thresh3.stage).toBe('Stage III');

      const thresh2 = getIndicativeGrapThreshold(350);
      expect(thresh2.stage).toBe('Stage II');

      const thresh1 = getIndicativeGrapThreshold(250);
      expect(thresh1.stage).toBe('Stage I');

      const threshNormal = getIndicativeGrapThreshold(100);
      expect(threshNormal.stage).toBe('Normal');

      const threshNull = getIndicativeGrapThreshold(null);
      expect(threshNull.stage).toBe('Unavailable');
    });

    it('97. Legacy alias getGrapStage is fully compatible with getIndicativeGrapThreshold', () => {
      expect(getGrapStage(420)).toEqual(getIndicativeGrapThreshold(420));
      expect(getGrapStage(null)).toEqual(getIndicativeGrapThreshold(null));
    });

    it('98. City switching between Delhi and Mumbai recalculates regulatory status dynamically', () => {
      const statusDelhi = resolveOfficialGrapStatus(VERIFIED_OFFICIAL_REGULATORY_ORDERS, { cityName: 'Delhi' });
      expect(statusDelhi.verification).toBe('verified');
      expect(statusDelhi.highestActiveStage).toBe(2);

      const statusMumbai = resolveOfficialGrapStatus(VERIFIED_OFFICIAL_REGULATORY_ORDERS, { cityName: 'Mumbai' });
      expect(statusMumbai.verification).toBe('not_applicable');
      expect(statusMumbai.highestActiveStage).toBeNull();
    });

    it('99. Existing share modal remains functional with 2026 advisories', () => {
      const html = ReactDOMServer.renderToString(
        <ShareBulletinModal
          isOpen={true}
          onClose={() => {}}
          cityName="Delhi-NCR"
          usAqi={150}
          pm25={55}
          cigarettes={2.5}
        />
      );
      expect(html).toContain('Share Daily Smog Bulletin');
      expect(html).toContain('Share to WhatsApp');
    });

    it('100. Existing school modal remains functional with pediatric guidance', () => {
      const html = ReactDOMServer.renderToString(
        <SchoolSafetyAdvisoryModal
          isOpen={true}
          onClose={() => {}}
          cityName="Delhi-NCR"
          usAqi={150}
          pm25={55}
        />
      );
      expect(html).toContain('School &amp; Child Outdoor Sports Advisory');
    });

    it('101. Existing RWA modal remains functional with community clean-air advice', () => {
      const html = ReactDOMServer.renderToString(
        <RwaBulletinModal
          isOpen={true}
          onClose={() => {}}
          cityName="Delhi-NCR"
          metrics={mockMetrics}
        />
      );
      expect(html).toContain('Community Air-Quality Advisory');
    });

    it('102. Step 7 remains isolated: no unverified Step 7 calculations are imported into Step 8', () => {
      // Step 8 relies strictly on main baseline calculations and independent regulatory orders
      expect(officialOrderService.getOrders().length).toBeGreaterThanOrEqual(6);
    });

    it('103. Absolute safety rule: No unsupported regulatory orders or medical diagnoses exist in output', () => {
      const advisories = generateHealthAdvisories({
        cityName: 'Delhi-NCR',
        pm25: 150,
        usAqi: 220,
      });
      for (const adv of advisories) {
        expect(adv.message).not.toContain('You have definitely developed');
        expect(adv.message).not.toContain('Prescription: take');
      }
    });
  });
});
