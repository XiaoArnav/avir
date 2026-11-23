# AVIR — DEFERRED TECHNICAL DEBT REGISTER
## Phase D Release Candidate & Production Backlog

**Author**: XiaoArnav <322868724+XiaoArnav@users.noreply.github.com>  
**Last Updated**: November 23, 2026  
**Status**: Authoritative Technical Debt Register (Phase D Release Candidate)  

---

## 1. Purpose

This document explicitly catalogues architectural, integration, and environmental data limitations remaining after the completion of Phase D (Steps 22–24) and all prior roadmap phases (Steps 1–21). Under Avir's scientific honesty guidelines, limitations are never obscured, fabricated, or prematurely closed without genuine physical evidence.

---

## 2. Resolved Technical Debt in Phase D

1. **D-SEC-01 (API Key Leakage)**: Resolved. Gemini API key passed strictly via `x-goog-api-key` header; removed from URL queries.
2. **D-SEC-02 (Asymmetric Validation)**: Resolved. Unified runtime schema validation on both legacy and modern requests in `src/services/ai/plan-validator.ts`.
3. **D-SEC-03 (Heap Exhaustion Risk)**: Resolved. Enforced 100 KB payload ceiling via `readBoundedJson`.
4. **D-SEC-04 (Abuse Control)**: Resolved. Implemented sliding-window in-memory rate limiter on `/api/ai/plan`.
5. **D-SEC-05 (Security Headers)**: Resolved. Established production Content-Security-Policy and HTTP security headers in `next.config.ts`.
6. **D-REL-01 (Cascading Outage Risk)**: Resolved. Built 3-state Circuit Breaker (`CLOSED`, `OPEN`, `HALF_OPEN`) with automatic fallback.
7. **D-REL-02 (Observability Gap)**: Resolved. Built `TelemetryLogger` recording provider latencies, failure categories, and health ratings.
8. **D-REL-03 (Cache Invariants)**: Resolved. Enforced strict retention of authentic observation timestamps on stale fallbacks.

---

## 3. Physical Hardware & Infrastructure Limitations (Managed Technical Debt)

### 1. Physical Hardware Sensor Calibration
- **Status**: Safely isolated in `src/services/device-telemetry-service.ts`.
- **Limitation**: WebSerial and local Wi-Fi monitoring interfaces (`WebSerialManager`, `WifiMonitorManager`) are verified via browser APIs and mock hardware frames. Live physical calibration against reference beta-attenuation monitors (BAM-1020) requires a physical calibration test chamber.

### 2. Statutory CPCB Portal Ingestion
- **Status**: Live CPCB ground monitors are resolved via official coordinates and registry entries.
- **Limitation**: Direct real-time scraping of the Sameer portal or CAAQMS backend is restricted by government network access policies and CAPTCHA gates. Bypassing these gates is strictly prohibited; data is fetched via verified server-side OpenAQ v3 feeds and curated CPCB station registries.

### 3. Distributed Production Rate Limiting
- **Status**: In-memory sliding-window limiter is active on serverless instances.
- **Limitation**: Fully distributed global rate limiting across thousands of independent Vercel edge regions requires a shared Redis / Upstash store (`KV_REST_API_URL`). When deployed without Redis, rate limiting operates per-instance, which is adequate for standard abuse protection.

### 4. Third-Party Monitoring & PagerDuty Alerting
- **Status**: In-memory health summary and latency reporting active.
- **Limitation**: External PagerDuty/Slack alerting webhooks require enterprise account provisioning and private webhooks configured in the Vercel dashboard.
