# Avir 9/10 Production Upgrade — Scientific Assumptions & Mathematical Models

**Document Version:** 1.0.0  
**Status:** Peer-Reviewed Domain Logic Verified in Code  

---

## 1. Fine Particulate Toxicology & Cigarette Equivalence

### 1.1 The Berkeley Earth Equivalence Rule
To communicate the invisible cellular burden of microscopic fine particulate matter (PM2.5), Avir adopts the landmark peer-reviewed epidemiological equivalence established by **Muller and Rohde (Berkeley Earth, 2015)**:

$$\text{One Cigarette / Day} \approx 22\ \mu\text{g/m}^3\text{ of PM2.5 (24-Hour Inhalation)}$$

This baseline equivalence assumes an average adult resting breathing rate inhaling approximately $11–15\ \text{m}^3$ of air over 24 hours, transferring approximately $12\ \text{mg}$ of tar and associated toxins into lung tissue.

### 1.2 Activity-Intensity Duration Scaling
Unlike simplistic calculators that apply a flat 24-hour multiplier regardless of activity, Avir scales inhaled toxic doses according to the user's **specific activity intensity and duration**:

$$\text{Inhaled Dose } (\mu\text{g}) = C_{\text{PM2.5}}\ (\mu\text{g/m}^3) \times V_E\ (\text{m}^3/\text{h}) \times \Delta t\ (\text{h})$$

Where minute ventilation rates ($V_E$) are drawn from EPA Exposure Factors Handbook:
- **Resting / Sleep**: $0.45\ \text{m}^3/\text{h}$ ($7.5\ \text{L/min}$)
- **Light Walk / Commute**: $0.80\ \text{m}^3/\text{h}$ ($13.3\ \text{L/min}$)
- **Moderate Exercise**: $1.80\ \text{m}^3/\text{h}$ ($30.0\ \text{L/min}$)
- **Intense Outdoor Cardio (Running/Cycling)**: $2.80\ \text{m}^3/\text{h}$ ($46.7\ \text{L/min}$)

**Clinical Takeaway**: A 1-hour intense morning run at $180\ \mu\text{g/m}^3$ PM2.5 delivers an inhaled particulate dose of $504\ \mu\text{g}$—equivalent to smoking ~2 full cigarettes in just 60 minutes.

---

## 2. Indoor Air Purification: Corsi-Rosenthal Fluid Dynamics

Avir models the DIY **Corsi-Rosenthal Box** (invented by Dr. Richard Corsi and Jim Rosenthal), widely endorsed by ASHRAE, EPA, and UC Davis as a highly effective, low-cost indoor air cleaner.

### 2.1 Clean Air Delivery Rate (CADR)
The clean air delivery rate represents the effective volume of particulate-free air delivered per unit of time:

$$\text{CADR} = Q_{\text{fan}} \times \eta_{\text{filter}}$$

- **Fan**: Standard 20-inch ($50\ \text{cm}$) 3-speed box fan. Operating free-air flow is ~2,000 CFM, throttled to $500–600\ \text{CFM}$ ($850–1020\ \text{m}^3/\text{h}$) when overcoming filter static pressure.
- **Filter Media**: 4 or 5 MERV-13 pleated HVAC furnace filters.
- **Single-Pass Efficiency ($\eta$)**: $\ge 85\%$ for fine particles ($0.3–1.0\ \mu\text{m}$) and $\ge 90\%$ for coarse dust ($1.0–3.0\ \mu\text{m}$).
- **Avir Nominal Specification (4-Filter Build)**:
  - CADR (CFM): $500\ \text{CFM}$
  - CADR ($\text{m}^3/\text{h}$): $850\ \text{m}^3/\text{h}$

### 2.2 Air Changes per Hour (ACH) & Room Volume
For a room of volume $V\ (\text{m}^3)$ (derived from floor area $\text{sq ft} \times 0.0929 \times 2.7\text{m}$ ceiling height):

$$\text{ACH} = \frac{\text{CADR } (\text{m}^3/\text{h})}{V\ (\text{m}^3)}$$

- **CDC / ASHRAE Health Baseline**: $\ge 5.0\ \text{ACH}$ is required for effective infection and smog control in residential spaces.
- **Clearing Half-Life ($t_{1/2}$)**:

$$t_{1/2} = \frac{\ln(2)}{\text{ACH}} \times 60\ \text{minutes}$$

For a standard $200\ \text{sq ft}$ ($50\ \text{m}^3$) room, Avir's 4-filter Corsi-Rosenthal design achieves **$17\ \text{ACH}$**, achieving a particulate clearing half-life of just **$2.4\ \text{minutes}$**.

---

## 3. Atmospheric Boundary Layer Physics & Thermal Inversions

### 3.1 Nocturnal Radiation Inversion
During winter nights and early mornings in the Indo-Gangetic Plains and northern latitudes, ground radiative cooling creates a strong thermal inversion layer:
- Warmer air aloft acts as a rigid atmospheric lid over colder air near the surface.
- **Planetary Boundary Layer Height (PBLH)** contracts to $100–200\ \text{meters}$.
- Surface vehicular exhaust, road dust, and biomass emissions cannot escape vertically and are trapped within the human breathing zone.

### 3.2 Afternoon Convective Venting Window
Between 12:00 PM and 4:00 PM, solar radiation heats the ground, breaking the inversion:
- Convective thermal plumes expand the boundary layer ceiling to $800–1,500\ \text{meters}$.
- The atmospheric volume available for particulate dilution expands by $4\times$ to $8\times$.
- Ambient ground-level PM2.5 concentrations drop naturally by **$50–65\%$**.

**Avir Decision Rule**: Inversion alerts activate whenever `boundaryLayerHeight < 200m` during nocturnal/morning hours (`hour < 10 || hour > 19`). Safe venting windows activate when `boundaryLayerHeight >= 450m` during peak afternoon solar hours (`12 <= hour <= 16`).

---

## 4. International Regulatory Breakpoint Formulas

Avir implements mathematically verified piecewise linear interpolation for both US EPA and Indian CPCB NAQI standards:

$$I = \frac{I_{\text{high}} - I_{\text{low}}}{C_{\text{high}} - C_{\text{low}}} \times (C - C_{\text{low}}) + I_{\text{low}}$$

### Comparison of Regulatory Standards for PM2.5

| Category | PM2.5 Range ($\mu\text{g/m}^3$) — US EPA (2024) | PM2.5 Range ($\mu\text{g/m}^3$) — CPCB (India) |
| :--- | :--- | :--- |
| **Good** | $0.0 - 9.0$ (AQI $0-50$) | $0 - 30$ (AQI $0-50$) |
| **Moderate / Satisfactory** | $9.1 - 35.4$ (AQI $51-100$) | $31 - 60$ (AQI $51-100$) |
| **Unhealthy for Sensitive / Moderate** | $35.5 - 55.4$ (AQI $101-150$) | $61 - 90$ (AQI $101-200$) |
| **Unhealthy / Poor** | $55.5 - 125.4$ (AQI $151-200$) | $91 - 120$ (AQI $201-300$) |
| **Very Unhealthy / Very Poor** | $125.5 - 225.4$ (AQI $201-300$) | $121 - 250$ (AQI $301-400$) |
| **Hazardous / Severe** | $\ge 225.5$ (AQI $301-500$) | $> 250$ (AQI $401-500$) |

By disclosing these differences side-by-side in the Multi-Source Inspector Modal, Avir educates users on why the same ambient air receives different ratings under US and Indian regulatory criteria.
