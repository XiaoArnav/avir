# Stage 2 Verification Report: CPCB/OpenAQ Source Integrity & Geographic Accuracy

Date: 2026-11-29  
Branch: `fix/stage2-source-distance-integrity`  
Status: Ready for independent review (not auto-merged)

## 1. Root Causes Found

1. **Unknown-distance & missing/invalid-coordinate acceptance (`src/services/source-control/source-resolution-modes.ts`)**:
   - `resolveAutomaticMode` accepted `s.distanceKm === null || s.distanceKm <= 35` for both official ground stations and OpenAQ stations, permitting stations with unknown distances or missing coordinates to qualify as local observations.
   - `resolveOfficialGroundMode` and `resolveOpenAqMode` performed no geographic distance or coordinate validation at all, and could accept OpenAQ `isMonitor: true` monitors (`sourceKind === 'official_ground_station'`) outside 25 km or inside the CPCB Official Ground mode.
   - `source-resolution-modes.ts` trusted stored `distanceKm` values without checking active location coordinates (`metrics.latitude`/`metrics.longitude`), allowing stale or conflicting distances across cities to pass radius checks and `specific_station` bounds (`>100 km`).
2. **Inconsistent provider radius bounds (`src/services/source-control/source-resolution-modes.ts`, `src/config/environmental-sources.ts`)**:
   - Automatic selection applied `35 km` to OpenAQ instead of OpenAQ v3's documented `25 km` (`25,000 m`) maximum search radius.
3. **Empty coordinate Null-Island & range bugs in provider normalizers (`cpcb-provider.ts`, `openaq-provider.ts`)**:
   - `cpcb-provider.ts` converted empty/whitespace strings (`""`, `"   "`) via `Number("") === 0` into `(0, 0)` Gulf of Guinea coordinates.
   - `openaq-provider.ts` did not enforce `-90..90` / `-180..180` WGS84 coordinate bounds before computing `calculateDistanceKm` in `parseOpenAqLocation` and sorting candidates.
4. **Catalog stale/untimed availability inflation (`src/services/source-control/source-catalog.ts`)**:
   - `toSourceCatalogItem` marked records with `status: 'stale'` (when `pm25 !== null`) or `status: 'active'` with untimed/stale PM2.5 as `isAvailable: true`.
5. **UI distance & freshness disclosures (`MultiSourceInspectorModal.tsx`, `EarthCommandCenter.tsx`)**:
   - `MultiSourceInspectorModal` rendered `'0 km'` for `distanceKm: null` in the source comparison table and `0 km` in Section B for atmospheric grid models, `'Local'` in the specific-station `<select>` dropdown for unknown-distance stations, and included non-station unconfigured/error placeholders in selectable station options.
   - `EarthCommandCenter` displayed `metrics.timestamp` (model clock) on `CompactCityCard` instead of the active resolved physical station's `observedAt` or `'Unavailable'` when the selected mode had no eligible feed.

## 2. Exact Files Changed

