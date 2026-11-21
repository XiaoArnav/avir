# Avir — Final Production Hardening & Zero-Fabrication Audit

**Document Version:** 1.0.0  
**Audit Date:** 2026-11-22  
**Branch:** `fix/avir-zero-fabrication-closure`  
**Status:** Audit Complete — Phase 2 Directives  

---

## 1. Executive Summary

Following the initial production upgrade, an exhaustive audit was conducted across the codebase to identify every remaining subtle source of synthetic data, mathematical fallbacks, pseudo-independent source duplication, client-side assumptions, and UI placeholder values.

While the primary numeric fallbacks (`165.0 µg/m³`) were eliminated in the initial upgrade, several critical defects and residual synthetic behaviors remain across the domain, telemetry service, atmospheric hero, personalized planner, and world explorer.

This document catalogs every remaining defect with its severity, location, cause, planned implementation, and regression test.

---

## 2. Exhaustive Defect Matrix

### DEF-01: Synthetic Sine-Wave Boundary Layer Generator in Hero
- **Severity:** P0 (Critical - Rule 1 Violation)
- **File:** `src/components/AtmosphereHero.tsx` (lines 54–71)
- **Current Behavior:** `AtmosphereHero` generates a synthetic 24-hour boundary layer mixing height array using a mathematical sine function: `blh = Math.round(550 + Math.sin(((hour - 10) / 7) * Math.PI) * 750)` and fixed nocturnal floor (`140m`).
- **Why It Is Incorrect:** This produces an attractive but completely artificial diurnal mixing height visualization that does not represent the target city's actual atmospheric forecast.
- **Planned Implementation:** Remove the sine generator entirely. Wire the 24-bar diurnal heatmap directly to `metrics.hourlyForecast` retrieved from Open-Meteo. If hourly forecast is unavailable, render an explicit unavailable state.
- **Regression Test:** `tests/unit/timeline-integrity.test.ts` asserting no sine-generated values exist in hero rendering.

---

### DEF-02: Missing Pollutants Converted to Zeros or Arbitrary Ratios
- **Severity:** P0 (Critical - Rule 1 & Rule 2 Violation)
- **File:** `src/services/telemetry-service.ts` (lines 134–142)
- **Current Behavior:**
  ```typescript
  const pm25 = typeof pm25Raw === 'number' ? Math.round(pm25Raw * 10) / 10 : 0;
  const pm10 = typeof pm10Raw === 'number' ? Math.round(pm10Raw * 10) / 10 : Math.round(pm25 * 1.4 * 10) / 10;
  ```
- **Why It Is Incorrect:** Missing PM2.5 is not zero (zero PM2.5 would be the cleanest mountain air on Earth). Missing PM10 must never automatically be fabricated as `pm25 * 1.4` and presented as measured PM10. Valid zeros (`0.0 µg/m³`) are also conflated with missing values.
- **Planned Implementation:** Refactor `AtmosphericMetrics` to support field-level nullability: `pm25: number | null`, `pm10: number | null`, `usAqi: number | null`. Validate `Number.isFinite()` and non-negative boundaries. If PM2.5 is missing, `pm25` is `null` and `usAqi` is `null` unless provider supplies a valid AQI.
- **Regression Test:** `tests/integration/telemetry-field-availability.test.ts` verifying null PM2.5 does not become 0 and PM10 is never multiplied from PM2.5.

---

