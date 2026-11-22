# AVIR — STEP 04/24: VERIFIED OFFICIAL GROUND-STATION INTEGRATION
## Production-Grade CPCB/CAAQMS Ingestion, Indian National AQI Validation, Station Identity, and Live Monitoring

---

## 1. Executive Summary & Objective

**Step 4 Objective**: Provide genuinely measured air-quality observations from the Central Pollution Control Board (CPCB) Continuous Ambient Air Quality Monitoring Station (CAAQMS) network and officially published Indian government open-data resources (`data.gov.in`), preserving original observation timestamps, operating agency provenance, pollutant-specific measurements, explicit measurement units, and reporting limitations.

- **Baseline Commit**: `7e308a817581e542ae8686bb86ba20f758082f46`
- **Implementation Branch**: `feat/avir-04-official-ground-station-integration`
- **Recommended PR Title**: `feat(telemetry): implement verified CPCB/CAAQMS ground-station ingestion`
- **Status**: Code Complete & Verified (28 Test Files, 440/440 Passing Tests). Operational live data retrieval is awaiting server environment configuration of `DATA_GOV_IN_API_KEY`.

---

## 2. Official Data Source Research & Evaluation

Two primary candidate sources were audited for programmatic CPCB/CAAQMS ground observation ingestion:

| Evaluation Dimension | Candidate 1: Open Government Data Platform India (`data.gov.in`) | Candidate 2: CPCB Central Control Room (`airquality.cpcb.gov.in` / `app.cpcbccr.com`) |
| :--- | :--- | :--- |
| **Resource Identifier** | Resource UUID `3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69` ("Real-time Air Quality Index from various locations") | Direct CCR web application dashboard (`https://app.cpcbccr.com/ccr/`) |
| **API Availability** | Documented public REST JSON API (`https://api.data.gov.in/resource/3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69`) | Internal Angular single-page application consuming private, undocumented endpoints |
| **Access Authorization** | Authorized under National Data Sharing and Accessibility Policy (NDSAP). Requires free developer API key via query parameter `api-key`. | No public developer specification. Access requires reverse-engineering session cookies or scraping, violating access rules. |
| **Rate Limits & Bounds** | Configurable queries with `limit`, `offset`, and query filters (`filters[city]`, `filters[state]`). Rate limited per key. | Protected by Cloudflare / dynamic tokens. High risk of IP blocking or breaking on UI redesigns. |
| **Data Fields** | `country`, `state`, `city`, `station`, `last_update`, `pollutant_id`, `pollutant_min`, `pollutant_max`, `pollutant_avg`, `pollutant_unit`, `latitude`, `longitude` | Hourly and 15-minute tabulated tables behind dynamic session filters |
| **Live Probe Result** | Responded HTTP JSON `{"error": "Authorization field missing"}` without key; `{"error": "Key not authorised"}` with unauthenticated key. Proven live endpoint. | Dashboard loads in browser but provides no authorized public programmatic API. |
| **Selection Decision** | **SELECTED** as primary authorized government data ingestion pipeline. | **REJECTED** due to lack of public developer contract and anti-scraping access policies. |

---

## 3. Architecture & Data Flow

```text
               AUTHORIZED GOVERNMENT DATA SOURCE
    Open Government Data (OGD) Platform India (data.gov.in)
     CPCB / State Pollution Control Boards (Resource 3b01bcb8)
                            |
                            v
            Server-Side Adapter (cpcb-provider.ts)
     - DATA_GOV_IN_API_KEY kept strictly on server
     - 8-second timeout & safe AbortSignal handling
     - Strict IST (+05:30) timestamp parsing
                            |
                            v
              Data Normalization & Validation
     - Rejects negative, NaN, "NA", and non-numeric values
     - Preserves genuine 0 concentrations
     - Explicit units: µg/m³ (particulates/gases) & mg/m³ (CO)
     - Preserves aggregation semantics (pollutant_avg/min/max)
                            |
                            v
              Verified Station Identity Model
     - Provider-scoped keys ('cpcb:<stationName>')
     - Differentiates internal IDs from official codes
     - Preserves operating agency (DPCC, MPCB, UPPCB, KSPCB, etc.)
                            |
                            v
               Canonical Telemetry Pipeline
     - Next.js Route: /api/telemetry/cpcb
     - Deduplication with verified cross-provider mappings
     - Independent source comparison (Mode A / B / C)
                            |
                            v
                 AVIR Dashboard & UI
     - Dedicated Official Government Ground Monitoring subsection
     - Honest 'Registry Verified • Awaiting Continuous Stream' state
     - Statutory Compliant (24-hr) vs Indicative Sub-Index labels
```

