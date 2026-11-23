import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as planRoute } from '@/app/api/ai/plan/route';

describe('Step 16 — Secure AI Planning API Route Integration', () => {
  const originalEnv = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    process.env.GEMINI_API_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  const validPayload = {
    city: 'Bengaluru',
    coordinates: { lat: 12.9716, lng: 77.5946 },
    schedule: {
      id: 'sched-blr',
      name: 'Bengaluru Urban Day',
      timezone: 'Asia/Kolkata',
      createdAt: '2026-11-23T00:00:00Z',
      updatedAt: '2026-11-23T00:00:00Z',
      activities: [
        {
          id: 'act-jog',
          name: 'Cubbon Park Morning Jog',
          startTime: '06:30',
          endTime: '07:30',
          durationMinutes: 60,
          intensity: 'vigorous',
          environment: 'outdoor',
          isFlexible: true,
          allowableStartRange: { earliest: '06:00', latest: '09:00' },
        },
        {
          id: 'act-work',
          name: 'Office in Indiranagar',
          startTime: '09:30',
          endTime: '18:00',
          durationMinutes: 510,
          intensity: 'light',
          environment: 'indoor_clean',
          isFlexible: false,
        },
      ],
    },
    generalizedSensitivity: 'sensitive',
  };

  it('rejects invalid payload missing city or coordinates with HTTP 400', async () => {
    const req = new NextRequest('http://localhost:3000/api/ai/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city: '' }),
    });

    const res = await planRoute(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Validation failed');
  });

  it('Elimination of B-010: Discards client-supplied geminiApiKey', async () => {
    // Attempt to inject client-supplied API key
    const payloadWithClientKey = {
      ...validPayload,
      geminiApiKey: 'CLIENT_ATTACKER_SUPPLIED_KEY_123',
    };

    const fetchSpy = vi.spyOn(global, 'fetch');

    const req = new NextRequest('http://localhost:3000/api/ai/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadWithClientKey),
    });

    const res = await planRoute(req);
    expect(res.status).toBe(200);

    // Verify fetch was NEVER called with CLIENT_ATTACKER_SUPPLIED_KEY_123!
    const calledWithClientKey = fetchSpy.mock.calls.some(call =>
      String(call[0]).includes('CLIENT_ATTACKER_SUPPLIED_KEY_123')
    );
    expect(calledWithClientKey).toBe(false);
  });

  it('falls back when Gemini adds a departure time unsupported by the plan', async () => {
    process.env.GEMINI_API_KEY = 'SERVER_AUTHORIZED_KEY_TEST';

    // Mock Gemini API returning an explanation with attempted hallucinated numbers
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    summary: 'Shift your outdoor cardio to avoid peak morning particulate trapping.',
                    narrative: 'Air quality in Bengaluru is cleanest in the early afternoon due to convective mixing.',
                    actionableRecommendations: [
                      'Run indoors or shift outdoor jog past 8 AM.',
                      'Keep office windows closed during morning rush hour.',
                    ],
                    healthContext: 'Sensitive respiratory individual: minimize high ventilation during peak hours.',
                  }),
                },
              ],
            },
          },
        ],
      }),
    } as any);

    const req = new NextRequest('http://localhost:3000/api/ai/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    });

    const res = await planRoute(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.deterministicPlan).toBeDefined();
    // Exposure numbers are strictly numeric and derived deterministically by server engine
    expect(typeof data.deterministicPlan.baselineExposureUg).toBe('number');
    expect(typeof data.deterministicPlan.optimizedExposureUg).toBe('number');
    expect(data.aiExplanation).toBeDefined();
    expect(data.isAiGenerated).toBe(false);
    expect(data.aiExplanation.summary).toBe(data.deterministicPlan.statusMessage);
    expect(JSON.stringify(data.aiExplanation)).not.toContain('past 8 AM');
  });

  it('Gracefully falls back to deterministic explanation template when GEMINI_API_KEY is unconfigured', async () => {
    // No GEMINI_API_KEY
    const req = new NextRequest('http://localhost:3000/api/ai/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    });

    const res = await planRoute(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.deterministicPlan).toBeDefined();
    expect(data.aiExplanation).toBeDefined();
    expect(data.aiExplanation.modelAttribution).toContain('Deterministic Rule-Based Engine');
  });
});
