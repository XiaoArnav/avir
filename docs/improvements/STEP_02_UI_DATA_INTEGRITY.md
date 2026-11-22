# Avir Production Roadmap — Step 02 of 24
## Production UI Data Integrity and Honest Unavailable States

### 1. Executive Summary

Step 2 of the 24-step Avir engineering roadmap establishes strict, zero-fabrication data consumption across all user-facing user interface components in Avir.

Prior to Step 2, several UI components contained subtle fallback shortcuts (`|| 380`, `|| 220`, `?? 0`), rejected legitimate zero-valued clean air readings (`val <= 0`), categorized missing or undefined AQI as "Hazardous", used predetermined static pollution numbers for comparative city benchmarks, and displayed modeled atmospheric weather chemistry as "Live Observation".

This release completely eliminates synthetic fallback data, distinguishes genuine zero measurements (`0 µg/m³` particulate concentration is valid physical clean air) from unavailable data (`null` / `undefined`), enforces honest unavailable UI states with disabled exports, and preserves strict data provenance.

---

### 2. Exact Files Modified & Created

| File | Change Scope |
| :--- | :--- |
| `src/domain/types.ts` | Added `'Unavailable'` to `AQICategory` discriminated union. |
| `src/domain/air-math.ts` | Updated `getAQICategory(aqi)` to return `'Unavailable'` for `null`, `undefined`, `NaN`, or negative values rather than defaulting to `'Hazardous'`. |
| `src/app/page.tsx` | Updated state management to clear previous city plans immediately on city switch (`setPlan(null)`); prevented plan generation on missing data or errors; passed nullable props to child components; updated category mapping. |
| `src/components/RwaBulletinModal.tsx` | Removed `|| 380` and `|| 220` synthetic fallbacks; replaced hardcoded society name with empty input/placeholder; disabled export and print actions when telemetry is unavailable; relabeled mandatory statutory claims as recommended community health advisories. |
| `src/components/SchoolSafetyAdvisoryModal.tsx` | Replaced `val <= 0` guard with strict nullability checks so that valid zero AQI/PM2.5 is accepted; rendered honest unavailable state on missing values; removed unverified government closure claims. |
| `src/components/ShareBulletinModal.tsx` | Supported nullable props; accepted valid zero clean air (0 cigarettes); rendered honest unavailable state on missing values; preserved source attribution, provenance, and timestamp. |
| `src/components/CityShootout.tsx` | Completely removed hardcoded static pollution values from presets (`COMPARISON_TARGETS` retain geographic coordinates only); fetched genuine live target readings dynamically; handled genuine 0 values; passed actual selected country instead of hardcoded `'India'`. |
| `src/components/CommuteCalculator.tsx` | Accepted `ambientPm25: number | null`; treated 0 as clean air (0 inhaled dose); rendered honest unavailable card on missing data; added explicit minute-ventilation modeling disclaimer. |
| `src/components/FilterLifespanEstimator.tsx` | Accepted `ambientPm25: number | null`; treated 0 as baseline clean air; rendered honest unavailable card on missing data; labeled outputs as model estimates. |
| `src/components/AtmosphereHero.tsx` | Added neutral `'Unavailable'` category badge; accurately labeled modeled vs observed vs cached telemetry; adjusted boundary-layer strip to prevent artificial bar heights on null BLH; hid misleading 5-source consensus badge pending Step 3. |
| `tests/unit/timeline-integrity.test.ts` | Updated baseline assertion to verify that `getAQICategory(null)` yields `'Unavailable'`. |
| `tests/integration/ui-data-integrity.test.ts` | **New targeted integration test suite** covering all 29 mandated scenarios across 7 component groups. |
| `docs/improvements/STEP_02_UI_DATA_INTEGRITY.md` | Comprehensive architectural and release documentation. |

---

### 3. Detailed Data-Integrity Corrections

#### 3.1. Zero-Fabrication Enforcement in RWA Notice (`RwaBulletinModal.tsx`)
- **Defect Removed**: `const aqi = metrics?.usAqi || 380; const pm25 = metrics?.pm25 || 220;`
- **Correction**: If telemetry is unavailable (`usAqi === null || pm25 === null`), the modal displays an informative unavailable notice explaining that telemetry is unavailable for the location. Export ("Copy WhatsApp Circular" and "Print / Save PDF") buttons are strictly disabled (`disabled={!isDataAvailable}`).
- **Attribution & Claims**: Society name defaults to empty with an informative placeholder (`"e.g. Silver Oaks Apartments RWA, Sector 54..."`). Directives are clearly labeled as "RECOMMENDED COMMUNITY CLEAN-AIR ADVISORY", eliminating unsupported claims of statutory CAQM enforcement orders.

