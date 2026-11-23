# AVIR — STEP 06: GLOBAL TELEMETRY & WORLD COMPARISONS
## Comprehensive Corrective Closure Documentation, Telemetry Contracts, Ranking Invariants, Defect Closure Matrix, and Step 07 Roadmap Handoff

---

## 1. Executive Summary & Corrective Mission

Step 6 of Avir's 24-step engineering roadmap establishes a **production-grade, scientifically rigorous worldwide atmospheric telemetry explorer, fair city-vs-city comparative benchmarking engine, and persistent local comparison store**.

Following an exhaustive audit of the initial Step 6 implementation, a comprehensive corrective closure was executed to eliminate subtle data-integrity, ranking, comparability, and persistence defects (Defect Matrix W01–W18).

Prior to this corrective pass:
1. **Outdated Matching Timestamps Ranked Current (W01)**: `computeComparableCohortRanks()` determined the dominant cohort timestamp strictly by frequency among all returned records. If all cities shared an outdated 3-day-old forecast run, they could form a matching but stale ranking cohort.
2. **Missing Timestamps Allowed in Comparison (W02)**: Comparisons proceeded even when observation timestamps were null or undefined.
3. **Incompatible Data Produced Numerical Fallbacks (W03)**: `calculateCityComparison()` marked `comparable: false` but retained fallback numerical values (e.g. `toxicityMultiplier: 1.0`, AQI ratios, and winner badges).
4. **AQI Ratio Conflated with Toxicity (W04, W16)**: Dimensionless, piecewise non-linear US AQI ratios were described as "toxicity multipliers" and "more toxic in all biological respects".
5. **Missing Provenance in Shootout (W05)**: `CityShootout` did not receive the main city's observation timestamp, model domain, source kind, or validity status.
6. **Broad Coordinate Tolerance (W06)**: Batch coordinate checks accepted displacements up to $2.0^\circ$ and lacked strict grid-cell association.
7. **Unverified Source Units (W07)**: Measurement units were not strictly verified against the provider contract ($\mu\text{g/m}^3$).
8. **Invalid Data in Cohorts (W08)**: Negative, non-numeric, or single-pollutant derived AQI could enter cohort ranking.
9. **Missing Model Timestamp Displayed as "Live" (W09)**: In `WorldDataExplorer`, when model timestamp was null, the UI displayed `"Live"`.
10. **Saved Comparisons Deduplicated by Name (W10)**: Comparisons collided for same-name cities in different countries (e.g. London UK vs London Ontario Canada).
11. **Saved Snapshots Overwritten by Live Telemetry (W11)**: Restoring a saved comparison immediately initiated a new live fetch, overwriting historic saved values.
12. **Geocoding Country Codes Dropped (W14)**: Geocoding results discarded ISO country codes, degrading regional categorization.
13. **Cache TTL Conflated with Model Freshness (W15)**: A recent in-memory cache hit was treated as "fresh" even if the underlying model simulation was stale.

Following this corrective closure:
- **32 Test Files**: All 32 test files passing (**720/720 tests passing, 0 failures**).
- **TypeScript**: Strict typechecking (`npx tsc --noEmit`) passes with **0 errors**.
- **Production Build**: Next.js 15.5 production build completes cleanly.
- **Defect Matrix W01–W18**: Closed with **100% PASS** on actionable software items.

---

## 2. Root Cause Analysis & Exact Fixes

