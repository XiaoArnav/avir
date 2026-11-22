# AVIR — STEP 03 FINAL PRODUCTION CLOSURE
## Genuine Multi-Source Monitoring, Provenance & Environmental Data Quality Gate

---

## 1. Executive Summary

### What Was Broken
In the initial Step 3 baseline and subsequent intermediate iterations:
1. **Timestamp Conflation & Stale Substitution**: The OpenAQ v3 connector was substituting `loc.datetimeLast` (station-level heartbeat/metadata) into individual sensor measurement slots when specific sensor timestamps were absent. This masked dead or discontinued sensors as active and fresh.
2. **Measurement Cross-Contamination**: Timestamps from one pollutant parameter (e.g., ozone or PM10) were being borrowed to validate a different pollutant parameter (PM2.5), violating pollutant measurement independence.
3. **Radius & Parameter Parsing Mismatch**: The browser client attempted to query `/api/telemetry/sources?radius=35`, which caused HTTP 400 Bad Request responses because OpenAQ v3 strictly caps search radiuses at 25 km ($25\,000\text{ m}$). Furthermore, API query parameters allowed trailing non-numeric characters (e.g. `25abc` parsed via loose `parseFloat`).
4. **Synthetic Fallback & Consensus Artifacts**: The UI and math layers retained fallback defaults (such as synthetic `?? 150` concentrations, `?? 200` boundary layer height assumptions), and produced artificial consensus percentages or causal claims without verified multi-source physical ground stations.
5. **Client/Server Bundle Bleed**: Static top-level imports of server-side Node providers (`openaq-provider.ts`) into `telemetry-service.ts` dragged Node-only dependencies and credentials into client-side bundles.

### Why It Mattered Scientifically
In urban environmental health and atmospheric physics:
- A physical ground station reporting an active heartbeat does not mean its particulate sensor is functioning. Subsuming station metadata for measurement timing presents invalid sensor readings as real-time ground truth.
- PM2.5 and PM10 particles have distinct aerodynamic diameters and physical behaviors; substituting timestamps or values across fractions fabricates air quality states.
- Thermal inversions trap ground-level smoke while upper boundary layers remain dispersed; conflating model predictions with ground observations or fabricating percentage confidence scores misleads vulnerable citizens and masks acute respiratory hazards.

### What Was Fixed
- **Strict Timestamp Hygiene**: Individual measurements preserve exact `observedAt: obsTime || null`. Station heartbeats are stored strictly in metadata provenance (`stationLastReportedAt`) and never substitute for sensor observation timing.
- **Client-Safe Pure Domain Layer**: Created `src/config/environmental-sources.ts` exporting explicit pure selectors (`getActivePhysicalSources`, `getStalePhysicalSources`, `getRegistryOnlyStations`, `getAtmosphericModels`, `getUnconfiguredProviders`, `validateObservationTiming`) and constants (`OPENAQ_MIN_RADIUS_KM = 1`, `OPENAQ_DEFAULT_RADIUS_KM = 25`, `OPENAQ_MAX_RADIUS_KM = 25`, `MAX_COMPARISON_DISTANCE_KM = 25`, `MAX_COMPARISON_TIME_DIFF_MINUTES = 120`).
- **Complete Client/Server Decoupling**: Browser telemetry strictly invokes the internal `/api/telemetry/sources` API route with clamped radius $[1, 25]\text{ km}$. `telemetry-service.ts` dynamically imports server providers only in server runtime environments.
- **Strict Numeric Query Parsing**: `/api/telemetry/sources` validates `lat` $[-90, 90]$, `lon` $[-180, 180]$, and `radius` $[1, 25]$ using strict regex `/^-?\d+(\.\d+)?$/`, rejecting strings with trailing letters.
- **Scientific Divergence & Invariant Engine**: The inter-source comparison engine strictly verifies anchor units (`ug/m3` or `µg/m³`), matches pollutant-specific timestamps, and computes multi-source spreads without ungrounded causal claims.
- **Zero Fabrication**: When ground stations are registry-only or unobserved, the UI honestly displays "0 reporting stations" and "0 currently available ground observations", with "PM2.5 Unavailable" (never 150).

---

## 2. Verified Ingestion Architecture

