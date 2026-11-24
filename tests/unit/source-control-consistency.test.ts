import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as planRoute } from '@/app/api/ai/plan/route';
import {
  deriveSelectedCurrentMeasurement,
  buildMetricsViewForCurrentSource,
  prepareCurrentSourcePlanInput,
  generateLocalHeuristicPlan,
  generateAirQualityPlan,
} from '@/services/ai-assistant-service';
import { resolveSource } from '@/services/source-control/source-resolution';
import {
  DEFAULT_SOURCE_PREFERENCE,
  loadSourcePreference,
  saveSourcePreference,
  SOURCE_PREFERENCE_STORAGE_KEY,
} from '@/services/source-control/source-preferences';
import { SourcePreference } from '@/services/source-control/source-control-types';
import { AtmosphericMetrics, EnvironmentalSourceRecord, HourlyAtmosphericPoint, UserVulnerabilityProfile } from '@/domain/types';
import { calculateAQIFromPM25, calculateCpcbNaqi } from '@/domain/air-math';
import { RequestCoordinator } from '@/lib/async/request-coordinator';
import { CommuteCalculator } from '@/components/CommuteCalculator';
import { FilterLifespanEstimator } from '@/components/FilterLifespanEstimator';
import { ActionDecisionCard } from '@/components/ui/ActionDecisionCard';
import { RoutineBuilder } from '@/components/RoutineBuilder';
import { aiPlanRateLimiter } from '@/lib/security/rate-limiter';

