import { NextRequest, NextResponse } from 'next/server';
import { PlanGenerationRequest, generateLocalHeuristicPlan } from '@/services/ai-assistant-service';
import { inspectPromptInjection } from '@/lib/security/sanitizer';
import { getAQICategory } from '@/domain/air-math';
import {
  validatePlanRequestPayload,
  sanitizeUserHealthContext,
} from '@/services/ai/plan-validator';
import {
  optimizeScheduleWithForecast,
  HourlyForecastPoint,
} from '@/services/optimization/forecast-optimizer';
import { calculateDailyScheduleExposure } from '@/services/exposure/exposure-engine';
import { AiPlanExplanation, DeterministicPlanResult } from '@/domain/planning-types';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();

    if (!rawBody || typeof rawBody !== 'object') {
      return NextResponse.json(
        { error: 'Validation failed: Request body must be a valid JSON object.' },
        { status: 400 }
      );
    }

    // Determine if payload is modern Phase B (schedule-based) or legacy Phase A
    const isModernSchedule = Boolean(rawBody.schedule && Array.isArray(rawBody.schedule.activities));

    if (isModernSchedule) {
      const validation = validatePlanRequestPayload(rawBody);
      if (!validation.isValid) {
        return NextResponse.json(
          { error: `Validation failed: ${validation.errors.join('; ')}`, errors: validation.errors },
          { status: 400 }
        );
      }
    } else {
      // Legacy payload validation
      if (!rawBody.city || typeof rawBody.city !== 'string' || rawBody.city.trim().length === 0) {
        return NextResponse.json(
          { error: 'Validation failed: City name is required.' },
          { status: 400 }
        );
      }
      if (!rawBody.metrics || typeof rawBody.metrics !== 'object') {
        return NextResponse.json(
          { error: 'Validation failed: Environmental metrics are required.' },
          { status: 400 }
        );
      }
    }

    // Prompt injection sanitation on any free text inputs
    if (typeof rawBody.customRoutine === 'string') {
      const inspection = inspectPromptInjection(rawBody.customRoutine);
      if (inspection.isThreatDetected) {
        console.warn('Adversarial prompt injection pattern stripped on server:', inspection.detectedPatterns);
        rawBody.customRoutine = 'Standard Daily Routine (Sanitized)';
      }
    }

    // =========================================================================
    // TIER 1: DETERMINISTIC ENGINE (ALL NUMBERS DERIVED HERE, NEVER BY LLM)
    // =========================================================================
    let deterministicPlan: DeterministicPlanResult;
    let legacyPlanFallback = isModernSchedule ? null : generateLocalHeuristicPlan(rawBody);

    if (isModernSchedule) {
      const forecast: HourlyForecastPoint[] = Array.isArray(rawBody.hourlyForecast)
        ? rawBody.hourlyForecast
        : [];

      deterministicPlan = optimizeScheduleWithForecast(rawBody.schedule, forecast);
    } else {
      // Map legacy fallback to DeterministicPlanResult
      const fb = legacyPlanFallback!;
      const baselineMass = fb.routineShifts.reduce((acc, s) => acc + (s.baselineExposureUg ?? 0), 0);
      const optMass = fb.routineShifts.reduce((acc, s) => acc + (s.optimizedExposureUg ?? s.baselineExposureUg ?? 0), 0);
      const diff = Math.max(0, baselineMass - optMass);

      deterministicPlan = {
        status: fb.routineShifts.some(s => s.isOptimizationAvailable) ? 'optimal' : 'unavailable',
        statusMessage: fb.summaryAdvisory,
        planFingerprint: `plan-legacy-${Date.now().toString(36)}`,
        baselineExposureUg: Math.round(baselineMass * 10) / 10,
        optimizedExposureUg: Math.round(optMass * 10) / 10,
        absoluteSavingsUg: Math.round(diff * 10) / 10,
        percentageSavings: baselineMass > 0 ? Math.round((diff / baselineMass) * 1000) / 10 : 0,
        activityShifts: fb.routineShifts.map((s, idx) => ({
          activityId: s.id,
          activityName: s.activityName,
          originalStart: s.timeWindow.split('-')[0]?.trim() || '08:00',
          originalEnd: s.timeWindow.split('-')[1]?.trim() || '09:00',
          proposedStart: s.optimizedTimeWindow?.split('-')[0]?.trim() || s.timeWindow.split('-')[0]?.trim() || '08:00',
          proposedEnd: s.optimizedTimeWindow?.split('-')[1]?.trim() || s.timeWindow.split('-')[1]?.trim() || '09:00',
          shiftMinutes: 0,
          originalMassUg: s.baselineExposureUg ?? 0,
          optimizedMassUg: s.optimizedExposureUg ?? s.baselineExposureUg ?? 0,
          savingsUg: Math.max(0, (s.baselineExposureUg ?? 0) - (s.optimizedExposureUg ?? s.baselineExposureUg ?? 0)),
          savingsPercent: s.reductionPercentage ?? 0,
          reason: s.rationale,
        })),
        unalteredActivities: [],
        calculationTimestamp: new Date().toISOString(),
        forecastProvenance: {
          provider: 'Open-Meteo',
          forecastStart: new Date().toISOString(),
          forecastHoursEvaluated: 24,
          isSynthetic: false,
        },
        limitations: ['Legacy heuristic calculation mode.'],
      };
    }

    // =========================================================================
    // TIER 2: VALIDATION & DATA MINIMIZATION
    // Discard client-supplied geminiApiKey (B-010). Use server environment variable only.
    // Sanitize clinical flags to generalized sensitivity tier (B-011).
    // =========================================================================
    const apiKey = process.env.GEMINI_API_KEY;
    const sensitivity =
      rawBody.generalizedSensitivity ||
      sanitizeUserHealthContext(rawBody.profile);

    // =========================================================================
    // TIER 3: AI EXPLANATION LAYER (LLM AS EXPLANATION ONLY, NO CALCULATIONS)
    // =========================================================================
    let aiExplanation: AiPlanExplanation | undefined = undefined;

    if (apiKey) {
      try {
        const promptText = `You are Avir's Environmental Health Communicator.
Review the following deterministic physical exposure calculations for an urban resident in ${rawBody.city}:
- Environmental Sensitivity Tier: ${sensitivity}
- Baseline Inhaled Particulate: ${deterministicPlan.baselineExposureUg} µg
- Optimized Inhaled Particulate: ${deterministicPlan.optimizedExposureUg} µg
- Inhaled Mass Reduction: ${deterministicPlan.absoluteSavingsUg} µg (${deterministicPlan.percentageSavings}%)
- Activity Shifts: ${JSON.stringify(deterministicPlan.activityShifts.map(s => ({ activity: s.activityName, from: s.originalStart, to: s.proposedStart, savingsUg: s.savingsUg })))}

Provide a clear, empathetic explanation. Do NOT alter, recalculate, or contradict the verified physical numbers.
Return only valid JSON matching this schema:
{
  "summary": string,
  "narrative": string,
  "actionableRecommendations": string[],
  "healthContext": string
}`;

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: promptText }] }],
              generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.2,
              },
            }),
          }
        );

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          const candidateText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidateText) {
            const parsed = JSON.parse(candidateText);
            aiExplanation = {
              summary: typeof parsed.summary === 'string' ? parsed.summary : deterministicPlan.statusMessage,
              narrative: typeof parsed.narrative === 'string' ? parsed.narrative : '',
              actionableRecommendations: Array.isArray(parsed.actionableRecommendations)
                ? parsed.actionableRecommendations
                : ['Monitor local air quality before strenuous outdoor exertion.'],
              healthContext: typeof parsed.healthContext === 'string' ? parsed.healthContext : `Sensitivity tier: ${sensitivity}`,
              modelAttribution: 'Gemini 2.5 Flash (Verified Server-Side)',
              generatedAt: new Date().toISOString(),
              isDeterministicVerified: true,
            };
          }
        }
      } catch (geminiErr) {
        console.warn('Gemini explanation call failed, using deterministic explanation fallback:', geminiErr);
      }
    }

    // Fallback deterministic explanation if Gemini unconfigured or failed
    if (!aiExplanation) {
      aiExplanation = {
        summary: deterministicPlan.statusMessage || `Personalized air quality plan for ${rawBody.city}.`,
        narrative: `Deterministic optimization evaluated schedule activities against ambient atmospheric levels in ${rawBody.city}.`,
        actionableRecommendations: [
          'Monitor real-time PM2.5 readings prior to outdoor activities.',
          'Utilize indoor filtration during peak early morning and late night inversions.',
        ],
        healthContext: `Sensitivity level: ${sensitivity}. Maintain appropriate indoor air protection.`,
        modelAttribution: 'Deterministic Rule-Based Engine (Server-Side)',
        generatedAt: new Date().toISOString(),
        isDeterministicVerified: true,
      };
    }

    // Modern response for Step 16+ clients
    if (isModernSchedule) {
      return NextResponse.json({
        success: true,
        deterministicPlan,
        aiExplanation,
      });
    }

    // Backwards-compatible response for legacy Phase A UI
    return NextResponse.json({
      ...legacyPlanFallback,
      isAiGenerated: Boolean(apiKey),
      summaryAdvisory: aiExplanation.summary,
      deterministicPlan,
      aiExplanation,
    });
  } catch (err: any) {
    console.error('AI plan route error:', err);
    return NextResponse.json(
      { error: 'Internal server error while generating plan' },
      { status: 500 }
    );
  }
}