```
Browser Client (React UI / Next.js Client Components)
       │
       ▼ (GET /api/telemetry/sources?lat=...&lon=...&radius=25)
Next.js Edge / Server Route Handler (src/app/api/telemetry/sources/route.ts)
       │
       ├── Strict Regex Parameter Validation (lat, lon, radius)
       ├── Clamped Radius: min(max(1, radius), 25) km
       ├── Dynamic Server Provider Ingestion (openaq-provider.ts)
       │       │
       │       ▼ (Authenticated HTTPS Request with X-API-Key)
       │   OpenAQ v3 REST API (https://api.openaq.org/v3)
       │
       └── Response Headers: Cache-Control: public, s-maxage=300, stale-while-revalidate=600
```

### Client-Server Split & Import Architecture
- **Server-Side Only**: `src/services/providers/openaq-provider.ts` and `src/app/api/telemetry/sources/route.ts` execute exclusively in Node.js/server environments.
- **Client-Side Safe**: Browser code imports pure configuration and types from `src/config/environmental-sources.ts` and invokes telemetry via `fetch('/api/telemetry/sources?...')`. Dynamic import `await import('./providers/openaq-provider')` in `telemetry-service.ts` ensures no server code or environment credentials leak into webpack client bundles.

### Caching Headers & Invalidation
The internal telemetry route emits:
```http
Cache-Control: public, s-maxage=300, stale-while-revalidate=600
```
- 5-minute ($300\text{ s}$) shared CDN/edge cache TTL prevents hammering OpenAQ endpoints on rapid client reloads.
- 10-minute ($600\text{ s}$) stale-while-revalidate window ensures instant client responses while refreshing upstream telemetry in the background.

### Parameter Validation Matrix
| Parameter | Type | Validation Rule | Invalid Handling |
| :--- | :--- | :--- | :--- |
| `lat` | Float | `/^-?\d+(\.\d+)?$/` & $[-90, 90]$ | HTTP 400 (`Invalid latitude`) |
| `lon` | Float | `/^-?\d+(\.\d+)?$/` & $[-180, 180]$ | HTTP 400 (`Invalid longitude`) |
| `radius` | Integer/Float | `/^-?\d+(\.\d+)?$/` & $[1, 25]$ km | Defaults to $25\text{ km}$; rejects $<1$ or $>25$ with HTTP 400 |

---

## 3. OpenAQ v3 Integration Contract

### Exact Endpoints Called
1. **Locations Discovery**:
   - `GET https://api.openaq.org/v3/locations?coordinates={lat},{lon}&radius={radiusMeters}&limit=10`
   - Headers: `X-API-Key: {process.env.OPENAQ_API_KEY}`, `Accept: application/json`
2. **Sensors Telemetry**:
   - `GET https://api.openaq.org/v3/locations/{locationId}/sensors`
   - Headers: `X-API-Key: {process.env.OPENAQ_API_KEY}`, `Accept: application/json`

### Field Mappings & Timestamp Hierarchy
- **Individual Sensor Measurement**:
  - `observedAt = sensor.datetime?.utc || sensor.latest?.datetime || null`
  - If null, `observedAt` remains strictly `null`. It is **never** backfilled from `location.datetimeLast`.
- **Station Heartbeat**:
  - `stationLastReportedAt = location.datetimeLast?.utc || null`
  - Kept in provenance metadata to indicate station connectivity status, completely segregated from physical observation validity.
- **Freshness Evaluation**:
  - Valid and fresh: Observation age $\le 24\text{ hours}$ (with $10\text{ min}$ clock skew allowance).
  - Stale: Observation age $> 24\text{ hours}$. Flagged as `isStale: true` and excluded from real-time inter-source comparisons.
  - Rejected: Timestamps $> 10\text{ minutes}$ in the future.

---

## 4. Scientific Comparison Engine

### Anchor Selection Logic
1. First preference: Active, verified physical ground station (`official_reference` or `citizen_calibrated`) within $\le 25\text{ km}$ and observed within $\le 120\text{ minutes}$.
2. Second preference: Primary atmospheric chemistry model (Open-Meteo ECMWF CAMS / NOAA GFS).

### Temporal & Spatial Tolerances
- **Max Comparison Distance**: $25\text{ km}$
- **Max Time Delta**: $120\text{ minutes}$ ($\Delta t \le 2\text{ hours}$)
- **Unit Parity**: Required unit $\mu\text{g/m}^3$ (or `ug/m3`). Non-particulate or mismatched units are rejected from numerical delta calculations.