---

## 4. Key Implementation Details

### A. Dedicated Server-Side Adapter (`src/services/providers/cpcb-provider.ts`)
- Implemented `fetchCpcbProviderResult` and `normalizeDataGovInRecords`.
- Strictly enforces server-side isolation: `DATA_GOV_IN_API_KEY` is read from `process.env` and never included in error logs, client responses, or URLs returned to the client.
- Handled status states:
  - `available`: Valid records returned and normalized.
  - `not_configured`: API key missing (honest state, non-blocking).
  - `unauthorized`: Invalid API key (HTTP 401/403 or `"Key not authorised"`).
  - `rate_limited`: Upstream rate limit reached (HTTP 429).
  - `upstream_error`: data.gov.in 5xx errors.
  - `unavailable`: Network timeout or fetch failure.
  - `no_coverage`: Empty records array.

### B. Strict Indian Standard Time (IST) Parsing
- Government records report `last_update` in `DD-MM-YYYY HH:mm:ss` (e.g. `22-11-2026 18:00:00`).
- Implemented `parseIndianStandardTime()` which explicitly anchors date parsing to UTC+05:30:
  `22-11-2026 18:00:00` $\to$ `2026-11-22T18:00:00+05:30` $\to$ `2026-11-22T12:30:00.000Z`.
- Rejects unparseable strings, missing values, and `"NA"` placeholders.

### C. Station Identity & Registry Integrity
- Defined `VerifiedStationIdentity` in `src/domain/types.ts`:
  - `internalId`: Unique Avir identifier (e.g. `avir-cpcb-dl-anand-vihar`).
  - `officialStationId`: `null` unless verified against official CPCB code database (eliminates assumed codes like `cpcb-dl-01`).
  - `sourceProvider`: Originating provider (`'cpcb'` or `'airnow'`).
  - `operatingAgency`: Operating authority (e.g. `'Delhi Pollution Control Committee'`).
  - `registryVerified`: `true`.
  - `sourceReference`: `'CPCB National CAAQMS Registry'`.
- Corrected US Embassy Chanakyapuri:
  - Preserved originating identity: `sourceProvider: 'airnow'`, `provider: 'US State Department (AirNow)'`, `operatingAgency: 'US Department of State / AirNow'`.
  - Removed fictitious `'cpcb:us_embassy'` mapping from `VERIFIED_CROSS_PROVIDER_STATION_MAP`.

### D. CPCB National AQI (NAQI) Engine Enhancements (`src/domain/cpcb-naqi.ts`)
1. **Explicit CO Units**:
   - Replaced magnitude-based unit guessing (`if (conc > 50) conc /= 1000`) with explicit unit handling.
   - If unit is `'ug/m3'`, converts by dividing by 1000; if `'mg/m3'`, preserves directly.
   - Preserved untyped backwards-compatibility for legacy callers without compromising explicit unit safety.
2. **Complete 8-Pollutant Support with Lead (Pb)**:
   - Added official statutory breakpoints for Pb (Lead) in µg/m³ (24-hr):
     - Good (0-50): 0.0 - 0.5
     - Satisfactory (51-100): 0.6 - 1.0
     - Moderate (101-200): 1.1 - 2.0
     - Poor (201-300): 2.1 - 3.0
     - Very Poor (301-400): 3.1 - 3.5
     - Severe (401-500): 3.5 - 5.0
3. **Statutory Compliance vs Indicative Sub-Index**:
   - Enforced MoEFCC data sufficiency criteria: $\ge 3$ pollutants required, with at least one being $\text{PM}_{2.5}$ or $\text{PM}_{10}$.
   - If averaging periods are not confirmed 24-hr averages (e.g. hourly snapshots), classified as `'indicative_snapshot'` rather than claiming statutory regulatory compliance.

### E. Scientifically Neutral Ground-Model Divergence (`src/services/ground-station-service.ts`)
- Updated `calculateGroundModelDelta` to replace speculative causal claims with neutral descriptions:
  - Divergence higher than model: *"Ground monitor measures X% higher particulate pollution than regional model grid. Differences may reflect localized emissions, station microclimate, modeling resolution, or boundary-layer trapping."*
  - Divergence lower than model: *"Ground monitor measures X% lower particulate pollution than regional model grid. Differences may reflect local microclimatic ventilation, dispersion factors, or modeling grid averaging."*
  - Aligned: *"Ground sensor observation and regional atmospheric chemistry model grid are closely aligned (within 25%)."*