| Defect ID | Defect Summary | Root Cause | Exact Engineering Fix |
| :--- | :--- | :--- | :--- |
| **W01** | Outdated matching timestamps ranked current | Modal timestamp selection across all items ignored absolute calendar age. | Created `evaluateWorldModelFreshness(modelValidAt, now, policy)` with configurable `ModelFreshnessPolicy` (`maxAgeHours: 12, maxFutureHours: 2`). `computeComparableCohortRanks` evaluates freshness for every city and selects dominant timestamp strictly among fresh cities. |
| **W02** | Missing timestamp allowed in comparison | Timestamps were optional in `CityComparisonInput`; missing timestamps were not checked. | Required valid timestamps in `calculateCityComparison()`. If either city lacks an observation timestamp, comparison is rejected with `comparable: false`. |
| **W03** | Incompatible data still yields numerical verdict | Fallback return assigned `toxicityMultiplier: 1.0` and calculated ratios. | Implemented strict comparability gate: if `!comparable`, returns `null` for all ratios, multipliers, differentials, and winner labels with explanatory verdict. |
| **W04 / W16** | AQI ratio used as toxicity multiplier | AQI index ratio ($280 / 28 = 10$) was used to claim "10x more toxic". | Replaced AQI ratio with physical PM2.5 mass concentration ratio ($R = \text{PM}_{2.5}^A / \text{PM}_{2.5}^B$). Removed all "toxicity multiplier" and biological claims. |
| **W05** | Missing model provenance in CityShootout | `page.tsx` passed only 4 basic props to `<CityShootout />`. | Expanded `CityShootoutProps` to receive `currentTimestamp`, `currentModelDomain`, `currentSourceKind`, `currentStatus`, `currentUnits`, `currentCityId`, `currentLatitude`, `currentLongitude`. Updated `page.tsx` call. |
| **W06** | Broad coordinate tolerance | $2.0^\circ$ displacement permitted; missing coordinate metadata silently accepted. | Reduced displacement tolerance to CAMS Global model grid limit ($0.8^\circ$). Flagged missing coordinate metadata as mismatch. Added multi-city order swap detection. |
| **W07** | Missing/unsupported source units accepted | Units metadata from Open-Meteo (`current_units`) was not verified before parsing numbers. | Added unit metadata verification in `parseBatchTelemetryResponse()`. Verified $\mu\text{g/m}^3$ for PM2.5 and PM10; rejected unsupported units (`ppm`, `ppb`). |
| **W08** | Invalid data entering ranking cohort | Null, negative, or derived AQI was not filtered before cohort ranking. | Excluded null, negative ($< 0$), absurd ($> 1000$), or single-pollutant derived AQI from ranking cohorts. Applied standard competition ranking (`1224`). |
| **W09** | Missing model timestamp shown "Live" | Fallback when `dominantTimestamp` was null displayed `'Live'`. | Changed fallback in `WorldDataExplorer.tsx` to render `'Model valid time unavailable'`. |
| **W10** | Saved comparisons deduplicated by name | Deduplication matched on `name.toLowerCase()`, colliding homonymous cities. | Implemented `getSavedCityIdentityKey()` with composite identity (`${country}:${admin}:${name}:${lat}:${lon}`) or `cityId`. |
| **W11** | Saved snapshot not fully restored | Restoring snapshot set `selectedTarget`, triggering live network overwrite. | Implemented dedicated Snapshot Restoration mode (`viewingSnapshot` state) displaying snapshot banner with exact saved values and explicit "Refresh Live Telemetry" button. |
| **W12** | Search race tests insufficient | Asynchronous geocoding responses could arrive out of order. | Verified `useRef` generation counter and `AbortController` cancellation in `WorldDataExplorer.tsx`. Added dedicated race condition tests. |
| **W13** | Geographic deduplication tests insufficient | Edge cases for same-name cities across countries were not covered in tests. | Added comprehensive unit tests in `step6-corrective-closure.test.ts` verifying independent retention of same-name cities. |
| **W14** | Geocoding country code not preserved | `searchCities()` dropped `country_code` from Open-Meteo geocoding response. | Preserved upper-cased `countryCode` on `GeocodedLocation` and mapped in `searchAndFetchGlobalCity()` to `classifyWorldRegion()`. |
| **W15** | Cache TTL confused with model freshness | In-memory cache hit marked data as current regardless of simulation time. | Segregated cache storage lifecycle (10m TTL) from model forecast age. Stale model data retains `status: 'stale'` even on cache hit. |
| **W17** | Browser integration unverified | Manual and automated browser interaction needed verification. | Verified responsive layout, drawer, sorting, filtering, and shootout UI across mobile and desktop viewports. |
| **W18** | Live API behavior unverified | Batch Open-Meteo response contract needed live verification. | Verified live Open-Meteo CAMS Global batch query across 5 global cities with verified coordinates, units, and timestamps. |

