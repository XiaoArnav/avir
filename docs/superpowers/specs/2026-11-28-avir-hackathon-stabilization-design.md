# Avir: Hackathon-Focused Stabilization — Design

Date: 2026-11-28
Repository: XiaoArnav/avir
Approved direction: Option A, six small, independently verifiable updates.

## Why

Avir's second hackathon attempt scored 96.79/100, with Code Quality 89, Testing 98, Security 99, Efficiency 100, Accessibility 98 and Alignment 100. The goal is to improve correctness, release confidence and honest user-facing behavior before considering the final allowed submission. A score of 97.80 is a target, not a guarantee.

## Goals

1. Eliminate cross-location UI state contamination when a visitor chooses a city or GPS location, including first-visit onboarding.
2. Make station-source selection geographically consistent and evidence-based; never display a distant or unverified ground reading as nearby.
3. Make the Gemini settings interface match the existing server-only secret architecture and deterministic fallback.
4. Audit dependency advisories and align CI and deployment Node runtimes with direct dependency engine requirements, without forced upgrades.
5. Add focused regression tests for actual failure modes, especially onboarding and mobile, retaining the existing Chromium browser suite.
6. Document an evidence-backed production smoke test and final submission checklist.

## Non-goals

- No redesign of the visual language or 3D globe, no major rearchitecture of Cesium/Three.js.
- No changes to tested EPA/CPCB AQI mathematics, deterministic environmental planner, or health recommendations without a reproduced correctness defect.
- No use of client-supplied Gemini API credentials; never put secrets into Git or browser-visible settings.
- No automatic merge to main, no production configuration or secret updates without explicit coordination, and no automated third hackathon submission.
- No sweeping dependency changes or forced audit fixes.

## Approach and tradeoffs

Chosen: six independent small PRs, regression tests first, review and CI gates on each. This minimizes blast radius while addressing demonstrated defects.

Not chosen: one large cross-subsystem refactor; it could improve static cleanliness but has greater regression risk with one submission attempt left.

Not chosen: documentation-only audit; it would not repair observed state, source-range and settings inconsistencies.

## User journeys and expected behavior

### 1. First visit and privacy
A visitor opens Avir with no local preferences. Opening location onboarding may coexist with initial Delhi example telemetry. Selecting any other city or GPS location must immediately clear old-city readings, dependent recommendations and selected temporal points, then load the new location. Stale network responses must never populate the new city. Manual city selections can be persisted; GPS-derived coordinates remain ephemeral. If reverse geocoding fails, GPS coordinates must not be labeled as India: use an unknown country code until verified.

### 2. Physical measurements and provenance
Automatic and provider-specific source modes select ground observations only when freshness, PM2.5 and geographic evidence are valid. Existing policy documents permit CPCB up to 35 km and the OpenAQ v3 search API permits up to 25 km. Before changing the resolver, trace how distance is computed and propagated. No unknown-distance observation should be described as physically nearby. User-explicit specific-station mode remains distinct and must display the actual station/provenance honestly.

### 3. AI explanations
The server reads GEMINI_API_KEY. Without that server-side key, the deterministic explanation must remain available. The UI must not offer to save a browser key that cannot be used; retain privacy/location reset options, and explain the configured/server-only status accurately without revealing secrets.

### 4. Dependencies and runtime
Categorize the five npm installation advisories by package, severity, production reachability and safe remediation. Do not upgrade a major dependency or apply --force without tests and a review. Align CI Node with the installed Cesium >=22.17.0 requirement after verifying build compatibility.

### 5. Browser coverage and accessibility
Preserve the existing 33 Chromium E2E tests. Add slow-network onboarding, unavailable source, no-API-key fallback, and a minimal mobile viewport smoke test. Review focus, labels and touch targets in changed components without broad visual redesign.

### 6. Release integrity
After each PR, require lint, 1,549+ unit/integration tests (count may grow), TypeScript check, production build, and browser E2E. Inspect the PR diff and confirm no unintentional change to previously validated features. Before submission, validate the production deployment and core user journeys manually; report any browser or credential access limitations explicitly.

## Safety and rollback

Work from a dedicated branch, one tightly scoped behavior change per PR. Never overwrite main. Require red-before-green regression proof for each bug fix. Keep previous deployment available for rollback. If a fix requires unverified assumptions, pause and document the blocker rather than guessing.

## Scope acceptance

Option A was selected by the project owner on 2026-11-28. The implementation plan for the first change will be reviewed before code changes, with later phases planned independently to keep risk visible.
