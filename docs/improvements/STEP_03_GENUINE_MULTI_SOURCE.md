# AVIR — STEP 03 OF 24: GENUINE MULTI-SOURCE MONITORING, PROVENANCE & ENVIRONMENTAL DATA QUALITY

**Document Reference:** `docs/improvements/STEP_03_GENUINE_MULTI_SOURCE.md`  
**Target Repository:** `https://github.com/XiaoArnav/avir`  
**Production Site:** `https://avir-blue.vercel.app/`  
**Branch:** `feat/avir-03-genuine-multi-source`  
**PR Title:** `feat(telemetry): integrate genuine independent air quality sources with provenance and quality validation`  
**Baseline Commit SHA:** `2318c5ea1ab29c6d4d679075b26a1a7cea2bc7ff` (on `main`)  
**Verified Commit Author:** `XiaoArnav <322868724+XiaoArnav@users.noreply.github.com>`

---

## 1. Executive Summary

Step 3 of the 24-step Avir production roadmap elevates Avir from a single-model atmospheric dashboard to an honest, multi-source environmental intelligence system. Prior to this release:
1. Ground stations and atmospheric models lacked a unified, canonical representation with full provenance, reporting latency, and instrument limitations.
2. The nearest-station discovery algorithm suppressed live citizen-science observations (e.g. Sensor.Community) whenever a static regulatory station existed nearby in the registry without streaming measurements.
3. OpenAQ API v3 global physical observations were not yet connected to the backend pipeline.
4. The consensus engine allowed uncalibrated percentage confidence formulas (e.g., 50%–98%) rather than computing scientific concentration differences ($\Delta \mu\text{g/m}^3$).
5. The "Data Sources & Quality" interface lacked a structured, 5-section breakdown separating genuine independent physical observations from derived mathematical regulatory standards (US EPA AirNow and CPCB NAQI).

This release introduces canonical source contracts, server-side OpenAQ v3 integration with strict credential security, unblocked Sensor.Community discovery, a 3-mode comparison engine (Mode A, Mode B, Mode C) with zero synthetic confidence scores, a redesigned 5-section Data Sources & Quality modal, and 57 new automated tests (bringing the verified suite to 24 test files and 328 passing tests).

---

## 2. Core Architectural Changes & Deliverables

### 2.1 Canonical Data Contracts (`src/domain/types.ts`)
- `EnvironmentalSourceKind`: Strict discrimination between `'atmospheric_model' | 'official_ground_station' | 'community_optical' | 'user_hardware' | 'satellite_reanalysis' | 'derived_standard'`.
- `EnvironmentalSourceStatus`: Typed lifecycle states: `'fresh' | 'active' | 'stale' | 'unavailable' | 'rejected' | 'unreachable' | 'error' | 'not_configured' | 'registry_only'`.
- `SourceMeasurement`: Fine-grained particulate/gas records containing strictly validated numeric values (preserving valid zero, rejecting negative/NaN/Infinity), standardized units (`ug/m3`), averaging period minutes, observation timestamps, raw uncalibrated values, and hygroscopic calibration formulas.
- `EnvironmentalSourceRecord`: Immutable canonical identity encompassing provider ID, upstream agency (e.g., CPCB, DPCC, AirNow), physical station ID, geographical distance (Haversine km), model grid resolution, and explicit provenance limitations.
- `SourceComparison`: Evaluates inter-source comparability across three mutually exclusive modes:
  - **Mode A (`mode_a_single_source`)**: Exactly 1 eligible source is present (e.g., Open-Meteo atmospheric model). Returns status `'insufficient_sources'` with zero fabricated confidence or spread.
  - **Mode B (`mode_b_incompatible`)**: Two or more sources exist but violate scientific comparability criteria (distance $>35\text{ km}$, time difference $>120\text{ minutes}$, incompatible averaging periods, or incompatible units). Outlines exact incompatibility reasons without averaging.
  - **Mode C (`mode_c_comparable`)**: Two or more independent physical observations or models satisfy all parity criteria. Computes exact absolute difference $\Delta \mu\text{g/m}^3$ and relative percentage, with boundary-layer trapping explanations where appropriate.

