# Avir — Zero-Fabrication Hardening & Production Closure

**Project:** Avir — Urban Air Quality & Exposure Intelligence  
**Repository:** https://github.com/XiaoArnav/avir  
**Branch:** `fix/avir-zero-fabrication-closure`  
**Date:** 2026-11-22  
**Author / Attributed Identity:** `XiaoArnav <322868724+XiaoArnav@users.noreply.github.com>`  
**Build & Test Status:** 100% Passing (114/114 Vitest Tests, Next.js 15.5.29 Clean Build)

---

## 1. Executive Summary

This production hardening sprint accomplishes full closure of the non-negotiable **Zero-Fabricated Production Data Policy** (Rule 1) and **Strict Data Provenance** (Rule 2). 

Every subtle source of synthetic data, mathematical sine curves, placeholder gas constants, hardcoded routine reduction percentages, and ungrounded safety scores was identified and eliminated. 

The application now operates on genuine empirical telemetry from Open-Meteo's high-resolution atmospheric models (ECMWF CAMS and NOAA GFS/IFS), providing honest, transparent unavailable states whenever feeds or specific parameters are offline.

---

## 2. Key Hardening Implementations

### 2.1 Elimination of Synthetic Sine Wave in Atmosphere Hero (DEF-01)
- **Problem**: `AtmosphereHero.tsx` previously used a client-side sine formula `Math.round(550 + Math.sin(((hour - 10) / 7) * Math.PI) * 750)` to generate an artificial 24-hour diurnal mixing height curve.
- **Solution**: Deleted the sine generator entirely. The 24-bar diurnal heatmap now renders directly from `metrics.hourlyForecast`. When forecast data is unavailable, an honest station telemetry awaiting notice is displayed.
- **Hour Tracking**: Replaced client machine `new Date().getHours()` with the target city's wall-clock hour parsed from `metrics.timestamp`, eliminating browser timezone drift when viewing international cities.

### 2.2 Field-Level Nullability & True Data Availability (DEF-02)
- **Problem**: When atmospheric parameters were missing from provider responses, `telemetry-service.ts` previously converted missing PM2.5 to `0.0 µg/m³` (implying pristine wilderness air) and missing PM10 to `pm25 * 1.4`.
- **Solution**: Upgraded `AtmosphericMetrics` with explicit nullability:
  - `pm25: number | null`
  - `pm10: number | null`
  - `usAqi: number | null`
  - `boundaryLayerHeight: number | null`
  - `temperature: number | null`
  - `humidity: number | null`
  - `windSpeed: number | null`
  - `windDirection: number | null`
- Missing values strictly remain `null`. Missing PM10 is never synthesized from PM2.5. `MetricAvailability` explicitly flags individual parameter presence.

### 2.3 Transparent Multi-Model Reporting & Null Consensus (DEF-03)
- **Problem**: `buildMultiSourceFeeds` previously duplicated a single PM2.5 reading across 5 named sources, and `calculateMultiSourceConsensus([])` returned hardcoded values (AQI 150, PM2.5 65, 90% confidence).
- **Solution**:
  - Re-anchored the inspector as a transparent **Atmospheric Model Breakdown & Regulatory Standards** tool, disclosing ECMWF CAMS, NOAA GFS, US EPA 2024 breakpoints, and CPCB NAQI breakpoints.
  - When input feeds are empty or missing, `calculateMultiSourceConsensus` returns `consensusAqi: null`, `consensusPm25: null`, `confidenceScorePercent: null`, and `isUnavailable: true`.
  - `MultiSourceInspectorModal.tsx` renders a clean "Model Telemetry Unavailable" state.

