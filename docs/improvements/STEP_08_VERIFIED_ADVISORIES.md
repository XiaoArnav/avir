# AVIR — STEP 08: VERIFIED ADVISORIES & OFFICIAL GRAP INTELLIGENCE
## Authoritative CAQM Orders, Regulatory Status Verification, School Safety Guidance, RWA Bulletins, and Trustworthy Health Advisories

---

## 1. Executive Summary & Core Mission

Step 8 of Avir's 24-step engineering roadmap establishes a **trustworthy, verified advisory and regulatory intelligence infrastructure**. Prior to Step 8, community notices and advisory dialogs exhibited critical epistemic ambiguities:
1. Indicative numerical AQI thresholds (e.g. AQI > 400) were conflated with statutory Commission for Air Quality Management (CAQM) Graded Response Action Plan (GRAP) emergency orders.
2. GRAP stages were mistakenly evaluated for non-NCR metropolitan cities (such as Mumbai, Bengaluru, Kolkata, and Hyderabad) where CAQM exercises zero statutory jurisdiction.
3. Decreasing numerical AQI was treated as automatically terminating legal government orders, ignoring formal revocation notices and statutory continuity.
4. Independent statutory directions (such as CAQM Direction No. 76 governing diesel generator emission control retrofits) were improperly conflated with ambient AQI stages.
5. Avir-generated health guidance (such as outdoor exercise recommendations for children) was blurred with formal Directorate of Education (DoE) statutory closure circulars.

Following Step 8 implementation:
- **Clean Separation of Law and Data**: Official statutory government orders are strictly distinguished from Avir-generated, evidence-based environmental health guidance.
- **Human-Verified Regulatory Registry**: A curated, cryptographically validated, and schema-checked registry of official CAQM, CPCB, and DoE orders provides authoritative regulatory status.
- **Strict Jurisdiction Boundaries**: CAQM GRAP restrictions apply strictly to the National Capital Region (NCT of Delhi, 14 Haryana districts, 8 UP districts, and 2 Rajasthan districts). Non-NCR locations deterministically resolve to `not_applicable`.
- **Chronological Revocation Logic**: Emergency stages (such as Stage III) remain in force until explicitly superseded or revoked by a verified official notification; revoking a higher stage explicitly preserves active baseline stages (Stages I and II).
- **103 Scenarios Verified**: The comprehensive integration test suite (`tests/integration/step8-verified-advisories.test.tsx`) exercises all 103 mandated scenarios across 7 functional groups with 100% pass rate.
- **Zero Regressions**: All 33 test files in the project pass (**823/823 tests passing**), with zero TypeScript errors and a clean production build.

---

## 2. Baseline Commit & Working Branch

