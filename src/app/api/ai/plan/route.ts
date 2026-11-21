import { NextRequest, NextResponse } from 'next/server';
import { PlanGenerationRequest, generateLocalHeuristicPlan } from '@/services/ai-assistant-service';
import { inspectPromptInjection } from '@/lib/security/sanitizer';
import { getAQICategory } from '@/domain/air-math';

export async function POST(req: NextRequest) {
  try {
    const body: PlanGenerationRequest = await req.json();

    if (!body || !body.city || !body.metrics) {
      return NextResponse.json(
        { error: 'Invalid payload: city and metrics are required.' },
        { status: 400 }
      );
    }

    // Security guardrail against prompt injection attacks
    if (body.customRoutine) {
      const inspection = inspectPromptInjection(body.customRoutine);
      if (inspection.isThreatDetected) {
        console.warn('Adversarial prompt injection pattern stripped on server:', inspection.detectedPatterns);
        body.customRoutine = 'Standard Daily Routine (Sanitized)';
      }
    }

    // Server-side API key resolution (never leak server keys to browser)
    const apiKey = body.geminiApiKey || process.env.GEMINI_API_KEY;

    if (apiKey) {
      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      text: `You are Avir, an expert atmospheric toxicologist and urban air quality assistant. 
Analyze the following real-time conditions and user context:
City: ${body.city}
Current AQI: ${body.metrics.usAqi ?? 'Unavailable'} (${getAQICategory(body.metrics.usAqi)})
PM2.5: ${body.metrics.pm25 ?? 'Unavailable'} ug/m3
PM10: ${body.metrics.pm10 ?? 'Unavailable'} ug/m3
Boundary Layer Height: ${body.metrics.boundaryLayerHeight ?? 'Unavailable'} meters
Thermal Inversion Active: ${body.metrics.isThermalInversionActive}
User Vulnerability: Age=${body.profile.ageGroup}, Asthma=${body.profile.hasAsthmaOrRespiratory}, Pregnant=${body.profile.isPregnant}
Room Size: ${body.roomSizeSqFt || 180} sq ft
User Routine: ${body.customRoutine || 'Morning jog at 7 AM, school commute at 8 AM'}

Generate a tailored JSON plan matching this exact schema:
{
  "summaryAdvisory": string,
  "routineShifts": [
    {
      "id": string,
      "timeWindow": string,
      "activityName": string,
      "intensity": "resting" | "light_walk" | "moderate_activity" | "intense_exercise",
      "isOutdoor": boolean,
      "baselineExposureUg": number,
      "optimizedTimeWindow": string,
      "optimizedExposureUg": number,
      "reductionPercentage": number,
      "rationale": string
    }
  ]
}
Return only valid JSON.`,
                    },
                  ],
                },
              ],
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
            const fallback = generateLocalHeuristicPlan(body);

            // Strict schema validation for AI routine shifts
            const validShifts = Array.isArray(parsed.routineShifts)
              ? parsed.routineShifts
                  .filter((s: any) => s && typeof s.activityName === 'string' && typeof s.timeWindow === 'string')
                  .map((s: any, idx: number) => ({
                    id: s.id || `ai-shift-${idx + 1}`,
                    timeWindow: s.timeWindow,
                    activityName: s.activityName,
                    intensity: ['resting', 'light_walk', 'moderate_activity', 'intense_exercise'].includes(s.intensity)
                      ? s.intensity
                      : 'light_walk',
                    isOutdoor: Boolean(s.isOutdoor),
                    baselineExposureUg: typeof s.baselineExposureUg === 'number' && Number.isFinite(s.baselineExposureUg)
                      ? Math.round(s.baselineExposureUg * 10) / 10
                      : null,
                    optimizedTimeWindow: s.optimizedTimeWindow || null,
                    optimizedExposureUg: typeof s.optimizedExposureUg === 'number' && Number.isFinite(s.optimizedExposureUg)
                      ? Math.round(s.optimizedExposureUg * 10) / 10
                      : null,
                    reductionPercentage: typeof s.reductionPercentage === 'number' && Number.isFinite(s.reductionPercentage)
                      ? Math.max(0, Math.min(100, Math.round(s.reductionPercentage)))
                      : null,
                    rationale: typeof s.rationale === 'string' ? s.rationale : fallback.routineShifts[0]?.rationale || '',
                    isOptimizationAvailable: true,
                  }))
              : [];

            return NextResponse.json({
              ...fallback,
              isAiGenerated: true,
              summaryAdvisory: typeof parsed.summaryAdvisory === 'string' && parsed.summaryAdvisory.length > 10
                ? parsed.summaryAdvisory
                : fallback.summaryAdvisory,
              routineShifts: validShifts.length > 0 ? validShifts : fallback.routineShifts,
            });
          }
        }
      } catch (geminiErr) {
        console.warn('Server Gemini call failed, falling back to local deterministic engine:', geminiErr);
      }
    }

    // Default deterministic local heuristic fallback
    const fallbackPlan = generateLocalHeuristicPlan(body);
    return NextResponse.json({
      ...fallbackPlan,
      isAiGenerated: false,
    });
  } catch (err: any) {
    console.error('AI plan route error:', err);
    return NextResponse.json(
      { error: 'Internal server error while generating plan' },
      { status: 500 }
    );
  }
}
