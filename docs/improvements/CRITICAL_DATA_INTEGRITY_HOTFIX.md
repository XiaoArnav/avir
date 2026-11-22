# Critical Production Data Integrity Hotfix
## Zero Fabrication, Ground-Station Truth, Source Provenance, and Regulatory Accuracy

**Document Reference:** `docs/improvements/CRITICAL_DATA_INTEGRITY_HOTFIX.md`  
**Target Repository:** `https://github.com/XiaoArnav/avir`  
**Production App:** `https://avir-blue.vercel.app/`  
**Branch:** `fix/avir-critical-data-integrity-hotfix`  
**Pull Request Title:** `fix(integrity): eliminate synthetic ground telemetry, false source consensus and regulatory claims`  
**Author Attribution:** `XiaoArnav <322868724+XiaoArnav@users.noreply.github.com>`

---

## 1. Baseline Main Branch Commit SHA
- **Baseline Commit:** `2ff6bed691ab090d261e5c996d78af8a8143b481` (on `main`)
- **Status of Prior PRs:**
  - PR #2 (`fix/avir-01-telemetry-contract`): Merged into `main`.
  - PR #3 (`feat/avir-live-ground-stations-and-calibration`): Merged into `main`.
  - PR #4 (`fix/avir-02-ui-data-states`): Merged into `main`.

---

## 2. Confirmed Problems Identified in Merged Codebase
A forensic scientific and data-integrity audit of `main` at `2ff6bed` revealed critical violations of Avir's core zero-fabrication directive:

1. **Synthetic Ground-Station Generation**:
   - `src/services/ground-station-service.ts` derived official station measurements using fixed multipliers on atmospheric models:
     - `pm25 = options.modelPm25 * 1.15`
     - `pm10 = options.modelPm25 * 1.6`
   - Stations were stamped with `new Date().toISOString()`, presenting unmeasured numbers as fresh ground truth.
   - Ground delta calculations and live pulsing badges were shown for stations that had never connected to a live physical sensor.

2. **Fabricated Relative Humidity in Calibration**:
   - `src/domain/calibration-math.ts` fell back to `const rh = rawRh ?? 50;` when ambient relative humidity was missing.
   - In dry winter smog (Delhi RH ~25%) or humid fog (RH ~85%), applying a polynomial with a fictitious 50% RH created unscientific, misleadingly altered PM2.5 concentrations.

3. **False Multi-Source Consensus**:
   - `src/domain/advanced-air-math.ts` cloned a single Open-Meteo telemetry response across 5 source cards (`Open-Meteo (CAMS)`, `GFS Atmospheric`, `CPCB National`, `US EPA Standard`, `OpenAQ Verified`).
   - The UI claimed a "98% Multi-Source Agreement" and TopNav promised "Compare 5 Sources", masking the reality of a single active atmospheric model.

4. **Worldwide Telemetry Fallbacks**:
   - `src/services/world-telemetry-service.ts` injected a hardcoded `{ usAqi: 75, pm25: 22 }` whenever a city query or API failed.
   - Falsely ranked failing queries in global lists while obscuring authentic zero-clean air locations.

5. **Unsupported Regulatory Claims**:
   - `src/domain/air-math.ts` classified GRAP stages as statutory government orders without checking official CAQM gazette notifications.
   - `src/domain/cpcb-naqi.ts` presented 2-pollutant (PM2.5/PM10) sub-indices as official statutory CPCB NAQI without qualifying the missing 6 criteria pollutants.

---

## 3. Modified Files

