# 📖 Avir Domain Glossary (Ubiquitous Language)

This glossary establishes canonical domain definitions across the Avir codebase, engineering specifications, and user documentation.

---

### Atmospheric & Meteorological Concepts

#### 1. Air Quality Index (AQI)
A standardized numerical metric (0–500+) communicating ambient air toxicity. 
* **0–50**: Good (Minimal impact)
* **51–100**: Moderate (Minor breathing discomfort for sensitive individuals)
* **101–150**: Unhealthy for Sensitive Groups (USG)
* **151–200**: Unhealthy (Adverse effects across general population)
* **201–300**: Very Unhealthy (Health alert; emergency condition)
* **301+**: Hazardous / Severe (Severe respiratory aggravation)

#### 2. Particulate Matter ($\text{PM}_{2.5}$ & $\text{PM}_{10}$)
Inhalable airborne particles measured in micrograms per cubic meter ($\mu\text{g}/\text{m}^3$).
* **$\text{PM}_{2.5}$**: Fine particulate ($\le 2.5\ \mu\text{m}$) capable of penetrating deep into alveolar pulmonary capillaries and entering systemic circulation.
* **$\text{PM}_{10}$**: Coarser respirable particles ($\le 10\ \mu\text{m}$) trapped predominantly in the upper respiratory tract.

#### 3. Thermal Inversion Layer
A meteorological phenomenon prevalent in winter where a layer of warm air settles above cooler surface air, acting as a physical lid that prevents vertical atmospheric mixing and traps vehicular, industrial, and biomass emissions at ground level.

#### 4. Planetary Boundary Layer Height (BLH)
The depth of the lowest atmospheric layer directly influenced by surface heating. During winter night/morning inversions, BLH contracts to 100m–150m, concentrating pollutants. Afternoon solar radiation expands BLH to 600m–1000m, venting ground concentrations.

---

### Exposure & Indoor Air Quality (IAQ) Metrics

#### 5. Respiratory Inhalation Exposure
The cumulative mass of $\text{PM}_{2.5}$ inhaled over a time window:
$$\text{Exposure } (\mu\text{g}) = \sum \left( \text{Concentration } [\mu\text{g}/\text{m}^3] \times \text{Ventilation Rate } [\text{m}^3/\text{hr}] \times \text{Duration } [\text{hr}] \right)$$

#### 6. Berkeley Earth Cigarette Equivalence
An epidemiological particulate translation benchmark developed by Muller & Rohde (Berkeley Earth):
$$1\text{ Cigarette/Day} \approx 22\ \mu\text{g}/\text{m}^3\text{ of ambient PM}_{2.5}\text{ exposure over 24 hours}$$

#### 7. Corsi-Rosenthal Box (CR Box)
A field-proven, low-cost DIY air cleaner constructed using a standard 20-inch box fan and 4–5 MERV-13 furnace filters taped into a cube. Delivers Clean Air Delivery Rates (CADR) equivalent to $300+ commercial HEPA purifiers at roughly $30–$40 total material cost.

#### 8. Clean Air Delivery Rate (CADR)
A metric measured in cubic feet per minute (CFM) or cubic meters per hour ($\text{m}^3/\text{hr}$) indicating the volume of particulate-free air delivered to an enclosed space.

#### 9. Air Changes per Hour (ACH)
The frequency with which the entire air volume of a room is filtered or exchanged:
$$\text{ACH} = \frac{\text{CADR } (\text{m}^3/\text{hr})}{\text{Room Volume } (\text{m}^3)}$$
Target for effective infection and smog control in residential spaces: $\ge 4\text{ to } 6\text{ ACH}$.

---

### Software & Architectural Terms

#### 10. Dual-Mode AI Engine
An architectural resilience pattern where the application features a live Google Gemini 2.5 Flash SDK integration alongside a deterministic local heuristic fallback. If API keys are unconfigured, rate-limited, or network is offline, the system seamlessly transitions to local algorithms without throwing runtime errors.

#### 11. Routine Shifting
The algorithmic rescheduling of high-ventilation activities (e.g. outdoor running, school transit, natural window ventilation) from peak nocturnal/morning inversion windows into midday solar-vented windows.
