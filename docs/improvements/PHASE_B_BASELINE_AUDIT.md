# Avir — Phase B Baseline Audit
## Personalized Environmental Intelligence, Exposure Physics, Commute Optimization, Indoor Air Engineering, and Secure AI Planning

**Date:** 2026-11-23  
**Auditor:** Principal Software Architect & Scientific Data Integrity Lead  
**Branch:** `feat/avir-phase-b-personalized-intelligence`  
**Base Commit:** `b6207230db872e24c1a73842beba1cd4bf661c06` (`origin/main`)  
**Baseline Test Suite Status:** 32 test files, 720 tests passing (100%)  
**Pre-Phase B Quality Score:** 5.5 / 10.0 (Functional shell with severe scientific and architectural defects)

---

## 1. Executive Summary & Pre-Phase B Quality Score

Avir's previous development phases established robust real-time telemetry, multi-source sensor aggregation (OpenAQ, Open-Meteo, CPCB), and personal hardware WebSerial/Wi-Fi ingestion (Steps 1–6). However, an exhaustive audit of the existing codebase reveals that the personalized intelligence features—namely routine optimization, inhaled exposure modeling, commute mode analysis, indoor air-quality engineering, and AI planning—were built on heuristic approximations, hardcoded numbers, and insecure API designs.

The pre-Phase B implementation scores **5.5 / 10.0**. While the visual components render without crashes, the underlying domain logic violates core scientific principles and security standards:
- Inhaled mass physics is corrupted by arbitrary clinical health multipliers and unscientific "cigarette equivalents".
- Routine optimization invents a 35% convective dilution improvement during midday even when no forecast data exists.
- Commute reductions are hardcoded to fixed values (85% metro, 75% car) regardless of real atmospheric concentrations or cabin ventilation.
- The Corsi-Rosenthal box tool guarantees 490–580 CFM without regard to real fan fan curves, uses hardcoded 2023 pricing, and falsely claims "Hospital Isolation Grade Clean Air".
- The AI Planning route asks a remote Large Language Model to calculate physical exposure dosages and accepts client-supplied API keys without strict schema validation.

Phase B will systematically eliminate all twelve confirmed defects (B-001 through B-012) and close findings B01 through B46.

---

## 2. Line-by-Line Code Audit of Existing Features

### 2.1. `src/services/ai-assistant-service.ts`
- **Line 48 (`B-001: Invented Midday Improvement`)**:
  ```typescript
  // FALLBACK: If forecast array is missing, fabricate a 35% midday improvement
  Math.round(peakPM25 * 0.65 * 10) / 10
  ```
  *Violation*: When hourly forecast data is unavailable, the service invents an atmospheric dilution factor of 35% ($\text{peak} \times 0.65$), claiming solar convective mixing without any empirical meteorological backing.
- **Line 53 (`B-002: Fixed Safe Workout Times`)**:
  ```typescript
  return { timeRange: '13:00 - 14:00', ... }
  ```
  *Violation*: The fallback unconditionally recommends 13:00–14:00 as the safest workout hour, even if actual telemetry indicates extreme ozone, sandstorms, or midday inversions.

### 2.2. `src/domain/advanced-air-math.ts`
- **Lines 327–356 (`B-003: Fixed Commute Reductions`)**:
  ```typescript
  // Hardcoded reduction percentages
  const modeReductions = {
    walking: 0.0,
    cycling: -0.1, // 10% penalty
    bus_standard: 0.20, // 20% reduction
    bus_ac: 0.50, // 50% reduction
    car_recirc: 0.75, // 75% reduction
    metro: 0.85, // 85% reduction
  };
  ```
  *Violation*: Commute modes claim fixed, universal exposure reductions across all cities, traffic densities, and vehicle ages without considering ambient concentration, filtration quality, or vehicle air exchange rates.

### 2.3. `src/domain/air-math.ts`
- **Lines 240–257 (`B-004: Arbitrary Health-Risk Scoring`)**:
  ```typescript
  let clinicalMultiplier = 1.0;
  if (profile.hasAsthma) clinicalMultiplier += 0.55;
  if (profile.hasCardiovascular) clinicalMultiplier += 0.40;
  const riskScore = (weightedExposure / 600) * 100;
  ```
  *Violation*: Arbitrary clinical coefficients (`+0.55`, `+0.40`) are multiplied directly into physical inhaled mass calculations. An exposure engine must report physical inhaled mass in $\mu\text{g}$; clinical vulnerability must be treated as vulnerability context, not a multiplier on inhaled micrograms.
