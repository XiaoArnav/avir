import { describe, it, expect } from 'vitest';
import {
  EnvironmentalDecisionContext,
  validateDecisionContext,
} from '@/services/ai/decision-context';
import { generateDeterministicStructuredExplanation } from '@/services/ai/deterministic-assistant';

describe('Environmental Decision Context & Structured AI Assistant (Phase 2)', () => {
  const validContext: EnvironmentalDecisionContext = {
    city: {
      name: 'Bengaluru',
      latitude: 12.9716,
      longitude: 77.5946,
      country: 'India',
      timezone: 'Asia/Kolkata',
    },
    source: {
      provider: 'CPCB',
      stationName: 'BTM Layout, Bengaluru - CPCB',
      distanceKm: 4.2,
      freshnessHours: 1,
      isModel: false,
    },
    currentPollutants: {
      pm25: 68.0,
      pm10: 110.0,
      aqi: 127,
      aqiStandard: 'cpcb',
      category: 'Moderate',
    },
    weather: {
      temperatureC: 24.5,
      relativeHumidity: 58,
      windSpeedKmh: 12.0,
      windDirectionDeg: 180,
    },
    userContext: {
      generalizedSensitivity: 'sensitive',
      commuteMode: 'cycling',
      indoorAirPurification: 'hepa_purifier',
    },
  };

  it('validates a correct EnvironmentalDecisionContext', () => {
    const res = validateDecisionContext(validContext);
    expect(res.isValid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('rejects invalid coordinates outside physical bounds', () => {
    const invalidLat = { ...validContext, city: { ...validContext.city, latitude: 120 } };
    const res1 = validateDecisionContext(invalidLat);
    expect(res1.isValid).toBe(false);
    expect(res1.errors.some((e) => e.includes('latitude'))).toBe(true);

    const invalidLng = { ...validContext, city: { ...validContext.city, longitude: -200 } };
    const res2 = validateDecisionContext(invalidLng);
    expect(res2.isValid).toBe(false);
    expect(res2.errors.some((e) => e.includes('longitude'))).toBe(true);
  });

  it('rejects invalid pollutant measurements', () => {
    const negativePm = {
      ...validContext,
      currentPollutants: { ...validContext.currentPollutants, pm25: -5 },
    };
    const res = validateDecisionContext(negativePm);
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.includes('PM2.5'))).toBe(true);
  });

  it('rejects invalid AQI standard values', () => {
    const badStandard = {
      ...validContext,
      currentPollutants: { ...validContext.currentPollutants, aqiStandard: 'who' as any },
    };
    const res = validateDecisionContext(badStandard);
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.includes('aqiStandard'))).toBe(true);
  });

  it('generates rich qualitative recommendations without hallucinatory numbers', () => {
    const explanation = generateDeterministicStructuredExplanation(validContext);

    expect(explanation.situationSummary).toContain('Bengaluru');
    expect(explanation.situationSummary).toContain('68 µg/m³');
    expect(explanation.actionableRecommendations.length).toBeGreaterThanOrEqual(4);

    // Verify recommendations structure
    for (const rec of explanation.actionableRecommendations) {
      expect(rec.id).toBeTruthy();
      expect(rec.action).toBeTruthy();
      expect(rec.why).toBeTruthy();
      expect(rec.supportingData).toBeTruthy();
      expect(rec.uncertainty).toBeTruthy();
      expect(rec.alternativeChoice).toBeTruthy();
      expect(rec.evidenceProvenance).toBeTruthy();
    }

    // Verify indoor & commute advice
    expect(explanation.indoorGuidance.ventilationAdvice).toBeTruthy();
    expect(explanation.indoorGuidance.filtrationAdvice).toBeTruthy();
    expect(explanation.commuteAdvice.recommendation).toBeTruthy();

    // Verify evidence references
    expect(explanation.evidenceReferences.some((r) => r.includes('CPCB'))).toBe(true);
    expect(explanation.modelAttribution).toContain('Deterministic');
    expect(explanation.isDeterministicVerified).toBe(true);
  });

  it('adapts outdoor recommendations for elevated particulate pollution', () => {
    const elevatedContext: EnvironmentalDecisionContext = {
      ...validContext,
      currentPollutants: {
        ...validContext.currentPollutants,
        pm25: 145.0,
        aqi: 310,
      },
    };
    const explanation = generateDeterministicStructuredExplanation(elevatedContext);
    const outdoorRec = explanation.actionableRecommendations.find(
      (r) => r.category === 'outdoor_activity'
    );
    expect(outdoorRec).toBeDefined();
    expect(outdoorRec!.action).toContain('Shift vigorous outdoor cardio');
    expect(outdoorRec!.why).toContain('planetary boundary layer');
  });

  it('includes sensitive group advice for sensitive cohorts', () => {
    const sensitiveExplanation = generateDeterministicStructuredExplanation(validContext);
    const sensitiveRec = sensitiveExplanation.actionableRecommendations.find(
      (r) => r.category === 'sensitive_group'
    );
    expect(sensitiveRec).toBeDefined();
    expect(sensitiveRec!.action).toContain('Limit prolonged outdoor exposure');

    const highlySensitiveContext: EnvironmentalDecisionContext = {
      ...validContext,
      userContext: { ...validContext.userContext, generalizedSensitivity: 'highly_sensitive' },
    };
    const highExplanation = generateDeterministicStructuredExplanation(highlySensitiveContext);
    const highRec = highExplanation.actionableRecommendations.find(
      (r) => r.category === 'sensitive_group'
    );
    expect(highRec).toBeDefined();
    expect(highRec!.action).toContain('Strictly minimize unnecessary outdoor physical exertion');
  });

  it('strictly includes medical disclaimer safety limitations', () => {
    const explanation = generateDeterministicStructuredExplanation(validContext);
    expect(explanation.safetyLimitations.length).toBeGreaterThanOrEqual(2);
    expect(explanation.safetyLimitations.some((s) => s.includes('not personal medical diagnoses'))).toBe(true);
  });
});