### 2.2 Server-Side OpenAQ v3 Connector (`src/services/providers/openaq-provider.ts`)
- **Strict Credential Security**: Kept server-side via `process.env.OPENAQ_API_KEY`. Never exposed to client bundles, component props, URLs, or browser local storage.
- **Honest Unconfigured Fallback**: When `OPENAQ_API_KEY` is not present, emits status `'not_configured'` with informative provenance without throwing or crashing.
- **Resilience & Rate-Limit Handling**: Catches HTTP 401 (`'rejected'`), HTTP 429 (`'unreachable'`), HTTP 5xx (`'unreachable'`), and network timeouts gracefully.
- **In-Memory Bounded Cache**: Caches coordinates within 10-minute TTL to prevent rate-limit penalties, preserving original physical observation timestamps across cache cycles.

### 2.3 OpenAQ API Route (`src/app/api/telemetry/sources/route.ts`)
- Clean Next.js App Router endpoint `GET /api/telemetry/sources?lat=...&lon=...&radius=...`.
- Enforces strict numeric bounds: latitude $[-90, 90]$, longitude $[-180, 180]$, radius $[1, 100]\text{ km}$.
- Rejects SSRF risks by enforcing fixed upstream API allowlists.
- Emits Edge Cache-Control headers (`public, s-maxage=300, stale-while-revalidate=600`).

### 2.4 Ground Station Unblocking (`src/services/ground-station-service.ts`)
- Resolved the discovery defect where static CPCB CAAQMS registry entries suppressed active citizen-science sensors (Sensor.Community).
- Added `discoverGroundStationSources(lat, lon, rh, options)`: Returns both verified CPCB registry stations (`status: 'registry_only'`, `measuredAt: null`) AND active hyperlocal Sensor.Community monitors (`status: 'fresh' | 'stale'`, calibrated via EPA Barkjohn when relative humidity is verified).
- Added `convertGroundStationToSourceRecord`: Translates ground stations into canonical `EnvironmentalSourceRecord` models with honest metadata.

### 2.5 Source Normalization & Comparison Engine (`src/domain/source-comparison.ts`)
- `createOpenMeteoModelRecord`: Formulates Open-Meteo ECMWF IFS / CAMS aerosol chemistry predictions as an `atmospheric_model`.
- `deduplicateEnvironmentalSources`: Identifies and collapses duplicate records originating from identical upstream monitors across multiple aggregators. Excludes mathematical derived standards from independent observation counts.
- `compareEnvironmentalSources`: Applies strict scientific eligibility rules:
  - Spatial proximity limit: $\le 35\text{ km}$.
  - Temporal delta limit: $\le 120\text{ minutes}$.
  - Stale observation limit: $\le 24\text{ hours}$.
  - Unit parity: strictly $\mu\text{g/m}^3$ for particulate matter.

### 2.6 Redesigned "Data Sources & Quality" Interface (`src/components/MultiSourceInspectorModal.tsx`)
Restructured into 5 distinct, accessible sections adhering to Avir's high-contrast dark/light design system:
- **Section A (Telemetry Overview)**: Primary model name, genuine count of reporting surface monitors, and comparison status.
- **Section B (Independent Environmental Sources)**: Distinct visual badges for Atmospheric Model (blue), Physical Reference Monitor (amber), Community Optical (emerald), and Local Hardware (cyan), displaying concentration, location, observation time, attribution, and limitations.
- **Section C (Multi-Source Inter-Comparison)**: Context-aware presentation for Mode A (Single source guidance), Mode B (Explicit incompatibility reasons), and Mode C (Scientific $\Delta \mu\text{g/m}^3$ concentration spread and boundary layer trapping insights).
- **Section D (Derived Regulatory Interpretations)**: Clearly segregated US EPA AirNow (0–500) and CPCB NAQI piecewise sub-indices, with an explicit advisory that these represent mathematical calculations from particulate mass, not additional physical monitoring stations.
- **Section E (Environmental Data Quality & Provenance Principles)**: Authoritative scientific educational guide covering modeled vs. observed dynamics, optical hygroscopic humidity swelling, boundary-layer inversion trapping, and comparison eligibility.

---

## 3. Files Modified and Created