---

## 3. Scientific Validation: Freshness, Parity, and Units

### 3.1 Model Freshness Policy (`evaluateWorldModelFreshness`)
Atmospheric numerical weather and chemistry models (such as ECMWF CAMS Global) run on scheduled cycles (typically 00:00 and 12:00 UTC). Forecast steps are valid for specific UTC valid hours.

```typescript
export interface ModelFreshnessPolicy {
  maxAgeHours?: number;      // Default: 12 hours
  maxFutureHours?: number;   // Default: 2 hours (forecast lead tolerance)
}
```

- **Rejection of Future Drift**: Any timestamp $> 2\,\text{hours}$ in the future is rejected as `status: 'invalid'`.
- **Rejection of Stale Runs**: Any timestamp $> 12\,\text{hours}$ old is marked `status: 'stale'`.
- **Deterministic Verification**: Accepts an injectable `now: Date` parameter for deterministic testing without system clock dependency.

### 3.2 Pollutant Units Verification
The Open-Meteo API returns:
```json
"current_units": {
  "time": "iso8601",
  "us_aqi": "AQI",
  "pm2_5": "μg/m³",
  "pm10": "μg/m³"
}
```
- US AQI is treated as a dimensionless piecewise linear index.
- PM2.5 and PM10 are verified to match accepted mass concentration units: `µg/m³`, `μg/m³`, `ug/m3`, `ug/m^3`, or `mg/m³`.
- Payloads presenting unsupported units (e.g. volumetric parts-per-million `ppm` or parts-per-billion `ppb`) have their PM2.5/PM10 metrics set to `null` to prevent corrupting concentration ratios.

---

## 4. Global Ranking Invariants & Standard Competition Ranking

1. **Cohort Inclusion Rules**:
   - Must possess valid, finite, non-negative US AQI ($0 \le \text{AQI} \le 1000$).
   - Must have a valid model timestamp matching the dominant cohort valid hour ($\Delta t \le 1\,\text{hour}$).
   - Must be verified physically fresh under `evaluateWorldModelFreshness()`.
   - Single-pollutant derived AQI approximations are strictly excluded from the multi-pollutant ranking cohort.
2. **Standard Competition Ranking (`1224`)**:
   - If two cities tie for Rank 1 (equal US AQI), both receive Rank 1.
   - The subsequent city receives Rank 3 (leaving Rank 2 vacant).
3. **Deterministic Tie-Breaking**:
   - Secondary sort: PM2.5 mass concentration descending.
   - Tertiary sort: City name alphabetically ascending.
   - Quaternary sort: Stable composite `cityId`.
4. **Honest Denominator Semantics**:
   - Renders: `"Rank #X of N comparable tracked cities"`.
   - Filtering by continent or severity preserves the original canonical cohort rank.

---

## 5. Strict City Comparison Gate & Scientific Math

### 5.1 Strict Comparability Gate
`calculateCityComparison(cityA, cityB)` enforces strict eligibility:
- Both cities must have valid, parseable observation timestamps.
- Temporal skew between observation times must not exceed 6 hours.
- Model domains must match (`cams_global` vs `cams_global`).
- Source methodologies must be compatible (point-source ground monitors cannot be directly equated with regional atmospheric models).
- Measurement units must be compatible.
- Neither city can have `status: 'stale'`.

When any check fails:
```typescript
return {
  comparable: false,
  reasons,
  commonMetric: null,
  pm25ConcentrationRatio: null,
  aqiRatio: null,
  toxicityMultiplier: null, // Zero numerical fallback
  dirtierCityName: null,
  cleanerCityName: null,
  cigaretteDifferential: null,
  verdict: `Atmospheric comparison unavailable: ${reasons.join(' ')}`
};
```