describe('Avir PR #32 — Source-Selection Consistency & Planning Lifecycle Regression (Tests 1-10)', () => {
  const nowMs = Date.now();
  const recentIso = new Date(nowMs - 15 * 60 * 1000).toISOString();

  const buildHourlyForecast = (): HourlyAtmosphericPoint[] =>
    Array.from({ length: 24 }, (_, hour) => ({
      time: `2026-11-24T${hour.toString().padStart(2, '0')}:00`,
      hour,
      pm25: hour >= 12 && hour <= 14 ? 20 : 85,
      pm10: hour >= 12 && hour <= 14 ? 40 : 140,
      usAqi: hour >= 12 && hour <= 14 ? 68 : 166,
      boundaryLayerHeight: hour >= 12 && hour <= 14 ? 1400 : 250,
      temperature: 22,
      humidity: 55,
      windSpeed: 8,
      isForecast: true,
      validAtUtc: new Date(nowMs + hour * 3600 * 1000).toISOString(),
      timezone: 'Asia/Kolkata',
      localDisplayTime: `${hour.toString().padStart(2, '0')}:00`,
      isSafeVentingWindow: hour >= 12 && hour <= 14,
      sourceAttribution: 'Open-Meteo Atmospheric Model (CAMS)',
      isModel: true,
    }));

  const createCpcbSource = (pm25Value = 180, overrides?: Partial<EnvironmentalSourceRecord>): EnvironmentalSourceRecord => ({
    id: 'cpcb-anand-vihar',
    providerId: 'cpcb',
    providerName: 'Central Pollution Control Board',
    sourceName: 'Anand Vihar CAAQMS',
    sourceKind: 'official_ground_station',
    status: 'fresh',
    stationId: 'site_142',
    latitude: 28.65,
    longitude: 77.31,
    distanceKm: 4.5,
    observedAt: recentIso,
    validAt: null,
    retrievedAt: recentIso,
    measurements: [
      {
        pollutant: 'pm25',
        value: pm25Value,
        unit: 'µg/m³',
        observedAt: recentIso,
        averagingPeriodMinutes: 60,
        qualityFlag: 'valid',
      },
    ],
    attribution: 'CPCB / DPCC Real-Time CAAQMS',
    provenance: {
      network: 'CAAQMS',
      licenseOrAttribution: 'GODL-India',
      isModel: false,
      limitations: ['Snapshot station feed'],
    },
    ...overrides,
  });

  const createOpenAqSource = (pm25Value = 125): EnvironmentalSourceRecord => ({
    id: 'openaq-us-embassy',
    providerId: 'openaq',
    providerName: 'OpenAQ Network',
    sourceName: 'US Diplomatic Post OpenAQ',
    sourceKind: 'physical_observation',
    status: 'fresh',
    stationId: 'oaq_22',
    latitude: 28.60,
    longitude: 77.19,
    distanceKm: 5.1,
    observedAt: recentIso,
    validAt: null,
    retrievedAt: recentIso,
    measurements: [
      {
        pollutant: 'pm25',
        value: pm25Value,
        unit: 'µg/m³',
        observedAt: recentIso,
        averagingPeriodMinutes: 60,
        qualityFlag: 'valid',
      },
    ],
    attribution: 'OpenAQ Reference Sensor',
    provenance: {
      network: 'AirNow-DOS',
      licenseOrAttribution: 'CC0',
      isModel: false,
      limitations: ['Single site reference'],
    },
  });

  const createCamsModelSource = (pm25Value = 90): EnvironmentalSourceRecord => ({
    id: 'cams-global-model',
    providerId: 'open_meteo',
    providerName: 'Open-Meteo Air Quality (ECMWF CAMS)',
    sourceName: 'ECMWF CAMS Global Model',
    sourceKind: 'atmospheric_model',
    status: 'fresh',
    latitude: 28.6139,
    longitude: 77.2090,
    distanceKm: 0,
    observedAt: null,
    validAt: recentIso,
    retrievedAt: recentIso,
    measurements: [
      {
        pollutant: 'pm25',
        value: pm25Value,
        unit: 'µg/m³',
        validAt: recentIso,
        averagingPeriodMinutes: 60,
        qualityFlag: 'valid',
      },
    ],
    attribution: 'ECMWF Copernicus Atmosphere Monitoring Service',
    provenance: {
      network: 'CAMS-IFS',
      licenseOrAttribution: 'Copernicus Open Access',
      isModel: true,
      limitations: ['11km gridded atmospheric chemistry model'],
    },
  });

  const createCityMetrics = (sources: EnvironmentalSourceRecord[], camsPm25 = 90): AtmosphericMetrics => ({
    status: 'success',
    provenance: 'modeled_forecast',
    timestamp: recentIso,
    retrievedAt: recentIso,
    timezone: 'Asia/Kolkata',
    cityName: 'Delhi-NCR',
    latitude: 28.6139,
    longitude: 77.2090,
    pm25: camsPm25,
    pm10: 140,
    usAqi: calculateAQIFromPM25(camsPm25), // 170 at 90 ug/m3
    cpcbAqi: calculateCpcbNaqi(camsPm25).aqi, // 200 at 90 ug/m3
    boundaryLayerHeight: 450,
    isThermalInversionActive: false,
    isLive: true,
    hourlyForecast: buildHourlyForecast(),
    sourceAttribution: 'Open-Meteo Air Quality (ECMWF CAMS)',
    environmentalSources: sources,
  });

  const defaultProfile: UserVulnerabilityProfile = {
    ageGroup: 'adult',
    hasAsthmaOrRespiratory: false,
    hasCardiovascularCondition: false,
    isPregnant: false,
    isOutdoorWorker: false,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    aiPlanRateLimiter.reset();
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Test 1 — CPCB selection propagates 180 µg/m³ across calculators, ActionDecisionCard, RoutineBuilder & planner while preserving model forecast', () => {
    const metrics = createCityMetrics([createCpcbSource(180), createOpenAqSource(125), createCamsModelSource(90)], 90);
    const pref: SourcePreference = { version: 1, mode: 'official_ground', allowFallbackToModel: false };

    const { currentMeasurement, planRequest } = prepareCurrentSourcePlanInput({
      city: 'Delhi-NCR',
      metrics,
      preference: pref,
      profile: defaultProfile,
      roomSizeSqFt: 200,
      customRoutine: 'Morning Run',
    });

    const view = buildMetricsViewForCurrentSource(metrics, currentMeasurement);
    const plan = generateLocalHeuristicPlan(planRequest);

    // Current-source adapter resolves CPCB 180 cleanly
    expect(currentMeasurement.isAvailable).toBe(true);
    expect(currentMeasurement.pm25).toBe(180);
    expect(currentMeasurement.isPhysicalObservation).toBe(true);
    expect(currentMeasurement.isModel).toBe(false);
    expect(currentMeasurement.sourceName).toBe('Anand Vihar CAAQMS');

    // Downstream calculators render 180, NOT 90
    const commuteHtml = ReactDOMServer.renderToString(React.createElement(CommuteCalculator, { ambientPm25: currentMeasurement.pm25 }));
    const filterHtml = ReactDOMServer.renderToString(React.createElement(FilterLifespanEstimator, { ambientPm25: currentMeasurement.pm25 }));
    const routineHtml = ReactDOMServer.renderToString(React.createElement(RoutineBuilder, { currentPm25: currentMeasurement.pm25 })).replace(/<!-- -->/g, '');
    const actionHtml = ReactDOMServer.renderToString(React.createElement(ActionDecisionCard, { metrics: view, category: plan.category })).replace(/<!-- -->/g, '');

    expect(commuteHtml.replace(/<!-- -->/g, '')).toContain('180 µg/m³ ambient air');
    expect(commuteHtml.replace(/<!-- -->/g, '')).not.toContain('90 µg/m³');
    expect(filterHtml.replace(/<!-- -->/g, '')).toContain('180 µg/m³ ambient particulate load');
    expect(filterHtml.replace(/<!-- -->/g, '')).not.toContain('90 µg/m³');
    expect(routineHtml).toContain('Ambient air: 180 µg/m³');
    expect(actionHtml).toContain('Very Unhealthy air alert');

    // Plan uses 180 for current baseline (180 * 2.8 = 504) while retaining 20 µg/m³ forecast (20 * 2.8 = 56)
    expect(plan.routineShifts[0].baselineExposureUg).toBe(504);
    expect(plan.routineShifts[0].optimizedExposureUg).toBe(56);
    expect(plan.category).toBe('VeryUnhealthy');

    // Original metrics object & forecast remain unchanged
    expect(metrics.pm25).toBe(90);
    expect(metrics.hourlyForecast?.[12].pm25).toBe(20);
  });

  it('Test 2 — Switching from CPCB to CAMS updates current-source inputs to 90 µg/m³ without stale CPCB values', () => {
    const metrics = createCityMetrics([createCpcbSource(180), createCamsModelSource(90)], 90);

    const cpcbInput = prepareCurrentSourcePlanInput({
      city: 'Delhi-NCR',
      metrics,
      preference: { version: 1, mode: 'official_ground' },
      profile: defaultProfile,
      roomSizeSqFt: 200,
      customRoutine: 'Morning Run',
    });
    expect(cpcbInput.currentMeasurement.pm25).toBe(180);

    const camsInput = prepareCurrentSourcePlanInput({
      city: 'Delhi-NCR',
      metrics,
      preference: { version: 1, mode: 'atmospheric_model' },
      profile: defaultProfile,
      roomSizeSqFt: 200,
      customRoutine: 'Morning Run',
    });

    expect(camsInput.currentMeasurement.pm25).toBe(90);
    expect(camsInput.currentMeasurement.isModel).toBe(true);
    expect(camsInput.currentMeasurement.sourceName).toContain('CAMS');

    const camsPlan = generateLocalHeuristicPlan(camsInput.planRequest);
    // 90 * 2.8 = 252 (not 504!)
    expect(camsPlan.routineShifts[0].baselineExposureUg).toBe(252);
    expect(camsPlan.category).toBe('Unhealthy');
    expect(camsPlan.summaryAdvisory).not.toContain('Anand Vihar');
  });

  it('Test 3 — Unavailable official source with fallback disabled yields null calculators & no silent 90 µg/m³ substitution while preserving forecast', () => {
    const offlineCpcb = createCpcbSource(180, {
      status: 'unavailable',
      measurements: [],
    });
    const metrics = createCityMetrics([offlineCpcb, createCamsModelSource(90)], 90);
    const pref: SourcePreference = { version: 1, mode: 'official_ground', allowFallbackToModel: false };

    const { currentMeasurement, planRequest } = prepareCurrentSourcePlanInput({
      city: 'Delhi-NCR',
      metrics,
      preference: pref,
      profile: defaultProfile,
      roomSizeSqFt: 200,
      customRoutine: 'Morning Run',
    });

    const view = buildMetricsViewForCurrentSource(metrics, currentMeasurement);

    expect(currentMeasurement.isAvailable).toBe(false);
    expect(currentMeasurement.pm25).toBeNull();
    expect(currentMeasurement.usAqi).toBeNull();
    expect(currentMeasurement.cpcbAqi).toBeNull();
    expect(view?.pm25).toBeNull();
    expect(view?.usAqi).toBeNull();
    expect(view?.hourlyForecast?.length).toBe(24);

    // Downstream calculators render unavailable messaging rather than CAMS 90
    const commuteHtml = ReactDOMServer.renderToString(React.createElement(CommuteCalculator, { ambientPm25: currentMeasurement.pm25 }));
    const filterHtml = ReactDOMServer.renderToString(React.createElement(FilterLifespanEstimator, { ambientPm25: currentMeasurement.pm25 }));
    const actionHtml = ReactDOMServer.renderToString(React.createElement(ActionDecisionCard, { metrics: view, category: 'Unavailable' }));

    expect(commuteHtml).toContain('Awaiting live particulate readings');
    expect(commuteHtml).not.toContain('90 µg/m³');
    expect(filterHtml).toContain('Awaiting live particulate readings');
    expect(actionHtml).toContain('Awaiting telemetry to evaluate today’s exposure risk');

    // Direct planning call also refuses to fabricate CAMS baseline under unavailable state
    const plan = generateLocalHeuristicPlan(planRequest);
    expect(plan.category).toBe('Unavailable');
    expect(plan.routineShifts[0].baselineExposureUg).toBeNull();
    expect(plan.impactMetrics.totalInhaledBaselineUg).toBeNull();
    expect(plan.summaryAdvisory).not.toContain('AQI 170');
    // Forecast-only window remains available from validated forecast
    expect(plan.routineShifts[0].optimizedTimeWindow).toBe('12:00 - 13:00');
  });

  it('Test 4 — Explicit fallback uses eligible CAMS model (90 µg/m³), marks fallback provenance & keeps original preference', () => {
    const offlineCpcb = createCpcbSource(180, { status: 'unavailable', measurements: [] });
    const metrics = createCityMetrics([offlineCpcb, createCamsModelSource(90)], 90);
    const pref: SourcePreference = { version: 1, mode: 'official_ground', allowFallbackToModel: true };

    const { currentMeasurement, planRequest } = prepareCurrentSourcePlanInput({
      city: 'Delhi-NCR',
      metrics,
      preference: pref,
      profile: defaultProfile,
      roomSizeSqFt: 200,
      customRoutine: 'Morning Run',
    });

    expect(currentMeasurement.isAvailable).toBe(true);
    expect(currentMeasurement.isFallback).toBe(true);
    expect(currentMeasurement.isModel).toBe(true);
    expect(currentMeasurement.pm25).toBe(90);
    expect(pref.mode).toBe('official_ground');
    expect(planRequest.currentAmbientPm25).toBe(90);
    expect(planRequest.currentAmbientProvenance).toBe('modeled_forecast');
  });

  it('Test 5 — AQI standard integrity: CPCB NAQI is never copied into usAqi and non-24h snapshot never becomes official bulletin', () => {
    const metrics = createCityMetrics([createCpcbSource(180), createCamsModelSource(90)], 90);
    const resolved = resolveSource({ version: 1, mode: 'official_ground' }, metrics, 'cpcb', nowMs);
    const measurement = deriveSelectedCurrentMeasurement(resolved, metrics);

    const expectedCpcb = calculateCpcbNaqi(180).aqi;
    const expectedEpa = calculateAQIFromPM25(180);

    expect(resolved.aqiStandard).toBe('cpcb');
    expect(measurement.cpcbAqi).toBe(expectedCpcb);
    expect(measurement.usAqi).toBe(expectedEpa);
    expect(measurement.usAqi).not.toBe(measurement.cpcbAqi);
    expect(resolved.isOfficialPublishedAqi).toBe(false);
    expect(measurement.usAqiEvidence?.averagingVerified).toBe(false);
    expect(measurement.usAqiEvidence?.isOfficialPublished).toBe(false);
  });

  it('Test 6 — Preference hydration restores saved manual preference prior to planning without defaulting to CAMS/automatic', () => {
    const storageMap = new Map<string, string>();
    const mockStorage: Storage = {
      get length() { return storageMap.size; },
      clear: () => storageMap.clear(),
      getItem: (k: string) => storageMap.get(k) ?? null,
      key: (i: number) => Array.from(storageMap.keys())[i] ?? null,
      removeItem: (k: string) => { storageMap.delete(k); },
      setItem: (k: string, v: string) => { storageMap.set(k, v); },
    };
    vi.stubGlobal('localStorage', mockStorage);

    const savedPref: SourcePreference = {
      version: 1,
      mode: 'atmospheric_model',
      allowFallbackToModel: false,
    };
    saveSourcePreference(savedPref);
    expect(storageMap.get(SOURCE_PREFERENCE_STORAGE_KEY)).toBeTruthy();

    const restored = loadSourcePreference();
    expect(restored.mode).toBe('atmospheric_model');
    expect(restored.mode).not.toBe(DEFAULT_SOURCE_PREFERENCE.mode);

    // Resolving telemetry with restored preference picks CAMS (90), not automatic's CPCB (180)
    const metrics = createCityMetrics([createCpcbSource(180), createCamsModelSource(90)], 90);
    const { currentMeasurement } = prepareCurrentSourcePlanInput({
      city: 'Delhi-NCR',
      metrics,
      preference: restored,
      profile: defaultProfile,
      roomSizeSqFt: 200,
      customRoutine: 'Morning Run',
    });

    expect(currentMeasurement.pm25).toBe(90);
    expect(currentMeasurement.isModel).toBe(true);
  });

  it('Test 7 — Client/Server /api/ai/plan parity + manual refresh & security validation', async () => {
    const metrics = createCityMetrics([createCpcbSource(180), createCamsModelSource(90)], 90);
    const { planRequest } = prepareCurrentSourcePlanInput({
      city: 'Delhi-NCR',
      metrics,
      preference: { version: 1, mode: 'official_ground' },
      profile: defaultProfile,
      roomSizeSqFt: 200,
      customRoutine: 'Morning Run',
    });

    // Local heuristic plan baseline = 504
    const localPlan = generateLocalHeuristicPlan(planRequest);
    expect(localPlan.routineShifts[0].baselineExposureUg).toBe(504);

    // Server /api/ai/plan with same browser payload
    const serverReq = new NextRequest('http://localhost:3000/api/ai/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        city: planRequest.city,
        metrics: planRequest.metrics,
        roomSizeSqFt: planRequest.roomSizeSqFt,
        customRoutine: planRequest.customRoutine,
        generalizedSensitivity: 'standard',
        currentAmbientPm25: planRequest.currentAmbientPm25,
        currentAmbientUsAqi: planRequest.currentAmbientUsAqi,
        currentAmbientCpcbAqi: planRequest.currentAmbientCpcbAqi,
        currentAmbientSource: planRequest.currentAmbientSource,
        currentAmbientProvenance: planRequest.currentAmbientProvenance,
        selectedSourceUnavailable: planRequest.selectedSourceUnavailable,
      }),
    });

    const serverRes = await planRoute(serverReq);
    expect(serverRes.status).toBe(200);
    const serverPlan = await serverRes.json();

    // Exact parity between server response and local fallback
    expect(serverPlan.routineShifts[0].baselineExposureUg).toBe(504);
    expect(serverPlan.category).toBe(localPlan.category);
    expect(serverPlan.metrics.pm25).toBe(180);
    expect(serverPlan.metrics.aqiEvidence.isOfficialPublished).toBe(false);

    // Browser path (typeof window !== 'undefined') transmits currentAmbient* fields cleanly to /api/ai/plan
    let forwardedBody: any = null;
    vi.stubGlobal('window', {});
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      forwardedBody = JSON.parse(String(init?.body));
      return { ok: true, json: async () => serverPlan } as Response;
    }));

    const browserPlan = await generateAirQualityPlan(planRequest);
    expect(forwardedBody.currentAmbientPm25).toBe(180);
    expect(forwardedBody.currentAmbientUsAqi).toBe(calculateAQIFromPM25(180));
    expect(forwardedBody.currentAmbientSource).toBe('Anand Vihar CAAQMS');
    expect(forwardedBody.selectedSourceUnavailable).toBe(false);
    expect(browserPlan.routineShifts[0].baselineExposureUg).toBe(504);

    // Unavailable source server parity
    const unavailReq = new NextRequest('http://localhost:3000/api/ai/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        city: 'Delhi-NCR',
        metrics,
        currentAmbientPm25: null,
        currentAmbientUsAqi: null,
        selectedSourceUnavailable: true,
        currentAmbientSource: 'Official Ground Station',
      }),
    });
    const unavailRes = await planRoute(unavailReq);
    expect(unavailRes.status).toBe(200);
    const unavailData = await unavailRes.json();
    expect(unavailData.category).toBe('Unavailable');
    expect(unavailData.routineShifts[0].baselineExposureUg).toBeNull();
    expect(unavailData.impactMetrics.totalInhaledBaselineUg).toBeNull();

    // Invalid ambient inputs rejected with HTTP 400
    const badReq = new NextRequest('http://localhost:3000/api/ai/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        city: 'Delhi-NCR',
        metrics: { pm25: 90, usAqi: 170 },
        currentAmbientPm25: -40,
      }),
    });
    const badRes = await planRoute(badReq);
    expect(badRes.status).toBe(400);
  });

  it('Test 8 — Rapid source change invalidates in-flight CAMS plan before it can overwrite CPCB selection', () => {
    const coordinator = new RequestCoordinator();
    const metrics = createCityMetrics([createCpcbSource(180), createCamsModelSource(90)], 90);

    // 1. Select CAMS & start plan request
    const camsCtx = coordinator.beginPlanRequest({
      cityName: 'Delhi-NCR',
      metricsTimestamp: metrics.timestamp,
      usAqi: 170,
      pm25: 90,
      profileId: 'adult|src:atmospheric_model',
    });
    expect(coordinator.isPlanResponseValid(camsCtx)).toBe(true);

    // 2. Switch to CPCB before CAMS responds -> invalidatePendingPlans + begin new CPCB plan
    coordinator.invalidatePendingPlans();
    expect(coordinator.isPlanResponseValid(camsCtx)).toBe(false);

    const cpcbCtx = coordinator.beginPlanRequest({
      cityName: 'Delhi-NCR',
      metricsTimestamp: metrics.timestamp,
      usAqi: calculateAQIFromPM25(180),
      pm25: 180,
      profileId: 'adult|src:official_ground',
    });

    // 3. Old CAMS response returns -> strictly rejected; current CPCB request stays valid
    expect(coordinator.isPlanResponseValid(camsCtx)).toBe(false);
    expect(coordinator.isPlanResponseValid(cpcbCtx)).toBe(true);
  });

  it('Test 9 — Switching cities invalidates previous city pending plan responses', () => {
    const coordinator = new RequestCoordinator();

    const delhiTelCtx = coordinator.beginTelemetryRequest(28.6139, 77.2090, 'Delhi-NCR');
    const delhiPlanCtx = coordinator.beginPlanRequest({
      cityName: 'Delhi-NCR',
      usAqi: 230,
      pm25: 180,
      profileId: 'adult|src:official_ground',
    });

    // Switch to Mumbai
    coordinator.invalidatePendingPlans();
    const mumbaiTelCtx = coordinator.beginTelemetryRequest(19.0760, 72.8777, 'Mumbai');

    expect(coordinator.isTelemetryResponseValid(delhiTelCtx)).toBe(false);
    expect(coordinator.isPlanResponseValid(delhiPlanCtx)).toBe(false);
    expect(coordinator.isTelemetryResponseValid(mumbaiTelCtx)).toBe(true);
  });

  it('Test 10 — Forecast preservation: selecting ground monitors never overwrites hourly model forecast points', () => {
    const metrics = createCityMetrics([createCpcbSource(180), createOpenAqSource(125), createCamsModelSource(90)], 90);
    const snapshotForecastBefore = JSON.stringify(metrics.hourlyForecast);

    const { currentMeasurement } = prepareCurrentSourcePlanInput({
      city: 'Delhi-NCR',
      metrics,
      preference: { version: 1, mode: 'official_ground' },
      profile: defaultProfile,
      roomSizeSqFt: 200,
      customRoutine: 'Morning Run',
    });
    const view = buildMetricsViewForCurrentSource(metrics, currentMeasurement);

    expect(JSON.stringify(metrics.hourlyForecast)).toBe(snapshotForecastBefore);
    expect(JSON.stringify(view?.hourlyForecast)).toBe(snapshotForecastBefore);
    expect(view?.hourlyForecast?.every((pt, idx) => pt.pm25 === metrics.hourlyForecast?.[idx].pm25)).toBe(true);
    expect(metrics.pm25).toBe(90);
  });
});
