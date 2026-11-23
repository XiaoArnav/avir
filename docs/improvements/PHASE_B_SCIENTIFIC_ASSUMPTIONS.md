# Avir — Phase B Scientific Assumptions & Physical Foundations
## Inhaled Mass Physics, Microenvironments, Indoor Air Dynamics, and Optimization Bounds

**Date:** 2026-11-23  
**Document ID:** `AVIR-SCI-PHASE-B-001`  
**Governing Standards:** US EPA Exposure Factors Handbook (2011), WHO Air Quality Guidelines (2021), ASHRAE Standard 62.1 & 62.2, ASTM E741 (Tracer Gas Dilution).

---

## 1. Physical Inhaled Pollutant Mass Formulation

### 1.1. Core Governing Equation
The physical quantity of particulate matter ($\text{PM}_{2.5}$) inhaled into the human respiratory tract over an activity interval $T = [t_{\text{start}}, t_{\text{end}}]$ is governed by the time integral of microenvironmental concentration and instantaneous ventilation rate:

$$\text{Inhaled Mass } (\mu\text{g}) = \int_{t_{\text{start}}}^{t_{\text{end}}} C_{\text{micro}}(t) \cdot \dot{V}_E(t) \, dt$$

For discrete computational intervals of duration $\Delta t_i$ (hours or minutes):
$$\text{Inhaled Mass } (\mu\text{g}) = \sum_{i=1}^{N} C_{\text{micro}, i} \cdot \dot{V}_{E, i} \cdot \Delta t_i$$

Where:
- $C_{\text{micro}, i}$ is the effective particulate concentration in the microenvironment during step $i$ ($\mu\text{g}/\text{m}^3$).
- $\dot{V}_{E, i}$ is the physiological minute ventilation rate for the activity intensity ($\text{m}^3/\text{min}$ or $\text{m}^3/\text{h}$).
- $\Delta t_i$ is the duration of exposure.

### 1.2. Minute Ventilation Rates ($\dot{V}_E$) by Activity Intensity
Ventilation rates are sourced directly from the **US EPA Exposure Factors Handbook (2011 Edition, Chapter 6: Inhalation Rates)** for adults (average body weight 70 kg):

| Activity Intensity | Typical Activities | Minute Ventilation ($\dot{V}_E$) [$\text{m}^3/\text{min}$] | Hourly Ventilation [$\text{m}^3/\text{h}$] |
|:---|:---|:---|:---|
| **Resting / Sleep** | Sleeping, reclining, meditating | $0.008\,\text{m}^3/\text{min}$ ($8.0\,\text{L}/\text{min}$) | $0.48\,\text{m}^3/\text{h}$ |
| **Light** | Sedentary office work, standing, gentle stroll | $0.012\,\text{m}^3/\text{min}$ ($12.0\,\text{L}/\text{min}$) | $0.72\,\text{m}^3/\text{h}$ |
| **Moderate** | Brisk walking ($4.5\,\text{km/h}$), cycling ($15\,\text{km/h}$), light chores | $0.025\,\text{m}^3/\text{min}$ ($25.0\,\text{L}/\text{min}$) | $1.50\,\text{m}^3/\text{h}$ |
| **Vigorous / Intense** | Running ($8+\,\text{km/h}$), hard cycling, intense cardio workout | $0.045\,\text{m}^3/\text{min}$ ($45.0\,\text{L}/\text{min}$) | $2.70\,\text{m}^3/\text{h}$ |

> [!IMPORTANT]
> **Zero Health Multipliers on Physical Mass**:
> The inhaled mass equation represents pure physical accumulation. Clinical vulnerabilities (e.g., asthma, COPD, cardiovascular conditions) do NOT alter the physical mass of pollutant entering the lungs for a given ventilation rate. Clinical status must be surfaced as vulnerability context, advisory urgency, or tailored behavioral recommendations—NEVER as an unscientific multiplier on physical micrograms.

---

## 2. Microenvironment Penetration & Transit Ratios

In outdoor-to-indoor and transit microenvironments, the indoor/in-cabin concentration $C_{\text{micro}}$ relates to ambient outdoor concentration $C_{\text{ambient}}$ via an effective microenvironment factor $\eta_{\text{micro}}$:

$$C_{\text{micro}} = C_{\text{ambient}} \times \eta_{\text{micro}}$$

### 2.1. Baseline Default Ratios & Empirical Uncertainty Ranges
Microenvironment factors vary widely based on building envelope leakage, vehicle cabin air filtration (cabin HEPA/MERV filters), recirculation mode, and door opening frequency. Avir establishes transparent, editable defaults with documented reference bounds:

