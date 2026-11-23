# AVIR — STEP 07: SCIENTIFICALLY CORRECT AQI
## Comprehensive Implementation Documentation, Regulatory Breakpoint Codification, Data Sufficiency Rules, Scientific Provenance Architecture, and Golden-Reference Verification

---

## 1. Scope and Objectives

Step 7 of Avir's 24-step engineering roadmap establishes **scientifically rigorous, mathematically exact, and regulatory-grade air quality index calculations** across the entire platform.

Prior to Step 7, Avir relied on legacy approximations:
1. Obsolete US EPA PM2.5 breakpoints (pre-2024 NAAQS values, where $12.0\,\mu\text{g/m}^3$ was classified as AQI 50 "Good").
2. Simplified 2-pollutant CPCB sub-index routines that defaulted to "Good" when data was missing.
3. Lack of explicit averaging interval constraints (24-hour vs 8-hour vs 1-hour indicative).
4. Missing pollutant unit conversions (especially CO $\text{mg/m}^3$ vs $\mu\text{g/m}^3$).
5. Unclear provenance between provider-reported indices, locally derived PM2.5 sub-indices, statutory-eligible NAQI calculations, and officially published CPCB bulletins.

Step 7 resolves each of these limitations at the domain, service, UI, and test layers without fabricating data or breaking backwards compatibility.

---

## 2. Baseline Commit

- **Baseline Commit**: `b6207230db872e24c1a73842beba1cd4bf661c06` (Merge branch `feat/avir-06-global-telemetry` into `main`).
- **Feature Branch**: `feat/avir-07-scientifically-correct-aqi`
- **Active Workspace**: `/Users/polymath/Antigravity/H2S/Prompt Wars`

---

## 3. Existing AQI Audit

An exhaustive audit of the codebase prior to Step 7 revealed:
1. **Outdated EPA PM2.5 Breakpoints**: `src/domain/air-math.ts` defined Good as $0.0 - 12.0\,\mu\text{g/m}^3$, Unhealthy upper bound as $150.4\,\mu\text{g/m}^3$, and Very Unhealthy as $250.4\,\mu\text{g/m}^3$. Under the revised 2024 EPA NAAQS, the Good category is $0.0 - 9.0\,\mu\text{g/m}^3$, $12.0\,\mu\text{g/m}^3$ maps to AQI 56 (Moderate), Unhealthy tops out at $125.4\,\mu\text{g/m}^3$, and Very Unhealthy tops out at $225.4\,\mu\text{g/m}^3$.
2. **Missing Concentration Truncation**: EPA 40 CFR Part 58 Appendix G mandates that PM2.5 concentrations must be truncated to one decimal place ($0.1\,\mu\text{g/m}^3$) prior to linear interpolation. The codebase was passing raw floating point numbers directly to interpolation.
3. **CPCB NAQI Fallback to "Good"**: When `calculateCpcbNaqi(null, null)` was invoked, it returned `{ aqi: null, category: 'Good' }`. This caused missing sensor data to be rendered in the UI as "Good" air quality.
4. **CO Unit Vulnerability**: CPCB breakpoints for Carbon Monoxide are defined in $\text{mg/m}^3$, while sensor telemetry is often reported in $\mu\text{g/m}^3$ or $\text{ppm}$. The calculation lacked explicit unit validation and normalization.
5. **Averaging Period Bypasses**: `calculateComprehensiveCpcbNaqi` accepted a generic boolean `is24HourAveraged: true` which allowed callers to treat 8-hour pollutants (CO, O3) as valid under a 24-hour flag.
6. **Data Sufficiency Gaps**: The Indian CPCB statutory rule requires at least 3 pollutants with mandatory presence of either PM2.5 or PM10. When fewer than 3 pollutants were present, the calculation was previously returning a composite index rather than marking the statutory index `null` while reporting indicative sub-indices.
7. **Ambiguous UI Terminology**: The hero banner and source inspector labeled single-pollutant PM2.5 sub-indices simply as "US AQI" or "AQI", implying a comprehensive multi-pollutant index.

---

## 4. Official Source References

1. **United States Environmental Protection Agency (US EPA)**:
   - *Code of Federal Regulations*: 40 CFR Part 58, Appendix G — Uniform Air Quality Index (AQI) and Daily Reporting.
   - *Federal Register Final Rule*: 89 FR 16202 (May 6, 2024), "Reconsideration of the National Ambient Air Quality Standards for Particulate Matter".
   - *Technical Assistance Document (TAD)*: "Technical Assistance Document for the Reporting of Daily Air Quality — the Air Quality Index (AQI)", EPA-454/B-24-001.
