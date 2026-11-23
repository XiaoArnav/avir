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
| **AQI-01** | **CRITICAL** | `src/domain/air-math.ts`, `src/domain/advanced-air-math.ts` (Step 7 PR #14) | EPA PM2.5 upper hazardous breakpoints (>300 µg/m³) truncation or incorrect calculation. | `tests/unit/air-math-step7.test.ts` > `AQI-01` | Ensure exact EPA breakpoint table (301-500 segment up to 500.4 µg/m³ -> AQI 500, beyond 500.4 capped or flagged). | Pending verification |
| **AQI-02** | **HIGH** | `src/domain/air-math.ts` (Step 7 PR #14) | CPCB official-publication flag missing or conflated with real-time indicative AQI. | `tests/unit/air-math-step7.test.ts` > `AQI-02` | Clearly separate CPCB 4 PM Official Daily Bulletin AQI from real-time indicative sub-index calculations. | Pending verification |
| **AQI-03** | **HIGH** | `src/domain/air-math.ts` (Step 7 PR #14) | CPCB 24h averaging requirement and data sufficiency (16/24h) ignored for real-time instantaneous values. | `tests/unit/air-math-step7.test.ts` > `AQI-03` | Enforce 16-hour minimum data sufficiency for CPCB 24h NAQI; label 1h/real-time as indicative sub-indices. | Pending verification |
| **AQI-04** | **MEDIUM** | `src/domain/multi-source-feeds.ts` (Step 7 PR #14) | Conflation of EPA and CPCB labels in `buildMultiSourceFeeds`. | `tests/unit/air-math-step7.test.ts` > `AQI-04` | Disambiguate US EPA AQI and Indian CPCB NAQI labels in all feed payloads. | Pending verification |
| **AQI-05** | **MEDIUM** | `src/domain/air-math.ts` (Step 7 PR #14) | Indicative vs complete index status transparency. | `tests/unit/air-math-step7.test.ts` > `AQI-05` | Add explicit index completeness and pollutant coverage flags. | Pending verification |

---

## 2. Verification Protocol

1. **RED**: Execute regression tests against existing code and confirm failure.
2. **GREEN**: Apply minimal deep-module fixes directly addressing root causes.
3. **REFACTOR / REGRESSION**: Re-run full test suites (`vitest`), type checks (`tsc --noEmit`), and production build (`next build`).
4. **DOCUMENT**: Update release notes and evidence records.