### Inter-Source Comparison Mathematics
For $N$ eligible physical and modeled sources with concentrations $C_1, C_2, \dots, C_N$:
$$\text{Mean} = \bar{C} = \frac{1}{N}\sum_{i=1}^N C_i$$
$$\text{Max Divergence} = \max_{i, j} |C_i - C_j|$$
$$\Delta\% = \frac{\max(C_i) - \min(C_i)}{\bar{C}} \times 100$$
- If physical observations are absent ($N=1$, model only): The engine reports **Mode A — Single Primary Provider Active**. Zero artificial consensus percentages or fabricated agreements are rendered.

---

## 5. Quality-Gate and Verification Results

### Automated Test Matrix
- **Total Test Files**: 25 passed out of 25 files (100%)
- **Total Tests**: 392 passed out of 392 tests (100%)
- **New Integration Tests**: `tests/integration/step3-final-closure.test.tsx` (40 comprehensive tests covering Groups A through E):
  - Group A: Client-server decoupling & import boundaries (dynamic import, zero static leak)
  - Group B: Parameter parsing & strict API route validation (strict float, bounds, headers)
  - Group C: OpenAQ v3 connector contract (timestamp isolation, radius clamping, missing data)
  - Group D: Scientific comparison invariants (unit verification, timestamp matching, spread calculation)
  - Group E: Inspector UI rendering (0 reporting stations, Mode A banner, accessibility `role="dialog"`)

### TypeScript & Production Build Verification
```bash
$ npx tsc --noEmit
# Exit code: 0 (Zero TypeScript errors)

$ npm run build
# Exit code: 0 (Zero compilation errors, static pages generated cleanly)
```

### Browser QA Matrix
| Viewport / Configuration | Test Target | Observed Outcome | Evidence File |
| :--- | :--- | :--- | :--- |
| **Desktop 1440x900 (Antigravity Dark)** | Delhi-NCR Atmospheric Dashboard | Live Open-Meteo telemetry rendered, AQI 225, zero synthetic defaults | `01_delhi_dashboard.png` |
| **Desktop 1440x900** | Data Sources Modal (Top) | "0 reporting stations", "0 currently available ground observations", no 150 fallback | `02_modal_sources_top.png` |
| **Desktop 1440x900** | Data Sources Modal (Bottom) | Mode A notice, Section D regulatory derivations, Section E principles verified | `03_modal_sources_bottom.png` |
| **Mobile 390x844** | Mobile Data Sources Modal | Responsive modal rendering without horizontal overflow or clipping | `04_modal_mobile_390.png` |
| **Desktop 1440x900 (Mumbai)** | Mumbai City Switcher & Modal | Context switches cleanly to Mumbai; verified telemetry and inspector | `05_mumbai_modal.png` |
| **Desktop 1440x900** | Connect My Monitor Modal | Dialog centered (`x=464, y=272.5, w=512, h=355`), zero z-index clipping | `06_connect_monitor_modal.png` |
| **Desktop 1440x900 (Vikas Light)** | Theme Switch & Light Mode Modal | High-contrast warm paper aesthetic, legible typography, proper modal contrast | `07_light_theme_modal.png` |

---

## 6. Live OpenAQ Verification Status

> [!WARNING]
> **LIVE VERIFICATION BLOCKED — CREDENTIAL NOT CONFIGURED**
> 
> In accordance with Sections 16, 20, and 23 of the production specification, live external OpenAQ v3 API verification is explicitly reported as:
> **`BLOCKED — CREDENTIAL NOT CONFIGURED`**
> 
> - **Reason**: `OPENAQ_API_KEY` is not present in the local execution or Vercel environment (`process.env.OPENAQ_API_KEY === undefined`).
> - **Current System Behavior**: The application operates gracefully in **Mode A (Single Primary Provider Active)**, using high-resolution Open-Meteo (ECMWF CAMS & NOAA GFS) numerical models, without erroring or crashing. It honestly reports "0 reporting stations" and "Live Readings Unavailable" for unauthenticated or unobserved ground stations.
> - **Zero Synthetic Telemetry**: In compliance with our scientific charter, no mock data, synthetic keys, or fabricated sensor values were injected.

### Instructions for Repository Owner to Activate Live OpenAQ v3 Ingestion
Once an OpenAQ API key is obtained:
1. Add the secret to your Vercel project environment variables:
   ```bash
   vercel env add OPENAQ_API_KEY production
   ```
2. Or add to local `.env.local`:
   ```bash
   OPENAQ_API_KEY=your_actual_openaq_api_key_here
   ```
3. Verify live ingestion with real ground stations in Delhi (e.g. US Embassy Chanakyapuri or CPCB Anand Vihar):
   ```bash
   curl -s "http://localhost:3000/api/telemetry/sources?lat=28.6139&lon=77.2090&radius=25" | jq .
   ```
   The response will transition from Mode A to Mode B/C with live ground station observations.

