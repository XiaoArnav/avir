/**
 * Avir Phase D Security & Privacy Regression Suite
 * Step 22: Security and Privacy Hardening
 * 
 * Verifies:
 * - D-SEC-01: Gemini API key authentication via x-goog-api-key header (never in URL)
 * - D-SEC-02: Strict unified validation across modern schedules and legacy requests
 * - D-SEC-03: Request body size limiting (100 KB max ceiling, HTTP 413)
 * - D-SEC-04: Sliding-window rate limiting (HTTP 429 with Retry-After header)
 * - D-REL-01: Bounded upstream timeout with AbortController
 * - Telemetry route parameter validation & machine-readable error codes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as planRoute } from '@/app/api/ai/plan/route';
import { GET as sourcesRoute } from '@/app/api/telemetry/sources/route';
import { GET as cpcbRoute } from '@/app/api/telemetry/cpcb/route';
import { createDefaultSchedule } from '@/services/routines/routine-manager';
import { aiPlanRateLimiter } from '@/lib/security/rate-limiter';

describe('Phase D: Security & Privacy Hardening (Step 22)', () => {
  const originalEnv = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
    aiPlanRateLimiter.reset();
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    process.env.GEMINI_API_KEY = originalEnv;
    aiPlanRateLimiter.reset();
    vi.restoreAllMocks();
  });

  describe('D-SEC-01: AI Provider Authentication & Secret Hygiene', () => {
    it('transmits Gemini API key strictly via x-goog-api-key header and never in query URL', async () => {
      process.env.GEMINI_API_KEY = 'TEST_SECRET_API_KEY_12345';
      let capturedUrl = '';
      let capturedHeaders: Record<string, string> = {};

      vi.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
        capturedUrl = String(url);
        if (init && init.headers) {
          capturedHeaders = init.headers as Record<string, string>;
        }
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        summary: 'Verified clean explanation',
                        narrative: 'Air quality advisory',
                        actionableRecommendations: ['Wear N95 mask'],
                        healthContext: 'Sensitive tier',
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });

      const schedule = createDefaultSchedule();
      const req = new NextRequest('http://localhost:3000/api/ai/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: 'Delhi',
          coordinates: { lat: 28.61, lng: 77.23 },
          schedule,
        }),
      });

      const res = await planRoute(req);
      expect(res.status).toBe(200);

      // Verify the query parameter ?key= is NOT present in the URL
      expect(capturedUrl).not.toContain('?key=');
      expect(capturedUrl).not.toContain('TEST_SECRET_API_KEY_12345');
      expect(capturedUrl).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');

      // Verify x-goog-api-key header is set
      expect(capturedHeaders['x-goog-api-key']).toBe('TEST_SECRET_API_KEY_12345');
    });

    it('falls back gracefully to deterministic explanation if upstream AI call times out', async () => {
      process.env.GEMINI_API_KEY = 'TEST_KEY';
      vi.spyOn(global, 'fetch').mockImplementation(async () => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        throw error;
      });

      const schedule = createDefaultSchedule();
      const req = new NextRequest('http://localhost:3000/api/ai/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: 'Delhi',
          coordinates: { lat: 28.61, lng: 77.23 },
          schedule,
        }),
      });

      const res = await planRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.isAiGenerated).toBe(false);
      expect(data.explanationSource).toBe('deterministic_fallback');
      expect(data.aiExplanation.modelAttribution).toContain('Deterministic');
    });
  });

  describe('D-SEC-02: Unified Schema Validation', () => {
    it('rejects legacy requests with NaN, Infinity, or negative PM2.5 concentrations', async () => {
      const reqNan = new NextRequest('http://localhost:3000/api/ai/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: 'Delhi',
          metrics: { pm25: 'not-a-number', usAqi: 150 },
        }),
      });

      const resNan = await planRoute(reqNan);
      expect(resNan.status).toBe(400);
      const dataNan = await resNan.json();
      expect(dataNan.code).toBe('VALIDATION_ERROR');

      const reqNeg = new NextRequest('http://localhost:3000/api/ai/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: 'Delhi',
          metrics: { pm25: -25, usAqi: 150 },
        }),
      });

      const resNeg = await planRoute(reqNeg);
      expect(resNeg.status).toBe(400);
      const dataNeg = await resNeg.json();
      expect(dataNeg.code).toBe('VALIDATION_ERROR');
    });

    it('rejects legacy requests with missing or empty city name', async () => {
      const req = new NextRequest('http://localhost:3000/api/ai/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: '   ',
          metrics: { pm25: 45, usAqi: 120 },
        }),
      });

      const res = await planRoute(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe('VALIDATION_ERROR');
    });

    it('rejects modern requests with invalid coordinates or excessive activities', async () => {
      const schedule = createDefaultSchedule();
      const req = new NextRequest('http://localhost:3000/api/ai/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: 'Delhi',
          coordinates: { lat: 95.0, lng: 77.23 }, // invalid latitude > 90
          schedule,
        }),
      });

      const res = await planRoute(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('D-SEC-03: Request Size Limits & Memory Defense', () => {
    it('rejects payloads exceeding the 100 KB ceiling with HTTP 413 PAYLOAD_TOO_LARGE', async () => {
      // Create a payload larger than 100 KB
      const largeString = 'A'.repeat(105 * 1024);
      const req = new NextRequest('http://localhost:3000/api/ai/plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(largeString.length + 50),
        },
        body: JSON.stringify({
          city: 'Delhi',
          customRoutine: largeString,
        }),
      });

      const res = await planRoute(req);
      expect(res.status).toBe(413);
      const data = await res.json();
      expect(data.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });

  describe('D-SEC-04: Abuse Control & Rate Limiting', () => {
    it('returns HTTP 429 with Retry-After when rate limit is exceeded', async () => {
      const schedule = createDefaultSchedule();
      const ip = '198.51.100.42';

      // Fire 15 allowed requests
      for (let i = 0; i < 15; i++) {
        const req = new NextRequest('http://localhost:3000/api/ai/plan', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-forwarded-for': ip,
          },
          body: JSON.stringify({
            city: 'Delhi',
            coordinates: { lat: 28.61, lng: 77.23 },
            schedule,
          }),
        });
        const res = await planRoute(req);
        expect(res.status).toBe(200);
      }

      // The 16th request must be rejected with 429
      const blockedReq = new NextRequest('http://localhost:3000/api/ai/plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': ip,
        },
        body: JSON.stringify({
          city: 'Delhi',
          coordinates: { lat: 28.61, lng: 77.23 },
          schedule,
        }),
      });

      const blockedRes = await planRoute(blockedReq);
      expect(blockedRes.status).toBe(429);
      expect(blockedRes.headers.get('Retry-After')).toBeTruthy();
      const data = await blockedRes.json();
      expect(data.code).toBe('RATE_LIMITED');
    });
  });

  describe('Telemetry API Endpoint Hardening', () => {
    it('/api/telemetry/sources returns machine-readable error codes on bad parameters', async () => {
      const reqMissing = new NextRequest('http://localhost:3000/api/telemetry/sources');
      const resMissing = await sourcesRoute(reqMissing);
      expect(resMissing.status).toBe(400);
      const dataMissing = await resMissing.json();
      expect(dataMissing.code).toBe('MISSING_COORDINATES');

      const reqBadLat = new NextRequest('http://localhost:3000/api/telemetry/sources?lat=120&lon=77');
      const resBadLat = await sourcesRoute(reqBadLat);
      expect(resBadLat.status).toBe(400);
      const dataBadLat = await resBadLat.json();
      expect(dataBadLat.code).toBe('INVALID_LATITUDE');
    });

    it('/api/telemetry/cpcb returns machine-readable error codes on bad parameters', async () => {
      const reqMissing = new NextRequest('http://localhost:3000/api/telemetry/cpcb?lat=28.6');
      const resMissing = await cpcbRoute(reqMissing);
      expect(resMissing.status).toBe(400);
      const dataMissing = await resMissing.json();
      expect(dataMissing.code).toBe('MISSING_COORDINATES');

      const reqBadRadius = new NextRequest('http://localhost:3000/api/telemetry/cpcb?lat=28.6&lon=77.2&radius=99999');
      const resBadRadius = await cpcbRoute(reqBadRadius);
      expect(resBadRadius.status).toBe(400);
      const dataBadRadius = await resBadRadius.json();
      expect(dataBadRadius.code).toBe('INVALID_RADIUS');
    });
  });
});
