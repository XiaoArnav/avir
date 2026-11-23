import { describe, it, expect } from 'vitest';
import {
  officialOrderService,
  VERIFIED_OFFICIAL_REGULATORY_ORDERS,
} from '@/services/advisories/official-order-service';
import {
  generateHealthAdvisory,
  validateAdvisoryEligibility,
} from '@/services/advisories/health-advisory-service';
import {
  lookupBoundaryLayerHeight,
  analyzeDiurnalRelativeWindows,
  HourlyAtmosphericPoint,
} from '@/services/forecast/hourly-alignment';
import {
  RequestCoordinator,
} from '@/lib/async/request-coordinator';
import {
  assessJurisdiction,
  resolveGrapStatus,
} from '@/services/advisories/grap-status-resolver';
import {
  checkEnvironmentalEligibility,
} from '@/domain/environmental-eligibility';

describe('Phase A Corrective Regression Tests (RED-GREEN)', () => {
  describe('A01: Official Regulatory Orders & Direction No. 104 Integrity', () => {
    it('identifies revised GRAP schedule as Direction No. 104, NOT Direction No. 82', () => {
      const grapScheduleOrder = VERIFIED_OFFICIAL_REGULATORY_ORDERS.find(
        (o) => o.id === 'caqm-grap-revised-schedule-2026'
      );
      expect(grapScheduleOrder).toBeDefined();
      expect(grapScheduleOrder?.orderNumber).toContain('Direction No. 104');
      expect(grapScheduleOrder?.orderNumber).not.toContain('Direction No. 82');
      expect(grapScheduleOrder?.title).toContain('Direction No. 104');
    });

    it('reports GRAP status as unknown if official registry verification is stale (>48 hours)', () => {
      const staleRegistryTime = '2026-11-20T10:00:00+05:30'; // Stale (> 48h from Nov 23)
      const status = resolveGrapStatus({
        cityName: 'New Delhi',
        currentAqi: 280,
        now: new Date('2026-11-23T12:00:00+05:30'),
        registryVerificationTime: staleRegistryTime,
      });

      expect(status.verification).toBe('unknown');
      expect(status.lastVerifiedAt).toBe(staleRegistryTime);
      expect(status.explanation).toMatch(/stale|unverified|unknown/i);
    });

    it('does not invent or fake lastVerifiedAt as current timestamp when unverified', () => {
      const status = resolveGrapStatus({
        cityName: 'Unknown Region',
        currentAqi: 250,
        now: new Date('2026-11-23T12:00:00+05:30'),
        registryVerificationTime: null,
      });

      expect(status.verification).toBe('unknown');
      expect(status.lastVerifiedAt).toBeNull();
    });
  });

  describe('A02: Health Advisory Missing AQI & PM2.5 Safeguards', () => {
    it('1. { usAqi: null, pm25: null } -> Insufficient Data', () => {
      const res = generateHealthAdvisory({
        cityName: 'Delhi',
        usAqi: null,
        pm25: null,
        provenance: 'unavailable',
      });
      expect(res.advisories.length).toBeGreaterThan(0);
      expect(res.advisories[0].evidenceLevel).toBe('insufficient_data');
      expect(res.advisories[0].title).toMatch(/Insufficient|Unavailable/i);
      expect(res.advisories[0].message).not.toMatch(/Satisfactory Ambient Conditions/i);
    });

    it('2. { usAqi: null, pm25: 250 } -> High Risk based on PM2.5 (never clean air)', () => {
      const res = generateHealthAdvisory({
        cityName: 'Delhi',
        usAqi: null,
        pm25: 250,
        timestamp: new Date().toISOString(),
        provenance: 'observed',
      });
      const healthAdv = res.advisories.find(
        (a) => a.evidenceLevel === 'evidence_based_guidance'
      );
      expect(healthAdv).toBeDefined();
      expect(healthAdv?.title).not.toMatch(/Satisfactory/i);
      expect(healthAdv?.title).toMatch(/Hazardous|Severe|High|Unhealthy/i);
      expect(healthAdv?.message).not.toMatch(/minimal acute respiratory risk/i);
      // Must not invent an AQI value
      expect(healthAdv?.limitations?.some((l) => l.includes('AQI unavailable'))).toBe(true);
    });

    it('3. { usAqi: 250, pm25: null } -> High Risk based on US AQI (does not invent PM2.5)', () => {
      const res = generateHealthAdvisory({
        cityName: 'Delhi',
        usAqi: 250,
        pm25: null,
        timestamp: new Date().toISOString(),
        provenance: 'observed',
      });
      const healthAdv = res.advisories.find(
        (a) => a.evidenceLevel === 'evidence_based_guidance'
      );
      expect(healthAdv).toBeDefined();
      expect(healthAdv?.title).toMatch(/Very Unhealthy|High/i);
      expect(healthAdv?.limitations?.some((l) => l.includes('PM2.5 concentration unavailable'))).toBe(true);
    });

    it('4. { usAqi: 45, pm25: 11 } -> Low Risk (satisfactory)', () => {
      const res = generateHealthAdvisory({
        cityName: 'Delhi',
        usAqi: 45,
        pm25: 11,
        timestamp: new Date().toISOString(),
        provenance: 'observed',
      });
      const healthAdv = res.advisories.find(
        (a) => a.evidenceLevel === 'evidence_based_guidance'
      );
      expect(healthAdv).toBeDefined();
      expect(healthAdv?.title).toMatch(/Satisfactory/i);
    });

    it('5. { usAqi: 45, pm25: 150 } -> Discrepancy / High Risk (protects user using worse metric)', () => {
      const res = generateHealthAdvisory({
        cityName: 'Delhi',
        usAqi: 45,
        pm25: 150,
        timestamp: new Date().toISOString(),
        provenance: 'observed',
      });
      const healthAdv = res.advisories.find(
        (a) => a.evidenceLevel === 'evidence_based_guidance'
      );
      expect(healthAdv).toBeDefined();
      // Must NOT declare clean air when PM2.5 is 150 µg/m³!
      expect(healthAdv?.title).not.toMatch(/Satisfactory/i);
      expect(healthAdv?.limitations?.some((l) => l.includes('Discrepancy'))).toBe(true);
    });

    it('6. { usAqi: 300, pm25: 12 } -> Discrepancy / High Risk (protects user using worse metric)', () => {
      const res = generateHealthAdvisory({
        cityName: 'Delhi',
        usAqi: 300,
        pm25: 12,
        timestamp: new Date().toISOString(),
        provenance: 'observed',
      });
      const healthAdv = res.advisories.find(
        (a) => a.evidenceLevel === 'evidence_based_guidance'
      );
      expect(healthAdv).toBeDefined();
      expect(healthAdv?.title).toMatch(/Unhealthy|Hazardous|Alert/i);
      expect(healthAdv?.limitations?.some((l) => l.includes('Discrepancy'))).toBe(true);
    });

    it('7. { usAqi: null, pm25: 15 } -> Moderate Risk based on PM2.5 (15 µg/m³ is moderate)', () => {
      const res = generateHealthAdvisory({
        cityName: 'Delhi',
        usAqi: null,
        pm25: 15,
        timestamp: new Date().toISOString(),
        provenance: 'observed',
      });
      const healthAdv = res.advisories.find(
        (a) => a.evidenceLevel === 'evidence_based_guidance'
      );
      expect(healthAdv).toBeDefined();
      expect(healthAdv?.title).toMatch(/Moderate Air Quality/i);
    });

    it('8. { usAqi: 180, pm25: 85 } -> Unhealthy Risk', () => {
      const res = generateHealthAdvisory({
        cityName: 'Delhi',
        usAqi: 180,
        pm25: 85,
        timestamp: new Date().toISOString(),
        provenance: 'observed',
      });
      const healthAdv = res.advisories.find(
        (a) => a.evidenceLevel === 'evidence_based_guidance'
      );
      expect(healthAdv).toBeDefined();
      expect(healthAdv?.title).toMatch(/Unhealthy Air/i);
    });
  });

  describe('A03: BLH without verified time axis', () => {
    it('returns null BLH and null matchedValidAt when time array is absent', () => {
      const result = lookupBoundaryLayerHeight(
        '2026-11-23T12:00:00Z',
        {
          boundary_layer_height: [450, 520, 600],
        } as any,
        'UTC'
      );
      expect(result.blh).toBeNull();
      expect(result.matchedValidAt).toBeNull();
      expect(result.deltaMinutes).toBeNull();
    });
  });

  describe('A04: Diurnal Sliding Window requires strictly consecutive hours', () => {
    it('rejects nonconsecutive hours from forming a 3-hour window', () => {
      // Points at 09:00, 14:00, 19:00 (5 hours apart)
      const points: HourlyAtmosphericPoint[] = [
        {
          time: '2026-11-23T09:00:00Z',
          validAtUtc: '2026-11-23T09:00:00Z',
          hour: 9,
          localDisplayTime: '09:00',
          pm25: 30,
          usAqi: 88,
          boundaryLayerHeight: 800,
          isForecast: true,
        },
        {
          time: '2026-11-23T14:00:00Z',
          validAtUtc: '2026-11-23T14:00:00Z',
          hour: 14,
          localDisplayTime: '14:00',
          pm25: 25,
          usAqi: 78,
          boundaryLayerHeight: 1200,
          isForecast: true,
        },
        {
          time: '2026-11-23T19:00:00Z',
          validAtUtc: '2026-11-23T19:00:00Z',
          hour: 19,
          localDisplayTime: '19:00',
          pm25: 45,
          usAqi: 124,
          boundaryLayerHeight: 400,
          isForecast: true,
        },
      ];

      const res = analyzeDiurnalRelativeWindows(points);
      // Because hours are nonconsecutive, no valid 3-hour consecutive window exists
      expect(res.hasValidData).toBe(false);
      expect(res.lowestSmogWindow.description).toContain('unavailable');
    });

    it('identifies true consecutive 3-hour run among mixed data', () => {
      const points: HourlyAtmosphericPoint[] = [
        {
          time: '2026-11-23T09:00:00Z',
          validAtUtc: '2026-11-23T09:00:00Z',
          hour: 9,
          localDisplayTime: '09:00',
          pm25: 30,
          usAqi: 88,
          boundaryLayerHeight: 800,
          isForecast: true,
        },
        // Gap here: no 10, 11, 12, 13
        {
          time: '2026-11-23T14:00:00Z',
          validAtUtc: '2026-11-23T14:00:00Z',
          hour: 14,
          localDisplayTime: '14:00',
          pm25: 20,
          usAqi: 68,
          boundaryLayerHeight: 1200,
          isForecast: true,
        },
        {
          time: '2026-11-23T15:00:00Z',
          validAtUtc: '2026-11-23T15:00:00Z',
          hour: 15,
          localDisplayTime: '15:00',
          pm25: 22,
          usAqi: 72,
          boundaryLayerHeight: 1100,
          isForecast: true,
        },
        {
          time: '2026-11-23T16:00:00Z',
          validAtUtc: '2026-11-23T16:00:00Z',
          hour: 16,
          localDisplayTime: '16:00',
          pm25: 25,
          usAqi: 78,
          boundaryLayerHeight: 950,
          isForecast: true,
        },
      ];

      const res = analyzeDiurnalRelativeWindows(points);
      expect(res.hasValidData).toBe(true);
      expect(res.lowestSmogWindow.startDisplayTime).toBe('14:00');
      expect(res.lowestSmogWindow.endDisplayTime).toBe('16:00');
    });
  });

  describe('A05: Request Coordinator & AI Plan Invalidation', () => {
    it('generates distinct fingerprints for cardiovascular, pregnancy, outdoor worker, and long routines', () => {
      const base = {
        cityName: 'Delhi',
        metricsTimestamp: '2026-11-23T10:00:00Z',
        usAqi: 150,
        pm25: 60,
        profileId: 'adult',
        roomSizeSqFt: 200,
        customRoutine: 'Morning jog in park for 30 minutes every morning at 7am',
        hasCardiovascularCondition: false,
        isPregnant: false,
        isOutdoorWorker: false,
      };

      const fpBase = RequestCoordinator.getPlanFingerprint(base);

      const fpCardio = RequestCoordinator.getPlanFingerprint({
        ...base,
        hasCardiovascularCondition: true,
      });
      expect(fpCardio).not.toBe(fpBase);

      const fpPreg = RequestCoordinator.getPlanFingerprint({
        ...base,
        isPregnant: true,
      });
      expect(fpPreg).not.toBe(fpBase);

      const fpOutdoor = RequestCoordinator.getPlanFingerprint({
        ...base,
        isOutdoorWorker: true,
      });
      expect(fpOutdoor).not.toBe(fpBase);

      // Distinguishes changes after 32 characters
      const fpRoutineVariant = RequestCoordinator.getPlanFingerprint({
        ...base,
        customRoutine: 'Morning jog in park for 30 minutes every morning at 9am (indoor gym instead)',
      });
      expect(fpRoutineVariant).not.toBe(fpBase);
    });

    it('invalidates pending plan request when input changes or invalidatePlanRequest is called', () => {
      const coordinator = new RequestCoordinator();
      const planContext = coordinator.beginPlanRequest({
        cityName: 'Delhi',
        usAqi: 200,
        pm25: 120,
        hasCardiovascularCondition: false,
      } as any);

      expect(coordinator.isPlanResponseValid(planContext)).toBe(true);

      // Invalidate on profile update
      coordinator.invalidatePendingPlans();

      expect(coordinator.isPlanResponseValid(planContext)).toBe(false);
    });
  });

  describe('A06: NCR Jurisdiction Assessment Precision', () => {
    it('returns unknown or not_applicable for non-NCR locations with substring resemblance', () => {
      // A city with "delhi" in the name outside NCR
      const res1 = assessJurisdiction({
        cityName: 'Indelhi Road (Kolkata)',
        admin1: 'West Bengal',
        countryCode: 'IN',
      });
      expect(res1.isNcr).toBe(false);

      const res2 = assessJurisdiction({
        cityName: 'Alwarpet',
        admin1: 'Tamil Nadu',
        countryCode: 'IN',
      });
      expect(res2.isNcr).toBe(false);
    });

    it('returns verified_official jurisdiction decision for official NCR districts', () => {
      const res = assessJurisdiction({
        cityName: 'Noida',
        admin1: 'Uttar Pradesh',
        countryCode: 'IN',
      });
      expect(res.isNcr).toBe(true);
      expect(res.confidence).toMatch(/high|verified_official/);
    });
  });

  describe('A08: Environmental Unit Normalization', () => {
    it('normalizes mg/m³ to µg/m³ by multiplying by 1000', () => {
      const check = checkEnvironmentalEligibility({
        value: 0.1,
        unit: 'mg/m³',
        pollutant: 'pm2.5',
        timestamp: new Date().toISOString(),
      });

      expect(check.eligible).toBe(true);
      // Normalized value must be 100 µg/m³, not 0.1!
      expect((check as any).normalizedValue).toBe(100);
      expect((check as any).normalizedUnit).toBe('µg/m³');
    });
  });
});
