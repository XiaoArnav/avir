import { NextRequest, NextResponse } from 'next/server';
import { daytimeForecastForPlan, generateLocalHeuristicPlan } from '@/services/ai-assistant-service';
import { inspectPromptInjection } from '@/lib/security/sanitizer';
import { getAQICategory } from '@/domain/air-math';
import {
  validatePlanRequestPayload,
  validateLegacyPlanRequestPayload,
  sanitizeUserHealthContext,
} from '@/services/ai/plan-validator';
import {
  optimizeScheduleWithForecast,
  HourlyForecastPoint,
} from '@/services/optimization/forecast-optimizer';
import { calculateDailyScheduleExposure } from '@/services/exposure/exposure-engine';
import { AiPlanExplanation } from '@/domain/planning-types';
import { aiPlanRateLimiter, extractClientIp } from '@/lib/security/rate-limiter';
import { readBoundedJson } from '@/lib/security/request-limiter';

const GEMINI_API_TIMEOUT_MS = 8000;

export async function POST(req: NextRequest) {
  try {
    // =========================================================================
    // STEP 22: ABUSE CONTROL & RATE LIMITING
    // =========================================================================
    const clientIp = extractClientIp(req);
    const rateLimit = aiPlanRateLimiter.check(clientIp);

    if (!rateLimit.allowed) {
      const retryAfterSec = Math.max(1, Math.ceil(rateLimit.resetMs / 1000));
      return NextResponse.json(
        {
          error: 'Rate limit exceeded. Too many requests to the AI planner endpoint.',
          code: 'RATE_LIMITED',
          retryAfterSeconds: retryAfterSec,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfterSec),
            'X-RateLimit-Limit': String(rateLimit.limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(retryAfterSec),
          },
        }
      );
    }

    // =========================================================================
    // STEP 22: BOUNDED PAYLOAD SIZE CHECK (100 KB CEILING)
    // =========================================================================
    const boundedRead = await readBoundedJson(req);
    if (!boundedRead.success) {
      const status = boundedRead.errorCode === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
      return NextResponse.json(
        {
          error: boundedRead.errorMessage || 'Invalid request payload.',
          code: boundedRead.errorCode || 'INVALID_REQUEST',
        },
        { status }
      );
    }

    const rawBody = boundedRead.data;

    if (!rawBody || typeof rawBody !== 'object') {
      return NextResponse.json(
        {
          error: 'Validation failed: Request body must be a valid JSON object.',
          code: 'VALIDATION_ERROR',
        },
        { status: 400 }
      );
    }

    // Determine if payload is modern Step 16+ (schedule-based) or legacy Phase A
    const isModernSchedule = Boolean(rawBody.schedule && Array.isArray(rawBody.schedule.activities));

    // =========================================================================
    // STEP 22: UNIFIED SCHEMA VALIDATION (ELIMINATES DEFECT D-SEC-02)
    // =========================================================================
    if (isModernSchedule) {
      const validation = validatePlanRequestPayload(rawBody);
      if (!validation.isValid) {
        return NextResponse.json(
          {
            error: `Validation failed: ${validation.errors.join('; ')}`,
            code: 'VALIDATION_ERROR',
            errors: validation.errors,
          },
          { status: 400 }
        );
      }
    } else {
      const validation = validateLegacyPlanRequestPayload(rawBody);
      if (!validation.isValid) {
        return NextResponse.json(
          {
            error: `Validation failed: ${validation.errors.join('; ')}`,
            code: 'VALIDATION_ERROR',
            errors: validation.errors,
          },
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
    const legacyPlanFallback = isModernSchedule ? null : generateLocalHeuristicPlan(rawBody);
    let deterministicPlan;

    if (isModernSchedule) {
      const isClientForecast = Array.isArray(rawBody.hourlyForecast) && rawBody.hourlyForecast.length > 0;
      const forecast: HourlyForecastPoint[] = isClientForecast ? rawBody.hourlyForecast : [];

      deterministicPlan = optimizeScheduleWithForecast(rawBody.schedule, forecast, {
        isUserSupplied: isClientForecast,
        cityId: typeof rawBody.city === 'string' ? rawBody.city.toLowerCase() : undefined,
      });
    } else {
      // Map legacy fallback to DeterministicPlanResult
      const fb = legacyPlanFallback!;
      const {totalInhaledBaselineUg, totalInhaledOptimizedUg, netAvoidedPM25Ug} = fb.impactMetrics;
      const points = daytimeForecastForPlan(rawBody.metrics);

      deterministicPlan = {
        status: fb.routineShifts.some(s => s.isOptimizationAvailable) ? 'optimal' : 'unavailable',
        statusMessage: fb.summaryAdvisory,
        planFingerprint: `plan-legacy-${Date.now().toString(36)}`,
        baselineExposureUg: totalInhaledBaselineUg,
        optimizedExposureUg: totalInhaledOptimizedUg,
        absoluteSavingsUg: netAvoidedPM25Ug,
        percentageSavings: totalInhaledBaselineUg && netAvoidedPM25Ug != null ? Math.round(netAvoidedPM25Ug / totalInhaledBaselineUg * 1000) / 10 : null,
        activityShifts: fb.routineShifts.filter(s => s.isOptimizationAvailable && s.optimizedTimeWindow).map((s) => ({
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
          provider: points[0]?.sourceAttribution ?? null,
          forecastStart: points.map(p => p.validAtUtc || p.time).filter(Boolean).sort()[0] ?? null,
          forecastHoursEvaluated: new Set(points.map(p => p.validAtUtc || p.time).filter(Boolean)).size,
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
    // STEP 22: HEADER-BASED AUTH (D-SEC-01) & ABORT TIMEOUT (D-REL-01)
    // =========================================================================
    let aiExplanation: AiPlanExplanation | undefined = undefined;
    let isAiGenerated = false;
    let explanationSource: 'llm_generated' | 'deterministic_fallback' = 'deterministic_fallback';

    if (apiKey) {
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), GEMINI_API_TIMEOUT_MS);

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

        // D-SEC-01 FIX: Pass API key strictly via x-goog-api-key header, NEVER in query URL
        const geminiRes = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey,
            },
            signal: abortController.signal,
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
            isAiGenerated = true;
            explanationSource = 'llm_generated';
          }
        }
      } catch (geminiErr: any) {
        if (geminiErr.name === 'AbortError') {
          console.warn('Gemini explanation call timed out after 8s, falling back to deterministic explanation.');
        } else {
          console.warn('Gemini explanation call failed, using deterministic explanation fallback:', geminiErr?.message || geminiErr);
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }

    // Fallback deterministic explanation if Gemini unconfigured or failed
    if (!aiExplanation) {
      isAiGenerated = false;
      explanationSource = 'deterministic_fallback';
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
        isAiGenerated,
        explanationSource,
        deterministicPlan,
        aiExplanation,
      });
    }

    // Backwards-compatible response for legacy Phase A UI
    return NextResponse.json({
      ...legacyPlanFallback,
      isAiGenerated,
      explanationSource,
      summaryAdvisory: aiExplanation.summary,
      deterministicPlan,
      aiExplanation,
    });
  } catch (err: any) {
    console.error('AI plan route error:', err);
    return NextResponse.json(
      { error: 'Internal server error while generating plan', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