### 5.2 PM2.5 Concentration Ratio Math
- **Formula**: $\text{Ratio} = \text{PM}_{2.5}^{\text{higher}} / \text{PM}_{2.5}^{\text{lower}}$.
- **Zero Denominator Handling**: If lower PM2.5 is $0\,\mu\text{g/m}^3$, ratio is reported as `null` (undefined for zero-exposure baseline) to eliminate division-by-zero or $\infty$.
- **Both Zero Handling**: If both report $0\,\mu\text{g/m}^3$, ratio is $1.0\times$ with pristine clean air verdict.
- **Berkeley Earth Exposure Analogy**: Illustrated as $\approx 22\,\mu\text{g/m}^3$ over 24h $\approx 1$ cigarette equivalent, with explicit medical disclaimer.

---

## 6. Persistence & Saved Snapshot Restoration

### 6.1 Composite Geographic Identity Key
To resolve city collisions across different countries and jurisdictions:
```typescript
export function getSavedCityIdentityKey(city: SavedCityRecord): string {
  if (city.cityId) return city.cityId.toLowerCase();
  const country = (city.countryCode || city.country || 'xx').toLowerCase().trim();
  const admin = (city.admin1 || '').toLowerCase().trim();
  const name = city.name.toLowerCase().trim();
  const lat = city.latitude !== undefined ? city.latitude.toFixed(4) : '';
  const lon = city.longitude !== undefined ? city.longitude.toFixed(4) : '';
  return `${country}:${admin}:${name}:${lat}:${lon}`;
}
```
This guarantees that **London, UK** and **London, Ontario, Canada** are saved and retained as distinct comparisons.

### 6.2 Snapshot Restoration Lifecycle
- Clicking a saved comparison chip activates **Snapshot Viewing Mode** (`viewingSnapshot`).
- Renders an informative snapshot banner:
  `Saved Snapshot — Recorded Nov 23, 2026, 10:00 AM`
- Displays the exact recorded telemetry metrics from the time of save.
- Live network polling is paused until the user explicitly clicks `"Refresh Current Live Telemetry"`.

---

## 7. Verification Gates & Test Summary

| Suite / Gate | Command | Result | Details |
| :--- | :--- | :--- | :--- |
| **Step 6 Core Scenarios** | `npx vitest run tests/integration/step6-global-telemetry.test.ts` | **PASS (85/85)** | 85 scenarios across Groups A–G green |
| **Step 6 Corrective Closure** | `npx vitest run tests/integration/step6-corrective-closure.test.ts` | **PASS (30/30)** | Dedicated W01–W16 matrix regression tests green |
| **Full Regression Suite** | `npm test` | **PASS (720/720)** | 32 test files, 100% green |
| **TypeScript Typecheck** | `npx tsc --noEmit` | **PASS (0 errors)** | Zero compiler warnings or errors |
| **Production Build** | `npm run build` | **PASS** | Clean Next.js 15.5 production bundle |

---

## 8. Defect Closure Matrix (W01–W18)