| Microenvironment / Mode | Default Ratio ($\eta_{\text{micro}}$) | Valid Range | Reference Basis |
|:---|:---|:---|:---|
| **Outdoor Ambient** | $1.00$ ($100\%$) | $[1.00, 1.00]$ | Direct ambient exposure |
| **Indoor (Naturally Ventilated / Open Windows)** | $0.75$ ($75\%$) | $[0.60, 0.90]$ | CPCB / US EPA residential infiltration studies |
| **Indoor (Closed / Unfiltered / AC)** | $0.50$ ($50\%$) | $[0.35, 0.70]$ | Typical Indian urban concrete building envelope |
| **Indoor (Active HEPA / Air Cleaner)** | $0.20$ ($20\%$) | $[0.05, 0.40]$ | Room air cleaner achieving 3–5 ACH in sealed room |
| **Walking / Cycling on Roadway** | $1.15$ ($115\%$) | $[1.00, 1.50]$ | Near-roadway proximity / vehicle tailpipe plume effect |
| **Open Bus / Auto-Rickshaw** | $0.85$ ($85\%$) | $[0.70, 1.00]$ | Partial aerodynamic shielding, roadway plume |
| **Air-Conditioned Bus (Standard)** | $0.55$ ($55\%$) | $[0.40, 0.70]$ | Coarse HVAC filtration, periodic door openings |
| **Car (Windows Closed, Recirculation ON)** | $0.30$ ($30\%$) | $[0.15, 0.50]$ | Closed cabin with active cabin air filter (Zhu et al.) |
| **Car (Windows Open)** | $0.90$ ($90\%$) | $[0.75, 1.10]$ | Near-ambient roadway plume |
| **Metro / Underground Transit Train** | $0.25$ ($25\%$) | $[0.15, 0.45]$ | Air-conditioned rolling stock, sealed carriages |

---

## 3. Indoor Air Quality (IAQ) Dynamics & Clean Air Delivery

### 3.1. Air Changes per Hour (ACH)
$$\text{ACH} = \frac{\text{CADR}_{\text{total}} \,\, (\text{m}^3/\text{h})}{\text{Room Volume } V \,\, (\text{m}^3)}$$

Unit conversion factor:
$$1\,\text{CFM} = 1.699011\,\text{m}^3/\text{h}$$

Room volume from floor area and ceiling height:
$$V = \text{Area } (\text{m}^2) \times \text{Height } (\text{m})$$
$$\text{Area } (\text{m}^2) = \text{Area } (\text{sq ft}) \times 0.092903$$

### 3.2. Idealized First-Order Well-Mixed Particle Decay
In a single-zone, uniformly mixed room with constant filtration rate $k_{\text{filt}} = \frac{\text{CADR}}{V}$, background deposition rate $k_{\text{dep}} \approx 0.1\,\text{h}^{-1}$, and zero continuous indoor particle emission:

$$\frac{dC(t)}{dt} = - (k_{\text{filt}} + k_{\text{dep}} + k_{\text{vent}}) \cdot C(t)$$
$$C(t) = C_0 \cdot e^{- K_{\text{total}} \cdot t}$$
$$\text{where } K_{\text{total}} = \text{ACH}_{\text{clean}} + \lambda_{\text{loss}}$$

Time required to achieve $90\%$ particle reduction ($C(t) / C_0 = 0.10$):
$$t_{90\%} = \frac{\ln(10)}{K_{\text{total}}} = \frac{2.3026}{\text{ACH}_{\text{clean}} + \lambda_{\text{loss}}} \,\, \text{[hours]}$$

Time required to achieve $99\%$ particle reduction:
$$t_{99\%} = \frac{\ln(100)}{K_{\text{total}}} = \frac{4.6052}{\text{ACH}_{\text{clean}} + \lambda_{\text{loss}}} \,\, \text{[hours]}$$

> [!NOTE]
> All UI outputs must explicitly disclose the underlying physical assumptions:
> 1. Ideal spatial uniformity (well-mixed air).
> 2. Sealed doors and windows without turbulent infiltration.
> 3. Zero ongoing indoor particle sources (e.g., cooking, incense, dusting).

---

## 4. Routine Optimization Constraints & Bounds

### 4.1. Absolute Eligibility Requirements for Forecast Optimization
Optimization recommendations must be derived exclusively from authentic, verified hourly forecast data. An optimization search is **ELIGIBLE** if and only if:
1. Hourly forecast records cover the proposed optimization horizon ($\ge 24$ hours).
2. Timestamp sequence is strictly monotonic with no missing hourly slots.
3. Target pollutant ($\text{PM}_{2.5}$) is present with non-negative physical values.
4. If forecast data is missing, stale, or malformed, the engine must return `status: 'unavailable'` with an honest explanation. **Fabricating a midday solar convective drop or defaulting to 13:00 is strictly prohibited.**

### 4.2. Activity Feasibility Constraints
An activity shift is **FEASIBLE** only if:
1. The activity is explicitly flagged as `isFlexible: true`. Fixed activities (e.g., work shifts, school drop-offs) cannot be shifted.
2. The shifted window falls entirely within the user's defined allowable time window ($t_{\text{earliest}} \le t_{\text{start}} < t_{\text{end}} \le t_{\text{latest}}$).
3. The shifted window does NOT collide with any fixed activities in the user's schedule.
4. Multi-hour activities are evaluated across their entire contiguous span by integrating the hourly forecast across the duration.
5. Inhaled mass reduction must be strictly positive to recommend a shift ($\Delta \text{Mass} > 0$).