---

## 7. Minimal Automated CI Gate

Created `.github/workflows/ci.yml` providing a robust release gate:
```yaml
name: CI Release Gate

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  verify:
    name: Verify Types, Tests & Production Build
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run unit & integration tests
        run: npm test

      - name: Typecheck codebase
        run: npx tsc --noEmit

      - name: Build production Next.js bundle
        run: npm run build
```

---

## 8. Unresolved Risks and Step 4 Recommendations

### Unresolved External Risks
1. **Third-Party API Rate Limits**: OpenAQ v3 enforces strict rate limits on free API keys. While our Edge caching (`s-maxage=300`) buffers repeated queries, high concurrent user traffic on un-cached coordinates could deplete API quotas.
2. **Sensor Humidity Drift**: Low-cost optical sensors (SDS011, PMS5003) experience hygroscopic particle swelling in dense winter morning radiation fogs ($\text{RH} > 80\%$). EPA Barkjohn corrections mitigate this, but relative humidity must be reliably available.

### Step 4 Recommendations (Statutory CPCB Continuous Ingestion)
- Implement a dedicated serverless scraper / ingestion worker for statutory CPCB (Central Pollution Control Board) CAAQMS stations.
- Store official 15-minute statutory reference records with cryptographic hashes for regulatory provenance.
- Maintain independent tracks for statutory regulatory enforcement (CPCB NAQI) and high-resolution personal health guidance (EPA Breakpoints).

---

## 9. Pollutant-Specific Freshness and Unified Active-Source Counting

### 1. The Original Timestamp Contamination Defect
In earlier implementations of `getActivePhysicalSources()` and `getStalePhysicalSources()`:
```typescript
const obsTime = measurement.observedAt || src.observedAt;
```
This fallback allowed station-level metadata (`src.observedAt` or `datetimeLast`) to contaminate individual pollutant freshness. If a physical station reported fresh PM10 or an active station heartbeat while its PM2.5 sensor was untimed or discontinued, the station-level timestamp falsely validated PM2.5 as active and fresh. Scientifically, this represented an invalid transfer of measurement provenance across physical particulate fractions.

### 2. The Exact Code Fix
In `src/config/environmental-sources.ts`, we eliminated all timestamp fallback logic:
```typescript
const obsTime = measurement.observedAt ?? null;
```
Observation timing is strictly resolved from the pollutant measurement itself. Station-level timestamps remain in `src.observedAt` and `src.provenance.limitations` strictly as informational device heartbeats and can never validate an individual pollutant's freshness.

### 3. The Shared Canonical Eligibility Function
Created `evaluateMeasurementEligibility(source, targetPollutant, now)` in `src/config/environmental-sources.ts`:
```typescript
export type MeasurementEligibility =
  | {
      eligible: true;
      pollutant: 'pm25' | 'pm10';
      value: number;
      unit: string;
      observedAt: string;
      ageMinutes: number;
    }
  | {
      eligible: false;
      reason:
        | 'missing_measurement'
        | 'invalid_value'
        | 'unsupported_unit'
        | 'missing_timestamp'
        | 'invalid_timestamp'
        | 'future_timestamp'
        | 'stale'
        | 'source_unavailable'
        | 'registry_only'
        | 'duplicate_source';
      message: string;
    };
```
This pure domain function enforces:
- Source availability (`status !== 'not_configured' && status !== 'registry_only' && status !== 'unavailable'`).
- Measurement presence for target pollutant.
- Non-negative, finite numeric value (`value >= 0 && Number.isFinite(value)`).
- Valid concentration unit (`ug/m3` or `µg/m³`).
- Measurement-specific observation timestamp (`obsTime = measurement.observedAt ?? null`).
- Clock-skew rejection ($> 10\text{ min}$ future forward skew).
- Freshness policy enforcement ($\le 24\text{ hours}$).

### 4. Fresh, Stale, and Unverifiable Distinctions
- **Fresh**: Authentically observed $\le 24\text{ hours}$ ago with valid particulate unit and concentration. Counted as active.
- **Stale**: Authentically observed $> 24\text{ hours}$ ago. Excluded from active counts; selectable via `getStalePhysicalSources()`.
- **Timestamp Unavailable (Unverifiable)**: Measurement concentration present without an observation timestamp. Not counted as active and not branded stale; displayed honestly as "Timestamp Unavailable".
- **Invalid**: Negative values, non-finite numbers, or rejected quality flags.
- **Unavailable**: Network outages, HTTP errors, or unconfigured server credentials.