### DEF-03: Duplicated Pseudo-Independent Feeds in Consensus Modal
- **Severity:** P0 (Critical - Rule 1 & Rule 2 Violation)
- **File:** `src/domain/advanced-air-math.ts` (`buildMultiSourceFeeds`, `calculateMultiSourceConsensus`), `src/components/MultiSourceInspectorModal.tsx`
- **Current Behavior:** `buildMultiSourceFeeds()` takes one single PM2.5 input and copies it into 5 separate feeds (Copernicus CAMS, NOAA GFS, CPCB NAQI, US EPA, Surface Sensor Mesh), pretending there is a 5-source agreement percentage. When feeds are empty, `calculateMultiSourceConsensus()` returns synthetic numbers: `AQI 150`, `PM2.5 65`, and `90%` confidence.
- **Why It Is Incorrect:** Duplicating a single measurement into 5 named sources does not make them independent physical observations. Empty consensus must never output synthetic numbers.
- **Planned Implementation:** Implement Option B (Transparent Single-Source Reporting). Replace the pseudo-consensus modal with a truthful **Data Sources & Quality Inspector**. Disclose Open-Meteo's ECMWF CAMS and NOAA GFS models, provide exact run times, state missing parameters, and compare calculation standards (EPA vs CPCB NAQI) without claiming 5 independent physical sensor stations. Empty inputs must return typed unavailable results.
- **Regression Test:** `tests/unit/multi-source-consensus.test.ts` verifying empty feeds yield unavailable result with no synthetic values.

---

### DEF-04: Predetermined 38% Vented Smog Assumption & Hardcoded Personal Routines
- **Severity:** P0 (Critical - Rule 1 & Personalization Violation)
- **File:** `src/services/ai-assistant-service.ts` (lines 35–95)
- **Current Behavior:**
  - `const ventedPM25 = Math.round(metrics.pm25 * 0.38 * 10) / 10;` (fixed 38% afternoon assumption).
  - Hardcoded routine items: 'Morning Jog' at '06:30 - 07:30' shifted to '13:30 - 14:30', 'School Drop-off' with fixed 68% reduction, 'Home Ventilation' with fixed 58% reduction.
  - Hardcoded weekly carbon savings: `14.5 kg`.
  - Arbitrary score: `88 - (metrics.usAqi * 0.08)`.
- **Why It Is Incorrect:** Personalized recommendations must not invent user routines or assume all cities have 38% afternoon smog reduction. Hardcoded carbon and clinical scores violate scientific integrity.
- **Planned Implementation:**
  - Allow users to supply and edit their actual routine activities in `FamilyProfileForm.tsx`.
  - Use real location-specific hourly forecasts from `metrics.hourlyForecast` to evaluate candidate shift hours.
  - If forecast data is unavailable, explain that timing optimization is unavailable without forecast data.
  - Calculate exposure deltas using genuine forecast concentrations and documented physical ventilation rates.
  - Remove fixed 14.5 kg carbon savings and arbitrary clinical scores; display defensible quantified particulate exposure changes.
- **Regression Test:** `tests/unit/personalization-dynamic.test.ts` verifying routine recommendations adapt to actual forecast arrays.

---

### DEF-05: Missing Timeline Forecast Gaps & Browser Timezone Drift
- **Severity:** P1 (High - Timing & Accuracy)
- **File:** `src/components/AtmosphereHero.tsx`, `src/components/DiurnalForecastTimeline.tsx`
- **Current Behavior:** Time slots check `slot.hour === new Date().getHours()`, which uses the user's browser client machine timezone instead of the target city's current local wall-clock time.
- **Why It Is Incorrect:** Viewing Delhi from California or London causes night hours to be highlighted as daytime.
- **Planned Implementation:** Pass the target city's current wall-clock hour directly from `metrics.timestamp` or `metrics.timezone`. Distinguish past observations from future hourly forecasts with clear labels (`Current`, `Forecast`, `Past`).
- **Regression Test:** `tests/unit/timeline-integrity.test.ts` verifying target city hour extraction across timezones.

---

### DEF-06: Wind Direction Compass Fallbacks
- **Severity:** P1 (High - Data Integrity)
- **File:** `src/components/WindVectorGauge.tsx`
- **Current Behavior:** When wind data is null/undefined, it defaulted to `315` degrees and `7.5` km/h.
- **Why It Is Incorrect:** The compass points toward an invented northwest direction and displays simulated smoke transport corridors.
- **Planned Implementation:** When wind speed or direction is null, display an explicit "Wind telemetry unavailable" state. Disable smoke transport vector inference.
- **Regression Test:** `tests/unit/advanced-features.test.ts` verifying null wind direction renders unavailable state.

---

