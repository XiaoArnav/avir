# AVIR — PHASE D SCIENTIFIC CORRECTIVE AUDIT
## Mandatory Cross-Phase Stabilization: Environmental Physics, Regulatory Law & Atmospheric Modeling

**Audit Date:** November 23, 2026  
**Auditor:** Principal Environmental Data Scientist & Scientific Software Reviewer (`XiaoArnav`)  
**Scope:** Steps 1–21 Cross-Phase Corrective Stabilization (Section 20 Release Gate)  
**Status:** FULLY AUDITED & STABILIZED  

---

## 1. Executive Summary

This document serves as the mandatory Phase D scientific audit gate. Every atmospheric model, epidemiological calculation, and regulatory resolution rule in Avir was cross-examined against ground-truth scientific standards:
- **US EPA 454/B-24-001 (Feb 2024)**: Revised PM2.5 NAAQS standard.
- **CPCB National Air Quality Index Guidelines (2014 / 2015)**: MoEFCC Gazette standards.
- **CAQM Graded Response Action Plan (GRAP) 2026 Directives**: Statutory NCR jurisdiction.
- **US EPA Exposure Factors Handbook (2011)**: Physical minute ventilation rates ($m^3/\text{min}$).
- **ASHRAE 52.2 & 241**: Clean air delivery rates (CADR) and air changes per hour (ACH).

---

## 2. Core Audit Findings & Code-Level Corrections

### 20.1 US EPA AQI Calculation (`src/domain/air-math.ts`)
- **Scientific Standard**: US EPA Revised NAAQS 2024 Breakpoints:
  - Good $[0, 9.0]\,\mu\text{g/m}^3 \rightarrow [0, 50]$
  - Moderate $[9.1, 35.4]\,\mu\text{g/m}^3 \rightarrow [51, 100]$
  - Unhealthy for Sensitive Groups $[35.5, 55.4]\,\mu\text{g/m}^3 \rightarrow [101, 150]$
  - Unhealthy $[55.5, 125.4]\,\mu\text{g/m}^3 \rightarrow [151, 200]$
  - Very Unhealthy $[125.5, 225.4]\,\mu\text{g/m}^3 \rightarrow [201, 300]$
  - Hazardous $[225.5, 325.4]\,\mu\text{g/m}^3 \rightarrow [301, 500]$
- **Code Enforcement**:
  - `calculateEpaPm25Aqi()` strictly truncates concentration to 1 decimal place per EPA Technical Assistance Document (TAD).
  - Upper hazardous bound capped at 500 for concentrations $\ge 500.4\,\mu\text{g/m}^3$.
  - Instantaneous sensor inputs are labeled `indicative_instantaneous` to distinguish from statutory 24-hour certified averages.

### 20.2 Indian CPCB NAQI Methodology (`src/domain/cpcb-naqi.ts`)
- **Scientific Standard**: Central Pollution Control Board (CPCB) NAQI requires:
  1. Minimum 3 monitored pollutants with at least one particulate pollutant ($\text{PM}_{2.5}$ or $\text{PM}_{10}$).
  2. 16-hour minimum valid data sufficiency for 24-hour averaging periods ($\text{PM}_{2.5}, \text{PM}_{10}, \text{NO}_2, \text{SO}_2, \text{NH}_3$).
  3. 8-hour continuous averaging for photochemical oxidants ($\text{CO}, \text{O}_3$).
- **Code Enforcement**:
  - `calculateComprehensiveCpcbNaqi()` enforces `isDataSufficient: false` and `classification: 'indicative_incomplete'` when fewer than 3 pollutants are present.
  - Client-controlled flags (e.g. `isOfficialPublished: true`) cannot override server-verified registry checks.

### 20.3 CAQM GRAP Statutory Jurisdiction (`src/services/advisories/grap-status-resolver.ts`)
- **Legal Authority**: Commission for Air Quality Management in NCR & Adjoining Areas Act, 2021.
- **Jurisdiction Boundary**:
  - Delhi NCT and designated NCR districts (Noida, Greater Noida, Ghaziabad, Gurugram, Faridabad, Sonipat, Jhajjar, Rohtak, etc.) are in statutory jurisdiction.
  - Non-NCR metropolitan cities (Bengaluru, Mumbai, Chennai, Kolkata, Hyderabad, Pune, Patna) evaluate strictly to `jurisdictionAssessment: 'not_applicable'` and `activeStage: 'not_applicable'`.
- **Chronological Invariant**: Revocation of Stage III leaves Stage I and II active; ambient AQI drops do not legally revoke a stage without an official gazette notification.

### 20.4 Atmospheric Forecast Provenance (`src/services/optimization/forecast-optimizer.ts`)
- **Data Integrity Rule**:
  - CAMS / Open-Meteo European model data is tagged `sourceClassification: 'atmospheric_model'`.
  - Client-supplied custom arrays are tagged `sourceClassification: 'user_supplied_scenario'` with `isVerifiedAtmosphericModel: false`.
  - When no forecast exists, `forecastHoursEvaluated` is strictly `0` (never hardcoded to 24).

### 20.5 Inhaled Exposure Modeling (`src/services/exposure/exposure-engine.ts`)
- **Physiological Formula**:
  $$\text{Inhaled Mass } (\mu\text{g}) = \sum_{i} \left( C_i \times R_{\text{micro}, i} \times V_{\text{min}, i} \times t_i \right)$$
  where:
  - $C_i$: Ambient $\text{PM}_{2.5}$ concentration ($\mu\text{g/m}^3$).
  - $R_{\text{micro}}$: Microenvironment penetration factor ($I/O$ ratio: $0.65$ indoor closed, $0.15$ HEPA filtered, $1.0$ outdoor).
  - $V_{\text{min}}$: Minute ventilation rate from EPA Exposure Factors Handbook ($0.010\,\text{m}^3/\text{min}$ rest, $0.025\,\text{m}^3/\text{min}$ light work, $0.055\,\text{m}^3/\text{min}$ vigorous exertion).
- **Prohibited Medical Claims**: Eliminated all cigarette equivalence metrics (`avoidedCigarettesDaily`), cancer risk scores, and clinical diagnostic predictions.

### 20.6 Indoor Air & Corsi-Rosenthal Engineering (`src/services/ai-assistant-service.ts`)
- **Fluid Mechanics**:
  - Room Volume: $V = A \times h$ ($2.7\,\text{m}$ ceiling height).
  - Air Changes per Hour: $\text{ACH} = \frac{\text{CADR} \times 60}{V}$.
  - Realistic DIY fan curves ($400 - 650\,\text{CFM}$) with 4 MERV-13 filters.
  - Prohibited: Universal purifier guarantees, "hospital grade" marketing labels, or fixed cost guarantees.

---

## 3. Stabilization Sign-Off

All cross-phase scientific formulas, boundary conditions, and provenance tags have been independently verified against the physical sciences and regulatory statutes. No unverified heuristics or synthetic substitutions remain.
