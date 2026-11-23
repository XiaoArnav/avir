# AVIR — PHASE C UNIFIED DESIGN SYSTEM (STEP 17)
## Tokens, Semantic Scales, Typographic Precision, and Component Primitives

**Author:** XiaoArnav <322868724+XiaoArnav@users.noreply.github.com>  
**Status:** Implemented & Verified in Production  

---

## 1. Design Token Architecture

Phase C introduces semantic design tokens in `src/app/globals.css` and `tailwind.config.ts` bridging both:
1. **Antigravity Dark Mode** (`--surface-primary: #0c101c`, `--surface-elevated: #111827`, `--border-default: rgba(255, 255, 255, 0.12)`)
2. **Vikas Warm Paper Light Mode** (`--surface-primary: #FFFFFF`, `--surface-secondary: #F6F5F0`, `--border-default: #DCD9D0`)

### 1.1 Semantic Surface Tokens
- `var(--surface-primary)`: Primary card background.
- `var(--surface-secondary)`: Recessed background container.
- `var(--surface-elevated)`: Floating dropdowns and dialog panels.
- `var(--surface-muted)`: Subtle pill chips and secondary rows.

### 1.2 Text Hierarchy & Math Symbols
- Preserves accurate scientific symbols across all viewports: $\mu\text{g/m}^3$ (`µg/m³`), `PM2.5`, `PM10`, `AQI`, `m`, `km/h`, `°C`, `ACH`.
- `tabular-nums` applied to all fluctuating numerical telemetry to prevent layout jitter.
- Minimum secondary text size set to $12\text{px}$ (mobile $14\text{px}$ target) to eliminate illegible $8\text{–}10\text{px}$ micro-copy.

### 1.3 Semantic Data States & Provenance
- `loading`: Visual skeleton pulse, `aria-busy="true"`.
- `current`: Fresh verified measurement within temporal window ($< 3\text{h}$).
- `stale`: Retained telemetry older than $3\text{h}$, labeled with amber clock badge and relative age.
- `unavailable`: Displayed strictly as `--` (never converted to 0).
- `error`: Explanatory error state with retry action and zero synthetic data guarantee.

---

## 2. Reusable Component Primitives

| Component Primitive | Location | Purpose & WCAG Compliance |
| :--- | :--- | :--- |
| `AccessibleDialog` | `src/components/ui/AccessibleDialog.tsx` | Traps focus, handles Escape key, restores focus on close, locks scroll. |
| `SectionHeader` | `src/components/ui/SectionHeader.tsx` | Standardizes titles, icons, and action slots across views. |
| `MetricCard` | `src/components/ui/MetricCard.tsx` | Consistent display of numerical value, unit, and provenance badge. |
| `StatusIndicator` | `src/components/ui/StatusIndicator.tsx` | Accessible category chip with color, dot, and text label. |
| `DataProvenanceBadge` | `src/components/ui/DataProvenanceBadge.tsx` | Explicitly distinguishes Ground Observation, Atmospheric Model, and Derived Calculation. |
| `LoadingState` | `src/components/ui/LoadingState.tsx` | Accessible polite live region for asynchronous fetch. |
| `EmptyState` | `src/components/ui/EmptyState.tsx` | Meaningful message when no data exists. |
| `ErrorState` | `src/components/ui/ErrorState.tsx` | Typed error card with retry button and zero-fabrication pledge. |
| `ActionDecisionCard` | `src/components/ui/ActionDecisionCard.tsx` | 3-answer action guide answering What, Can I, and When. |
