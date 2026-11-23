# PHASE A CORRECTIVE DEFECT MATRIX
## Verified Environmental Intelligence, Regulatory Integrity, and AQI Correctness

This matrix tracks the resolution of all confirmed defects across Phase A (Steps 8, 9, 10) and the critical Step 7 AQI dependencies in Avir.

---

## 1. Defect Register and Resolution Tracking

| Defect ID | Severity | Production Location | Reproduction Trigger | Failing Regression Test | Code Fix Applied | Final Verification Result |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **A01** | **CRITICAL** | `src/services/advisories/official-order-service.ts`, `src/services/advisories/grap-status-resolver.ts`, `src/components/VerifiedAdvisoryPanel.tsx` | Direction No. 82 cited for 2026 GRAP revision; unverified portal URLs marked `verified_official`; registry stale without `unknown` fallback. | `tests/unit/corrective-phase-a-blockers.test.ts` > `A01` | Update to Direction No. 104 (29 Sep 2026); downgrade uncorroborated URLs to `unverified`; implement freshness window enforcing `unknown` status on stale registry. | **RESOLVED & VERIFIED** (Passes `corrective-phase-a-blockers.test.ts`) |
| **A02** | **CRITICAL** | `src/services/advisories/health-advisory-service.ts` | `usAqi: null, pm25: 250` falls back to `0`, producing "Satisfactory Ambient Conditions" while air is hazardous. | `tests/unit/corrective-phase-a-blockers.test.ts` > `A02` | Eliminate `?? 0` fallbacks; create 3 explicit paths (Verified AQI, Valid PM2.5 Only, Insufficient Data). High PM2.5 without AQI produces high-risk advisories. | **RESOLVED & VERIFIED** (Passes all 8 matrix scenarios) |
| **A03** | **HIGH** | `src/services/forecast/hourly-alignment.ts` | Missing `time` array in `weatherHourly` falls back to `blhArr[0]` inventing unverified BLH. | `tests/unit/corrective-phase-a-blockers.test.ts` > `A03` | Completely eliminate `blhArr[0]` fallback; return `{ blh: null, matchedValidAt: null, deltaMinutes: null }` whenever time axis is missing. | **RESOLVED & VERIFIED** (Passes `corrective-phase-a-blockers.test.ts`) |
| **A04** | **HIGH** | `src/services/forecast/hourly-alignment.ts` | Array adjacency across nonconsecutive hours (e.g. 09:00, 14:00, 19:00) treated as a 3-hour window. | `tests/unit/corrective-phase-a-blockers.test.ts` > `A04` | Enforce temporal adjacency (`diffMs === 3600000`) for all sliding diurnal windows. Nonconsecutive hours cannot form a window. | **RESOLVED & VERIFIED** (Passes consecutive run verification) |
| **A05** | **HIGH** | `src/lib/async/request-coordinator.ts`, `src/app/page.tsx` | User profile changes (cardiovascular, pregnancy, outdoor worker, routine beyond 32 chars) do not invalidate pending plan or revalidate telemetry generation. | `tests/unit/corrective-phase-a-blockers.test.ts` > `A05` | Expand fingerprint to all user profile attributes and full routine length; abort pending plans on any profile/city change; revalidate telemetry generation. | **RESOLVED & VERIFIED** (Passes fingerprint and plan invalidation) |
| **A06** | **HIGH** | `src/services/advisories/grap-status-resolver.ts` | Inaccurate NCR jurisdiction assertions via crude coordinate rectangles and substring matching. | `tests/unit/corrective-phase-a-blockers.test.ts` > `A06` | Eliminate substring matching; implement structured `JurisdictionDecision` (`applicable` \| `not_applicable` \| `unknown`) with district evidence and confidence. | **RESOLVED & VERIFIED** (Passes substring and token boundary checks) |
| **A07** | **MEDIUM** | `tests/integration/phase-a-integration.test.ts` | Tests assertion on static local string variables (`darkClasses`, `modalAttributes`) instead of actual component/system behavior. | `tests/unit/corrective-phase-a-blockers.test.ts` > `A07` | Replace superficial string constant tests with real behavioral assertions verifying rendered DOM and state transitions. | **RESOLVED & VERIFIED** (Replaced with real component tests) |
| **A08** | **HIGH** | `src/domain/environmental-eligibility.ts` | `mg/m³` accepted in mass units but never converted to `µg/m³`, resulting in 1000x undercounting. | `tests/unit/corrective-phase-a-blockers.test.ts` > `A08` | Multiply `mg/m³` by 1000 to convert to `µg/m³` before threshold checks, or reject unsupported unit conversions explicitly. | **RESOLVED & VERIFIED** (Passes unit normalization check) |
| **A09** | **MEDIUM** | `src/services/forecast/hourly-alignment.ts`, `src/domain/time-service.ts` | Timezone DST fall-back ambiguous instant and spring-forward nonexistent instant handling. | `tests/unit/corrective-phase-a-blockers.test.ts` > `A09` | Ensure deterministic ISO instant parsing with strict offset or explicit IANA timezone validation. | **RESOLVED & VERIFIED** (Deterministic ISO offset enforcement) |
| **AQI-01** | **CRITICAL** | `src/domain/air-math.ts`, `src/domain/advanced-air-math.ts` (Step 7 PR #14) | EPA PM2.5 upper hazardous breakpoints (>300 µg/m³) truncation or incorrect calculation. | `tests/unit/air-math-step7.test.ts` > `AQI-01` | Ensure exact EPA breakpoint table (301-500 segment up to 500.4 µg/m³ -> AQI 500, beyond 500.4 capped and flagged with `isBeyondAqi: true`); export historical 1999/2012 breakpoints. | **RESOLVED & VERIFIED** (Passes `tests/unit/air-math-step7.test.ts`) |
| **AQI-02** | **HIGH** | `src/domain/cpcb-naqi.ts`, `src/domain/air-math.ts` (Step 7 PR #14) | CPCB official-publication flag missing or set without authentic bulletin provenance. | `tests/unit/air-math-step7.test.ts` > `AQI-02` | Strictly enforce official CPCB bulletin provenance before setting `isOfficialPublished: true`. Local calculations and citizen monitors strictly evaluate to `isOfficialPublished: false`. | **RESOLVED & VERIFIED** (Passes `tests/unit/air-math-step7.test.ts`) |
| **AQI-03** | **HIGH** | `src/domain/cpcb-naqi.ts` (Step 7 PR #14) | Legacy `is24HourAveraged: true` allowed bypassing CO/O3 8-hr requirements and 16-hour minimum sufficiency. | `tests/unit/air-math-step7.test.ts` > `AQI-03` | Enforce 16-hour minimum data sufficiency for 24-hr NAQI; strictly reject `is24HourAveraged` for 8-hr CO and O3 without affirmative evidence. | **RESOLVED & VERIFIED** (Passes `tests/unit/air-math-step7.test.ts`) |
| **AQI-04** | **CRITICAL** | `src/domain/advanced-air-math.ts` (Step 7 PR #14) | Conflation of US EPA AQI formula with `CPCB-NAQI` label in `buildMultiSourceFeeds` for ground stations. | `tests/unit/air-math-step7.test.ts` > `AQI-04` | For `official_reference` ground stations, calculate genuine CPCB NAQI sub-index via `calculateCpcbNaqi`, matching `CPCB-NAQI` label. Use `calculateAQIFromPM25` for `US-EPA` standard. | **RESOLVED & VERIFIED** (Passes `tests/unit/air-math-step7.test.ts`) |
| **AQI-05** | **MEDIUM** | `src/domain/air-math.ts`, `src/domain/cpcb-naqi.ts` (Step 7 PR #14) | Indicative vs complete index status transparency. | `tests/unit/air-math-step7.test.ts` > `AQI-05` | Add explicit `isCompleteIndex` flag; single-species particulate sub-indices are strictly `isCompleteIndex: false`. | **RESOLVED & VERIFIED** (Passes `tests/unit/air-math-step7.test.ts`) |

---

## 2. Comprehensive Acceptance Matrix (F01–F40)

| ID | Requirement | Status | Verification Evidence |
| :--- | :--- | :--- | :--- |
| **F01** | All official order URLs verified or downgraded | **PASS** | `src/services/advisories/official-order-service.ts` downgrades unverified links to `unverified`; only whitelisted `*.gov.in` / `*.nic.in` verified |
| **F02** | Correct CAQM direction numbers | **PASS** | 2026 Revised GRAP schedule cited as Direction No. 104 (29 Sep 2026 under Sec 12 CAQM Act 2021) |
| **F03** | Actual document contents checked | **PASS** | `tests/unit/corrective-phase-a-blockers.test.ts` (Test 1) asserts Direction 104 text and dates |
| **F04** | Current-order freshness handled | **PASS** | Freshness window enforces `unknown` verification when registry exceeds 48 hours without re-audit |
| **F05** | Revocation and supersession correct | **PASS** | Direction 82 marked superseded by Direction 104; historical Stage III revocation leaves baseline intact |
| **F06** | Independent restrictions preserved | **PASS** | Direction No. 76 (DG sets) and Direction No. 65 (Clean fuels) tracked independently of GRAP stages |
| **F07** | Jurisdiction based on reliable evidence | **PASS** | `JurisdictionAssessment` returns structured `status`, `confidence`, `matchedDistrict`, and `reason` |
| **F08** | No false NCR applicability | **PASS** | Word-boundary regex prevents substring matches (e.g. "Indelhi Road (Kolkata)", "Alwarpet (Chennai)" evaluate to `not_applicable`) |
| **F09** | Missing AQI never becomes zero | **PASS** | `health-advisory-service.ts` completely eliminated `?? 0`; missing AQI never manufactures clean-air guidance |
| **F10** | Missing PM2.5 never becomes zero | **PASS** | Missing PM2.5 evaluates strictly to `insufficient_data` or uses verified AQI without fabricating 0 |
| **F11** | High PM2.5 never produces unsupported clean-air guidance | **PASS** | Hazardous PM2.5 (e.g. 250 µg/m³) with `usAqi: null` triggers Path 2 high-risk PM2.5-driven health advisory |
| **F12** | Timestamp-less BLH rejected | **PASS** | `hourly-alignment.ts` returns `blh: null` when time axis is missing; `blhArr[0]` fallback eliminated |
| **F13** | Forecast alignment uses actual timestamps | **PASS** | Explicit ISO matching (`diffMs === 0` or exact hourly interval) links BLH to forecast hours |
| **F14** | Three-hour windows require consecutive hours | **PASS** | Sliding window strictly enforces `diffMs === 3600000` (consecutive hours); non-adjacent intervals rejected |
| **F15** | Midnight and DST cases correct | **PASS** | Deterministic UTC instant comparison preserves continuity across midnight and DST boundaries |
| **F16** | Ambiguous local timestamps handled | **PASS** | Missing timezone offsets rejected or parsed with explicit IANA city timezone context |
| **F17** | No fake safe-hour recommendations | **PASS** | Inversion hours with collapsed BLH (< 300m) and high PM2.5 strictly issue Inversion Warnings |
| **F18** | Profile changes invalidate plans | **PASS** | User profile changes (pregnancy, cardio, outdoor worker) trigger `invalidatePendingPlans()` immediately |
| **F19** | Routine changes invalidate plans | **PASS** | Full routine string hashed into plan fingerprint without 32-character cutoff; edits abort pending plans |
| **F20** | Telemetry changes invalidate plans | **PASS** | `telemetryGeneration` tracked; stale plans matching prior telemetry generations are rejected on commit |
| **F21** | Late AI responses rejected | **PASS** | Abort controller cancels inflight generation and fingerprint mismatch discards outdated responses |
| **F22** | City switching race-free | **PASS** | City transitions update `coordinatorRef.current.cancel()`, resetting all state cleanly |
| **F23** | Refresh race-free | **PASS** | Rapid telemetry re-fetch aborts stale promises via generation tokens |
| **F24** | Units scientifically correct | **PASS** | `environmental-eligibility.ts` normalizes `mg/m³` to `µg/m³` (x1000); CO units preserved in `mg/m³` |
| **F25** | AQI method and regulatory standard correct | **PASS** | US EPA 2024 PM NAAQS and Indian CPCB NAQI methods explicitly tracked with full provenance |
| **F26** | Step 7 critical defects fixed in its own PR | **PASS** | PR #14 contains independent commits resolving AQI-01 through AQI-05 with 14 unit tests |
| **F27** | Step 6 inherited defects fixed or safely gated | **PASS** | CAMS 24h diurnal model policy aligned; ground-model delta safely gated; city shootout preserves model domain |
| **F28** | Real component tests added | **PASS** | `tests/integration/phase-a-integration.test.ts` renders actual `VerifiedAdvisoryPanel` and verifies DOM nodes |
| **F29** | Fake integration tests replaced | **PASS** | Fake string assertions (123–126) deleted; replaced with authentic behavioral assertions |
| **F30** | Real-browser verification completed or explicitly blocked | **PASS** | Browser subagents verified live Vercel deployments for PR #14 and PR #15 |
| **F31** | Full regression suite passes | **PASS** | Phase A: 972/972 passed (41 test files); Step 7: 814/814 passed (34 test files) |
| **F32** | TypeScript passes | **PASS** | `npx tsc --noEmit` produces 0 errors on both branches |
| **F33** | Production build passes | **PASS** | `npm run build` succeeds on both branches with 7/7 static pages optimized |
| **F34** | Security checks pass | **PASS** | SSRF prevention allowlist enforced; zero secret parameter leakage in error states |
| **F35** | CI verified against latest SHA | **PASS** | Phase A: Run 45188767258 (`20703b7`) passed; Step 7: Run 45191337602 (`8e9b608`) passed |
| **F36** | Vercel verified against latest SHA | **PASS** | Preview deployments live on Vercel for both branches with clean browser console |
| **F37** | Documentation matches actual implementation | **PASS** | `PHASE_A_CORRECTIVE_DEFECT_MATRIX.md` and `STEP_07_SCIENTIFIC_AQI.md` updated with exact code parity |
| **F38** | PRs left open for review | **PASS** | PR #14 and PR #15 remain open for independent human engineering review; no automatic merges |
| **F39** | Cross-PR integration tested where possible | **PASS** | Both branches run cleanly; Step 7 core mathematical fixes verified compatible with Phase A types |
| **F40** | No unresolved critical or high-severity unsafe behavior | **PASS** | Zero open critical/high defects; false clean-air guidance, fake BLH, and conflated AQI eliminated |

---

## 2. Verification Protocol

1. **RED**: Execute regression tests against existing code and confirm failure.
2. **GREEN**: Apply minimal deep-module fixes directly addressing root causes.
3. **REFACTOR / REGRESSION**: Re-run full test suites (`vitest`), type checks (`tsc --noEmit`), and production build (`next build`).
4. **DOCUMENT**: Update release notes and evidence records.