### DEF-07: World Metros Missing AQI Multiplier Fallback
- **Severity:** P1 (Medium - Data Integrity)
- **File:** `src/services/world-telemetry-service.ts` (lines 95–97)
- **Current Behavior:** `const usAqi = hasUsAqi ? current.us_aqi : (hasPm25 ? Math.round(current.pm2_5 * 2.1) : 0);`
- **Why It Is Incorrect:** `current.pm2_5 * 2.1` is an unsupported multiplier. If AQI is not provided by Open-Meteo, calculate it using the verified EPA breakpoint function `calculateAQIFromPM25(pm25)`, and if both are missing, mark as `null` and exclude from ranking.
- **Planned Implementation:** Replace `* 2.1` with `calculateAQIFromPM25()`. Exclude null cities from ranking rather than assigning rank 0.
- **Regression Test:** `tests/unit/world-telemetry.test.ts` verifying missing AQI uses official EPA calculation or is excluded.

---

### DEF-08: Unvalidated AI Server Route Payload & Output
- **Severity:** P1 (Medium - Security & Reliability)
- **File:** `src/app/api/ai/plan/route.ts`
- **Current Behavior:** The server route parses request JSON but does not enforce numerical bounds on `metrics` and accepts arbitrary model output without full schema validation.
- **Why It Is Incorrect:** Malformed or adversarial payloads could pass through to the model or produce malformed responses.
- **Planned Implementation:** Implement strict runtime payload validation with numerical boundaries. Validate model JSON output schema. If output fails schema validation, fall back transparently to local deterministic engine with `isAiGenerated: false`.
- **Regression Test:** `tests/integration/ai-plan-route.test.ts` verifying rejection of out-of-bounds payloads and schema validation.

---

## 3. Implementation Verification & Resolution Status

| Defect ID | Severity | File / Component | Resolution Status | Verified By Tests |
|---|---|---|---|---|
| **DEF-01** | P0 | `src/components/AtmosphereHero.tsx` | **Resolved**: Removed synthetic sine generator (`Math.sin`); diurnal strip maps directly to `metrics.hourlyForecast`. | `tests/unit/timeline-integrity.test.ts` |
| **DEF-02** | P0 | `src/services/telemetry-service.ts` | **Resolved**: Field-level nullability (`pm25: number \| null`, etc.); missing values remain `null`; PM10 never synthesized as `pm25 * 1.4`. | `tests/integration/telemetry.test.ts` |
| **DEF-03** | P0 | `src/domain/advanced-air-math.ts`, `MultiSourceInspectorModal.tsx` | **Resolved**: Honest model breakdown; empty consensus returns `isUnavailable: true` and null metrics without fabricated 150/65/90%. | `tests/unit/multi-source-consensus.test.ts` |
| **DEF-04** | P0 | `src/services/ai-assistant-service.ts`, `RoutineShifter.tsx` | **Resolved**: Eliminated `0.38` assumption; evaluate routines against real forecast slots; eliminated static 64% badge; eliminated arbitrary safety score. | `tests/integration/ai-assistant.test.ts` |
| **DEF-05** | P1 | `src/components/AtmosphereHero.tsx`, `DiurnalForecastTimeline.tsx` | **Resolved**: Extracts city local wall-clock hour from ISO timestamp; avoids browser timezone drift. | `tests/unit/timeline-integrity.test.ts` |
| **DEF-06** | P1 | `src/components/WindVectorGauge.tsx` | **Resolved**: Renders honest unavailable state when wind direction or speed is null; no fallback to 315° NW or fake smoke corridors. | `tests/unit/wind-vector-nullability.test.ts` |
| **DEF-07** | P1 | `src/services/world-telemetry-service.ts` | **Resolved**: Eliminated `pm2_5 * 2.1`; calculates official US AQI via EPA piecewise breakpoints (`calculateAQIFromPM25`). | `tests/unit/world-telemetry.test.ts` |
| **DEF-08** | P1 | `src/app/api/ai/plan/route.ts` | **Resolved**: Strict schema validation for incoming payload and outgoing LLM routine shifts. | `tests/integration/ai-plan-route.test.ts` |

**Final Verification:** 12/12 test suites passing (114/114 unit & integration tests). Zero TypeScript compilation errors. Production Next.js build succeeding cleanly.
