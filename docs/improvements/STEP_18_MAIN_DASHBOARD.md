# AVIR — STEP 18: MAIN DASHBOARD EXPERIENCE REPORT
## Action-First Decisions, Clear AQI Standards, Relative Freshness, and Progressive Disclosure

**Author:** XiaoArnav <322868724+XiaoArnav@users.noreply.github.com>  
**Status:** Complete (Step 18/24)  

---

### 1. Key Improvements Delivered
1. **Above-the-Fold Information Priority**:
   - Prominently displays selected city, primary AQI reading, category badge, and explicit US EPA AQI vs Indian CPCB NAQI standard differentiation.
   - Shows accurate PM2.5 and PM10 mass concentrations in $\mu\text{g/m}^3$ alongside boundary layer smoke ceiling in meters ($m$).
2. **Action-First Guidance (`ActionDecisionCard`)**:
   - Positioned directly below the primary atmospheric hero to answer three key user questions immediately:
     1. *Air Quality Status*: Plain-language health burden and WHO baseline comparison.
     2. *Outdoor Activity*: Concrete workout and N95 precautions.
     3. *Ventilation & Clean Home*: Clear guidance on when to air rooms and when to run filtration.
   - Direct one-click navigation to the Routine Optimizer via "Optimize Daily Schedule &rarr;".
3. **Temporal Freshness & Provenance**:
   - Integrated relative time reporting (e.g. `15m ago`, `Just now`, `Stale (>3h ago)`) alongside wall-clock time.
   - Distinguished ground stations from atmospheric chemistry models without false consensus claims.
4. **Zero-Fabrication Error & Stale Handling**:
   - Missing readings render strictly as `--` with explicit "AQI Unavailable" badges, never defaulting to 0.

### 2. Verification & Regression Coverage
- `tests/integration/phase-c-dashboard-ux.test.tsx`: 6/6 tests passing.
- `npx tsc --noEmit`: 0 errors.
