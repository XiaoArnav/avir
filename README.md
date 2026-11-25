# Avir — Urban Air Quality & Atmospheric Intelligence Command Center

> **Real-time 3D Earth observation, global NWP wind streamlines, multi-source ground & satellite telemetry, exposure physics, and daily smog mitigation planning.**
>
> **Live Deployment:** [https://avir-blue.vercel.app](https://avir-blue.vercel.app) · **Repository:** [github.com/XiaoArnav/avir](https://github.com/XiaoArnav/avir) · **Project Context:** PromptWars Virtual Challenge 6 · **License:** [MIT](LICENSE)

Avir is an atmospheric intelligence and urban air-quality decision platform built with **Next.js 15 App Router**, **React 19**, **TypeScript**, **CesiumJS**, and **Three.js**. Every calculation, visualization, and status badge follows strict **zero-fabrication** and **honest data provenance** invariants: sensor readings, atmospheric forecasts, satellite imagery, active fires, and statutory advisories are never synthesized or blended silently when upstream feeds are missing, stale, or unavailable.

---

## Table of Contents

- [Core Capabilities](#core-capabilities)
- [3D Earth Command Center & Environmental Layers](#3d-earth-command-center--environmental-layers)
- [Workspaces (`FloatingDock`)](#workspaces-floatingdock)
- [Scientific Standards & Mathematical Models](#scientific-standards--mathematical-models)
- [Multi-Source Telemetry, Source Control & BYOD Hardware](#multi-source-telemetry-source-control--byod-hardware)
- [API Reference](#api-reference)
- [Security, Privacy & Reliability Architecture](#security-privacy--reliability-architecture)
- [Project Structure](#project-structure)
- [Local Setup & Environment Variables](#local-setup--environment-variables)
- [Testing & CI Release Gate](#testing--ci-release-gate)
- [Data Attributions & Acknowledgments](#data-attributions--acknowledgments)

---

## Core Capabilities

- **Dual-Engine 3D Earth + Accessible 2D Map**: Primary **CesiumJS** satellite globe (`Esri World Imagery` with `OpenStreetMap` fallback) paired with a toggleable/automatic **Three.js** WebGL globe (`NASA Blue/Black Marble` + custom atmospheric rim shader) and a **2D Geographic Observation Map** with a sortable station ledger.
- **Global Wind Flow V2 (`NOAA GFS` & `ECMWF IFS`)**: Serverless pure-TypeScript **GRIB2 decoder** streaming compact IEEE-754 `Float32Array` grids to GPU-animated streamlines (`CesiumJS` 30°-cell flow shader and `Three.js` sphere-tangent ribbons) plus scalar field drapes (`Wind Speed`, `2 m Air Temperature`, `MSL Pressure`).
- **Satellite Earth Observation Overlays**: Live **NASA FIRMS** VIIRS `NOAA-20` 375 m thermal anomalies (works keyless via regional CSV archives or with optional `FIRMS_MAP_KEY`), keyless **Re:Earth / Mapterhorn 3D Quantized-Mesh Terrain**, and a **NASA GIBS** Before/After reflectance comparison slider (`VIIRS NOAA-21` & `HLS Sentinel-2`).
- **Dual-Standard Regulatory Air Quality**: Switch live between **Indian CPCB NAQI** (8-pollutant statutory piecewise index with >= 3 pollutant sufficiency enforcement) and **2024 Revised US EPA PM2.5 NAAQS** (`40 CFR Part 58 App G`).
- **Source Control & Personal Hardware Monitors**: Switch dynamically across `automatic`, `official_ground`, `openaq`, `atmospheric_model`, and `specific_station` modes, or connect USB `WebSerial` and local Wi-Fi air monitors (e.g., **AirGradient ONE**, **AirGradient Open Air**, **Project Vaayu**) with **US EPA Barkjohn** RH calibration gating.
- **Exposure Physics & Deterministic Action Planning**: Discrete inhaled PM2.5 mass calculator, forecast-driven **Routine Shifter**, **IAQ Engineering Studio** (ACH, exponential particle decay, Corsi-Rosenthal Box BOM), **Commute Exposure Calculator**, **Mask & HEPA Lifespan Checker**, **CAQM GRAP NCR Jurisdiction Resolver**, and **Gemini 2.5 Flash** qualitative explanations backed by deterministic guardrails.

---

## 3D Earth Command Center & Environmental Layers

Avir initializes with **CesiumJS** as the default 3D engine (`src/components/globe/AvirGlobe.tsx`) and preserves layer state and forecast wind snapshots across engine switches (`CESIUM` <-> `THREE`) and `3D` <-> `2D MAP` toggles.

### Rendering Engines

| Mode | Implementation | Imagery / Textures | Fallback Behavior |
| :--- | :--- | :--- | :--- |
| **CesiumJS** *(Default)* | `src/components/globe/cesium/AvirCesiumGlobe.tsx` | Esri World Imagery (`ArcGIS`), falling back to OpenStreetMap; diurnal planetary lighting; static assets staged to `public/cesium/` via `scripts/copy-cesium.mjs` | Automatically switches to Three.js if Cesium WebGL initialization fails |
| **Three.js** *(Fallback / Toggle)* | `src/components/globe/AvirGlobeCanvas.tsx` | `public/textures/earth-night.jpg` (dark) / `earth-blue-marble.jpg` (light) + Rayleigh rim shader; isolated mouse-wheel & pinch zoom (`three-camera-controller.ts`) | Falls back to procedural canvas textures or 2D map if WebGL is unavailable |
| **2D Map & Station Ledger** | `src/components/globe/AccessibleEarthFallback.tsx` | Accessible 2D equirectangular station projection + tabular station ledger (`View Tabular Station Ledger`) | Zero-WebGL accessible baseline |

### `ENVIRONMENTAL LAYERS` Controls (`GlobeControls.tsx`)

| Layer | Data Source & Resolution | Features & Reliability Controls |
| :--- | :--- | :--- |
| **Wind Flow (V2)** | **NOAA GFS 0.25°** (cycles `00/06/12/18z`, up to `+384h`) & **ECMWF IFS 0.25°** (`00/12z` up to `+360h`, `06/18z` up to `+144h`), plus regional Open-Meteo `best_match` vectors | Pure-TS GRIB2 decoding (`Template 5.0/5.2/5.3` spatial differencing & `Template 5.42` CCSDS AEC), 24h historical cycle matching via `cycleAtOrBefore`, overlays (`Flow`, `Speed`, `Temp`, `Pressure`), `km/h` / `m/s` / `mph` units, pause & `prefers-reduced-motion` support, point wind inspection, bounded LRU caches (`24` snapshots, 30 min TTL / 6h stale), subscriber-isolated request cancellation |
| **Active Fires** | **NASA FIRMS** (`VIIRS NOAA-20` 375 m trailing-24h thermal anomalies within `1–1,000 km`, default `500 km`) | Works **keyless** via smallest matching official `VIIRS_NOAA20_C2_24H` regional CSV archive (with `Global` ocean/border fallback) or via optional server `FIRMS_MAP_KEY` (`VIIRS_NOAA20_NRT` Area API); dateline bbox splitting, Haversine distance filtering, IPv4 fallback retry, 30 min cache, key redaction |
| **3D Terrain Mesh** | **Re:Earth / Mapterhorn** ellipsoidal quantized mesh (`https://terrain.reearth.land/cesium-mesh/ellipsoid`, `CC BY 4.0`) | CesiumJS-only; generation-token async race guards, burst `429/502/503/504` shared-cooldown retry (`TERRAIN_RETRY_ATTEMPTS = 3`), clean fallback to `Cesium.EllipsoidTerrainProvider` on persistent errors |
| **Satellite Imagery** | **NASA EOSDIS GIBS** Worldview Snapshots (`VIIRS_NOAA21_CorrectedReflectance_TrueColor` on 250m grid & `HLS_S30_Nadir_BRDF_Adjusted_Reflectance` on 31.25m grid) | Interactive **Before / After Comparison Slider** (`SatelliteComparisonSlider.tsx`) with keyboard accessibility, `DescribeDomains` temporal lookup, honest availability states (`candidate`, `global_date_listed`, `verified_regional`, `unavailable`, `unverified`), and optical-vs-PM2.5 scientific disclosures |

---

## Workspaces (`FloatingDock`)

The persistent mission dock switches across five workspaces under the Earth Command Center and Today's Action Guide:

1. **Air Quality** *(default)*
   - **Active City Card & Environmental Details Drawer**: Displays primary AQI/NAQI index, category, dominant pollutant, data source pill (click to open **Source Control**), freshness timestamp, mixing/BLH metrics, and verified regulatory status.
   - **24-Hour Diurnal Trend & Smog Forecast** (`DiurnalForecastTimeline.tsx`): Synchronizes hourly PM2.5 / US AQI and Planetary Boundary Layer Height (BLH) with solar radiation windows and highlights thermal inversion traps (`snap back to NOW` supported).
   - **Wind & Smoke Dispersion** (`WindVectorGauge.tsx`, `WindDispersionVisualizer.tsx`): Real-time surface ventilation assessment and directional vector rose.
   - **Compare Cities: Smog Shootout** (`CityShootout.tsx`): Side-by-side comparison across tracked cities with explicit methodological notices when comparing reference ground stations vs. atmospheric model baselines.
   - **Commute Exposure Calculator** (`CommuteCalculator.tsx`): Compares transit modes across `15m`–`90m` durations (6 interactive UI modes: Metro Transit, Car AC/Recirc, AC City Bus, Open Bus, Walking, Cycling; domain model also supports `car_windows_open`).
   - **Mask & Filter Lifespan Checker** (`FilterLifespanEstimator.tsx`): Estimates respirator saturation cycles (`N95 / FFP2`, `KF94`, `3-Ply Surgical`, `Cloth`) and HEPA purifier filter replacement intervals from live PM2.5 (`0 µg/m³` treated as valid clean air).
   - **Target Global Air Station & Protection Profile**: City geocoding search (`Open-Meteo` geocoder with predefined fallback), ephemeral `Locate Me` browser GPS, and sensitivity tier customization.
2. **World Data** (`WorldDataExplorer.tsx`)
   - Tracks **35 global metropolitan hubs** (`WORLD_METROS` in `src/services/world-telemetry-service.ts`) pinned to ECMWF `cams_global` via batch coordinates with coordinate-mismatch checks, regional filters (`All`, `Asia`, `Europe`, `Americas`, `Middle East & Africa`, `Oceania`), severity filters, comparability status, and Grid / Table / 3D Globe modes.
3. **Daily Plan** (`RoutineBuilder.tsx`, `RoutineShifter.tsx`)
   - Editable daily schedule builder (`<= 15` activities) with flexible time-window bounds, discrete inhaled PM2.5 dose totals, forecast-driven activity shifting to cleaner daytime mixing hours, and AI narrative summaries.
4. **Clean Home** (`IAQStudio.tsx`)
   - **Indoor Air Engineering Studio**: Calculates real Air Changes per Hour (`ACH`), well-mixed exponential decay half-life clearance, metric/imperial room volume, 5 cleaner presets (**4-Filter Corsi-Rosenthal Box** `450 CFM`, **5-Filter CR Box** `520 CFM`, **Single-Filter DIY** `280 CFM`, **Commercial HEPA Medium** `250 CFM`, **Commercial HEPA Large** `400 CFM`), and customizable Bill of Materials (`INR`).
5. **Community** (`VerifiedAdvisoryPanel.tsx`, `RwaBulletinModal.tsx`, `SchoolSafetyAdvisoryModal.tsx`)
   - Displays verified **CAQM Graded Response Action Plan (GRAP)** applicability for NCR jurisdictions (`Strict Transparency Notice`: GRAP stages are never inferred solely from numeric AQI outside verified NCR orders) plus structured guidance generators for Resident Welfare Associations (RWAs), schools, and shareable bulletins.

---

## Scientific Standards & Mathematical Models

Canonical domain definitions are documented in [GLOSSARY.md](GLOSSARY.md) and enforced in `src/domain/`:

- **2024 Revised US EPA PM2.5 NAAQS** (`src/domain/air-math.ts`): Implements `40 CFR Part 58, Appendix G` (`89 FR 16202`, effective May 6, 2024), tightening the `Good` (AQI `0–50`) 24-hour PM2.5 threshold to **`0.0–9.0 µg/m³`** and scaling `Hazardous` up to **`325.4 µg/m³` -> AQI 500**, alongside the historical 2012 table for longitudinal comparison.
- **Indian CPCB NAQI** (`src/domain/cpcb-naqi.ts`): Full 8-pollutant piecewise linear interpolation (`PM2.5`, `PM10`, `NO2`, `SO2`, `CO`, `O3`, `NH3`, `Pb`), enforcing explicit unit verification, **minimum 3-pollutant sufficiency requiring `PM2.5` or `PM10`**, and strict classification between `statutory_compliant` 24h/8h official averages and `indicative_subindex` / `indicative_snapshot` readings.
- **Inhaled Pollutant Mass Physics** (`src/services/exposure/exposure-engine.ts`, `src/domain/exposure-types.ts`):
  ```text
  Inhaled Mass (µg) = C_ambient (µg/m³) × η_micro × V_E (m³/min) × Δt (min)
  ```
  Uses **US EPA Exposure Factors Handbook (2011, Table 6-1)** adult minute ventilation rates (`0.008 m³/min` resting, `0.012` light, `0.025` moderate, `0.045` vigorous) and documented microenvironment ratios (`1.00` outdoor, `0.75` indoor unfiltered, `0.20` indoor clean at 3–5 ACH, `0.30` car w/ AC recirc, `0.55` AC bus, `0.25` metro, `1.15` active roadside).
- **Zero-Fabrication & Eligibility Rules** (`src/config/environmental-sources.ts`): Enforces a 25 km max comparison radius (`OPENAQ_MAX_RADIUS_KM = 25`), 120-minute max comparison time divergence, 24-hour max observation age, and 10-minute future-skew tolerance. Preserves authentic `0 µg/m³` clean-air readings and rejects model multipliers masquerading as station measurements.

---

## Multi-Source Telemetry, Source Control & BYOD Hardware

### Source Resolution Modes (`src/services/source-control/`)

Users can inspect every nearby station in `MultiSourceInspectorModal` and switch active resolution preferences across five modes:
- `automatic` · `official_ground` (CPCB/DPCC CAAQMS) · `openaq` (OpenAQ v3) · `atmospheric_model` (Open-Meteo / ECMWF CAMS & IFS) · `specific_station`

### Personal Hardware Connector (`src/components/DeviceConnectorModal.tsx`)

- **USB (`WebSerial` API)** and **Local Wi-Fi LAN Polling** (with address validation in `wifi-address-validator.ts` and strict separation between device-reported `observedAt` and local `receivedAt`).
- **Pre-configured Profiles** (`src/services/devices/device-profiles.ts`): **AirGradient ONE (`I-9PSL`)** (`/measures/current`, PMS5003 + Senseair S8 CO2 + SHT40), **AirGradient Open Air (`O-1PST`)**, **Project Vaayu Monitor**, plus protocol-compatible & manual modes.
- **Barkjohn Humidity Correction** (`src/domain/calibration-math.ts`): Applies the Barkjohn et al. (2021) purple/PMS optical correction **only** when the device identity is verified/selected, the sensor model is eligible (`Plantower PMS5003/T` or `Nova SDS011`), units are valid `µg/m³`, local relative humidity is co-located, and firmware has not already compensated raw readings (preventing double-calibration).

---

## API Reference

All Route Handlers live in `src/app/api/` and execute strictly on the server with input validation:

| Method & Route | Purpose & Upstream Source | Validation, Caching & Rate Limits |
| :--- | :--- | :--- |
| `POST /api/ai/plan` | Deterministic exposure optimization (`DailySchedule`) + optional qualitative narrative via **Gemini 2.5 Flash** (`x-goog-api-key`, `temperature: 0.2`, 8s timeout) | Sliding-window IP rate limiter, `100 KB` bounded JSON read, clinical sensitivity minimization, prompt-injection stripping, numeric-fabrication & medical-claim output guardrails (`plan-validator.ts`), automatic deterministic fallback |
| `GET /api/environment/fires` | Active-fire thermal anomalies near `?lat=&lng=&radiusKm=` (default `500`, max `1000`) | Strict finite-float & bounds validation, `30 req/min` rate limiter, 30 min cache, keyless FIRMS regional CSV archive or optional `FIRMS_MAP_KEY` Area API |
| `GET /api/environment/wind` | Regional 3x3 & active-city 10 m wind vectors from Open-Meteo Forecast (`best_match`) for `?lat=&lng=&hour=&validTimeUtc=` | Strict coordinate/hour/ISO UTC validation, coordinate snap check (`<= 1.0°`), 30 min cache |
| `GET /api/environment/wind/global` | Global Wind V2 JSON manifest (`schemaVersion: 2`) for `?model=gfs\|ifs&overlay=none\|speed\|temperature\|pressure&validAtUtc=` | Selects cycle via `cycleAtOrBefore` (`24h` past to `+384h` GFS / `+360h` IFS), bounded LRU cache, subscriber-isolated abort handling |
| `GET /api/environment/wind/global/grid` | Binary wind grid (`application/octet-stream` Float32 `U`/`V`/optional scalar) for `?model=&overlay=&date=YYYYMMDD&hour=&step=` | Synoptic cycle & step validation, decoded from NOAA/ECMWF GRIB2 via `grib2-decoder.ts`, `s-maxage=3600` |
| `GET /api/geo/reverse` | Reverse geocoding for `?lat=&lon=` via **OpenStreetMap Nominatim** with predefined metro fallback | Rounds coordinates to **3 decimals (~110 m privacy)**, 24h in-memory cache |
| `GET /api/telemetry/cpcb` | Server-side proxy for India OGD **CPCB / CAAQMS** real-time resource (`data.gov.in`) | Server-only `DATA_GOV_IN_API_KEY`, strict IST (`UTC+05:30`) calendar/time parsing |
| `GET /api/telemetry/sources` | Server-side proxy for **OpenAQ v3** monitoring locations within `1–25 km` | Server-only `OPENAQ_API_KEY`, preserves native measurement timestamps |

---

## Security, Privacy & Reliability Architecture

- **HTTP Security Headers & Strict CSP** (`next.config.ts`): Enforces `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security` (2y preload), `Permissions-Policy` locking down camera/microphone/payment while permitting self geolocation, `poweredByHeader: false`, and a strict `Content-Security-Policy` allowlisting Open-Meteo, OpenAQ, CPCB (`api.data.gov.in`), Sensor.Community, Gemini API, Esri/ArcGIS, OpenStreetMap, `terrain.reearth.land`, and NASA Earthdata (`gibs.earthdata.nasa.gov`, `wvs.earthdata.nasa.gov`).
- **Ephemeral Location Privacy**: Browser geolocation (`Locate Me`) updates session telemetry only and is never persisted to `localStorage`.
- **Zero Client Secret Leakage**: Upstream keys (`GEMINI_API_KEY`, `OPENAQ_API_KEY`, `DATA_GOV_IN_API_KEY`, optional `FIRMS_MAP_KEY`) are read exclusively server-side, passed via headers where supported (`x-goog-api-key`), and scrubbed from error diagnostics. Client-supplied API keys sent in `/api/ai/plan` payloads are discarded.
- **Fault Tolerance**: Subscriber-isolated abort handling on shared wind in-flight requests prevents one disconnected client from failing concurrent users; failure cooldown caches are bounded LRU; stale-while-revalidate metadata clearly labels cached fallbacks (`isStale: true`) rather than misrepresenting stale data as live.

---

## Project Structure

```text
.
├── .github/workflows/ci.yml      # CI Release Gate (Vitest, tsc, Next build, Playwright E2E)
├── .env.example                  # Documented server-side API keys template
├── GLOSSARY.md                   # Canonical atmospheric & regulatory domain definitions
├── next.config.ts                # Security headers, CSP & webpack Cesium/SPZ config
├── playwright.config.ts          # Chromium E2E test configuration against port 3000
├── scripts/
│   └── copy-cesium.mjs           # Postinstall Cesium static asset sync -> public/cesium/
├── public/
│   ├── cesium/                   # Runtime Cesium Workers, Assets, Widgets, ThirdParty
│   └── textures/                 # NASA earth-blue-marble.jpg & earth-night.jpg
├── src/
│   ├── app/
│   │   ├── api/                  # 8 Server-side API Route Handlers
│   │   ├── layout.tsx            # Root dark-first theme, metadata & Vercel Analytics
│   │   └── page.tsx              # Orchestrator connecting telemetry, globes & dock tabs
│   ├── components/
│   │   ├── environment/          # NASA GIBS SatelliteComparisonSlider
│   │   ├── globe/                # AvirGlobe, Cesium (cesium/*), Three.js layers & 2D fallback
│   │   ├── home/                 # EarthCommandCenter, CompactCityCard, EnvironmentalDetailsDrawer
│   │   ├── location/             # FirstVisitLocationModal (ephemeral GPS & city selection)
│   │   └── ui/futuristic/        # FloatingDock, MissionHeader, holographic UI primitives
│   ├── config/
│   │   └── environmental-sources.ts  # Freshness, distance & measurement eligibility rules
│   ├── domain/                   # Pure scientific math: EPA/CPCB AQI, wind fields, GRIB/exposure types
│   ├── lib/                      # Cache, circuit breaker, rate-limiter, sanitizer, timezone utils
│   └── services/                 # FIRMS, GIBS, Global Wind GRIB2 decoder, CPCB, OpenAQ, IAQ, GRAP
├── tests/
│   ├── a11y/                     # Accessibility compliance checks
│   ├── browser/                  # Python Playwright verification helpers (routine_outage.py, etc.)
│   ├── integration/              # Provider, wind API, GIBS, FIRMS & hotfix regression suites
│   ├── security/                 # Secret isolation, sanitization & guardrail specs
│   └── unit/                     # Domain math, GRIB2 decoding, terrain & renderer unit tests
└── e2e/                          # Playwright E2E specs (globe-platform, source-control, threejs-zoom)
```

---

## Local Setup & Environment Variables

### Prerequisites
- **Node.js 20+** and `npm`

### Installation & Running Locally

```bash
git clone https://github.com/XiaoArnav/avir.git
cd avir
npm install          # Installs dependencies and runs scripts/copy-cesium.mjs to populate public/cesium/
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

All external keys are **strictly server-side** and **optional for core operation** (without keys, Avir runs with Open-Meteo global atmospheric chemistry/weather, NOAA GFS / ECMWF IFS global wind GRIB2, Re:Earth 3D terrain, NASA GIBS satellite reflectance, keyless NASA FIRMS regional CSV fire archives, and deterministic AI routine optimization):

| Variable | Required? | Purpose |
| :--- | :--- | :--- |
| `OPENAQ_API_KEY` | Optional | Enables authenticated **OpenAQ v3** ground sensor queries within 1–25 km |
| `DATA_GOV_IN_API_KEY` | Optional | Enables India OGD (**CPCB / CAAQMS**) official regulatory ground-station feeds |
| `GEMINI_API_KEY` | Optional | Enables **Gemini 2.5 Flash** qualitative explanations in `POST /api/ai/plan` (falls back to deterministic explanations cleanly when unset) |
| `FIRMS_MAP_KEY` | Optional | Enables direct **NASA FIRMS** `VIIRS_NOAA20_NRT` Area API queries when set (defaults to keyless official `VIIRS_NOAA20_C2_24H` regional CSV archives when omitted) |

---

## Testing & CI Release Gate

The GitHub Actions workflow ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs cleanly on Node 20 with four automated verification gates:

```bash
npm test                  # Vitest unit, integration, security & a11y suite (99 files, 1,474 tests)
npx tsc --noEmit          # Strict TypeScript compiler check
npm run build             # Cesium asset copy + Next.js production build
npx playwright install --with-deps chromium && npm run test:e2e
                          # Chromium E2E suite (33 tests across e2e/*.spec.ts; builds/starts server on :3000)
```

> **Note on E2E Concurrency:** Under constrained CPU/WebGL environments, heavy multi-engine Cesium/Three layer tests can also be run individually via `npx playwright test e2e/globe-platform.spec.ts -g "operates unified Environmental Layers"`. Standalone Python Playwright checks for browser UI outage flows remain available under `tests/browser/`.

---

## Data Attributions & Acknowledgments

- **3D Wind & Quantized-Mesh Patterns**: Global GPU wind streamline shader and shared-cooldown terrain retry concepts adapted with attribution from the MIT-licensed [God's Eye View](https://github.com/bilawalsidhu/gods-eye-view) architecture by Bilawal Sidhu.
- **Basemap & Elevation Imagery**: Tiles © Esri, Maxar, Earthstar Geographics; © OpenStreetMap contributors; Terrain: Re:Earth / Mapterhorn (`CC BY 4.0`).
- **Atmospheric, Satellite & Air-Quality Open Data**: NOAA NCEP GFS (`Public Domain`), ECMWF IFS & CAMS (`Open Data`), NASA FIRMS & NASA EOSDIS GIBS / Worldview, Open-Meteo, OpenAQ v3, Government of India OGD / CPCB CAAQMS, Sensor.Community.