| File | Nature of Correction |
| :--- | :--- |
| `src/domain/types.ts` | Added `GroundStationState`, `cpcbStatus`, `observedAt`, `retrievedAt`, `isSingleModelActive`, and strict nullability types. |
| `src/domain/calibration-math.ts` | Removed `rawRh ?? 50` fallback. Calibration is strictly skipped (`applied: false`) if RH is unavailable or outside [1, 100]. |
| `src/services/ground-station-service.ts` | Removed `1.15x` and `1.6x` multipliers. Stations without active physical feeds marked `registry_only` with `pm25: null`, `pm10: null`. Delta returns `null`. |
| `src/services/telemetry-service.ts` | Prohibited RH fallback to 50 when querying ground stations. Emitted `cpcbStatus: 'indicative_subindex'`. |
| `src/domain/advanced-air-math.ts` | Eliminated 5-source cloning. Emits primary model + genuine ground sensor (if any) + derived regulatory calculations. Consensus requires $\ge 2$ independent sources. |
| `src/services/world-telemetry-service.ts` | Removed synthetic `{ usAqi: 75, pm25: 22 }` fallback. Nulls preserved and pushed to bottom of rankings with `rank: null`. Clean `0` values preserved. |
| `src/domain/air-math.ts` | Refactored GRAP stages as `Numerical Threshold (Indicative)` with `isStatutoryOrderVerified: false`. Returns `Unavailable` when AQI is null. |
| `src/domain/cpcb-naqi.ts` | Explicitly marked PM2.5/PM10 calculation as `indicative_subindex` with `isStatutoryCompliant: false`. |
| `src/components/GroundStationBadge.tsx` | Suppressed live pulsing indicators and delta pill when station has no real sensor feed. Added "Live Readings Unavailable" state. |
| `src/components/MultiSourceInspectorModal.tsx` | Updated modal to describe single primary model without synthetic consensus percentages or fabricated feeds. |
| `src/components/TopNav.tsx` | Renamed "Compare 5 Sources" to "Data Sources & Quality". |
| `src/components/AtmosphereHero.tsx` | Updated CPCB sub-index label to "Indicative CPCB Sub-Index" to reflect statutory reality. |
| `src/components/WorldDataExplorer.tsx` | Updated cards and table views to display `--` and "Unavailable" when AQI or PM2.5 is null. |
| `tests/integration/critical-data-integrity-hotfix.test.ts` | Created comprehensive 30-test regression suite covering all hotfix areas. |
| `tests/unit/*.test.ts` | Updated unit tests to align with zero-fabrication invariants across all domains. |

---

## 4. Removed Multipliers & Synthetic Ground Generation
In `src/services/ground-station-service.ts`:
- **Deleted:**
  ```typescript
  // DELETED FABRICATION:
  pm25: Math.round(options.modelPm25 * 1.15 * 10) / 10,
  pm10: Math.round(options.modelPm25 * 1.6 * 10) / 10,
  timestamp: new Date().toISOString()
  ```
- **Replaced With:**
  ```typescript
  // HONEST STATION REGISTRY OBSERVATION:
  pm25: null,
  pm10: null,
  observedAt: null,
  retrievedAt: new Date().toISOString(),
  stationState: 'registry_only'
  ```
- Ground model delta calculation `calculateGroundModelDelta` now strictly returns `null` if either the ground observation or atmospheric model is null or undefined.

---

## 5. Ground-Station Availability Model
Avir now defines four unambiguous physical states for ground stations:
- `'registry_only'`: The station exists in official regulatory directories (e.g., CPCB CAAQMS list) and coordinates are verified, but no real-time telemetry API connection is currently authenticated. Measurements are strictly `null`.
- `'live_observation'`: An authenticated physical sensor feed is actively reporting verified measurements within freshness limits ($\le 120$ minutes).
- `'stale_observation'`: A previously authenticated physical sensor feed has not updated within freshness thresholds. Original measurement timestamp is preserved.
- `'measurement_unavailable'`: Station is offline, undergoing maintenance, or reporting sensor malfunction.

---

## 6. Sensor.Community / EPA Barkjohn Calibration Safeguards
In `src/domain/calibration-math.ts`:
- The EPA Barkjohn (2021) equation:
  $$\text{PM}_{2.5,\text{cal}} = 0.534 \times \text{PM}_{2.5,\text{raw}} - 0.0844 \times \text{RH} + 5.604$$
  requires co-located relative humidity ($\text{RH}$).
