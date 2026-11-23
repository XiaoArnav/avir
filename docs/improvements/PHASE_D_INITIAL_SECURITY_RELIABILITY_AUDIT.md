# AVIR — PHASE D INITIAL SECURITY & RELIABILITY AUDIT
## Baseline Threat Model, Trust Boundaries, Vulnerability Surface & Release Blockers

**Audit Date:** November 23, 2026  
**Audited Base Commit:** `2102a0fbb6dc2e12fe535c9a740700c52977bf04` (Merged PR #17, `feat/avir-phase-c-product-experience`)  
**Working Branch:** `fix/avir-phase-d-production-readiness`  
**Auditor Roles:** Principal Security Engineer, Full-Stack Architect, Reliability Engineer, DevSecOps Lead  
**Scope:** Steps 22–24 + Cross-Phase Stabilization  

---

## 1. Executive Summary & Repository Baseline

Avir has reached Phase D after completing Steps 1–21 across all core disciplines:
- Steps 1–7: Real-time telemetry, multi-source provenance, CPCB ground monitors, personal monitor integration, and CPCB NAQI / US EPA AQI breakpoints.
- Phase A (Steps 8–10): Verified government advisories, CAQM GRAP legal jurisdiction, hourly diurnal forecasts, and sync resilience.
- Phase B (Steps 11–16): Personal routines, mathematical exposure modeling, commute routing, Corsi-Rosenthal indoor air engineering, and deterministic-first AI planning.
- Phase C (Steps 17–21): Unified design system, interactive dashboard, diurnal timelines, responsive navigation, and WCAG AA accessibility.

### Baseline Environment & Dependencies
```text
Framework: Next.js 15.5.29 (App Router)
React: 19.3.1 (React DOM 19.3.1)
TypeScript: 5.9.3
Testing: Vitest 3.2.7 (64 test files, 1,195 passing tests)
Styling: Tailwind CSS 3.4.19, Lucide React 1.77.0
Hosting Target: Vercel Serverless & Edge Network
Live Production URL: https://avir-blue.vercel.app/
```

### Exposed API Surface
```text
POST /api/ai/plan               - Bounded AI plan explanation & exposure reduction
GET  /api/telemetry/sources     - OpenAQ v3 physical monitor resolution
GET  /api/telemetry/cpcb        - Official Indian CPCB ground-station telemetry
```

---

## 2. Threat Model & Trust Boundaries

The application handles environmental data and personal schedules without user accounts or server-side persistent databases. The threat model is mapped against OWASP Top 10, OWASP Top 10 for LLMs, and OWASP ASVS v4.0.

```text
       [ Untrusted Internet User ]
                   │
                   ▼
  ┌─────────────────────────────────┐
  │   Next.js Edge & API Routes     │
  │   /api/ai/plan                  │
  │   /api/telemetry/sources        │
  │   /api/telemetry/cpcb           │
  └────────┬───────────────┬────────┘
           │               │
           ▼               ▼
  ┌─────────────────┐  ┌───────────────────────────────────┐
  │ AI Provider     │  │ Environmental Providers           │
  │ (Google Gemini) │  │ - Open-Meteo (CAMS European Model)│
  │                 │  │ - OpenAQ v3                       │
  │                 │  │ - CPCB Official Stations          │
  └─────────────────┘  └───────────────────────────────────┘
           │               │
           └───────┬───────┘
                   ▼
  ┌─────────────────────────────────┐
  │ Validated Domain Calculations   │
  │ - air-math.ts, cpcb-naqi.ts     │
  │ - forecast-optimizer.ts         │
  │ - exposure-engine.ts            │
  └────────────────┬────────────────┘
                   ▼
  ┌─────────────────────────────────┐
  │ Browser Dashboard & UI          │
  │ ├── LocalStorage (Prefs/Routines│
  │ ├── Device Modal (WebSerial)    │
  │ └── Clipboard / Social Exports  │
  └─────────────────────────────────┘
```

### Boundary Assessment Matrix
| Trust Boundary | Data Entering | Controller | Validation Mechanism | Threat Surface | Mitigation Required |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **User -> API Routes** | JSON payload, query params | Untrusted Client | Runtime schema & type parsing | DoS, memory bloat, injection | Request body size limit, strict schema |
| **API -> AI Provider** | Prompt, sanitized routine stats | Server App | Server-only credential, header auth | Key leakage, cost exhaustion | Move API key to `x-goog-api-key`, timeout, rate limiting |
| **API -> Upstream Telemetry** | Lat, lon, radius | Server App | Strict float regex, range checks | SSRF, upstream outage, timeout | Strict coordinate clamps, circuit breakers, stale fallback |
| **Domain -> Client UI** | Telemetry, exposure, advisories | Server & Client | Domain invariant checkers | Fake consensus, bad data | Zero-fabrication, explicit provenance |
| **Client UI -> LocalStorage** | User routine, city choice | Client User | JSON parse validation | Stale/corrupt client state | Schema validation on load, data clearing |
| **Client UI -> Hardware** | Serial packets, Wi-Fi | Local Monitor | Packet CRC, bounded frame parsing | Buffer overflow, local SSRF | Strict packet regex, IP validation |

---

## 3. Classified Findings & Action Plan

### CRITICAL (Must Fix in Step 22)
1. **D-SEC-01 (Credential Exposure in Query String)**:
   - *Location*: `src/app/api/ai/plan/route.ts` line 155.
   - *Defect*: Gemini API URL constructed as `https://generativelanguage.googleapis.com/...:generateContent?key=${apiKey}`. API keys in query parameters are logged in HTTP access logs, proxy caches, and network monitoring tools.
   - *Remediation*: Transmit API key strictly via `x-goog-api-key: ${apiKey}` HTTP request header.

2. **D-SEC-02 (Asymmetric Request Validation)**:
   - *Location*: `src/app/api/ai/plan/route.ts` lines 39–52.
   - *Defect*: Legacy request pathway validates only presence of `city` and `metrics` object, allowing NaN, Infinity, negative values, and arbitrary unbounded payloads to enter calculation layers.
   - *Remediation*: Unify request schema validation in `src/services/ai/plan-validator.ts` across both modern and legacy payloads.

3. **D-SEC-03 (Missing Request Body Size Limit / Memory Exhaustion)**:
   - *Location*: `src/app/api/ai/plan/route.ts`.
   - *Defect*: Route directly calls `await req.json()` without pre-checking `Content-Length` or enforcing a bounded byte-stream reader. An attacker could stream a 50MB JSON payload to cause Node.js heap exhaustion.
   - *Remediation*: Check `Content-Length` header against 100KB limit, and enforce bounded stream reader before JSON deserialization.

### HIGH (Must Fix in Steps 22 & 23)
4. **D-SEC-04 (Lack of Abuse Control & Rate Limiting)**:
   - *Location*: `src/app/api/ai/plan/route.ts`.
   - *Defect*: Route has zero rate limiting. Anyone can spam expensive LLM calls, draining quotas.
   - *Remediation*: Implement sliding-window rate limiter (`src/lib/security/rate-limiter.ts`) returning HTTP 429 with `Retry-After` header.

5. **D-SEC-05 (Missing HTTP Security Headers)**:
   - *Location*: Root repository (no `next.config.*` exists).
   - *Defect*: Missing `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy`.
   - *Remediation*: Create `next.config.ts` enforcing robust security headers tailored for Next.js hydration and Open-Meteo/OpenAQ APIs.

6. **D-REL-01 (Unbounded Upstream AI Fetch Timeout)**:
   - *Location*: `src/app/api/ai/plan/route.ts`.
   - *Defect*: Upstream Gemini fetch call lacks `AbortController` timeout; a stalled Google response hangs server execution.
   - *Remediation*: Add 8000ms `AbortController` timeout and graceful deterministic fallback.

7. **D-REL-02 (Observability & Telemetry Health Logging)**:
   - *Location*: `src/lib/monitoring/`.
   - *Defect*: Lack of structured telemetry latency and error tracking for upstream data providers.
   - *Remediation*: Implement `src/lib/monitoring/telemetry-logger.ts` for structured error and latency tracking.

### MEDIUM / LOW (Addressed in Steps 22–24)
8. **D-SEC-06 (IP Address Spoofing Protection)**: Ensure client IP extraction for rate limiting inspects trusted platform headers (`x-forwarded-for`, `x-real-ip`) without vulnerability to header spoofing.
9. **D-PRV-01 (Client-Side Privacy Controls)**: Audit `CityPicker.tsx`, `FamilyProfileForm.tsx`, and `RoutineBuilder.tsx` to ensure stored preferences can be cleared completely with a single click.
10. **D-REL-03 (Circuit Breakers for Upstream Outages)**: Enforce stale-while-revalidate fallback across Open-Meteo and CPCB adapters when external networks fail.

---

## 4. Release Blocker Checklist
- [ ] D-SEC-01: Gemini key moved to `x-goog-api-key` header.
- [ ] D-SEC-02: Legacy & modern `/api/ai/plan` payloads strictly validated.
- [ ] D-SEC-03: Request body size limit (100KB) enforced.
- [ ] D-SEC-04: Rate limiting with HTTP 429 implemented.
- [ ] D-SEC-05: `next.config.ts` security headers configured.
- [ ] D-REL-01: Upstream AI timeout with AbortController implemented.
- [ ] D-REL-02: Telemetry monitoring logger implemented.
- [ ] D-REL-03: Circuit breakers & cache stale fallback verified.
- [ ] Step 24 E2E test suite passing.
- [ ] Zero TypeScript errors and clean production build.
