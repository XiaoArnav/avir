# AVIR — PRODUCTION RELEASE CHECKLIST
## Pre-Deployment Verification, Quality Gating & Human Approval Sign-Off

**Release Target:** Avir v1.0.0 Production Release  
**Repository:** https://github.com/XiaoArnav/avir  
**Target Pull Request:** [XiaoArnav/avir#18](https://github.com/XiaoArnav/avir/pull/18)  
**Production URL:** https://avir-blue.vercel.app/  

---

## 1. Pre-Merge Verification Gates

- [x] **Zero TypeScript Errors**: `npx tsc --noEmit` exits with status `0`.
- [x] **Automated Regression Suite**: 67 test files, 1,216 tests passing ($100\%$ pass rate).
- [x] **Clean Production Compilation**: `npm run build` succeeds without warnings or chunk errors.
- [x] **Dependency Audit**: `npm audit` reviewed; zero unmitigated runtime production vulnerabilities.
- [x] **Security Hardening**:
  - [x] Gemini API key transmitted strictly via `x-goog-api-key` header (never in URLs).
  - [x] 100 KB payload ceiling enforced on POST requests.
  - [x] Sliding-window rate limiter (15 req/min) active on `/api/ai/plan`.
  - [x] `next.config.ts` enforces Content-Security-Policy, X-Frame-Options, and HSTS.
- [x] **Reliability & Resilience**:
  - [x] Circuit breaker active for Open-Meteo, OpenAQ, and CPCB external endpoints.
  - [x] In-memory telemetry health logger reporting latencies and p95 percentiles.
  - [x] Stale fallbacks strictly retain authentic observation timestamps.
- [x] **Scientific Integrity**:
  - [x] US EPA 2024 revised NAAQS breakpoints and 1-decimal truncation verified.
  - [x] Indian CPCB NAQI 3-pollutant minimum and 16-hr data sufficiency enforced.
  - [x] CAQM GRAP directives gated strictly to NCR statutory districts.
  - [x] Zero-fabrication policy: no synthetic sensor readings, no fake multipliers.
- [x] **CI/CD Checks on GitHub PR #18**:
  - [x] `CI Release Gate / Test, Typecheck & Production Build` is GREEN.
  - [x] `Vercel Preview Deployment` is READY.

---

## 2. Human Review & Merge Sign-Off

*Notice: Automatic merging is prohibited. The repository owner must review the PR diff before merging.*

- [ ] Repository owner has inspected the PR #18 diff.
- [ ] Vercel preview deployment URL tested on mobile and desktop.
- [ ] PR #18 approved and merged using **Squash and Merge** or **Rebase and Merge**.

---

## 3. Post-Deployment Smoke Test (Production Verification)

Execute immediately following production promotion on https://avir-blue.vercel.app/:
1. **Homepage Loading**: Verify hero status displays authentic telemetry.
2. **City Switching**: Switch between Delhi and Bengaluru; confirm correct CAQM GRAP pill display (active for NCR, "GRAP: NCR Only" for Bengaluru).
3. **Diurnal Forecast**: Toggle timeline hours; verify 24-hour diurnal curve loads cleanly.
4. **Routine Optimizer**: Run test schedule optimization; confirm exposure reduction percentage renders with physical mass units ($\mu\text{g}$).
5. **Security Headers**: Inspect browser network tab response headers to confirm `X-Frame-Options: DENY` and `Content-Security-Policy` are active.
