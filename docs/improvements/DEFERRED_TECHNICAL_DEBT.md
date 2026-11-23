# AVIR — DEFERRED TECHNICAL DEBT REGISTER
## Phase A Master Baseline & Future Phase Backlog

**Author**: XiaoArnav <322868724+XiaoArnav@users.noreply.github.com>  
**Last Updated**: 2026-11-23  
**Status**: Authoritative Technical Debt Register  

---

## 1. Purpose

This document explicitly catalogues architectural, integration, and environmental data limitations deferred during Phase A (Steps 8–10) or inherited from earlier steps (Steps 1–7). Under Avir's scientific honesty guidelines, limitations are never obscured, fabricated, or prematurely closed without genuine infrastructure.

---

## 2. Inherited Technical Debt from Steps 01–07

### Step 4 — Official Ground Stations (CPCB/CAAQMS)
- **Official API Ingestion**: Direct programmatic ingestion from CPCB CCR / Sameer portal requires statutory government credentials and IP allowlisting. Scraping or bypassing CAPTCHAs is strictly prohibited under project and security directives.
- **Station-Level Fallback**: CPCB stations without active real-time feeds are retained with `'registry_only'` status and zero synthetic readings.

### Step 5 — Personal Air-Monitor Integration
- **Physical Sensor Verification**: Browser-level WebSerial USB and local Wi-Fi monitoring interfaces (`WebSerialManager`, `WifiMonitorManager`) are fully implemented and verified via browser APIs and mock hardware frames. Live physical verification with PMS5003 / Sensirion SPS30 hardware remains dependent on physical bench hardware.
- **Factory Calibration Offsets**: Relative humidity calibration curves are implemented; individual sensor calibration constants require dual-chamber collocated testing against reference monitors.

### Step 6 — Global Telemetry & World Comparisons
- **Batch Endpoint Latency**: World telemetry explorer fetches batches of cities via Open-Meteo multi-coordinate endpoints. Coverage of 100+ worldwide cities requires a persistent server-side distributed cache or geohash bucket.
- **Sparse Observation Density**: Ground monitor coverage outside North America, Europe, and select Asian metros relies on satellite-derived CAMS models. Model data is explicitly labeled as such.

### Step 7 — Scientifically Correct AQI (PR #14)
- **Status of PR #14**: Pull Request #14 (`feat/step-07-scientifically-correct-aqi`) contains identified calculation debt regarding pollutant averaging windows and truncated breakpoint tables.
- **Phase A Isolation Guarantee**: Phase A code has **ZERO dependency** on PR #14 and does not import, merge, or cherry-pick unverified code from that branch. Full corrective closure for Step 7 will take place in its dedicated milestone.

---

## 3. Phase A Technical Debt & Future Scope

### Step 8 — Verified Advisories & Official GRAP Intelligence
- **Automated CAQM Gazette Scraping**: Official statutory orders from CAQM and Delhi DoE are curated in a human-verified registry (`VERIFIED_OFFICIAL_REGULATORY_ORDERS`). Live automated polling of `caqm.nic.in` PDFs requires an official signed RSS/API feed from CAQM or periodic editorial verification.
- **Other State Clean Air Action Plans**: Currently, statutory emergency orders are strictly modeled for NCR (CAQM). Non-NCR state action plans (e.g. Maharashtra CAP, West Bengal Action Plan) return `'not_applicable'` for GRAP and provide baseline evidence-based guidance.

### Step 9 — Hourly Forecast & Timezone Normalization
- **Open-Meteo 7-Day Extension**: Current forecast timeline renders the next 24 hours. Extending to full 7-day multi-model ensemble (CAMS + GFS + ECMWF) will require compressed payload streaming.
- **High-Altitude Boundary Layer Dynamics**: Boundary layer height model output from NOAA GFS is matched within 60 minutes. Mountainous regions with extreme topography (e.g. Leh, Kathmandu) experience microclimatic valley inversions not fully resolved at 11 km grid scales.

### Step 10 — Data Synchronization & Request Coordination
- **Local Storage Telemetry Cache**: Telemetry caching currently resides in in-memory LRU cache (`telemetryCache`). Persisting telemetry across page reloads in IndexedDB with cryptographic signing is deferred to Phase C.
- **WebSocket Push Synchronization**: Current real-time synchronization operates on abortable on-demand pull and manual refresh. Real-time push via WebSocket/Server-Sent Events will be evaluated when official real-time streaming endpoints become available.