2. **Central Pollution Control Board (CPCB), India**:
   - *National Air Quality Index Report*: CPCB, Ministry of Environment, Forest and Climate Change (MoEFCC), Government of India (October 2014, Prof. Mukesh Sharma et al., IIT Kanpur).
   - *CPCB Sameer Bulletin Methodology*: Real-time National AQI dissemination guidelines and 24-hour averaging rules.

---

## 5. EPA Standard Version

Avir now implements the **May 6, 2024 EPA Revised PM NAAQS Rule (89 FR 16202)**:
- Replaced the 1997/2006/2012 legacy annual PM2.5 standard ($12.0\,\mu\text{g/m}^3$) with the updated $9.0\,\mu\text{g/m}^3$ standard.
- Enforced concentration truncation to $0.1\,\mu\text{g/m}^3$.
- Standard linear interpolation with rounding to the nearest integer.
- Upper boundary capped at AQI 500 for concentrations exceeding $500.4\,\mu\text{g/m}^3$ per EPA reporting conventions.

---

## 6. CPCB Standard Version

Avir implements the **CPCB National Air Quality Index (NAQI) Standard (2014)**:
- 8 criteria pollutants: PM2.5, PM10, NO2, SO2, CO, O3, NH3, Pb.
- 6 descriptive categories: Good (0–50), Satisfactory (51–100), Moderately Polluted (101–200), Poor (201–300), Very Poor (301–400), Severe (401–500).
- Statutory minimum: $\ge 3$ pollutants monitored, with at least one particulate matter fraction (PM2.5 or PM10).
- Maximum sub-index determines the composite NAQI.

---

## 7. Complete Breakpoint Tables

### US EPA 2024 Revised PM2.5 Breakpoints (24-Hour Average, $\mu\text{g/m}^3$)

| Category | AQI Range ($I_{Lo} - I_{Hi}$) | Concentration Range ($BP_{Lo} - BP_{Hi}$, $\mu\text{g/m}^3$) |
| :--- | :--- | :--- |
| **Good** | 0 – 50 | 0.0 – 9.0 |
| **Moderate** | 51 – 100 | 9.1 – 35.4 |
| **Unhealthy for Sensitive Groups** | 101 – 150 | 35.5 – 55.4 |
| **Unhealthy** | 151 – 200 | 55.5 – 125.4 |
| **Very Unhealthy** | 201 – 300 | 125.5 – 225.4 |
| **Hazardous (Lower)** | 301 – 400 | 225.5 – 325.4 |
| **Hazardous (Upper)** | 401 – 500 | 325.5 – 500.4 |

### Indian CPCB NAQI 8-Pollutant Breakpoints

| Category | AQI Range | PM2.5 (24h, $\mu\text{g/m}^3$) | PM10 (24h, $\mu\text{g/m}^3$) | NO2 (24h, $\mu\text{g/m}^3$) | SO2 (24h, $\mu\text{g/m}^3$) | CO (8h, $\text{mg/m}^3$) | O3 (8h, $\mu\text{g/m}^3$) | NH3 (24h, $\mu\text{g/m}^3$) | Pb (24h, $\mu\text{g/m}^3$) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Good** | 0 – 50 | 0 – 30 | 0 – 50 | 0 – 40 | 0 – 40 | 0.0 – 1.0 | 0 – 50 | 0 – 200 | 0.0 – 0.5 |
| **Satisfactory** | 51 – 100 | 31 – 60 | 51 – 100 | 41 – 80 | 41 – 80 | 1.1 – 2.0 | 51 – 100 | 201 – 400 | 0.5 – 1.0 |
| **Moderate** | 101 – 200 | 61 – 90 | 101 – 250 | 81 – 180 | 81 – 380 | 2.1 – 10.0 | 101 – 168 | 401 – 800 | 1.1 – 2.0 |
| **Poor** | 201 – 300 | 91 – 120 | 251 – 350 | 181 – 280 | 381 – 800 | 10.1 – 17.0 | 169 – 208 | 801 – 1200 | 2.1 – 3.0 |
| **Very Poor** | 301 – 400 | 121 – 250 | 351 – 430 | 281 – 400 | 801 – 1600 | 17.1 – 34.0 | 209 – 748 | 1201 – 1800 | 3.1 – 3.5 |
| **Severe** | 401 – 500 | 250+ | 430+ | 400+ | 1600+ | 34.0+ | 748+ | 1800+ | 3.5+ |