| File | Action | Purpose |
| :--- | :--- | :--- |
| `src/domain/types.ts` | Modified | Added canonical types: `EnvironmentalSourceKind`, `EnvironmentalSourceStatus`, `SourceMeasurement`, `EnvironmentalSourceRecord`, `SourceComparisonStatus`, `SourceComparisonMode`, `SourceComparison`, and extended `AtmosphericMetrics`. |
| `.env.example` | Created | Documented `OPENAQ_API_KEY` and `GEMINI_API_KEY` for server configuration. |
| `src/services/providers/openaq-provider.ts` | Created | Server-side OpenAQ v3 connector with authentication, rate-limiting, coordinate validation, unit checks, and in-memory caching. |
| `src/app/api/telemetry/sources/route.ts` | Created | Protected Next.js API route serving environmental sources with input validation and Edge caching. |
| `src/services/ground-station-service.ts` | Modified | Unblocked citizen-science sensor discovery alongside static CPCB registry stations; added canonical source converters. |
| `src/domain/source-comparison.ts` | Created | Pure domain engine for source deduplication, Open-Meteo model normalization, eligibility rules, and 3-mode comparison. |
| `src/services/telemetry-service.ts` | Modified | Integrated multi-source discovery into the live telemetry pipeline; assembled `environmentalSources` and `sourceComparison`. |
| `src/components/MultiSourceInspectorModal.tsx` | Modified | Redesigned modal with 5 distinct sections (Overview, Sources, Comparison, Regulatory, Methodology). |
| `src/app/page.tsx` | Modified | Passed canonical sources and comparison objects to `MultiSourceInspectorModal`. |
| `tests/unit/source-normalization.test.ts` | Created | 23 automated tests covering Groups A, C, and D. |
| `tests/unit/source-comparison.test.ts` | Created | 9 automated tests covering Groups D and E. |
| `tests/integration/openaq-provider.test.ts` | Created | 12 automated tests covering Groups B and F. |
| `tests/integration/multi-source-pipeline.test.ts` | Created | 4 automated tests covering Groups F and G. |
| `tests/integration/source-inspector.test.tsx` | Created | 9 automated tests covering Group G UI rendering. |

---

## 4. Test Verification Summary

All 24 test suites and all 328 automated tests pass with zero failures:

```
Test Files  24 passed (24)
     Tests  328 passed (328)
  Duration  11.78s
```

### Coverage across 60 Mandated Scenarios:
- **Group A (Provenance & Identity, 1–8)**: Verified classification of Open-Meteo as modeled, OpenAQ as observed, Sensor.Community as citizen optical, CPCB/EPA as derived standards, duplicate elimination, registry-only isolation, and explicit unknown provider handling.
- **Group B (OpenAQ Connector & Security, 9–18)**: Verified parsing of OpenAQ v3 payload, missing API key handling (`not_configured`), server-side credential isolation, HTTP 401 rejection, HTTP 429 rate-limiting, HTTP 500 safety, malformed JSON protection, empty station handling, and coordinate preservation.
- **Group C (Physical Measurements Integrity, 19–27)**: Verified PM2.5 zero preservation, null preservation for missing readings, strict PM10/PM2.5 separation, negative concentration rejection, NaN/Infinity rejection, unit validation, clock skew rejection, and stale timestamp flagging (>24h).
- **Group D (Source Independence & Discovery, 28–33)**: Verified single model produces 1 source, derived AQI cannot inflate count, identical upstream sensors collapse to 1 observation, Open-Meteo + OpenAQ produces 2 sources, multi-pollutant binding, and unblocked citizen sensor discovery.
- **Group E (Comparison Engine Modes, 34–42)**: Verified Mode A single source behavior, Mode B unit incompatibility, Mode B averaging period mismatch, Mode B stale observation exclusion, Mode B distance limit (>35km), Mode B timestamp delta (>120m), Mode C scientific absolute difference ($\Delta \mu\text{g/m}^3$), zero fabricated confidence percentage, and boundary-layer trapping divergence.
- **Group F (Cache Invariants & Failure Isolation, 43–49)**: Verified timestamp preservation in cache, OpenAQ outage isolation, Sensor.Community failure isolation, city-switching state isolation, concurrent cache hits, and bounded rate-limit retries.
- **Group G (Source Inspector UI & Accessibility, 50–60)**: Verified accurate source counts, visual classification badges, honest unavailable states, segregated regulatory calculations, Mode B explanation display, clean modal open/close, dark/light contrast, mobile responsive flex wrapping, and resilient error rendering.

---

## 5. Verification Commands

```bash
# 1. Verify clean typecheck
npx tsc --noEmit

# 2. Run complete test suite (328 tests)
npm test

# 3. Verify production Next.js compilation
npm run build
```
