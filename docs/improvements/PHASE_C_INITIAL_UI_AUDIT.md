# AVIR — PHASE C INITIAL UI/UX AUDIT & ARCHITECTURAL ROADMAP
## Comprehensive Inspection of Production Interface, Component Hierarchy, Accessibility Gaps, and Cross-Phase Integrity

**Project:** Avir — High-Trust Urban Environmental Intelligence  
**Repository:** https://github.com/XiaoArnav/avir  
**Audit Baseline Commit:** `71186d7665b881a60077f79f2236bb08505def96`  
**Author:** XiaoArnav <322868724+XiaoArnav@users.noreply.github.com>  
**Status:** Settled Audit & Phase C Roadmap  

---

## 1. Executive Summary & Audit Scope

Avir has successfully integrated deep environmental modeling across Phases A and B (Steps 1–16), encompassing regulatory CAQM GRAP directives, multi-pollutant CPCB and EPA calculations, Diurnal boundary layer modeling, and personalized exposure physics. However, an architectural audit of the current frontend interface reveals that user experience, visual hierarchy, accessibility, and terminology require a coordinated Phase C transformation.

The primary objective of Phase C (Steps 17–21) is to **turn Avir from a configuration-heavy technical dashboard into an action-first environmental intelligence product** without compromising underlying scientific rigor or fabricating data.

---

## 2. Key Audit Findings by Dimension

### 2.1 Design System & Typography (Step 17)
- **Hardcoded Style Fragmentation**: Border radius, background opacities, and border colors are scattered between raw Tailwind utilities (`border-stone-300 dark:border-zinc-800`, `bg-white/95 dark:bg-[#0c0c0e]/95`, `bg-stone-50 dark:bg-zinc-900/60`). There is no centralized token set for semantic surfaces, elevated layers, and provenance indicators.
- **Tiny Text Sizes**: Several secondary metrics and provenance markers render at `text-[9px]` or `text-[10px]` with low contrast (`text-stone-400 dark:text-zinc-600`), falling short of comfortable legibility on mobile devices.
- **Lack of Standardized Data State Components**: Loading skeletons, empty states, and unavailable data fallbacks are custom-coded across `AtmosphereHero`, `DiurnalForecastTimeline`, `CityShootout`, and `WorldDataExplorer`. A unified component primitive set (`LoadingState`, `EmptyState`, `ErrorState`, `MetricCard`, `DataProvenance`, `AccessibleDialog`) is needed.

### 2.2 Main Dashboard Hierarchy (Step 18)
- **Configuration-Before-Action Burden**: On initial load, users are confronted with technical panels before being shown immediate, plain-language actionable guidance. The dashboard needs an instant "Today's Quick Health Guide / Your Actions Today" section directly answering: *How bad is the air? Can I go outside? When should I ventilate? What adjustments should I make?*
- **Hero Measurement Clarity**: `AtmosphereHero` shows EPA AQI prominently, but the distinction between US EPA AQI (dimensionless standard) and CPCB NAQI (Indian statutory index) must be immediately legible with clear standard tags.
- **Progressive Personalization**: Household vulnerability profiling (`FamilyProfileForm`) currently sits alongside basic telemetry on the homepage. It should be presented progressively so first-time visitors can understand local conditions without filling out a clinical profile.

### 2.3 Scientific Visualizations (Step 19)
- **Hourly Chart Clarity**: `DiurnalForecastTimeline` renders a horizontal scroll of discrete button cards. While functional, it lacks a continuous SVG visual trend showing the diurnal PM2.5 trajectory, day boundaries, and distinct visual treatments for observed vs modeled hourly points.
- **AQI vs Mass Concentration**: Conflating dimensionless AQI and mass concentration ($\mu\text{g/m}^3$) on similar numerical scales creates user confusion. They must have independent visual scales or explicit mode selectors.
- **Wind Vector & Dispersion Accuracy**: Meteorological convention requires clear representation of wind provenance (where wind originates from). The animated dispersion visualizer must explicitly state it is an illustrative dispersion model and respect `prefers-reduced-motion`.

