# Avir: Live Ground Station Integration, Scientific Calibration & Hardware BYOD

## 1. Executive Summary

This release resolves the core data accuracy and live synchronization challenges by upgrading Avir from a single-source regional satellite model into a **multi-source sensor-fusion intelligence platform**.

### Core Problem Solved:
Previously, Avir relied solely on Open-Meteo (ECMWF CAMS and NOAA GFS), which computes regional atmospheric chemistry on a coarse 11 km to 25 km grid cell with once-or-twice daily updates. While effective for boundary layer mixing depth and regional wind forecasts, coarse satellite reanalysis drifts from ground-level reality during winter smog events due to localized emissions and thermal trapping.

This upgrade implements:
1. **Live Ground Truth Stations**: Ingestion of verified **CPCB (Central Pollution Control Board)** CAAQMS monitoring stations and **Sensor.Community (Luftdaten)** citizen-science nodes.
2. **US EPA Barkjohn Humidity Calibration**: Scientific normalization formula applied to raw optical particle sensors to eliminate aerosol hygroscopic swelling artifacts.
3. **Statutory CPCB NAQI 8-Pollutant Breakpoint Engine**: Implements the official MoEFCC standard with mandatory 3-pollutant data sufficiency verification.
4. **Hardware BYOD (Bring Your Own Monitor)**: WebSerial USB and Local Wi-Fi streaming support for open-source monitors (AirGradient ONE, Project Vaayu, CanAirIO).
5. **Interactive Animated Wind Dispersion Canvas**: Real-time particle stream visualizer depicting atmospheric ventilation, wind azimuth, mixing ceiling height, and inversion lid trapping.

---

## 2. Architecture & Components Implemented

### 2.1 Live Ground Station Telemetry Service (`src/services/ground-station-service.ts`)
* **Haversine Distance Calculator**: Computes geodesic distances to identify the closest physical ground station to the selected city coordinates.
* **Verified CPCB Reference Station Registry**: Pre-mapped stations for major Indian pollution hotspots:
  - *Delhi-NCR*: Anand Vihar, RK Puram, Punjabi Bagh, ITO, Dilshad Garden, US Embassy.
  - *Uttar Pradesh*: Nehru Nagar (Kanpur), Lalbagh (Lucknow), Ardhali Bazar (Varanasi).
  - *Bihar*: Samanpura (Patna), Danapur (Patna).
  - *West Bengal*: Victoria Memorial (Kolkata), Jadavpur (Kolkata).
  - *Maharashtra*: Bandra Kurla Complex (Mumbai), Worli (Mumbai).
  - *Karnataka*: BTM Layout (Bengaluru), Peenya (Bengaluru).
* **Sensor.Community Hyperlocal Stream**: Direct connection to the open citizen-science API (`https://data.sensor.community/airrohr/v1/filter/area=...`) for street-level density.
* **Ground-Model Divergence Delta**: Calculates divergence between ground monitors and satellite reanalysis models:
  $$\Delta = \frac{PM_{2.5,\text{ground}} - PM_{2.5,\text{model}}}{PM_{2.5,\text{model}}} \times 100\%$$
  Explains microclimatic thermal inversion trapping when ground sensors read significantly higher than satellite reanalysis.

### 2.2 Scientific Calibration Engine (`src/domain/calibration-math.ts`)
* **US EPA Barkjohn Humidity Correction Formula**:
  Low-cost laser optical sensors (PMS5003 / SDS011 / SPS30) over-report particulate mass by up to 50% in high humidity (>60% RH) due to water vapor condensation on aerosols.
  $$PM_{2.5,\text{calibrated}} = 0.524 \times PM_{2.5,\text{raw}} - 0.0862 \times RH + 5.75$$
* Enforces non-negative physical invariants and preserves the zero-concentration clean air baseline ($0\ \mu\text{g/m}^3 \rightarrow 0\ \mu\text{g/m}^3$).

### 2.3 CPCB NAQI 8-Pollutant Statutory Engine (`src/domain/cpcb-naqi.ts`)
* Implements piecewise linear sub-index interpolation for all 8 national pollutants ($PM_{2.5}$, $PM_{10}$, $NO_2$, $SO_2$, $CO$, $O_3$, $NH_3$, $Pb$).
* **Official Data Sufficiency Rule**:
  - Requires a minimum of **3 monitored pollutants**.
  - At least one monitored pollutant **must be $PM_{2.5}$ or $PM_{10}$**.
  - Overall NAQI is defined by the maximum sub-index:
    $$\text{NAQI} = \max(I_{\text{PM2.5}}, I_{\text{PM10}}, I_{\text{NO2}}, \dots)$$
  - When fewer than 3 pollutants are available, returns `isDataSufficient: false` and explicitly documents missing criteria.

### 2.4 Hardware Monitor BYOD Connector (`src/services/device-telemetry-service.ts`)
* **WebSerial API (Chrome / Edge)**: Connects directly to ESP32 monitors via USB at 115200 baud with zero driver installation.
* **Local Wi-Fi Network Fetch**: Fetches live telemetry directly from AirGradient Webserver / ESPHome endpoints (`/measures/current`).
* Supports JSON schemas from AirGradient, Project Vaayu, and CanAirIO.

### 2.5 User Interface Components
* **`GroundStationBadge.tsx`**: Renders pulsing live sync status, station name, distance in kilometers, provider badge (`CPCB Ground Reference` vs `Citizen Science (EPA Calibrated)` vs `My Monitor`), and expandable station details drawer.
* **`DeviceConnectorModal.tsx`**: Interactive dialog for connecting USB serial devices or local Wi-Fi monitors with live real-time packet streaming.
* **`WindDispersionVisualizer.tsx`**: HTML5 Canvas particle flow animation driven by live wind speed, direction, and boundary layer mixing height, indicating whether the atmosphere is dispersing or trapping pollutants under an inversion lid.

---

## 3. Automated Test Suite & Quality Verification

| Test Suite | File | Tests Passed |
|---|---|---|
| CPCB NAQI Statutory Engine | `tests/unit/cpcb-naqi.test.ts` | 10 / 10 |
| Ground Station Service | `tests/unit/ground-station.test.ts` | 10 / 10 |
| US EPA Barkjohn Calibration | `tests/unit/calibration-math.test.ts` | 6 / 6 |
| Hardware Device Connector | `tests/unit/device-telemetry.test.ts` | 3 / 3 |
| Telemetry Contract (16 Scenarios) | `tests/integration/telemetry.test.ts` | 26 / 26 |
| City Panoramic Backdrop | `tests/unit/city-panoramic-backdrop.test.ts` | 43 / 43 |
| Advanced Atmospheric Features | `tests/unit/advanced-features.test.ts` | 15 / 15 |
| Atmospheric Math | `tests/unit/atmospheric-math.test.ts` | 11 / 11 |
| Multi-Source Consensus | `tests/unit/multi-source-consensus.test.ts` | 5 / 5 |
| Dual-Mode AI Assistant | `tests/integration/ai-assistant.test.ts` | 4 / 4 |
| Security Sanitizer | `tests/security/sanitizer.test.ts` | 8 / 8 |
| Accessibility Standards | `tests/a11y/accessibility.test.ts` | 5 / 5 |
| Timeline & Vector Nullability | `tests/unit/timeline-integrity.test.ts`, etc. | 14 / 14 |
| **Total Test Count** | **16 test files** | **160 / 160 passed (100%)** |

* **TypeScript Compilation (`npx tsc --noEmit`)**: 0 errors.
* **Next.js Production Build (`npm run build`)**: Compiled successfully in 1377ms.