- **Safeguard:** If `rawRh === null`, `rawRh === undefined`, or `rawRh` falls outside $[1, 100]$, calibration is completely skipped:
  ```typescript
  if (rawRh === null || rawRh === undefined || isNaN(rawRh) || rawRh < 1 || rawRh > 100) {
    return {
      applied: false,
      calibratedPm25: Math.round(rawPm25 * 10) / 10,
      formulaName: 'Uncalibrated (Missing Ambient RH)',
      notes: 'EPA Barkjohn calibration requires validated ambient relative humidity. Raw PM2.5 preserved without synthetic adjustment.'
    };
  }
  ```
- The raw physical measurement is never altered with fabricated atmospheric assumptions.

---

## 7. Honest Multi-Source Model & Provider Count
In `src/domain/advanced-air-math.ts`:
- **Physical Atmospheric Models vs Derived Standards:**
  - Open-Meteo is explicitly categorized as `model_forecast`.
  - US EPA AQI and CPCB NAQI are explicitly categorized as `derived_calculation`.
  - Nearby physical sensors are categorized as `ground_observation`.
- **Single-Source Honesty:**
  - When only Open-Meteo is supplying environmental forecasts, `isSingleModelActive` is set to `true`.
  - Multi-source consensus score is set to `null` (`confidenceScorePercent: null`, `agreementLevel: 'Single Primary Provider'`).
  - Avir informs the user: *"1 atmospheric model active. Additional provider feeds (Copernicus CAMS, GFS, CPCB, OpenAQ) are planned for Step 3."*

---

## 8. Worldwide Telemetry Fallback Elimination
In `src/services/world-telemetry-service.ts`:
- When an API query fails or is unavailable:
  - `usAqi` and `pm25` are strictly set to `null`.
  - Fictitious `{ usAqi: 75, pm25: 22 }` defaults have been completely excised.
- Authentic clean air readings (`usAqi: 0`, `pm25: 0`) are fully preserved and valid.
- In global ranking tables:
  - Locations with `null` metrics are assigned `rank: null` and sorted to the bottom.
  - Active ranks ($1, 2, 3, \dots$) are reserved strictly for cities with genuine observational or modeled data.
  - Cards and tables render `--` with clear "Unavailable" badges.

---

## 9. GRAP Regulatory Classification Corrections
In `src/domain/air-math.ts`:
- GRAP (Graded Response Action Plan) stages (Stage I through IV) are now explicitly designated as **Indicative Numerical Thresholds**:
  - `stage: 'Stage I (Indicative)'` (AQI 201–300)
  - `stage: 'Stage II (Indicative)'` (AQI 301–400)
  - `stage: 'Stage III (Indicative)'` (AQI 401–450)
  - `stage: 'Stage IV (Indicative)'` (AQI > 450)
- Field `isStatutoryOrderVerified: false` is permanently attached to prevent user confusion between instantaneous AQI calculations and official CAQM gazette executive orders.
- If AQI is `null`, `getGrapStage` returns:
  `{ stage: 'Unavailable', actions: ['AQI data unavailable. Check official CAQM gazette.'], isStatutoryOrderVerified: false, benchmarkType: 'Numerical Threshold (Indicative)' }`.

---

## 10. CPCB NAQI Presentation Corrections
In `src/domain/cpcb-naqi.ts`:
- Statutory Indian National Air Quality Index (NAQI) requires a 24-hour average of at least three pollutants, with at least one being $\text{PM}_{2.5}$ or $\text{PM}_{10}$.
- Because Avir calculates a sub-index based only on particulate matter ($\text{PM}_{2.5}$ and optionally $\text{PM}_{10}$), it is formally classified as:
  ```typescript
  classification: 'indicative_subindex'
  isStatutoryCompliant: false
  subIndexNotes: 'Indicative particulate sub-index. Official statutory NAQI requires multi-pollutant 24h concentrations (SO2, NO2, CO, O3, NH3, Pb).'
  ```