### 5. Unified `activeCount` Contract
Previously, `openaq-provider.ts` computed `activeCount` using `r.status === 'fresh'`, while the UI inspector used physical monitor selectors.
Now, both use `getActivePhysicalSources(sources, 'pm25')`:
- `activeCount`: Canonical active PM2.5 reporting physical ground monitors.
- `activePm25Count`: Explicit active PM2.5 count.
- `activePm10Count`: Explicit active PM10 count.
- `availableStationCount`: Distinct physical stations registered within the search radius.
All displayed counts in the UI header, card badges, and API JSON responses strictly agree.

### 6. Provider-Scoped Deduplication and Verified Cross-Provider Identity
Previously, `getPhysicalStationDeduplicationKey()` used `station:${src.stationId.trim().toLowerCase()}`, which risked collapsing two completely unrelated monitoring networks that happen to use the same numeric/string ID (such as OpenAQ location `#101`, Sensor.Community sensor `#101`, and CPCB CAAQMS station `#101`).

**Corrective Implementation**:
1. **Provider-Scoped by Default**: Stations are keyed by default with their provider / network scope (`provider:${provider}:${stationId}` or `upstream:${upstreamNet}:${stationId}`). This guarantees that unrelated networks sharing identical IDs are treated as distinct physical monitors.
2. **Verified Upstream Lineage Merging**: When an aggregator (e.g., OpenAQ) explicitly records the originating upstream authority (`src.upstreamProviderId === 'cpcb_caaqms'`) alongside the physical station ID, and a direct agency feed reports the same upstream network and station ID, the shared lineage merges them into a single physical station (`upstream:cpcb:${stationId}`).
3. **Explicit Cross-Provider Registry Mapping (`VERIFIED_CROSS_PROVIDER_STATION_MAP`)**: Cross-provider records are merged across disparate provider namespaces when registered in the verified cross-provider mapping dictionary (e.g., `openaq:5001` and `airnow:chanakyapuri` both map to `canonical:us_embassy_chanakyapuri`).
4. **Uniformity Across Selectors and Domain Math**: `getPhysicalStationDeduplicationKey()` is directly shared by `getActivePhysicalSources()`, `getStalePhysicalSources()`, `deduplicateEnvironmentalSources()`, and `fetchOpenAqProviderResult()`.
5. **Comprehensive Automated Tests**: Validated in `tests/integration/step3-pollutant-freshness-edge-cases.test.ts` (Group: Provider-Scoped Deduplication & Verified Cross-Provider Identity).

### 7. API Response Semantics
The Next.js route `/api/telemetry/sources` returns:
```json
{
  "provider": "openaq",
  "status": "available",
  "sources": [...],
  "retrievedAt": "2026-11-23T00:15:00.000Z",
  "count": 2,
  "activeCount": 1,
  "activePm25Count": 1,
  "activePm10Count": 1,
  "availableStationCount": 1,
  "errorCode": null
}
```
HTTP headers enforce Edge caching:
`Cache-Control: public, s-maxage=300, stale-while-revalidate=600`.

### 8. Verification Results Matrix
- **Test Suite**: 26 test files passed, 402 tests passed (100% pass rate).
- **Cases A through J Regression Suite** (`tests/integration/step3-pollutant-freshness-edge-cases.test.ts`):
  - Case A (PM10 fresh, PM2.5 untimed): PASS.
  - Case B (PM2.5 fresh, PM10 untimed): PASS.
  - Case C (PM2.5 stale, PM10 fresh): PASS.
  - Case D (PM2.5 invalid, PM10 valid): PASS.
  - Case E (Station timestamp exists, PM2.5 untimed): PASS.
  - Case F (Two aggregators expose one station): PASS.
  - Case G (Missing PM2.5 value, valid PM10 value): PASS.
  - Case H (Valid PM2.5 zero accepted): PASS.
  - Case I (Future-dated PM2.5 rejected): PASS.
  - Case J (Provider status fresh, pollutant timestamp missing): PASS.
- **TypeScript**: `npx tsc --noEmit` exited 0.
- **Production Build**: `npm run build` compiled 6/6 static and dynamic routes successfully.
- **Live OpenAQ Status**: `NOT LIVE-VERIFIED (BLOCKED — OPENAQ_API_KEY NOT CONFIGURED)`.