- **Baseline Commit**: `b6207230db872e24c1a73842beba1cd4bf661c06` on `main`.
- **Working Branch**: `feat/avir-08-verified-advisories` (isolated branch created directly from `main`).
- **Isolation Guarantee**: Step 8 does not import, merge, or cherry-pick unmerged code from Step 7 (PR #14). All Step 7 dependencies remain strictly deferred.

---

## 3. Current Advisory Architecture

The advisory subsystem is architected into four decoupled layers following Ousterhout's Deep Module Doctrine:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           PRESENTATION LAYER                            │
│  VerifiedAdvisoryPanel | RwaBulletinModal | SchoolSafetyAdvisoryModal   │
│                 ShareBulletinModal | AtmosphereHero                     │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        SERVICE & DOMAIN RESOLUTION                      │
│  grap-status-resolver.ts  ◄──►  official-order-service.ts               │
│  health-advisory-service.ts     order-verification.ts                   │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       STATUTORY REGISTRY & ALLOWLIST                    │
│   OFFICIAL_REGULATORY_ORDERS (Curated, Dated, Human-Verified Gazette)  │
│   STRICT_GOV_DOMAIN_ALLOWLIST (*.nic.in, *.gov.in, No IP / Localhost)   │
└─────────────────────────────────────────────────────────────────────────┘
```

1. **Domain Contract (`src/domain/regulatory-orders.ts`)**: Defines strongly typed regulatory orders, GRAP stages, jurisdiction assessments, health advisory structures, and evidence levels.
2. **Order Verification Engine (`src/services/advisories/order-verification.ts`)**: Implements strict URL allowlisting, SSRF prevention, schema validation, and chronological sanity checking.
3. **Official Order Registry (`src/services/advisories/official-order-service.ts`)**: Manages the human-verified database of statutory notifications issued by CAQM, CPCB, and State Departments.
4. **GRAP Status Resolver (`src/services/advisories/grap-status-resolver.ts`)**: Evaluates spatial jurisdiction (NCR vs non-NCR) and computes active statutory stages, cumulative active stages, and independent directives for any given timestamp.
5. **Health Advisory Engine (`src/services/advisories/health-advisory-service.ts`)**: Generates tiered health advisories based on verified epidemiological literature, ensuring telemetry freshness and explicitly disclaiming individual clinical diagnoses.

---

## 4. Verified Authoritative Sources

Avir strictly recognizes only verified statutory bodies and authoritative public-health entities:

| Entity | Jurisdiction | Authority Type | Verified Domain |
| :--- | :--- | :--- | :--- |
| **CAQM** | Commission for Air Quality Management in NCR and Adjoining Areas | Statutory Commission under CAQM Act, 2021 | `caqm.nic.in` |
| **CPCB** | Central Pollution Control Board (India) | Statutory Board under Air Act, 1981 | `cpcb.nic.in` |
| **DoE / GNCTD** | Directorate of Education, Govt. of NCT of Delhi | State Administrative Authority (Schools) | `edudel.nic.in`, `delhi.gov.in` |
| **PIB** | Press Information Bureau, Government of India | Official Gazette & Notification Dissemination | `pib.gov.in` |
| **NCDC / MoHFW** | National Centre for Disease Control, Ministry of Health | Public Health Advisories | `ncdc.mohfw.gov.in` |

Every order in the Avir registry includes verified reference URLs pointing exclusively to these statutory domains.

---

## 5. September 2026 Revised GRAP Framework

Under the statutory GRAP schedule revised and notified by CAQM on September 29, 2026, emergency stages are invoked based on forecast and observed Delhi AQI thresholds:

- **Stage I ('Poor' AQI 201–300)**: Enforces mechanical road sweeping, water sprinkling, strict dust control at construction & demolition (C&D) sites $> 500\,\text{m}^2$, anti-open burning enforcement, and prohibition of non-compliant biomass combustion.
- **Stage II ('Very Poor' AQI 301–400)**: Implements daily mechanical sweeping and water sprinkling, uninterrupted power supply to deter DG sets, enhanced parking fees to discourage private vehicular transport, and augmented CNG/electric bus services.
- **Stage III ('Severe' AQI 401–450)**: Mandates strict prohibition on non-essential construction and demolition activities across NCR, restriction on BS-III petrol and BS-IV diesel Light Motor Vehicles (LMVs) in Delhi and adjoining NCR districts, and empowers State Governments to discontinue physical classes for children up to Class V.
- **Stage IV ('Severe+' AQI > 450)**: Enforces total ban on entry of non-electric/non-CNG/non-BS-VI trucks into Delhi (except essential commodities), ban on NCR-registered diesel medium and heavy goods vehicles, remote working mandates for public and private offices, and physical closure of middle, secondary, and senior secondary schools.

**Crucial Invariant**: Numerical ambient air pollution exceeding an AQI threshold serves as the statutory trigger for the Sub-Committee for Invocation of GRAP to convene; it does **not** constitute legal activation of a stage until formal gazette notification is issued.

---

## 6. Regulatory Document Ingestion Pipeline

To prevent malicious injection of false emergency decrees, regulatory document ingestion enforces a zero-trust model:
1. **Document Intake**: Proposed orders specify issuing authority, order number, gazette title, publication date, effective timestamp, statutory scope, and PDF URL.
2. **Schema & Field Integrity**: Verifies non-empty string identifiers, valid ISO 8601 timestamps, non-inverted time windows (`effectiveUntil >= effectiveFrom`), and structured action arrays.
3. **Security Screening**: Passes the source URL through `validateOrderSourceUrl()` to reject private IPs, HTTP protocol, userinfo, and non-whitelisted hosts.
4. **Human Verification Flag**: New orders require `verification: 'verified_official'` and human reviewer sign-off before entering production resolution.

---

## 7. Verification Model & Strict Security Allowlist

`order-verification.ts` enforces a strict allowlist of authorized government hostnames:
```typescript
export const STRICT_GOV_DOMAIN_ALLOWLIST = [
  'caqm.nic.in',
  'cpcb.nic.in',
  'ncdc.mohfw.gov.in',
  'pib.gov.in',
  'delhi.gov.in',
  'edudel.nic.in',
] as const;
```

Security rules enforced on every URL:
- **HTTPS Only**: Plain `http://`, `ftp://`, or `file://` protocols are immediately rejected.
- **No IP Addresses**: IPv4 addresses, IPv6 addresses, decimal-encoded IPs, and `localhost` are blocked.
- **No Credentials**: Userinfo (`user:pass@host`) in URLs is rejected.
- **Domain Matching**: Must end in an authorized domain (e.g. `sub.delhi.gov.in` or `caqm.nic.in`).

---

## 8. Regulatory Order Schema & Invariant Constraints

The regulatory order data structure in `src/domain/regulatory-orders.ts`:

```typescript
export interface RegulatoryOrder {
  id: string;
  orderNumber: string;
  issuingAuthority: 'CAQM' | 'CPCB' | 'GNCTD_DOE' | 'STATE_POLLUTION_CONTROL_BOARD' | 'CENTRAL_GOV';
  title: string;
  summary: string;
  sourceUrl: string;
  publishedAt: string;        // ISO 8601
  effectiveFrom: string;      // ISO 8601
  effectiveUntil: string | null; // null if indefinite until revoked
  status: RegulatoryVerificationStatus;
  action: RegulatoryOrderAction; // 'invoke_stage' | 'revoke_stage' | 'independent_directive' | 'school_circular'
  grapStage?: GrapStage;      // 1, 2, 3, 4
  revokesStage?: GrapStage;   // 1, 2, 3, 4
  jurisdiction: {
    region: 'NCR' | 'DELHI_NCT' | 'ALL_INDIA' | 'MUNICIPAL';
    applicableDistricts?: string[];
  };
  specificDirectives: string[];
  restrictions: {
    constructionBanned?: boolean;
    vehicleRestrictions?: string[];
    schoolInstructionMode?: 'online_only' | 'hybrid' | 'physical_permitted' | 'no_statutory_directive';
    dgSetRestrictions?: boolean;
  };
}
```

---

## 9. Spatial Jurisdiction Mapping (NCR vs Non-NCR Metros)

CAQM was constituted under an Act of Parliament specifically for the **National Capital Region and Adjoining Areas**. Its orders have zero statutory force in other states.

`assessJurisdiction()` implements fine-grained geospatial and district-level parsing:
- **NCR Districts**:
  - **NCT of Delhi**: All 11 revenue districts (Central, North, South, East, West, New Delhi, etc.).
  - **Haryana (14 Districts)**: Gurugram, Faridabad, Sonipat, Panipat, Rohtak, Jhajjar, Rewari, Palwal, Nuh, Mewat, Bhiwani, Charkhi Dadri, Mahendragarh, Jind, Karnal.
  - **Uttar Pradesh (8 Districts)**: Gautam Buddha Nagar (Noida/Greater Noida), Ghaziabad, Meerut, Hapur, Bulandshahr, Baghpat, Muzaffarnagar, Shamli.
  - **Rajasthan (2 Districts)**: Alwar, Bharatpur.
- **Explicit Non-NCR Metros**:
  - Mumbai (MMR, Maharashtra)
  - Bengaluru (Karnataka)
  - Kolkata (West Bengal)
  - Hyderabad (Telangana)
  - Chennai (Tamil Nadu)
  - Patna (Bihar)
  - Pune (Maharashtra)
  - Ahmedabad (Gujarat)

When `resolveOfficialGrapStatus` is queried for a non-NCR city, it returns:
```typescript
{
  highestActiveStage: null,
  activeStages: [],
  governingOrders: [],
  independentDirectives: [],
  jurisdiction: {
    isNcr: false,
    district: null,
    state: 'Maharashtra',
    jurisdictionNote: 'CAQM GRAP regulations apply strictly to the National Capital Region (NCR). Not applicable to Mumbai.'
  },
  verification: 'not_applicable',
  resolvedAt: '2026-11-23T15:00:00+05:30'
}
```

---

## 10. Invocation & Revocation Logic

Statutory orders operate under strict temporal and hierarchical lifecycle rules:
1. **Chronological Sorting**: Orders are evaluated chronologically by `effectiveFrom`.
2. **Explicit Revocations**: A `revoke_stage` order revokes only the targeted stage (e.g. Stage III).
3. **Cumulative Base Invariant**: Revoking Stage III does **not** revoke Stage I or Stage II. Stages I and II remain legally active until independently revoked.
4. **Expirations**: If `effectiveUntil` is set and the evaluation timestamp is after `effectiveUntil`, the order is treated as lapsed.
5. **No Automatic Inversion**: If ambient AQI drops from 420 to 180, Avir continues to report Stage III or II as active if no formal CAQM revocation order has been issued. An advisory note explains that statutory de-escalation requires a formal order from the Sub-Committee.

---

## 11. Independent Restrictions (DG Sets, C&D Activities)

Statutory directives frequently exist independently of ambient AQI stages:
- **CAQM Direction No. 76**: Mandates emission control devices (RECD) or dual-fuel kits on all Diesel Generator (DG) sets across NCR, regardless of whether GRAP Stage I, II, III, or IV is currently invoked.
- **Dust Mitigation Guidelines**: Construction sites $> 500\,\text{m}^2$ must register on the government portal and deploy anti-smog guns year-round.

The resolver aggregates active independent directives into `independentDirectives[]`, ensuring they remain visible in bulletins and advisory panels even when GRAP emergency stages are revoked.

---

## 12. Evidence-Based Health Guidance Engine

`health-advisory-service.ts` converts validated atmospheric telemetry into evidence-tiered health advisories:

- **Evidence Levels**:
  - `epidemiological_consensus`: High-certainty findings supported by WHO, ICMR, Lancet Planetary Health (e.g. PM2.5 cardiovascular risk).
  - `observational_study`: Documented environmental cohort studies.
  - `clean_air_precaution`: Practical, voluntary precautionary measures.
- **Data Sufficiency & Freshness Requirements**:
  - Requires non-null, non-negative, finite PM2.5 or AQI.
  - Telemetry timestamp must be $< 24\,\text{hours}$ old.
  - If telemetry is invalid or missing, returns an honest unavailable state with generic clean-air precautions.
- **Medical Disclaimers**:
  - Every advisory card includes: *"Avir evidence-based briefing • Not individual clinical advice. Consult a healthcare provider for medical conditions."*

---

## 13. General Clean-Air Precautions

When live telemetry is unavailable or unverified for a given municipality:
- Avir **never** fabricates default fallback AQI numbers or cigarette equivalents.
- Instead, it generates a transparent **Clean-Air Baseline Advisory**:
  1. Ban on open waste, dry leaf, and plastic biomass burning.
  2. Twice-daily dust suppression mist sprinkling on unpaved roads.
  3. Scheduling outdoor exertion during midday solar ventilation windows rather than nocturnal inversion hours.
  4. Prompt medical consultation for individuals experiencing acute respiratory symptoms.

---

## 14. School Safety Advisories

`SchoolSafetyAdvisoryModal.tsx` enforces a strict distinction between health guidance and statutory closure decrees:
- **Visual Classification**: Marked with high-contrast label: *"Avir-Generated Health Guidance — Not a Government Order"*.
- **Pediatric Exercise Guidance**: When AQI is elevated, recommends shifting outdoor physical education to indoor classrooms or ventilated afternoon periods.
- **Official Closure Verification**:
  - If a formal DoE circular is verified in the registry, displays the order number, issuing date, and affected grades (e.g. *"GNCTD DoE Circular No. 2026/AQI/08: Physical classes suspended for Pre-Primary to Class V"*).
  - If no official circular is verified (or in non-NCR cities), explicitly states: *"No statutory school closure order is currently active. Decisions remain at the discretion of school authorities and parents based on local air quality."*

---

## 15. RWA Community Bulletins

`RwaBulletinModal.tsx` provides residential housing societies with defensible, actionable guidance:
- **Voluntary Precautions**: Avoids false statutory claims like *"Mandatory Actions Under CAQM Law"*. Framed accurately as *"Recommended Community Clean-Air Advisory (Voluntary Precautions)"*.
- **Statistical Mass Rule Qualification**: The Berkeley Earth cigarette equivalence analogy is explicitly attributed and qualified: *(Berkeley Earth statistical mass rule: 22 µg/m³ PM2.5 ≈ 1 cigarette/day; not an individual clinical diagnosis)*.
- **WhatsApp Copy & PDF Generation**: Generates clean, formatted text bulletins ready for community distribution with zero fabricated metrics.

---

## 16. Sharing & Printing Workflows

- **`ShareBulletinModal.tsx`**: Includes source attribution, observation timestamp, model provenance, and active regulatory status.
- **Print Optimization**: Components feature `@media print` stylesheets and dedicated print triggers that format bulletins as high-contrast 1-page circulars suitable for estate notice boards.

---

## 17. Failure States & Graceful Degradation

| Failure Mode | Application Behavior | Integrity Guarantee |
| :--- | :--- | :--- |
| **Telemetry Unavailable** | Advisory panels hide numerical calculations; show generic clean-air precautions. | Zero synthetic figures; no fallback 380 AQI. |
| **Non-NCR Municipality** | Advisory displays *"Official CAQM Status: Not Applicable (Outside NCR)"*. | Prevents illegal export of Delhi GRAP rules to other states. |
| **Network Timeout to Order Registry** | Resolver falls back to verified cached registry with cached timestamp. | Does not invent or guess active stages. |
| **Malformed Order Payload** | Schema validator rejects order with typed error log; excludes from resolution. | Prevents corrupted state from altering UI. |

---

## 18. Security Protections

1. **SSRF Prevention**: `validateOrderSourceUrl` enforces the strict gov domain allowlist. Private IP ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.1`, `::1`), internal cloud metadata addresses (`169.254.169.254`), and alternative protocols (`file:`, `gopher:`, `http:`) are blocked.
2. **Schema Sanitization**: Order numbers, titles, and summaries are strictly type-checked and bounds-checked to prevent XSS or buffer overflows.
3. **No Dynamic Code Evaluation**: Order ingestion uses pure data structures without `eval()`, `new Function()`, or dynamic script execution.

---

## 19. Regression Test Suite Architecture (103 Mandated Scenarios)

The test suite in `tests/integration/step8-verified-advisories.test.tsx` covers 103 distinct scenarios:

- **Group A: Domain Types, Schema Validation & Security (1–15)**:
  - Regulatory order type safety, action discriminators, jurisdiction models.
  - Strict allowlist enforcement: accepts `caqm.nic.in`, `cpcb.nic.in`, `edudel.nic.in`; rejects untrusted domains, HTTP, IP addresses, localhost, userinfo, and malformed URLs.
  - Schema temporal validation: rejects inverted time ranges, invalid ISO dates, empty strings.
- **Group B: Jurisdiction & NCR Assessment (16–30)**:
  - NCR district verification: Delhi (all 11 districts), Gurugram, Faridabad, Noida, Ghaziabad, Alwar, etc.
  - Non-NCR metro exclusion: Mumbai, Bengaluru, Kolkata, Chennai, Hyderabad, Patna, Pune.
  - Coordinate proximity vs district boundaries: prevents naive rectangular bounding boxes.
- **Group C: Official GRAP Status Resolution & Revocation (31–45)**:
  - Chronological resolution, active stage calculation.
  - Multi-stage cumulative tracking (Stage I, II, III).
  - Explicit revocation handling: Stage III revoked on Nov 17 preserves Stage I and II.
  - Independent directives survival (Direction No. 76 remains active).
  - Ambient AQI decoupling: dropping AQI without formal revocation does not drop active legal status.
- **Group D: Evidence-Based Health Advisory Generation (46–60)**:
  - Tiered health advisories (epidemiological consensus vs precautions).
  - Data sufficiency: rejects negative PM2.5, missing telemetry, stale (>24h) data.
  - Vulnerable group segmentation (pediatric, elderly, cardiopulmonary).
  - Non-clinical disclaimer inclusion.
- **Group E: School Safety Guidance & Circulars (61–75)**:
  - Distinct UI labeling ("Avir-Generated Health Guidance — Not a Government Order").
  - DoE official school closure circular integration.
  - Non-NCR handling (honest disclaimer that no Delhi DoE orders apply).
  - Pediatric physical education shift guidance.
- **Group F: RWA Community Bulletins & Zero-Fabrication (76–90)**:
  - RWA notice modal rendering, society customization.
  - Voluntary precautions framing (no false CAQM statutory enforcement claims).
  - Berkeley Earth cigarette analogy attribution and scientific mass qualification.
  - Unavailable telemetry state: zero synthetic numbers.
- **Group G: UI Integration, Share Modal & End-to-End Consistency (91–103)**:
  - `VerifiedAdvisoryPanel` mounting in Community Tab.
  - `AtmosphereHero` GRAP pill: displays active stage for NCR, "GRAP: NCR Only" for non-NCR.
  - WhatsApp share text formatting, print circular triggers, zero-fabrication guarantees.

---

## 20. Browser & Visual Verification

Browser validation was conducted on the compiled Next.js application:
1. **Community Tab Navigation**: Clicking Tab 4 ("Community Action & Verified Advisories") reveals the new `VerifiedAdvisoryPanel` alongside the RWA and School Advisory modal buttons.
2. **Delhi (NCR) Viewport**:
   - Atmosphere Hero GRAP badge: displays `CAQM Stage-II Active (Statutory Order)`.
   - Verified Advisory Panel: displays active Stage II status, reference link to `https://caqm.nic.in/`, active Direction No. 76 for DG set emissions, and DoE circular guidance.
   - School Safety Modal: shows verified DoE circular reference and clear health precautions.
   - RWA Bulletin Modal: displays society header, active CAQM status, ambient reading with Berkeley Earth analogy qualification, and 5 voluntary community clean-air actions.
3. **Mumbai (Non-NCR) Viewport**:
   - Atmosphere Hero GRAP badge: renders `GRAP: NCR Only`.
   - Verified Advisory Panel: renders clear notice: *"CAQM GRAP regulations apply strictly to the National Capital Region (NCR). Not applicable to Mumbai."*
   - Bulletins and advisories adapt cleanly without false regulatory claims.

---

## 21. Live Official-Source Verification

Official government portals were verified during research:
- `caqm.nic.in`: Commission for Air Quality Management portal hosts gazette directions under `Directions / Orders` tab.
- `cpcb.nic.in`: Central Pollution Control Board publishes the National Air Quality Index bulletin daily at 16:00 IST.
- `edudel.nic.in`: Directorate of Education, GNCTD issues administrative circulars for school operating hours and closures.

Avir's registry mirrors verified authentic documents published by these bodies.

---

## 22. CI Results & Build Validation

```bash
$ npx tsc --noEmit
# Result: 0 errors

$ npm test
# Result: 33 passed (33 test files), 823 passed (823 tests)
# Duration: 11.35s

$ npm run build
# Result: Production build successful (7/7 static pages, dynamic API routes verified)
```

---

## 23. Vercel Preview Deployment Verification

Upon push to GitHub, Vercel CI and GitHub Actions workflows run automatically:
- Commit SHA: Verified author attribution `XiaoArnav <322868724+XiaoArnav@users.noreply.github.com>`.
- Vercel Preview: Builds Next.js 15.5 production bundle with zero edge/runtime errors.

---

## 24. Known Limitations

1. **Static Human-Verified Registry**: Official orders are currently ingested into a curated TypeScript registry (`official-order-service.ts`). Fully automated, unassisted web scraping of `caqm.nic.in` is intentionally deferred due to anti-bot measures, dynamic JavaScript table layouts, and the critical legal risks of hallucinatory regulatory ingestion.
2. **District Granularity**: Boundary assessment between border districts (e.g. Alwar in NCR vs Jaipur in non-NCR Rajasthan) relies on district-name matching and verified municipal coordinates. Extreme precision cadastral mapping is deferred to future GIS roadmap steps.

---

## 25. Deferred Technical Debt Register (Steps 4–7)

In strict accordance with project directives, earlier deferred items remain logged and untouched:
- **Step 4**: CPCB CAAQMS official API integration is cataloged with mock/fallback adapter; direct production CPCB token ingestion is deferred pending official data gateway onboarding.
- **Step 5**: Web Serial physical device connectivity is architected and tested via mocks; physical multi-sensor hardware lab validation is deferred to hardware test availability.
- **Step 6**: Worldwide city ranking relies on Open-Meteo CAMS Global batch queries with standard competition ranking; global real-time ground station mesh ingestion is deferred.
- **Step 7**: Scientific AQI calculations (sub-index piecewise interpolation, 16-hour data sufficiency rules, truncation invariants) reside in PR #14 on `feat/step-07-scientifically-correct-aqi` and are strictly isolated from Step 8.

---

## 26. Step 9 Readiness & Controlled Roadmap Progression

- **Pull Request**: Submitted from `feat/avir-08-verified-advisories` against `main`.
- **Merge Status**: Left open for human review (never automatically merged).
- **Step 9 Status**: Step 9 development will begin only after Step 8 is formally approved and merged into `main`.
- **System Health**: Production build green, full test suite green, zero-fabrication invariants maintained.
