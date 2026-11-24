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

  it('keeps missing PM2.5 honest without labeling it moderate pollution', () => {
    const missingPmContext: EnvironmentalDecisionContext = {
      ...validContext,
      city: { name: 'Reykjavik', latitude: null, longitude: null, country: null, timezone: null },
      source: { provider: 'Unknown Source', sourceType: 'unknown', isModel: null, freshnessHours: null },
      currentPollutants: { pm25: null, pm10: null, aqi: null, aqiStandard: 'unavailable', category: 'Unavailable' },
    };

    expect(validateDecisionContext(missingPmContext).isValid).toBe(true);
    const explanation = generateDeterministicStructuredExplanation(missingPmContext);
    const serialized = JSON.stringify(explanation).toLowerCase();

    expect(explanation.situationSummary).toContain('cannot be determined');
    expect(serialized).not.toContain('moderate µg/m³');
    expect(serialized).not.toContain('epa naqi');
    expect(serialized).not.toContain('1 hour(s) ago');
    expect(serialized).not.toContain('physical ground monitor');
    expect(serialized).not.toContain('atmospheric model estimate');
    expect(explanation.evidenceReferences.some((r) => r.includes('Unverified'))).toBe(true);
    expect(explanation.evidenceReferences.some((r) => r.includes('Unavailable'))).toBe(true);
  });

  it('does not invent afternoon windows, BLH peaks, or unsupported percentages when forecast is missing', () => {
    const elevatedNoForecast: EnvironmentalDecisionContext = {
      ...validContext,
      currentPollutants: { pm25: 135, pm10: 190, aqi: 295, aqiStandard: 'cpcb' },
      hourlyForecast: undefined,
    };

    const explanation = generateDeterministicStructuredExplanation(elevatedNoForecast);
    const serialized = JSON.stringify(explanation);

    expect(serialized).not.toContain('12:00 - 16:00');
    expect(serialized).not.toContain('12:00–16:00');
    expect(serialized).not.toContain('40–80%');
    expect(serialized).not.toContain('50–70%');
    expect(serialized).not.toContain('historically lowest');
    expect(serialized).not.toContain('Forecast boundary layer height peaks');
    expect(serialized).not.toContain('08:00 - 10:30');
  });

  it('cites validated afternoon cleaner window and BLH only when hourlyForecast actually contains them in city timezone', () => {
    // In Asia/Kolkata (UTC+5:30): 01:30Z = 07:00 IST morning, 08:30Z = 14:00 IST afternoon
    const withForecast: EnvironmentalDecisionContext = {
      ...validContext,
      currentPollutants: { pm25: 110, pm10: 160, aqi: 260, aqiStandard: 'cpcb' },
      hourlyForecast: [
        { time: '2026-11-24T01:30:00Z', pm25: 120, aqi: 280, boundaryLayerHeight: 150 },
        { time: '2026-11-24T08:30:00Z', pm25: 42, aqi: 70, boundaryLayerHeight: 1450 },
      ],
    };

    const explanation = generateDeterministicStructuredExplanation(withForecast);
    const outdoorRec = explanation.actionableRecommendations.find((r) => r.category === 'outdoor_activity');
    expect(outdoorRec).toBeDefined();
    expect(outdoorRec!.applicableWindow).toBe('14:00 - 15:00');
    expect(outdoorRec!.supportingData).toContain('42 µg/m³');
    expect(outdoorRec!.supportingData).toContain('1450 m');

    // 14:00Z is 19:30 IST (evening), not afternoon; must NOT label 14:00Z as 14:00 - 15:00 afternoon in Asia/Kolkata
    const eveningInIst: EnvironmentalDecisionContext = {
      ...validContext,
      currentPollutants: { pm25: 110, pm10: 160, aqi: 260, aqiStandard: 'cpcb' },
      hourlyForecast: [
        { time: '2026-11-24T01:30:00Z', pm25: 120, aqi: 280 },
        { time: '2026-11-24T14:00:00Z', pm25: 42, aqi: 70 },
      ],
    };
    const eveningExplanation = generateDeterministicStructuredExplanation(eveningInIst);
    const eveningRec = eveningExplanation.actionableRecommendations.find((r) => r.category === 'outdoor_activity');
    expect(eveningRec).toBeDefined();
    expect(eveningRec!.applicableWindow).toBe('Around 19:30');
    expect(JSON.stringify(eveningExplanation)).not.toContain('14:00 - 15:00');

    // Bare UTC forecast with missing timezone must keep UTC label and must not assume local afternoon
    const utcNoTimezone: EnvironmentalDecisionContext = {
      ...validContext,
      city: { ...validContext.city, timezone: null },
      currentPollutants: { pm25: 110, pm10: 160, aqi: 260, aqiStandard: 'cpcb' },
      hourlyForecast: [
        { time: '2026-11-24T07:00:00Z', pm25: 120, aqi: 280 },
        { time: '2026-11-24T14:00:00Z', pm25: 42, aqi: 70 },
      ],
    };
    const utcExplanation = generateDeterministicStructuredExplanation(utcNoTimezone);
    const utcRec = utcExplanation.actionableRecommendations.find((r) => r.category === 'outdoor_activity');
    expect(utcRec).toBeDefined();
    expect(utcRec!.applicableWindow).toBe('Around 14:00 UTC');
    expect(JSON.stringify(utcExplanation)).not.toContain('14:00 - 15:00');
  });

  it('rejects NaN, unsupported units, contradictory unknown sources, duplicate/unordered forecast, invalid schedule, and raw medical keys', () => {
    expect(
      validateDecisionContext({
        ...validContext,
        currentPollutants: { ...validContext.currentPollutants, pm25: Number.NaN },
      }).isValid
    ).toBe(false);

    expect(
      validateDecisionContext({
        ...validContext,
        currentPollutants: { ...validContext.currentPollutants, pm25Unit: 'ppm' as any },
      }).isValid
    ).toBe(false);

    expect(
      validateDecisionContext({
        ...validContext,
        source: { provider: 'Unverified Sensor', sourceType: 'unknown', isModel: false },
      }).isValid
    ).toBe(false);

    expect(
      validateDecisionContext({
        ...validContext,
        hourlyForecast: [
          { time: '2026-11-24T10:00:00Z', pm25: 50 },
          { time: '2026-11-24T10:00:00Z', pm25: 60 },
        ],
      }).isValid
    ).toBe(false);

    expect(
      validateDecisionContext({
        ...validContext,
        hourlyForecast: [
          { time: '2026-11-24T12:00:00Z', pm25: 50 },
          { time: '2026-11-24T10:00:00Z', pm25: 60 },
        ],
      }).isValid
    ).toBe(false);

    expect(
      validateDecisionContext({
        ...validContext,
        hourlyForecast: [{ time: 'not-a-timestamp', pm25: 50 }],
      }).isValid
    ).toBe(false);

    expect(
      validateDecisionContext({
        ...validContext,
        schedule: {
          activities: [
            { id: '1', name: 'Bad', startTime: '25:99', endTime: '08:00', locationType: 'outdoor' },
          ],
        },
      }).isValid
    ).toBe(false);

    expect(
      validateDecisionContext({
        ...validContext,
        userContext: { ...validContext.userContext, hasAsthmaOrRespiratory: true } as any,
      }).isValid
    ).toBe(false);

    expect(validateDecisionContext([] as any).isValid).toBe(false);
    expect(validateDecisionContext({ ...validContext, weather: 'sunny' as any }).isValid).toBe(false);
  });
});