### 2.4 Navigation & Location UX (Step 20)
- **Misleading Navigation Badges**: `SegmentedTabs.tsx` contains a hardcoded `₹2,950` badge for the "Clean Home" tab and an unqualified `'Live'` badge on "World Data". These violate Avir's zero-misrepresentation policy and must be removed.
- **Tab Accessibility Deficiencies**: `SegmentedTabs.tsx` applies `role="tablist"` and `role="tab"` but lacks `aria-controls`, `id`, and keyboard arrow navigation (Left/Right/Home/End) required for full WAI-ARIA tab pattern compliance.
- **City Switching & Disambiguation**: `CityPicker.tsx` dropdown displays `loc.name` and `loc.admin1`, but needs stronger keyboard navigation, active highlight, and clear location provenance.

### 2.5 Accessibility & Modal Hygiene (Step 21)
- **Missing Escape Key and Focus Trap**: None of the secondary modals (`SchoolSafetyAdvisoryModal`, `RwaBulletinModal`, `ShareBulletinModal`, `SettingsModal`, `ScienceExplainerModal`, `MultiSourceInspectorModal`) implement Escape key dismissal, initial focus shifting, focus containment (focus trap), or focus restoration to the trigger element.
- **Touch Target Padding**: A few mobile buttons are below the $44 \times 44\ \text{px}$ touch target guideline.
- **Screen Reader Announcements**: Rapid state changes (e.g. city switching, metric loading, optimization results) lack polite live-region announcements.

---

## 3. Component Architecture Transformation Plan

```
src/
├── domain/
│   └── presentation-contract.ts      <-- Shared display contract (UX08, UX10, UX16)
├── components/
│   ├── ui/                           <-- Step 17 Component Primitives
│   │   ├── SectionHeader.tsx
│   │   ├── MetricCard.tsx
│   │   ├── StatusIndicator.tsx
│   │   ├── DataProvenanceBadge.tsx
│   │   ├── EmptyState.tsx
│   │   ├── ErrorState.tsx
│   │   ├── LoadingState.tsx
│   │   ├── AccessibleDialog.tsx      <-- Step 21 Focus Trap & Escape Handler
│   │   └── ActionDecisionCard.tsx    <-- Step 18 Action-First Guide
│   ├── AtmosphereHero.tsx            <-- Step 18 Refined Action-First Hero
│   ├── DiurnalForecastTimeline.tsx   <-- Step 19 Interactive Trend Chart & Timeline
│   ├── SegmentedTabs.tsx             <-- Step 20 Accessible ARIA Tabs & Clean Badges
│   ├── TopNav.tsx                    <-- Step 20 Refined Header Navigation
│   ├── MetroRail.tsx                 <-- Step 20 Responsive Fast Switcher
│   ├── CityPicker.tsx                <-- Step 20 Accessible Disambiguated Search
│   └── [Modals refactored with AccessibleDialog]
```

---

## 4. Phase C Testing & Verification Strategy

1. **Unit & Contract Tests**:
   - `tests/unit/presentation-contract.test.ts`: Test `toDisplayMeasurement`, data freshness classification, and unit conversions.
   - `tests/unit/accessible-dialog.test.tsx`: Test Escape key, focus trapping, and focus restoration.
   - `tests/unit/design-system-tokens.test.ts`: Verify semantic token presence and contrast standards.
2. **Integration Tests**:
   - `tests/integration/phase-c-dashboard-ux.test.tsx`: Verify action-first guidance, AQI standard labeling, city switching without state leakage, and clean tab navigation.
   - `tests/integration/phase-c-visualizations.test.tsx`: Verify hourly trend rendering, observation vs model distinction, and missing-data gap handling.
   - `tests/integration/phase-c-accessibility.test.tsx`: Verify keyboard navigation across tabs, dialogs, form controls, and theme toggling.
3. **Browser E2E User Journeys**:
   - Execute all 5 mandated journeys (Journeys A through E) using browser subagent with real screenshot captures.
4. **Zero-Fabrication Guard**:
   - Ensure all displayed metrics trace directly to validated domain models without arbitrary multipliers or fake consensus.