- **Lines 260–275 (`B-005: Cigarette-Equivalent Claims`)**:
  ```typescript
  export function calculateBerkeleyCigarettes(pm25UgM3: number, hours: number) {
    return (pm25UgM3 * hours) / (22 * 24);
  }
  ```
  *Violation*: Translates ambient $\text{PM}_{2.5}$ into "cigarettes smoked" as a literal dose comparison. This metric is scientifically controversial, uncalibrated for acute exposures, and violates evidence-based communication standards.
- **Lines 284–310 (`B-006: Purifier CADR Guarantees`)**:
  ```typescript
  export function calculateCorsiRosenthalBox(numFilters: 4 | 5) {
    return numFilters === 4 ? 490 : 580; // CFM
  }
  ```
  *Violation*: Hardcodes exact clean air delivery rates (490 CFM / 580 CFM) for DIY air cleaners without accounting for filter MERV ratings, box fan static pressure drop, or shroud existence.

### 2.4. `src/components/IAQStudio.tsx`
- **Lines 75–88 (`B-008: Misleading Medical Terminology`)**:
  ```tsx
  {ach >= 6 && <Badge>Hospital Isolation Grade Clean Air</Badge>}
  ```
  *Violation*: Falsely equates 6 air changes per hour in a residential room to airborne infection isolation rooms (AIIR / negative pressure isolation), which require strict pressure differentials, directional airflow, and HEPA exhaust filtration.
- **Lines 110–140 (`B-007: Fixed Product Prices`)**:
  ```tsx
  const fanCost = 1400;
  const filterCost = 1200;
  const tapeCost = 350;
  const totalCost = 2950;
  const commercialCost = 18000;
  ```
  *Violation*: Hardcodes fixed Indian Rupee prices from a static 2023 snapshot without user editability or disclosure of date/region variability.

### 2.5. `src/app/api/ai/plan/route.ts`
- **Lines 27–35 (`B-010: Client-Supplied API Keys`)**:
  ```typescript
  const { geminiApiKey } = await req.json();
  const apiKey = geminiApiKey || process.env.GEMINI_API_KEY;
  ```
  *Violation*: Allows clients to supply raw API keys in HTTP request bodies, creating serious security, credential intercept, and logging hazards.
- **Lines 54–71 (`B-009: LLM-Controlled Numerical Calculations`)**:
  ```typescript
  const prompt = `Calculate baselineExposureUg, optimizedExposureUg, and reductionPercentage for this routine...`;
  ```
  *Violation*: The LLM is tasked with calculating physical dosages and reduction percentages, leading to hallucinated numbers and non-reproducible calculations.
- **Lines 48–53 (`B-011: Sensitive Profile Transmission`)**:
  ```typescript
  prompt += `User Health Profile: ${JSON.stringify(body.profile)}`;
  ```
  *Violation*: Direct serialization and transmission of personal clinical flags (asthma, COPD, cardiovascular conditions, pregnancy) to an external LLM provider without data minimization.
- **Lines 15–25 (`B-012: Incomplete Input Validation`)**:
  ```typescript
  if (!body.city || !body.metrics) return NextResponse.json({ error: 'Missing city' }, { status: 400 });
  ```
  *Violation*: No structural schema validation (Zod/TypeScript guard), no payload size limits, no validation of activity timestamps or coordinate ranges.

---

## 3. Data Model Audit
- **Lack of Structured Routine Model**: Routines were stored as loose strings or hardcoded mock items rather than typed domain entities with unique IDs, names, start/end times, intensity levels, microenvironments, and flexibility constraints.
- **No Invariant Boundaries**: Midnight-crossing activities (e.g. 23:00 to 01:00) and daylight saving/timezone conversions were unhandled, leading to negative duration calculations.
- **Missing IAQ Domain Entities**: No formal types for room dimensions, clean air delivery rate units ($\text{CFM} \leftrightarrow \text{m}^3/\text{h}$), or time-series concentration decay.

---

## 4. Scientific Defensibility Audit
- **Inhaled Mass Equation**: The fundamental physical relationship for inhaled pollutant mass is:
  $$\text{Inhaled Mass } (\mu\text{g}) = \int_{0}^{T} C(t) \cdot \dot{V}_E(t) \, dt$$
  where $C(t)$ is pollutant concentration ($\mu\text{g}/\text{m}^3$) and $\dot{V}_E(t)$ is minute ventilation ($\text{m}^3/\text{min}$). The existing code replaced this with an arbitrary weighted score.
- **Breathing Rates**: Literature-validated minute ventilation rates (EPA Exposure Factors Handbook) must be established:
  - Resting / Sleep: $0.008\,\text{m}^3/\text{min}$ ($0.48\,\text{m}^3/\text{h}$)
  - Light Activity: $0.012\,\text{m}^3/\text{min}$ ($0.72\,\text{m}^3/\text{h}$)
  - Moderate Activity: $0.025\,\text{m}^3/\text{min}$ ($1.50\,\text{m}^3/\text{h}$)
  - Vigorous / Intense: $0.045\,\text{m}^3/\text{min}$ ($2.70\,\text{m}^3/\text{h}$)