### 2.4 Dynamic Personalization & Elimination of Fixed 38% Assumptions (DEF-04)
- **Problem**: `ai-assistant-service.ts` assumed all afternoon smog drops by exactly 38% (`metrics.pm25 * 0.38`), hardcoded routine shift reductions (68%, 58%), hardcoded weekly carbon abatement (14.5 kg), and calculated an arbitrary safety score (`88 - usAqi * 0.08`).
- **Solution**:
  - `generateLocalHeuristicPlan` searches the actual `metrics.hourlyForecast` for daytime hours (11:00–16:00) with the lowest PM2.5 and highest boundary layer expansion.
  - Particulate exposure reductions are calculated using actual forecast concentrations and physical inhalation rates (`calculateInhaledPM25`).
  - If hourly forecast is unavailable, `reductionPercentage` is `null` with explicit documentation.
  - Eliminated the arbitrary safety score and unmodeled 14.5 kg carbon savings.
  - In `RoutineShifter.tsx`, replaced the static `"Breathe ~64% Less Smog Today"` badge with dynamically averaged inhaled smog reductions across the user's active schedule.

### 2.5 Dynamic Thermal Inversion & Ventilation Warnings
- **Problem**: `AtmosphereHero.tsx` previously contained a static alert: `"Avoid high-exertion outdoor activities; shift workouts to the 12:30 PM - 3:30 PM solar venting window"`, making an unsupported claim about specific hours regardless of actual forecast conditions.
- **Solution**:
  - The alert dynamically queries `metrics.hourlyForecast` for genuine safe venting windows.
  - If a venting window exists, it quotes the forecast start and end hours.
  - If no safe window exists (e.g. persistent hazardous inversion), it states: `"No significant solar venting window is projected across the forecast; keep workouts indoors in filtered air zones."`
  - When inversion is inactive, it distinguishes clean atmospheric dispersion from elevated advection smog.
  - The 4 protective action pills dynamically adjust to AQI tiers (Good, Moderate, Sensitive, Unhealthy, Hazardous) instead of statically demanding N95 masks when air is clean.

### 2.6 Wind Vector Null Safety (DEF-06)
- **Problem**: When wind data was null, `WindVectorGauge` defaulted to 315° NW and 7.5 km/h, erroneously diagnosing an active smoke corridor from regional fires.
- **Solution**: When `windDirection === null` or `windSpeed === null`, `WindVectorGauge` displays an honest "Surface wind telemetry currently unavailable" state without pointing the compass dial.

### 2.7 World Metros EPA Breakpoint Integrity (DEF-07)
- **Problem**: `world-telemetry-service.ts` previously used `Math.round(current.pm2_5 * 2.1)` when `us_aqi` was missing.
- **Solution**: Replaced the arbitrary `* 2.1` multiplier with the official piecewise EPA breakpoint calculation `calculateAQIFromPM25(pm25)`.

### 2.8 Server-Side AI Output Schema Validation (DEF-08)
- **Problem**: `/api/ai/plan` accepted LLM candidate JSON without field-level boundary and type checks.
- **Solution**: Added strict runtime schema validation for incoming payloads and outgoing routine shift objects. Any malformed shift reverts to deterministic verified physics defaults.

---

## 3. Test Suite & Verification Results

```
Test Files  12 passed (12)
Tests       114 passed (114)
Start at    04:17:38
Duration    4.14s

✓ tests/unit/atmospheric-math.test.ts (11 tests)
✓ tests/security/sanitizer.test.ts (8 tests)
✓ tests/unit/timeline-integrity.test.ts (5 tests)
✓ tests/integration/ai-assistant.test.ts (4 tests)
✓ tests/unit/advanced-features.test.ts (15 tests)
✓ tests/unit/city-panoramic-backdrop.test.ts (43 tests)
✓ tests/unit/world-telemetry.test.ts (4 tests)
✓ tests/integration/ai-plan-route.test.ts (3 tests)
✓ tests/a11y/accessibility.test.ts (5 tests)
✓ tests/unit/wind-vector-nullability.test.ts (2 tests)
✓ tests/unit/multi-source-consensus.test.ts (5 tests)
✓ tests/integration/telemetry.test.ts (9 tests)
```

**Production Build Verification:**
```
✓ Compiled successfully in 1323ms
✓ Linting and checking validity of types
✓ Generating static pages (5/5)
✓ Finalizing page optimization
```
Zero TypeScript errors. Zero build warnings. Zero synthetic production fallbacks.