#### 3.2. Pediatric Health Integrity (`SchoolSafetyAdvisoryModal.tsx`)
- **Defect Removed**: `if (usAqi <= 0 || pm25 <= 0)` rejected valid zero pollution.
- **Correction**: Accepts `0` as clean air (`Safe for All School Outdoor Activities`). Rejects `null`, `undefined`, `NaN`, and negative concentrations into an honest unavailable state. Removes unsupported assertions of official school closure decrees.

#### 3.3. Honest Social Briefings (`ShareBulletinModal.tsx`)
- **Defect Removed**: Sentinel values and fallback cigarettes calculation.
- **Correction**: Preserves genuine observation timestamp, source attribution, and data classification. If PM2.5 is unavailable, cigarette equivalence is omitted or marked unavailable.

#### 3.4. Elimination of Fake Comparative Presets (`CityShootout.tsx`)
- **Defect Removed**: 8 international cities had hardcoded fake AQI and PM2.5 numbers (e.g. Tokyo 26, Beijing 88, Lahore 310, London 35).
- **Correction**: Presets were converted to geographic metadata configurations (`name`, `country`, `latitude`, `longitude`). Telemetry is fetched live from Open-Meteo or rendered as "Comparison data unavailable" if not yet loaded. The user's primary city country is passed dynamically rather than forced to `'India'`.

#### 3.5. Accurate Data Provenance in Hero (`AtmosphereHero.tsx`)
- **Defect Removed**: Modeled Open-Meteo data was badged as "Live Observation".
- **Correction**: Modeled data is badged as "Latest modeled conditions" with timestamp prefix "Modeled for:". Cached data is badged as "Cached Reading" with "Cached from:". Ground stations are labeled "Ground Observation".
- **Consensus Safeguard**: The multi-source consensus badge claiming agreement across 5 independent sources was hidden until true multi-source ingestion is implemented in Step 3.
- **Missing Boundary Layer Height**: Null BLH does not render a fake 200m bar.

---

### 4. Verification & Testing Evidence

All tests pass with zero failures:
```bash
$ npm test

 ✓ tests/a11y/accessibility.test.ts (5 tests)
 ✓ tests/security/sanitizer.test.ts (8 tests)
 ✓ tests/unit/timeline-integrity.test.ts (5 tests)
 ✓ tests/unit/advanced-features.test.ts (15 tests)
 ✓ tests/unit/city-panoramic-backdrop.test.ts (43 tests)
 ✓ tests/integration/ai-plan-route.test.ts (3 tests)
 ✓ tests/unit/multi-source-consensus.test.ts (5 tests)
 ✓ tests/unit/world-telemetry.test.ts (4 tests)
 ✓ tests/integration/ai-assistant.test.ts (4 tests)
 ✓ tests/unit/atmospheric-math.test.ts (11 tests)
 ✓ tests/unit/wind-vector-nullability.test.ts (2 tests)
 ✓ tests/integration/ui-data-integrity.test.ts (29 tests)
 ✓ tests/integration/telemetry.test.ts (9 tests)

Test Files  13 passed (13)
     Tests  143 passed (143)
```

TypeScript type-checking passed cleanly:
```bash
$ npx tsc --noEmit
# 0 errors
```

Next.js production build succeeded cleanly:
```bash
$ npm run build
✓ Compiled successfully
✓ Generating static pages (5/5)
✓ Finalizing page optimization
```

---

### 5. Deferred Scope & Next Roadmap Milestones

- **Step 3 (Source Provenance & Multi-Source Monitoring)**: Ingest genuine independent feeds (CAMS, NOAA GFS, OpenAQ, ground sensors) rather than deriving simulated consensus from a single provider.
- **Step 4 (Ground-Station Integration)**: Integrate verified physical surface monitors without synthetic multipliers or fabricated sensor coordinates.
- **Step 6 (Global Telemetry & World Comparisons)**: Enhance world ranking batch queries and persistent city comparative benchmarks.
- **Step 8 (Statutory GRAP & Regulatory Action Tracker)**: Official CAQM and government gazette regulatory notifications.

---

### 6. Git & GitHub Branch Delivery

- **Branch**: `fix/avir-02-ui-data-states`
- **Base Commit**: `f8f1f40a9557b52fd10ccf3ab9af9a9524a39c21` (`origin/main`)
- **Author Identity**: `XiaoArnav <322868724+XiaoArnav@users.noreply.github.com>`
- **Status**: Ready for peer review; not merged automatically.