### F. Internal API Route (`src/app/api/telemetry/cpcb/route.ts`)
- App Router route handler validating `lat`, `lon`, `radius`, `city`, and `state`.
- Bounded radius (1 to 50 km).
- Serves typed JSON responses with 5-minute CDN edge caching (`s-maxage=300, stale-while-revalidate=600`).

### G. UI Inspector Modal Enhancements (`src/components/MultiSourceInspectorModal.tsx`)
- Added dedicated subsection: **Official Government Ground Monitoring (CPCB / CAAQMS / State PCBs)**.
- Renders real reported pollutants (PM2.5, PM10, and gaseous species) when active.
- For registry stations awaiting streaming connection, displays honest status: `"Registry Verified • Awaiting Continuous Stream"`.
- Displays `"No Station in Range"` message when no regulatory reference monitor exists within 35 km.
- CPCB NAQI card clearly displays classification: `Statutory Compliant (24-hr)`, `Indicative Snapshot`, or `Indicative Sub-Index`.

---

## 5. Verification & Test Evidence

### Automated Test Suite
- **Total Test Files**: 28 passed (28)
- **Total Tests**: 440 passed (440)
- **New Test Files Added**:
  1. `tests/unit/cpcb-provider.test.ts` (25 tests covering Groups A, B, C, D)
  2. `tests/integration/step4-official-ground-stations.test.tsx` (9 tests covering Group E, API route, and UI modal)

### Production Build & Compiler
- `npx tsc --noEmit`: Exited 0 (zero type errors).
- `npm run build`: Compiled 7/7 routes successfully (including new dynamic route `/api/telemetry/cpcb`).

### Genuine Live-Source Testing Probe
- **Target Endpoint**: `https://api.data.gov.in/resource/3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69`
- **Result without key**: HTTP JSON `{"error": "Authorization field missing"}`
- **Result with unauthenticated key**: HTTP JSON `{"error": "Key not authorised"}`
- **Operational Verification Status**: `OFFICIAL DATA SOURCE — NOT LIVE VERIFIED (Awaiting user configuration of DATA_GOV_IN_API_KEY)`.

---

## 6. Acceptance Criteria Checklist

### Engineering
- [x] Dedicated official data adapter implemented (`src/services/providers/cpcb-provider.ts`).
- [x] Selected source and access method documented (`data.gov.in` resource `3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69`).
- [x] Authenticated data retrieval implemented when credentials are present.
- [x] Original measurement values and units preserved.
- [x] Original observation timestamps preserved with strict IST parsing.
- [x] Unknown averaging periods remain `null`.
- [x] Official station identifiers separated from internal Avir IDs.
- [x] Unverified cross-provider mappings removed.
- [x] Registry-only stations excluded from active reporting counts.
- [x] Zero timestamp contamination between pollutants.
- [x] Official data reaches canonical telemetry pipeline (`allEnvironmentalSources`).
- [x] Missing official data never creates synthetic observations.
- [x] Provider failure does not crash the dashboard.
- [x] Official observations and model predictions remain distinct.
- [x] Mode A / B / C comparison safeguards active.

### Regulatory and Scientific Integrity
- [x] CPCB breakpoints verified against official MoEFCC documentation.
- [x] Explicit CO unit handling enforced; magnitude guessing eliminated.
- [x] Full Lead (Pb) support implemented across all 6 regulatory bands.
- [x] Averaging-period eligibility enforced (`indicative_snapshot` for instantaneous/hourly readings).
- [x] Data sufficiency enforced ($\ge 3$ pollutants including $\text{PM}_{2.5}$ or $\text{PM}_{10}$).
- [x] Officially published and Avir-derived AQI distinguished.
- [x] Unsupported causal ground-model interpretations replaced with neutral physical descriptions.

### Quality and Release
- [x] All 406 previous automated tests pass without regression.
- [x] 34 new Step 4 tests pass (Total: 440 passing tests).
- [x] TypeScript compiler passes with zero errors.
- [x] Production build passes cleanly.
- [x] Zero secrets committed to Git.
- [x] Dedicated implementation documentation created.
- [x] Reviewable PR opened against `main`.
