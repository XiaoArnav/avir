# Avir Onboarding and Location Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** A first-visit city/GPS choice must never retain stale data from the example city or falsely assign an unverified GPS location to India.

**Architecture:** Reuse the existing page-level handleCitySelect state transition for every onboarding selection. Keep GPS fallback construction in a pure, testable location helper; keep geographic truthfulness at the server reverse-geocoding boundary as well. The code changes must be narrow and preserve existing privacy behavior.

**Tech Stack:** Next.js 15, React 19, TypeScript, Vitest, Playwright Chromium, GitHub Actions.

**Spec:** docs/superpowers/specs/2026-11-28-avir-hackathon-stabilization-design.md

## Global Constraints

- Maintain existing city-selection modes and the existing Cesium-first globe behavior.
- Keep manually selected city persistence; never persist ephemeral GPS coordinates across sessions.
- Do not modify the AQI calculation engine, source-policy algorithms, model layers or API credentials.
- Branch from commit 195e45980a5cc7766f6c9855d327fb9e883c37a2 and open a draft PR **before adding tests**, because the existing GitHub Actions workflow runs on pull requests targeting main but not on pushes to plan/* branches. Do not auto-merge or deploy.
- Regression test must fail on the existing behavior before production code is changed.
- CI gate: npm run lint, npm test, npx tsc --noEmit, npm run build, npm run test:e2e.

## Review Focus

- Delayed new-city telemetry: old city measurements must disappear as soon as the city changes.
- Late old-city response: a canceled or ignored old request must never overwrite the new city.
- GPS outside India, reverse-geocode failure: fallback country code must be unknown, not IN.
- Upstream reverse-geocode result with missing country_code: preserve unknown, never invent IN.
- GPS privacy: ephemeral coordinates must not be persisted; manual selected cities may be persisted.

---

### Task 1: Route first-visit city selection through the canonical reset

**Files:**
- Test (new): e2e/first-visit-location.spec.ts
- Modify: src/app/page.tsx (FirstVisitLocationModal onSelectCity, current approximately lines 788-794)

**Interfaces:**
- Consumes: handleCitySelect(loc: GeocodedLocation, source?: LocationSelectionSource): void.
- Produces: all city changes, including first visit, use the same stale-data reset and plan invalidation.

- [ ] **Step 0: Open a draft PR against main.** Keep it in draft and confirm GitHub Actions is available before committing a failing regression test.
- [ ] **Step 1: Add failing Playwright regression.** Start with empty onboarding localStorage; intercept external air-quality requests with a fresh Delhi response and hold the Bengaluru response. Wait for the initial Delhi values, choose Bengaluru inside FirstVisitLocationModal, and assert the Bengaluru-labeled city card has no Delhi AQI/PM2.5 while the Bengaluru response is pending. Confirm the loading status announces Bengaluru.
- [ ] **Step 2: Verify red.** Commit only the failing test to the working branch, observe the GitHub Actions Playwright job fail for stale telemetry (not missing selectors, timeout or infrastructure error).
- [ ] **Step 3: Implement the minimal fix.** Pass handleCitySelect directly to FirstVisitLocationModal.onSelectCity and preserve the source argument, instead of calling setSelectedCity directly.
- [ ] **Step 4: Verify green.** Re-run GitHub Actions; the new test and all existing checks must pass. If the test was not red for the expected reason, correct the test before accepting the change.
- [ ] **Step 5: Inspect the diff.** Confirm no unrelated changes to dynamic globe components, AQI math, plan generation or privacy persistence.

### Task 2: GPS fallback truthfulness, client and server

**Files:**
- Test (new): tests/unit/gps-location-fallback.test.ts
- Test (existing): tests/unit/api-geo-reverse.test.ts
- Create: src/components/location/gps-location-fallback.ts
- Modify: src/components/location/FirstVisitLocationModal.tsx (default detectedLocation)
- Modify: src/app/api/geo/reverse/route.ts (Nominatim country_code fallback, current approximately line 147)

**Interfaces:**
- Produces: createGpsFallbackLocation(latitude: number, longitude: number): GeocodedLocation.
- The helper must return the current coordinate-derived deterministic id and coarse coordinate label, country 'Detected Location', countryCode 'UN', with the same coordinates.
- The API must use 'UN' if upstream address.country_code is missing; a valid upstream country code remains uppercase.

- [ ] **Step 1: Add failing unit tests.** Assert a Seattle-coordinate GPS fallback returns countryCode 'UN' and retains the latitude/longitude; assert a mocked Nominatim response with city/country but missing country_code returns 'UN' for a unique uncached coordinate. Preserve existing Delhi spatial-index test and Bengaluru valid country-code test.
- [ ] **Step 2: Verify red.** Commit only tests to the branch; confirm CI fails in the expected new assertions before code changes.
- [ ] **Step 3: Implement minimally.** Extract the existing fallback construction to the pure helper with the unknown country code and call it from the modal. In reverse-geocoding route, replace the invented 'in' default with 'UN' only when the country code is unavailable.
- [ ] **Step 4: Verify green.** Confirm the targeted unit tests and full CI pass.
- [ ] **Step 5: Privacy check.** Ensure the GPS branch still only writes avir_location_onboarded_v1 and not avir_selected_city_v1, while manual city buttons retain persistence.

### Task 3: Final PR readiness and verification

**Files:**
- Review only: src/app/page.tsx, src/components/location/*, src/app/api/geo/reverse/route.ts, new/modified tests.

- [ ] **Step 1: Review changed files and source/test scope.** No unrelated formatting or dependency changes.
- [ ] **Step 2: Obtain fresh successful CI evidence for lint, Vitest, typecheck, build, browser E2E.** Record exact run URL and failures if any.
- [ ] **Step 3: Inspect Vercel preview if available.** Smoke-test first visit, city search, explicit GPS permission, denied GPS and manual city switching. If interactive browsing is unavailable, label manual verification pending.
- [ ] **Step 4: Update the existing draft PR description.** Summarize root cause, red-to-green evidence, risk, and rollback. Request approval; do not auto-merge.
- [ ] **Step 5: After owner approval and merge, start a separate implementation plan/PR for source-distance integrity.** Future Option A phases each get an independently tested PR.

## Subsequent Option A PRs (separate plans)

1. Source-distance scientific integrity: inspect source-record distance propagation; normalize CPCB/OpenAQ bounds; test near/far/unknown and manual-fallback behavior.
2. Gemini settings accuracy: remove misleading browser key flow, retain server-only key architecture, test deterministic no-key fallback.
3. Dependency and Node runtime safety: npm audit dependency tree, categorize production reachability, choose minimal updates; align CI Node >=22.17.0.
4. Additional browser/mobile/accessibility coverage: add deterministic slow-network and viewport smoke tests without large UI changes.
5. Final production verification and submission decision: check deployed runtime, provider-configuration status and core journey; no automatic submission.
