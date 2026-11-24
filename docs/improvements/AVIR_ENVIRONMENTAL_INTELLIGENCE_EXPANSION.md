# Avir Environmental Intelligence Expansion
## Complete Six-Phase Engineering Architecture & Master Pull-Request Matrix

---

## Executive Summary

Avir has evolved from an urban air-quality visualization interface into an advanced, multi-spectral planetary environmental intelligence platform. This document specifies the complete architecture, scientific invariants, data provenance, and pull-request release matrix for the **Avir Environmental Intelligence Expansion**.

Every phase of this master plan has been developed, tested, committed under strict author attribution (`XiaoArnav <322868724+XiaoArnav@users.noreply.github.com>`), and opened as an isolated pull request targeting `main`.

---

## Master Pull-Request Release Matrix

| Phase | PR # | Branch | Title | Key Modules & Architecture |
|---|---|---|---|---|
| **Phase 1: Source Control** | [#32](https://github.com/XiaoArnav/avir/pull/32) | `feat/avir-source-control` | `feat(telemetry): add user-controlled environmental data sources and scientific comparisons` | `source-resolution.ts`, `MultiSourceInspectorModal.tsx`, `source-preferences.ts` |
| **Phase 2: AI Decision Assistant** | [#34](https://github.com/XiaoArnav/avir/pull/34) | `feat/avir-ai-decision-assistant` | `feat(ai): strengthen personalized environmental decisions and explanations` | `decision-context.ts`, `deterministic-assistant.ts`, `api/ai/plan/route.ts` |
| **Phase 3: Wind-Flow Intelligence** | [#35](https://github.com/XiaoArnav/avir/pull/35) | `feat/avir-wind-intelligence` | `feat(environment): add global forecast wind-flow visualization` | `wind-types.ts`, `wind-service.ts`, `three-wind-layer.ts`, `api/environment/wind/route.ts` |
| **Phase 4: Active-Fire Hotspots** | [#36](https://github.com/XiaoArnav/avir/pull/36) | `feat/avir-fire-intelligence` | `feat(environment): integrate NASA FIRMS active-fire intelligence` | `firms-types.ts`, `firms-service.ts`, `three-fire-layer.ts`, `api/environment/fires/route.ts` |
| **Phase 5A: Proportional Zoom** | [#33](https://github.com/XiaoArnav/avir/pull/33) | `feat/threejs-advanced-zoom` | `feat(globe): bring Cesium-style smooth zoom controls to Three.js` | `three-camera-controller.ts`, `threejs-zoom.spec.ts` |
| **Phase 5B: 3D Elevation Terrain** | [#37](https://github.com/XiaoArnav/avir/pull/37) | `feat/avir-cesium-terrain` | `feat(cesium): integrate keyless quantized-mesh 3D elevation terrain` | `cesium-terrain.ts`, `AvirCesiumGlobe.tsx`, `cesium-terrain.test.ts` |
| **Phase 6: Satellite Comparison** | [#38](https://github.com/XiaoArnav/avir/pull/38) | `feat/avir-recent-satellite-imagery` | `feat(environment): add dated satellite imagery and comparison tools` | `imagery-types.ts`, `satellite-imagery-service.ts`, `SatelliteComparisonSlider.tsx` |
| **Phase 7: Layer Controls** | [#39](https://github.com/XiaoArnav/avir/pull/39) | `feat/avir-layer-controls` | `feat(globe): add unified environmental layer controls` | `GlobeControls.tsx`, `AvirGlobe.tsx`, `globe-layer-controls.test.tsx` |

---

## Detailed Architectural Breakdown by Phase

### Phase 1: User-Controlled Environmental Data Sources (Avir Source Control)
- **Problem Solved**: Avir previously normalized data behind opaque fallbacks without letting users select their preferred reporting authority or inspect raw discrepancies.
- **Implementation**:
  - Implemented 5 resolution modes: `consensus` (deterministic weighted median), `cpcb` (regulatory CPCB monitors), `waqi` (WAQI international consensus), `openmeteo` (ECMWF CAMS 11km chemical model), and `fallback` (safeguarded mock).
  - Client-side persistence in `localStorage` under `avir_preferred_source` with validation.
  - Multi-source inspector modal comparing CPCB raw vs WAQI vs Open-Meteo with delta tracking, station counts, and timestamps.
- **Scientific Correctness**: Preserves distinct index scales (CPCB NAQI 0–500 piecewise linear vs US EPA AQI 0–500).

### Phase 2: Personalized AI Environmental Decision Assistant
- **Problem Solved**: Previously, AI plans outputted generic bullet points without accounting for personal respiratory sensitivity, vigorous exertion windows, or indoor air filtration.
- **Implementation**:
  - Structured `EnvironmentalDecisionContext` schema with user risk profile (`general`, `asthma`, `cardiovascular`, `elderly`, `pediatric`), routine activities, indoor HEPA availability, and commute modalities.
  - Strict qualitative rule-based deterministic fallback (`deterministic-assistant.ts`) when `GEMINI_API_KEY` is not present, ensuring zero fabrication or hallucination.
  - Generates structured plan explanations with 5 discrete facets: outdoor shift reasoning, commuting guidance, indoor filtration protocols, vulnerable group warnings, and scientific limitations.

### Phase 3: Global Wind-Flow & Atmospheric Intelligence
- **Problem Solved**: Ground-level air quality cannot be understood without synoptic atmospheric transport.
- **Implementation**:
  - Synoptic 10-meter wind vectors integrated via Open-Meteo GFS/ECMWF forecast pipeline.
  - Trigonometric conversion from meteorological azimuths ($\theta$) to Cartesian zonal ($u$) and meridional ($v$) vectors:
    $$u = -s \cdot \sin(\theta), \quad v = -s \cdot \cos(\theta)$$
  - Atmospheric ventilation factor index ($\text{Ventilation} = \text{Wind Speed} \times \text{Boundary Layer Height}$).
  - Spherical particle streamline visualizer (`three-wind-layer.ts`) rendered on radius $R = 90.1$ with fade tails and dynamic color ramps.

### Phase 4: NASA FIRMS Active-Fire Hotspot Intelligence
- **Problem Solved**: Regional stubble burning and biomass combustion cause major seasonal pollution spikes across South Asia and North America.
- **Implementation**:
  - Direct integration with NASA LANCE FIRMS (Fire Information for Resource Management System) via secure server-side proxy.
  - Thermal anomaly parsing (VIIRS S-NPP / NOAA-20 / NOAA-21 375m and MODIS 1km) with Fire Radiative Power (FRP, MW) and detection confidence filtering.
  - Keyless resilience: When `FIRMS_MAP_KEY` is not configured, the API gracefully returns `{ configured: false, status: 'unconfigured' }` with clear setup instructions.
  - **Scientific Guardrail**: Embeds explicit disclaimer: *"Thermal anomalies represent satellite-detected radiant heat emissions. They do not constitute verified wildfire incidents or direct proof of ground-level air pollution without co-located dispersion modeling."*

### Phase 5: Advanced Proportional Zoom & Realistic 3D Terrain
- **Three.js Proportional Zoom (5A)**:
  - Dynamically computes camera distance: $d \in [108, 450]$ (Earth radius $R \approx 90$).
  - Proportional exponential velocity scaling: $\Delta d = \text{factor} \times (d - R_{\text{surface}})$.
  - Smooth inertia damping ($k = 0.08$), double-click centering, and touch-pinch responsiveness.
- **Cesium 3D Elevation Terrain (5B)**:
  - Integrated keyless ellipsoidal quantized-mesh terrain via Re:Earth endpoint (`https://terrain.reearth.land/cesium-mesh/ellipsoid`).
  - Dynamic terrain switching toggle with graceful fallback to `Cesium.EllipsoidTerrainProvider()` on network throttle (429).
  - Prominent CC BY 4.0 attribution badge: `Terrain: Re:Earth / Mapterhorn (CC BY 4.0)`.

### Phase 6: NASA GIBS Recent Satellite Imagery & Comparison Tools
- **Implementation**:
  - Keyless NASA EOSDIS GIBS Web-scale Vector Snapshot (WVS) API URL generator.
  - Products supported: VIIRS True Color (250m) and Harmonized Landsat Sentinel-2 (HLS S30, 30m).
  - Bounding-box calculation around urban coordinates for regional optical smoke/haze analysis.
  - Draggable, keyboard-accessible split-view comparison slider (`SatelliteComparisonSlider.tsx`).
  - **Scientific Transparency**: Optical satellite imagery visualizes atmospheric reflectance and smoke plumes; it does not measure particulate mass concentrations ($\mu\text{g/m}^3$) directly.

### Phase 7: Unified Environmental Layer Controls
- **Implementation**:
  - Integrated `LAYERS` popover into `GlobeControls.tsx` for instant multi-spectral layer management.
  - Supports Wind Flow, Active Fires, 3D Elevation Terrain, and Satellite Comparison.
  - Full keyboard accessibility (`Escape` dismiss, outside-click detection, `aria-haspopup="dialog"`).

---

## Verification & Scientific Quality Gates

1. **Deterministic Air Quality Invariant**: Zero random number generation or fake telemetry. In unconfigured or offline states, explicit fallback schemas with warnings are returned.
2. **Standard Separation**: CPCB National Air Quality Index (NAQI) breakpoints are never mixed with US EPA breakpoints.
3. **Security**: Server-side proxying ensures API credentials (`FIRMS_MAP_KEY`, `GEMINI_API_KEY`) are never leaked to client bundles.
4. **Git Attributability**: All commits strictly authored by `XiaoArnav <322868724+XiaoArnav@users.noreply.github.com>`.
5. **Human Merge Gate**: All pull requests remain open for human code review and repository owner approval.
