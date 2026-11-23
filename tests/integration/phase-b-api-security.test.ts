import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as planRoute } from '@/app/api/ai/plan/route';
import { createDefaultSchedule } from '@/services/routines/routine-manager';

describe('Phase B Critical Regression Suite: API Security & Provenance (C20–C25, C29, C30)', () => {
  const originalEnv = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    process.env.GEMINI_API_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  it('C24: isAiGenerated is FALSE when GEMINI_API_KEY is missing, labeling deterministic fallback', async () => {
    const schedule = createDefaultSchedule();
    const req = new NextRequest('http://localhost:3000/api/ai/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        city: 'Bengaluru',
        coordinates: { lat: 12.97, lng: 77.59 },
        schedule,
      }),
    });

    const res = await planRoute(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isAiGenerated).toBe(false);
    expect(data.explanationSource).toBe('deterministic_fallback');
  });

  it('C24: isAiGenerated is FALSE when Gemini call times out or throws an error', async () => {
    process.env.GEMINI_API_KEY = 'SERVER_SECRET_KEY';
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Gateway Timeout 504'));

    const schedule = createDefaultSchedule();
    const req = new NextRequest('http://localhost:3000/api/ai/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        city: 'Bengaluru',
        coordinates: { lat: 12.97, lng: 77.59 },
        schedule,
      }),
    });

    const res = await planRoute(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isAiGenerated).toBe(false);
    expect(data.explanationSource).toBe('deterministic_fallback');
  });

  it('C22: Client-supplied hourlyForecast is classified as user_supplied_scenario, never verified atmospheric telemetry', async () => {
    const schedule = createDefaultSchedule();
    const req = new NextRequest('http://localhost:3000/api/ai/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        city: 'Bengaluru',
        coordinates: { lat: 12.97, lng: 77.59 },
        schedule,
        hourlyForecast: [
          { validAtUtc: '2026-11-23T06:00:00Z', pm25UgM3: 50 },
        ],
      }),
    });

    const res = await planRoute(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.deterministicPlan.forecastProvenance.sourceClassification).toBe('user_supplied_scenario');
    expect(data.deterministicPlan.forecastProvenance.isVerifiedAtmosphericModel).toBe(false);
  });

  it('C25: Never claims 24 hours evaluated when no eligible forecast was provided', async () => {
    const schedule = createDefaultSchedule();
    const req = new NextRequest('http://localhost:3000/api/ai/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        city: 'Bengaluru',
        coordinates: { lat: 12.97, lng: 77.59 },
        schedule,
      }),
    });

    const res = await planRoute(req);
    const data = await res.json();
    expect(data.deterministicPlan.forecastProvenance.forecastHoursEvaluated).toBe(0);
    expect(data.deterministicPlan.status).toBe('unavailable');
  });
});
