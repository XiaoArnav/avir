# AVIR — PRODUCTION OPERATIONAL RUNBOOK
## Incident Management, Provider Architecture, Outage Handling, Key Rotation & Rollback Procedures

**Document Version:** 1.0.0  
**Last Updated:** November 23, 2026  
**System Owner:** Avir Engineering Operations (`XiaoArnav`)  
**Production URL:** https://avir-blue.vercel.app/  
**Target Repository:** https://github.com/XiaoArnav/avir  

---

## 1. System Architecture & Component Map

Avir is built on Next.js 15 (App Router) deployed across Vercel's global edge and serverless functions:
```text
  [ Client Browser Dashboard ]
        │
        ├── Next.js Static Pages (Prerendered with ISR)
        │
        └── Serverless API Routes (/api/ai/plan, /api/telemetry/*)
              │
              ├── Upstream: Open-Meteo Air Quality API (European CAMS atmospheric models)
              ├── Upstream: OpenAQ API v3 (Global physical ground monitors)
              ├── Upstream: Central Pollution Control Board (CPCB India official feeds)
              └── Upstream: Google Gemini 2.5 Flash (AI narrative explanations only)
```

---

## 2. Environment Variables & Secret Configuration

*Security Directive: Never log, commit, or print plain-text values of these variables.*

| Variable Name | Required Scope | Purpose | Fallback Behavior When Missing |
| :--- | :--- | :--- | :--- |
| `GEMINI_API_KEY` | Server-side only | Powers optional LLM plan explanations | Falls back to rule-based deterministic explanation |
| `NEXT_PUBLIC_VERCEL_ENV` | Client / Server | Environment context (`production` / `preview`) | Defaults to local development mode |

---

## 3. Healthy Application Signals

A healthy production deployment exhibits the following baseline telemetry:
1. **HTTP 200 on Main Route (`/`)**: TTFB $< 150\,\text{ms}$, First Load JS $\approx 103\,\text{KB}$.
2. **API Routes (`/api/telemetry/*`)**: Returns JSON with `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`.
3. **AI Route (`/api/ai/plan`)**: Response time $< 1200\,\text{ms}$ with `isAiGenerated: true` (or deterministic fallback $< 50\,\text{ms}$).
4. **Error Rate**: Total 5xx server errors $< 0.1\%$ across rolling 1-hour window.

---

## 4. Operational Failure Modes & Troubleshooting

### 4.1 Upstream Provider Outage (Open-Meteo / OpenAQ / CPCB)
- **Symptom**: Dashboard displays "Telemetry Stale" or "Offline Cached".
- **Internal Handling**:
  - `CircuitBreaker` trips to `OPEN` after 4 consecutive failures.
  - Sub-requests immediately return `telemetryCache.getStale()` with `status: 'stale'`.
  - Authentic observation timestamps (`observedAt`) are strictly preserved.
- **Operational Action**:
  - Inspect `telemetryLogger.getHealthSummary()` for error category (`503 Service Unavailable`, `Gateway Timeout`).
  - Do not restart serverless functions; circuit will probe recovery via `HALF_OPEN` state every 20 seconds automatically.

### 4.2 AI Explanation Timeout / Rate Limit Trigger
- **Symptom**: Client receives HTTP 429 or fallback narrative without AI badge.
- **Internal Handling**:
  - Bounded 8000ms `AbortController` terminates hanging Google requests.
  - Deterministic engine delivers verified mathematical exposure savings without interruption.
- **Operational Action**:
  - If 429 rate limit is sustained across multiple users, check for bot scraping. Verify `x-forwarded-for` client IPs.

---

## 5. Secret Key Rotation Process

To rotate the `GEMINI_API_KEY`:
1. Generate a new API key in Google AI Studio.
2. Navigate to **Vercel Project Settings $\rightarrow$ Environment Variables**.
3. Edit `GEMINI_API_KEY` for **Production** and **Preview** environments with the new value.
4. Trigger a zero-downtime redeployment of the latest stable deployment:
   ```bash
   vercel redeploy --prod
   ```
5. Revoke the old key in Google AI Studio after verifying successful telemetry in Vercel runtime logs.

---

## 6. Immediate Production Rollback Procedure

If a deployed commit causes severe runtime regressions or critical defects:

### Method A: Vercel Dashboard (Instant Zero-Downtime Rollback)
1. Open https://vercel.com/xiao-c64a/avir/deployments.
2. Locate the previous verified stable production deployment (e.g. `2102a0f`).
3. Click the **three dots (...) $\rightarrow$ Instant Rollback**.
4. Confirm the rollback. Vercel's edge network instantly routes 100% of production traffic to the previous deployment build within 2 seconds.

### Method B: Git Revert (Clean Source Tracking)
```bash
# Checkout main branch and pull latest state
git checkout main
git pull origin main

# Revert the offending merge commit
git revert -m 1 <MERGE_COMMIT_SHA> -m "revert: rollback production to stable release"

# Push to origin/main (triggers automated CI release gate)
git push origin main
```