| ID | Finding | Status | Verification Evidence |
| :--- | :--- | :---: | :--- |
| **W01** | Outdated matching timestamps ranked current | **PASS** | `evaluateWorldModelFreshness` enforces policy; `computeComparableCohortRanks` excludes stale dominant timestamps (`step6-corrective-closure.test.ts:32-94`). |
| **W02** | Missing timestamp allowed in comparison | **PASS** | `calculateCityComparison` rejects missing timestamps with structured reason (`step6-corrective-closure.test.ts:98-115`). |
| **W03** | Incompatible data still yields numerical verdict | **PASS** | `calculateCityComparison` returns `comparable: false` with `null` for all ratios, multipliers, differentials, and winner labels (`step6-corrective-closure.test.ts:117-159`). |
| **W04** | AQI ratio used as toxicity ratio | **PASS** | Replaced with true PM2.5 mass concentration ratio; verdict removes all toxicity claims (`step6-corrective-closure.test.ts:163-186`). |
| **W05** | Missing model provenance in CityShootout | **PASS** | `CityShootoutProps` updated with genuine provenance; winner badges suppressed on incompatible domains (`step6-corrective-closure.test.ts:273-302`). |
| **W06** | Broad coordinate tolerance | **PASS** | `checkCoordinateMismatch` enforces $0.8^\circ$ CAMS grid limit; flags missing metadata and swapped orders (`step6-corrective-closure.test.ts:306-348`). |
| **W07** | Missing source units accepted | **PASS** | `parseBatchTelemetryResponse` verifies $\mu\text{g/m}^3$ units; rejects unsupported units (`step6-corrective-closure.test.ts:352-383`). |
| **W08** | Invalid data entering cohort | **PASS** | Negative, null, or derived AQI excluded from cohort; standard competition ranking `1224` applied (`step6-corrective-closure.test.ts:387-434`). |
| **W09** | Missing model timestamp shown Live | **PASS** | `WorldDataExplorer` renders `'Model valid time unavailable'` instead of `'Live'` (`step6-corrective-closure.test.ts:438-452`). |
| **W10** | Saved comparisons deduplicated by name | **PASS** | Composite geographic key disambiguates same-name cities across countries (`step6-corrective-closure.test.ts:457-483`). |
| **W11** | Saved snapshot not fully restored | **PASS** | Snapshot restoration mode preserves recorded values and timestamp without live overwrite (`step6-corrective-closure.test.ts:487-506`). |
| **W12** | Search request race tests insufficient | **PASS** | Asynchronous race condition test confirms obsolete queries cannot overwrite newer state (`step6-corrective-closure.test.ts:510-536`). |
| **W13** | Geographic deduplication tests insufficient | **PASS** | Dedicated multi-jurisdiction deduplication test confirms separate retention (`step6-corrective-closure.test.ts:457-483`). |
| **W14** | Geocoding country code not preserved | **PASS** | Uppercase `countryCode` preserved on `GeocodedLocation` (`step6-corrective-closure.test.ts:540-562`). |
| **W15** | Cache TTL confused with model freshness | **PASS** | 24-hour-old model data is flagged `stale` regardless of cache retrieval age (`step6-corrective-closure.test.ts:566-577`). |
| **W16** | Inaccurate scientific comparison claims | **PASS** | Biological toxicity claims removed; PM2.5 physical mass ratio enforced (`step6-corrective-closure.test.ts:163-221`). |
| **W17** | Browser integration not verified | **PASS** | Responsive drawer, filters, shootout, and saved comparisons verified across desktop and mobile. |
| **W18** | Live API behavior | **PASS** | Live batch API verified for 5 global cities with matching coordinates and valid timestamps. |

---

## 9. Controlled Step 07 Roadmap Handoff Assessment

### 9.1 Roadmap Audit Findings
An exhaustive scan of the repository (`README.md`, `docs/`, `package.json`, commit history) confirms that **no authoritative document in the codebase currently defines the formal specifications for Steps 7 through 24**.

In strict accordance with Section 23 of the roadmap directive:
> *"If the authoritative roadmap does not define Step 7 clearly: Do not invent its scope. Report the missing roadmap definition and deliver a proposed Step 7 implementation plan for review."*

### 9.2 Proposed Step 07 Scope for User Review
Based on Avir's architectural progression (Step 1 Core Telemetry $\rightarrow$ Step 2 Microclimate $\rightarrow$ Step 3 Temporal Invariants $\rightarrow$ Step 4 Ground Stations $\rightarrow$ Step 5 Personal Sensors $\rightarrow$ Step 6 Global Comparisons), Step 7 logically advances into **Atmospheric Dispersion Modeling & Diurnal Thermal Inversion Forecasting**:

1. **Title**: Step 07 — Diurnal Boundary Layer Dynamics, Thermal Inversion Forecasting & Street-Level Atmospheric Dispersion Modeling.
2. **Core Capabilities**:
   - Boundary layer height ($\text{BLH}$) numerical integration from ECMWF planetary boundary layer data.
   - Ground-level trapping index during nighttime radiative cooling events.
   - Safe outdoor ventilation windows based on solar convective mixing.
   - Integration with Avir's existing `Routine Shifter` and `Diurnal Safe Hours` features.
3. **Branching & Dependency Strategy**:
   - Step 7 can branch cleanly from `main` or build upon `feat/avir-06-global-telemetry-comparisons` once PR #13 is reviewed and merged.
   - Zero unauthorized code execution for Step 7 will commence until explicit user confirmation of scope and merge sequencing is provided.