- [src/config/environmental-sources.ts](file:///Users/polymath/Antigravity/H2S/Prompt%20Wars/src/config/environmental-sources.ts) — Added shared selection radius constants `CPCB_SELECTION_RADIUS_KM = 35`, `OPENAQ_SELECTION_RADIUS_KM = 25`, `SPECIFIC_STATION_MAX_RADIUS_KM = 100`.
- [src/services/source-control/source-eligibility.ts](file:///Users/polymath/Antigravity/H2S/Prompt%20Wars/src/services/source-control/source-eligibility.ts) — Added `verifySourceDistance` and `withVerifiedDistance` using `calculateDistanceKm`.
- [src/services/source-control/source-resolution-modes.ts](file:///Users/polymath/Antigravity/H2S/Prompt%20Wars/src/services/source-control/source-resolution-modes.ts) — Enforced 35 km CPCB / 25 km OpenAQ / coordinate verification across Automatic, Official Ground, OpenAQ, and Specific Station modes while preserving explicit opt-in fallback and specific-station overrides.
- [src/services/source-control/source-catalog.ts](file:///Users/polymath/Antigravity/H2S/Prompt%20Wars/src/services/source-control/source-catalog.ts) — Derived `isAvailable` and `isStale` via `hasValidPm25` and `evaluateMeasurementEligibility`.
- [src/services/providers/cpcb-provider.ts](file:///Users/polymath/Antigravity/H2S/Prompt%20Wars/src/services/providers/cpcb-provider.ts) — Prevented empty/`NA`/`null` coordinate strings from coercing to `0`.
- [src/services/providers/openaq-provider.ts](file:///Users/polymath/Antigravity/H2S/Prompt%20Wars/src/services/providers/openaq-provider.ts) — Rejected out-of-range latitude/longitude coordinates before Haversine computation.
- [src/components/MultiSourceInspectorModal.tsx](file:///Users/polymath/Antigravity/H2S/Prompt%20Wars/src/components/MultiSourceInspectorModal.tsx) — Displayed `'Unverified'` / `'Distance unverified'` instead of `'0 km'` / `'Local'`, `'Grid (~11 km)'` for CAMS atmospheric models, updated mode copy (`25km`), and filtered diagnostic placeholders from specific-station options.
- [src/components/home/EarthCommandCenter.tsx](file:///Users/polymath/Antigravity/H2S/Prompt%20Wars/src/components/home/EarthCommandCenter.tsx) — Synchronized `CompactCityCard` freshness label with `resolvedSource.observedAt` / `resolvedSource.validAt` and `'Unavailable'` status.
- [tests/unit/stage2-source-distance-integrity.test.tsx](file:///Users/polymath/Antigravity/H2S/Prompt%20Wars/tests/unit/stage2-source-distance-integrity.test.tsx) — Added 16 regression tests covering geographic radii, unknown/conflicting distances, location isolation, provider normalization, catalog freshness, and UI disclosures.
- [e2e/source-control.spec.ts](file:///Users/polymath/Antigravity/H2S/Prompt%20Wars/e2e/source-control.spec.ts) — Added Test 5 enforcing 25 km / 35 km / null-distance rejection and mobile (`390x844`) Source Control verification.

## 3. Geographic Selection Policies

| Source Category | Selection Policy | Unknown Distance (`null`) | Coordinates Missing / Invalid |
|---|---|---|---|
| CPCB / Official Regulatory Ground (`providerId !== 'openaq'`) | Within **35 km** (`CPCB_SELECTION_RADIUS_KM`) via verified Haversine & stored distance | Rejected in `automatic` and `official_ground` | Rejected in `automatic` and `official_ground` |
| OpenAQ v3 Network (`providerId === 'openaq'`) | Within **25 km** (`OPENAQ_SELECTION_RADIUS_KM`) regardless of `isMonitor` | Rejected in `automatic` and `openaq` | Rejected in `automatic` and `openaq` |
| Atmospheric Model (ECMWF CAMS) | Spatial grid model (`Grid (~11 km)`), selected as Automatic tier 3 or explicit `atmospheric_model` / opted-in fallback | N/A (grid cell) | N/A |
| Specific Station (`specific_station`) | Preserves user selection up to **100 km** (`SPECIFIC_STATION_MAX_RADIUS_KM`), recomputes distance against active city if stored conflicts | Allowed with explicit `"station distance is unverified"` disclosure (not represented as local coverage) | Disclosed as unverified distance unless `>100 km` |

## 4. Provider Documentation Consulted

- **OpenAQ API v3 Geospatial Query Docs** (`docs.openaq.org/using-the-api/geospatial`): `coordinates` (`latitude,longitude`) and `radius` (`meters`, **max 25,000 m = 25 km**, default `1,000 m`); radii above `25,000` return HTTP 422.
- **OGD Platform India / CPCB CAAQMS Dataset** (`data.gov.in` resource `3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69`): station/pollutant rows normalized with strict IST (`+05:30`) parsing, documented MoEFCC statutory units (`ug/m3`, `co` in `mg/m3`), and application 35 km nearby selection policy (distinct from API route max query parameter `CPCB_MAX_SEARCH_RADIUS_KM = 50`).

## 5. Before / After Behavior Examples

- **Before**: OpenAQ reference monitor at `28 km` or CPCB station with `distanceKm: null` qualified in Automatic mode, and `MultiSourceInspectorModal` comparison table showed `0 km` for `distanceKm: null`.
- **After**: Both are excluded from Automatic and provider-specific nearby modes; Automatic cleanly resolves to ECMWF CAMS model (`Open-Meteo Atmospheric Chemistry`), `openaq` reports `"outside the documented 25 km selection radius"`, and the comparison table labels unknown distances `Unverified` and CAMS `Grid (~11 km)`.
- **Before**: Empty string `latitude: ""` in CPCB OGD rows parsed to `0° N` (Null Island); Bengalurean station carrying stale `distanceKm: 4.5` passed Delhi checks.
- **After**: Empty strings parse as `null`, and `verifySourceDistance` recomputes `1740 km` from station coordinates against Delhi center, rejecting it across Automatic, Official Ground, OpenAQ, and Specific Station (`>100 km`).

## 6. New Regression Tests (RED → GREEN Verified)

- **RED baseline before fixes**: `12 / 16` tests failed in `tests/unit/stage2-source-distance-integrity.test.tsx` (`tsc --noEmit` exit `0`), and Test 5 failed in `e2e/source-control.spec.ts` showing `Out-of-Radius OpenAQ Monitor` (`28 km`) selected on Delhi's card.
- **GREEN after fixes**:
  - `tests/unit/stage2-source-distance-integrity.test.tsx`: **16 / 16 passed**
  - `e2e/source-control.spec.ts` (Tests 1–5): **5 / 5 passed**

## 7. Verification Commands & Results (Post-Final Edit)

| Command | Result |
|---|---|
| `git diff --check` | Passed (0 issues) |
| `npm run lint` | Passed (0 errors, 0 warnings) |
| `npx tsc --noEmit` | Passed (0 errors) |
| `npx vitest run` | **109 test files / 1,574 tests passed** |
| `npm run build` | Passed (`next build`) |
| `npm run test:e2e -- --workers=2` | **39 / 39 Playwright Chromium tests passed** (`2.0m`) |
| Live Browser QA (`http://localhost:3000`) | Verified reset/onboarding, Delhi-NCR → Bengaluru switch, all 5 Source Control modes + fallback toggle, mobile `390x844` layout (`0` horizontal page overflow, `0` React/runtime errors) |

## 8. Remaining Limitations

- Live upstream CPCB (`DATA_GOV_IN_API_KEY`) and OpenAQ v3 (`OPENAQ_API_KEY`) API credentials are not configured in the local/CI sandbox; live-key provider responses were verified using deterministic mocked HTTP fixtures rather than real external API calls. Local unauthenticated browser QA verified `"OPENAQ_API_KEY is not configured..."` and `"awaiting continuous live telemetry"` states cleanly.
- Local `next start` emits a non-blocking console error for `/_vercel/insights/script.js` returning HTML outside Vercel's edge runtime (unrelated to Stage 2).

## 9. Rollback Instructions

Revert the Stage 2 PR commit or cherry-pick revert on `main` (`git revert <merge-commit-sha> -m 1`) without touching Stage 1 (`ccb6003`), AQI math, or globe infrastructure.

## 10. Review Readiness

All acceptance criteria and regression gates pass. Ready for independent ChatGPT review (PR intentionally left open and unmerged).