---

## 8. Interpolation Equation

The official linear interpolation equation specified by both US EPA (40 CFR Part 58) and CPCB is implemented in `src/domain/air-math.ts` and `src/domain/cpcb-naqi.ts`:

$$I_p = \frac{I_{Hi} - I_{Lo}}{BP_{Hi} - BP_{Lo}} \times (C_p - BP_{Lo}) + I_{Lo}$$

Where:
- $C_p$ is the pollutant concentration (truncated to $0.1\,\mu\text{g/m}^3$ for PM2.5).
- $BP_{Hi}$ is the concentration breakpoint that is greater than or equal to $C_p$.
- $BP_{Lo}$ is the concentration breakpoint that is less than or equal to $C_p$.
- $I_{Hi}$ is the index breakpoint corresponding to $BP_{Hi}$.
- $I_{Lo}$ is the index breakpoint corresponding to $BP_{Lo}$.
- $I_p$ is rounded to the nearest whole integer (`Math.round`).

---

## 9. Rounding and Concentration Precision

Per 40 CFR Part 58, Appendix G, Section 12:
- PM2.5 concentration must be truncated to one decimal point ($0.1\,\mu\text{g/m}^3$). For example, $9.08\,\mu\text{g/m}^3 \rightarrow 9.0\,\mu\text{g/m}^3$.
- `truncatePm25Concentration(concentration)`:
  ```typescript
  export function truncatePm25Concentration(val: number): number {
    return Math.trunc(val * 10) / 10;
  }
  ```
- Sub-indices and composite indices are rounded to the nearest integer (`Math.round(I_p)`).

---

## 10. Units

All pollutant concentrations are normalized before calculation:
- PM2.5, PM10, NO2, SO2, O3, NH3, Pb: $\mu\text{g/m}^3$.
- CO: $\text{mg/m}^3$.
- Automatic conversion: If CO is provided in $\mu\text{g/m}^3$, `calculateSubIndex` divides by 1000 ($1000\,\mu\text{g/m}^3 = 1.0\,\text{mg/m}^3$). Unsupported units (e.g. `ppm` without molecular weight conversion) are rejected with `null`.

---

## 11. Averaging Periods

- **24-Hour Averaging**: PM2.5, PM10, NO2, SO2, NH3, Pb.
- **8-Hour Averaging**: CO, O3.
- When live single-hour telemetry is processed without a full historical rolling window, the output is explicitly classified as `cpcb_derived_indicative` or `epa_pm25_24h_subindex` with `averagingPeriod: '1-hour' | '24-hour'`.
- Legacy boolean `is24HourAveraged: true` can no longer bypass CO and O3 8-hour requirement.

---

## 12. Pollutant Eligibility

Only recognized regulatory criteria pollutants are eligible for statutory AQI calculation. If an unknown pollutant or unrecognized string is provided, it is ignored and excluded from data sufficiency checks.

---

## 13. Data Sufficiency

Per the CPCB NAQI Report (2014):
1. A minimum of **3 criteria pollutants** must be measured.
2. At least one of the monitored pollutants **must be particulate matter** (either PM2.5 or PM10).
3. If data sufficiency is not met:
   - Composite `aqi` is `null`.
   - `dataSufficiencyMet` is `false`.
   - `missingRequirements` reports exactly what was missing (e.g. `"At least 3 pollutants required"`, `"Mandatory PM2.5 or PM10 missing"`).
   - Valid sub-indices for available individual pollutants are preserved for transparent indicative inspection.

---

## 14. Derived versus Provider-Reported Outputs

Avir distinguishes between provider-reported data and locally derived values via the new `AqiEvidence` and `AqiMethod` types:

```typescript
export type AqiMethod =
  | 'provider_reported'
  | 'epa_pm25_24h_subindex'
  | 'epa_pm25_nowcast'
  | 'cpcb_official_published'
  | 'cpcb_derived_indicative'
  | 'cpcb_statutory_eligible'
  | 'unavailable';

export interface AqiEvidence {
  standard: 'US_EPA' | 'CPCB_NAQI' | 'OTHER';
  standardVersion: string;
  method: AqiMethod;
  formula: string;
  responsiblePollutant?: string;
  isOfficialPublished: boolean;
  pollutantCount: number;
  dataSufficiencyMet: boolean;
  caveats: string[];
}
```

