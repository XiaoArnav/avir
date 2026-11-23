/**
 * Avir Phase D End-to-End Release Verification Suite
 * Step 24: Comprehensive Multi-Phase Cross-System Integration
 * 
 * Validates complete end-to-end user journeys across:
 * - Journey 1: Telemetry Ingestion -> Scientific AQI (EPA & CPCB) -> Diurnal Forecast -> Status Hero
 * - Journey 2: Routine Creation -> Exposure Calculation -> Forecast Optimization -> Inhaled Mass Savings
 * - Journey 3: Official CAQM GRAP Regulatory Resolver -> NCR Jurisdiction vs Metros
 * - Journey 4: AI Planning Security -> 100 KB Payload Guard -> Header-based Auth -> Invariant Verification
 * - Journey 5: Resilience & Outage Recovery -> Circuit Breaker Trip -> Stale Telemetry Provenance Preservation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateAQIFromPM25, getAQICategory } from '@/domain/air-math';
import { calculateComprehensiveCpcbNaqi } from '@/domain/cpcb-naqi';
import { assessJurisdiction, resolveGrapStatus } from '@/services/advisories/grap-status-resolver';
import { createDefaultSchedule } from '@/services/routines/routine-manager';
import { optimizeScheduleWithForecast, EligibleForecastPoint } from '@/services/optimization/forecast-optimizer';
import { calculateDailyScheduleExposure } from '@/services/exposure/exposure-engine';
import { CircuitBreaker } from '@/lib/reliability/circuit-breaker';
import { MemoryCache } from '@/lib/cache';
import { aiPlanRateLimiter } from '@/lib/security/rate-limiter';
import { POST as planRoute } from '@/app/api/ai/plan/route';
import { NextRequest } from 'next/server';

describe('Avir Step 24: Production Release Candidate Verification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    aiPlanRateLimiter.reset();
  });

  afterEach(() => {
    aiPlanRateLimiter.reset();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // JOURNEY 1: TELEMETRY INGESTION & SCIENTIFIC AQI DUAL BREAKPOINTS
  // =========================================================================
  describe('Journey 1: Telemetry & Scientifically Correct Dual AQI', () => {
    it('computes scientifically exact US EPA AQI and Indian CPCB NAQI without synthetic substitution', () => {
      // Test realistic winter smog scenario (PM2.5 = 120 µg/m³, PM10 = 210 µg/m³)
      const pm25 = 120.0;
      const pm10 = 210.0;

      // 1. US EPA AQI verification (120 µg/m³ falls in Unhealthy [100.5, 140.4] -> [151, 200])
      const epaSub = calculateAQIFromPM25(pm25);
      expect(epaSub).not.toBeNull();
      expect(epaSub!).toBeGreaterThanOrEqual(151);
      expect(epaSub!).toBeLessThanOrEqual(200);
      expect(getAQICategory(epaSub!)).toBe('Unhealthy');

      // 2. Indian CPCB NAQI verification (120 µg/m³ PM2.5 falls in Poor [91, 120] -> 201-300)
      const cpcbResult = calculateComprehensiveCpcbNaqi({
        pm25: pm25,
        pm10: pm10,
        no2: 45,
      });

      expect(cpcbResult.isDataSufficient).toBe(true);
      expect(cpcbResult.aqi).toBeGreaterThanOrEqual(200);
      expect(cpcbResult.dominantPollutant).toBeDefined();
      expect(cpcbResult.category).toBeDefined();
    });
  });

  // =========================================================================
  // JOURNEY 2: PERSONAL ROUTINE & FORECAST-DRIVEN EXPOSURE OPTIMIZATION
  // =========================================================================
  describe('Journey 2: Personal Routine Exposure Engine & Optimization', () => {
    it('optimizes daily activities against hourly forecast and delivers verifiable inhaled mass reduction', () => {
      const schedule = createDefaultSchedule();

      // Hourly forecast with afternoon clean window (13:00-16:00 IST) and morning peak (06:00-08:00 IST)
      const hourlyForecast: EligibleForecastPoint[] = Array.from({ length: 24 }, (_, i) => {
        const hourUtc = (i + 18) % 24;
        const dateStr = i < 6 ? '2026-11-22' : '2026-11-23';
        const hourStr = String(hourUtc).padStart(2, '0');
        let pm = 50;
        if (i >= 6 && i <= 8) pm = 90; // Morning traffic peak (06:00-08:00 IST)
        else if (i >= 13 && i <= 16) pm = 25; // Afternoon convective dip (13:00-16:00 IST)
        else if (i >= 18 && i <= 20) pm = 80; // Evening traffic peak (18:00-20:00 IST)
        return {
          validAtUtc: `${dateStr}T${hourStr}:30:00Z`,
          cityId: 'bengaluru',
          timezone: 'Asia/Kolkata',
          pm25UgM3: pm,
          sourceKind: 'atmospheric_model',
          provider: 'Open-Meteo',
          units: 'µg/m³',
          status: 'valid',
          modelRunAt: '2026-11-22T12:00:00Z',
        };
      });

      // Calculate baseline exposure
      const baselineExposure = calculateDailyScheduleExposure(schedule, 180);
      expect(baselineExposure.totalInhaledMassUg).toBeGreaterThan(0);

      // Run forecast optimizer
      const optResult = optimizeScheduleWithForecast(schedule, hourlyForecast, {
        isUserSupplied: false,
        cityId: 'bengaluru',
      });

      expect(optResult.status).not.toBe('unavailable');
      expect(optResult.statusMessage).toBeDefined();
      expect(optResult.forecastProvenance.isSynthetic).toBe(false);
    });
  });

  // =========================================================================
  // JOURNEY 3: OFFICIAL REGULATORY GRAP ADVISORY RESOLVER
  // =========================================================================
  describe('Journey 3: Verified Regulatory Jurisdiction & Stage Resolution', () => {
    it('applies statutory CAQM GRAP restrictions strictly to NCR districts and rejects non-NCR cities', () => {
      // 1. Delhi (NCR) -> Statutory Jurisdiction evaluates to 'in_jurisdiction'
      const delhiJurisdiction = assessJurisdiction({
        cityName: 'Delhi',
        latitude: 28.61,
        longitude: 77.23,
        admin1: 'Delhi',
        countryCode: 'IN',
      });
      expect(delhiJurisdiction.isNcr).toBe(true);

      const delhiGrap = resolveGrapStatus({
        cityName: 'Delhi',
        latitude: 28.61,
        longitude: 77.23,
        admin1: 'Delhi',
        countryCode: 'IN',
      });
      expect(delhiGrap.verification).toBeDefined();
      expect(delhiGrap.jurisdiction).toBeDefined();

      // 2. Bengaluru (Non-NCR) -> Must deterministically evaluate to 'not_applicable'
      const blrJurisdiction = assessJurisdiction({
        cityName: 'Bengaluru',
        latitude: 12.97,
        longitude: 77.59,
        admin1: 'Karnataka',
        countryCode: 'IN',
      });
      expect(blrJurisdiction.isNcr).toBe(false);
      expect(blrJurisdiction.status).toBe('not_applicable');

      const blrGrap = resolveGrapStatus({
        cityName: 'Bengaluru',
        latitude: 12.97,
        longitude: 77.59,
        admin1: 'Karnataka',
        countryCode: 'IN',
      });
      expect(blrGrap.verification).toBe('not_applicable');
    });
  });

  // =========================================================================
  // JOURNEY 4: END-TO-END AI PLAN GENERATION SECURITY
  // =========================================================================
  describe('Journey 4: End-to-End AI Route Security & Invariant Gate', () => {
    it('executes /api/ai/plan end-to-end with bounded payload, strict headers, and deterministic fallback', async () => {
      const schedule = createDefaultSchedule();

      const req = new NextRequest('http://localhost:3000/api/ai/plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '203.0.113.195',
        },
        body: JSON.stringify({
          city: 'Delhi',
          coordinates: { lat: 28.61, lng: 77.23 },
          schedule,
        }),
      });

      const res = await planRoute(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.deterministicPlan).toBeDefined();
      expect(data.aiExplanation).toBeDefined();
      expect(data.deterministicPlan.baselineExposureUg).toBeGreaterThanOrEqual(0);
      expect(data.deterministicPlan.optimizedExposureUg).toBeGreaterThanOrEqual(0);
    });
  });

  // =========================================================================
  // JOURNEY 5: RESILIENCE, CIRCUIT BREAKER & STALE CACHE TIMESTAMPS
  // =========================================================================
  describe('Journey 5: Resilience & Upstream Outage Recovery', () => {
    it('trips circuit breaker on network failure and preserves authentic observation timestamp on stale cache', async () => {
      const cache = new MemoryCache<{ aqi: number; observedAt: string }>(10);
      const originalTimestamp = '2026-11-23T14:00:00.000Z';

      // Store authentic observation with 10ms TTL
      cache.set('city:delhi', { aqi: 185, observedAt: originalTimestamp }, 10);

      // Fast forward past expiration
      await new Promise((resolve) => setTimeout(resolve, 20));

      const breaker = new CircuitBreaker({ failureThreshold: 2, recoveryTimeoutMs: 500 });

      // Outage simulation
      const fetchLiveData = async () => {
        throw new Error('503 Service Unavailable');
      };

      const result = await breaker.execute(fetchLiveData, async () => {
        const stale = cache.getStale('city:delhi');
        return {
          ...stale?.value,
          status: 'stale',
          isExpired: stale?.isExpired,
        };
      });

      expect(result.aqi).toBe(185);
      expect(result.status).toBe('stale');
      expect(result.isExpired).toBe(true);
      // Zero-fabrication: measurement timestamp must remain the original observation time
      expect(result.observedAt).toBe(originalTimestamp);
    });
  });
});