- The hero UI displays this as **"Indicative CPCB Sub-Index"**.

---

## 11. Test Suite Additions & Results
A dedicated test suite was implemented in `tests/integration/critical-data-integrity-hotfix.test.ts` containing 30 targeted tests:
1. **Group A: Ground-Station Truth & Multipliers (Tests 1–6)**
   - Verified zero multiplier derivation (no 1.15x / 1.6x).
   - Verified `stationState: 'registry_only'` and `observedAt: null` for registry stations.
   - Verified `calculateGroundModelDelta` returns `null` when ground readings are missing.
   - Verified UI displays "Live Readings Unavailable" without pulsing ping.
2. **Group B: Sensor Calibration Safeguards (Tests 7–10)**
   - Verified missing RH (`null`, `undefined`) disables calibration and preserves raw value.
   - Verified out-of-range RH ($< 1$ or $> 100$) disables calibration.
   - Verified valid RH properly evaluates EPA Barkjohn equation.
3. **Group C: Multi-Source Provenance & Consensus (Tests 11–16)**
   - Verified Open-Meteo is not cloned into 5 sources.
   - Verified single-model state yields `confidenceScorePercent: null` and `'Single Primary Provider'`.
   - Verified TopNav button is labeled "Data Sources & Quality".
4. **Group D: Worldwide Data Integrity & Null Safety (Tests 17–22)**
   - Verified failed city search returns `null` AQI and PM2.5, never 75/22.
   - Verified clean air zero (`0`) is preserved and not coerced to null.
   - Verified null cities receive `rank: null` and sort to the bottom.
5. **Group E: Regulatory & GRAP Accuracy (Tests 23–26)**
   - Verified GRAP stages labeled as "Numerical Threshold (Indicative)".
   - Verified `isStatutoryOrderVerified: false`.
   - Verified null AQI yields `stage: 'Unavailable'`.
6. **Group F: CPCB Sub-Index Presentation (Tests 27–28)**
   - Verified classification is `'indicative_subindex'`.
   - Verified hero displays "Indicative CPCB Sub-Index".
7. **Group G: End-to-End System Invariants (Tests 29–30)**
   - Full live telemetry pipeline preserves zero-fabrication invariants across all outputs.

### Vitest Execution Summary
```
Test Files  18 passed (18)
     Tests  240 passed (240)
  Duration  8.09s
```

---

## 12. Build and Typecheck Verification
- **TypeScript Typecheck (`npx tsc --noEmit`):** Exited with code `0` (Zero type errors).
- **Production Build (`npm run build`):** Compiled successfully in 858ms. All 5 static/dynamic routes generated cleanly.

---

## 13. Known Limitations (Future Roadmap Boundaries)
1. **Genuine Ground-Station Telemetry Ingestion (Step 3 / Step 4)**:
   - Real-time data from CPCB CAAQMS and Sensor.Community REST APIs will be connected with authenticated API keys and OAuth tokens.
2. **Multi-Model Ensembles (Step 3)**:
   - True multi-source consensus will ingest independent APIs (Copernicus CAMS, NOAA GFS, OpenAQ) to calculate genuine agreement spreads.
3. **Official Gazette Verification**:
   - Statutory GRAP orders remain verified offline until state portal scrapers or official APIs are introduced.

---

## 14. Instructions for Human Reviewer
1. Review the diff in `src/services/ground-station-service.ts` to confirm complete removal of the 1.15x and 1.6x multipliers.
2. Verify in `src/domain/calibration-math.ts` that RH is never defaulted to 50%.
3. Inspect `src/domain/advanced-air-math.ts` to confirm the removal of the 5 synthetic source clones.
4. Run `npm test` locally to verify all 240 tests pass.
5. Inspect the "Data Sources & Quality" inspector modal in the preview deployment to confirm honest single-provider transparency.