- When Open-Meteo returns `us_aqi`, it is tagged as `provider_reported` with standard version `'Open-Meteo Model (EPA AQI Framework)'`.
- When local PM2.5 concentration is calculated, it is tagged as `epa_pm25_24h_subindex` with formula `'EPA 2024 PM2.5 Linear Interpolation (89 FR 16202)'`.
- When ground station readings are processed, CPCB NAQI is tagged as `cpcb_derived_indicative` or `cpcb_statutory_eligible`.

---

## 15. Statutory Publication Distinction

Only indices published directly by an authorized government agency (e.g., CPCB Sameer 4:00 PM Daily Bulletin) may be tagged as `cpcb_official_published`. Locally computed NAQI values from station telemetry are always marked `isOfficialPublished: false`.

---

## 16. Source Timestamps

Timestamps are preserved strictly without synthesis:
- Ground station observations retain their genuine `observedAt` timestamp.
- Atmospheric models retain their genuine `validAt` forecast timestamp.
- A missing observation timestamp never causes the system to substitute `new Date().toISOString()`.

---

## 17. UI Categories and Labels

1. **`AtmosphereHero.tsx`**:
   - Hero card header displays: `"US AQI (Modeled)"` with subtitle `"Provider-reported atmospheric model index"`.
   - Provenance evidence chip shows: `"US EPA 2024 Revised PM2.5 Standard (40 CFR Part 58, 89 FR 16202)"`.
   - Safe category fallback: renders `'Unavailable'` in neutral gray if AQI is null or invalid; never defaults to "Good" or "Hazardous".
2. **`MultiSourceInspectorModal.tsx`**:
   - Distinct labels for `"PM2.5 AQI Sub-Index"` vs `"CPCB NAQI (Indian Standard)"` vs `"Indicative CPCB Sub-Index"`.
   - Formula and standard version clearly displayed in method breakdown.
   - Responsible pollutant explicitly displayed (e.g., `"Responsible Pollutant: PM2.5"`).

---

## 18. All Defects Fixed

| Defect ID | Severity | Description | Root Cause | Exact Engineering Fix |
| :--- | :--- | :--- | :--- | :--- |
| **S7-01** | Critical | Obsolete EPA PM2.5 breakpoints ($12.0\,\mu\text{g/m}^3 \rightarrow 50$ Good) | Pre-2024 NAAQS table in `air-math.ts` | Codified `EPA_PM25_2024_BREAKPOINTS` (89 FR 16202). $12.0\,\mu\text{g/m}^3$ now computes to AQI 56 Moderate. |
| **S7-02** | High | Unhealthy upper bound error ($150.4$ instead of $125.4\,\mu\text{g/m}^3$) | Legacy 1997/2006 table | Updated Unhealthy range to $55.5 - 125.4\,\mu\text{g/m}^3$ and Very Unhealthy to $125.5 - 225.4\,\mu\text{g/m}^3$. |
| **S7-03** | Medium | Missing concentration truncation | Raw floating point passed to interpolation | Added `truncatePm25Concentration` to truncate to $0.1\,\mu\text{g/m}^3$ per 40 CFR Part 58 App G. |
| **S7-04** | Critical | Missing CPCB data defaulted to "Good" | `calculateCpcbNaqi(null, null)` returned `{ aqi: null, category: 'Good' }` | Corrected return to `{ aqi: null, category: 'Unavailable' }`. |
| **S7-05** | High | Fragile CO unit handling in CPCB | CO could be evaluated as $\mu\text{g/m}^3$ without conversion | Added explicit $\mu\text{g/m}^3 \rightarrow \text{mg/m}^3$ division by 1000 and rejected unsupported units. |
| **S7-06** | High | CPCB averaging interval bypass | Legacy boolean `is24HourAveraged` allowed 8h CO/O3 to bypass | Enforced pollutant-specific averaging intervals (24h vs 8h) regardless of legacy flags. |
| **S7-07** | High | CPCB 3-pollutant and PM requirements not enforced | 2-pollutant inputs produced overall NAQI | Enforced $\ge 3$ pollutants and mandatory PM2.5 or PM10 presence for statutory eligibility. |
| **S7-08** | Medium | Misleading UI labels ("US AQI" for single-pollutant) | Generic "AQI" used for PM2.5 sub-index | Updated UI labels to "PM2.5 AQI Sub-Index", "US AQI (Modeled)", and added scientific evidence chips. |
| **S7-09** | Medium | Single-source test time brittleness | Hardcoded `2026-11-22` timestamps evaluated against real wall clock in integration test | Scoped `vi.useFakeTimers()` to Group D in `step3-final-closure.test.tsx` and `source-comparison.test.ts`. |
| **S7-10** | Low | Negative, NaN, or Infinite values not cleanly rejected | Unchecked numeric inputs in calculations | Added strict validation guards in `calculateAQIFromPM25` and `calculateSubIndex`. |