---

## 5. Indoor Air Engineering Audit
- **Room Volume & Air Changes**:
  $$\text{ACH} = \frac{\text{CADR } (\text{m}^3/\text{h})}{\text{Room Volume } (\text{m}^3)}$$
  Conversion: $1\,\text{CFM} = 1.69901\,\text{m}^3/\text{h}$.
- **Decay Dynamics**: Under well-mixed conditions with constant filtration and zero indoor generation:
  $$C(t) = C_0 \cdot e^{-(\lambda_{\text{nat}} + \text{CADR}/V) \cdot t}$$
  The UI must clearly state that these models assume instantaneous ideal mixing, sealed windows, and no continuous indoor particle generation.

---

## 6. AI Architecture & Security Audit
- **Three-Tier Architecture Requirement**:
  - **Tier 1 (Deterministic Domain)**: Pure TypeScript functions compute all physical exposure values, time windows, and delta percentages.
  - **Tier 2 (Schema Validation & Sanitization)**: Server-side validation with payload size bounding and clinical data minimization.
  - **Tier 3 (AI Explanation Layer)**: Remote LLM (Gemini 2.5) receives ONLY pre-computed numbers and sanitized activity descriptions to write empathetic, actionable prose.
- **API Key Hardening**: Remove client-supplied keys; enforce server environment secrets (`process.env.GEMINI_API_KEY`).

---

## 7. UI/UX & Accessibility Audit
- **State Synchronization**: Modifying an activity or changing the active city must immediately invalidate any in-flight or cached AI recommendations.
- **Empty & Error States**: When forecast data is unavailable, the UI must display an honest "Forecast unavailable for optimization" notice rather than an invented time shift.
- **Accessibility**: All routine editing controls, modal dialogs, and scenario selectors must support ARIA labeling, keyboard navigation, and visible focus rings.

---

## 8. Test Coverage Baseline
- Current tests: 720 tests across 32 test suites.
- Phase B additions required:
  - Unit tests for routine storage, schedule validation, and midnight crossing.
  - Unit tests for forecast eligibility and non-invented optimization.
  - Unit tests for physical inhaled mass calculation across breathing rates.
  - Unit tests for commute microenvironment scenario calculations.
  - Unit tests for indoor air CADR conversion, ACH, and decay models.
  - Unit and integration tests for secure AI planning routes and data minimization.
  - End-to-end integration tests for the full user journey.

---

## 9. Defect Inventory (B-001 through B-012)

| Defect ID | Severity | Component | Description | Resolution Strategy |
|:---|:---|:---|:---|:---|
| **B-001** | CRITICAL | `ai-assistant-service.ts` | 35% convective dilution fallback | Require eligible forecast; display honest unavailable state |
| **B-002** | HIGH | `ai-assistant-service.ts` | Hardcoded 13:00–14:00 safe window | Derive window strictly from min concentration forecast |
| **B-003** | HIGH | `advanced-air-math.ts` | Fixed 85%/75% commute reductions | Replace with transparent, editable microenvironment factors |
| **B-004** | CRITICAL | `air-math.ts` | Arbitrary clinical health multipliers | Pure physical inhaled mass ($\mu\text{g}$); clinical data as context |
| **B-005** | MEDIUM | `air-math.ts`, UI | Cigarette-equivalent claims | Remove cigarette conversions from decisions and primary UI |
| **B-006** | HIGH | `air-math.ts` | Hardcoded 490/580 CFM CADR | Allow user-entered CADR and filter resistance curves |
| **B-007** | MEDIUM | `IAQStudio.tsx` | Static ₹2,950 component prices | Make component costs user-editable with dated baseline |
| **B-008** | HIGH | `IAQStudio.tsx` | "Hospital Isolation Grade" claims | Remove clinical isolation claim; display ACH and decay time |
| **B-009** | CRITICAL | `/api/ai/plan/route.ts` | LLM calculating physical numbers | Server-side deterministic engine; LLM only explains |
| **B-010** | CRITICAL | `/api/ai/plan/route.ts` | Client-supplied `geminiApiKey` | Server environment variable only; reject client key |
| **B-011** | HIGH | `/api/ai/plan/route.ts` | Transmitting sensitive health flags | Data minimization; transmit only generalized sensitivity |
| **B-012** | HIGH | `/api/ai/plan/route.ts` | Inadequate request validation | Comprehensive schema validation and input bounds |

---

## 10. Conclusion & Execution Blueprint
Phase B execution will proceed immediately with the implementation of strict domain contracts, followed sequentially by Steps 11 through 16, rigorous test-driven validation, UI state integration, and release preparation.