---

## 19. Golden-Reference Tests

Implemented in `tests/integration/step7-scientific-aqi.test.ts`:
- **Total Scenarios**: 80
- **Passed**: 80
- **Failed**: 0
- **Group Breakdown**:
  - **Group A (1–20)**: US EPA 2024 Revised PM2.5 AQI Calculations (Breakpoints at 0.0, 9.0, 9.1, 12.0 $\rightarrow$ 56 Moderate, 35.4, 35.5, 55.4, 55.5, 125.4, 125.5, 225.4, 325.4, 500.4, capping at 500, negative, NaN, Infinity, null, rounding, truncation, metadata). **20/20 PASS**.
  - **Group B (21–36)**: CPCB 8 Criteria Pollutants Calculations (Breakpoint edges for all 8 pollutants, CO $\text{mg/m}^3$ vs $\mu\text{g/m}^3$, valid zeros, negative values, unsupported units). **16/16 PASS**.
  - **Group C (37–52)**: CPCB Data Sufficiency & Averaging Protocols (0, 1, 2, 3 pollutants with PM, 3 without PM, 24h vs 8h intervals, legacy boolean cannot bypass, local vs official publication). **16/16 PASS**.
  - **Group D (53–70)**: Scientific Provenance & UI Presentation Integrity (Provider-reported vs derived, indicative states, stale marking, original units, safe unavailable categories, zero preservation, partial telemetry, GRAP non-inference). **18/18 PASS**.
  - **Group E (71–80)**: Regression & Cross-System Health (World Explorer, CityShootout, CPCB source, OpenAQ, Personal Monitor, Provenance integrity, Cache non-fabrication, Category safety, City switching, Breakpoint table exactness). **10/10 PASS**.

---

## 20. Regression Test Results

- **Total Test Files**: 33
- **Total Tests**: 800
- **Passing Tests**: 800
- **Failing Tests**: 0
- **Suite Duration**: ~29.9 seconds

---

## 21. Browser Test Results

- Server-side rendering and component mounting verified via `ReactDOMServer.renderToString`.
- Modal accessibility attributes verified (`role="dialog"`, `aria-modal="true"`).
- Honest unavailable states verified: missing data displays `"PM2.5 concentration unavailable."` rather than fabricated values.
- Clean unmount on `isOpen=false` verified.

---

## 22. Remaining Limitations

1. **Official CPCB Live Ingestion**: Requires official government portal API credentials (CCR portal / GovData) for real-time station feeds.
2. **Physical Hardware Verification**: Step 5 USB Web Serial and BLE hardware connectivity remains tested via mocked WebSerial / WebBluetooth interfaces.

---

## 23. Deferred Step 4–6 Issues (Technical Debt Register)

The technical debt register is strictly preserved:
1. **Step 4**: CPCB official API key requirement and live CCR ingestion pipeline.
2. **Step 5**: Testing on physical microcontrollers (PMSA003, Sensirion SPS30, ESP32) in physical environment.
3. **Step 6**: World telemetry batch model query optimization for edge regions with high latency.

---

## 24. CI and Vercel Evidence

- TypeScript verification (`npx tsc --noEmit`): **0 errors**.
- Production build (`npm run build`): **Compiled successfully in 1289ms**, static generation 7/7 pages green.
- Vitest test run (`npm test`): **33 test files passed, 800 tests passed**.

---

## 25. Step 8 Readiness

- **Status**: **READY (GO)**
- The mathematical, regulatory, and provenance foundations for air quality indices are now fully solid, enabling Step 8 (Multi-Pollutant Health Impacts & Advisory Engine) to build upon verified, scientifically defensible AQI values.
