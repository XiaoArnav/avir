# Avir

Avir is an Urban Air Quality Assistant for Hack2Skill Prompt Wars Challenge 6. Enter a city and a routine to compare estimated particulate exposure across eligible activity windows. [Open Avir](https://avir-blue.vercel.app).

## How a recommendation works

Open-Meteo supplies modeled air quality and weather. The source inspector distinguishes model estimates, available ground observations and station registry entries. A listed station alone does not establish a current reading. Check the observation time and source before comparing values. The US EPA and Indian CPCB indices use different scales and sufficiency rules.

For a scheduled activity, the exposure engine multiplies ambient concentration (µg/m³), a microenvironment ratio, minute ventilation (m³/min), and duration (minutes). The result is an estimated inhaled mass in micrograms. Ventilation and infiltration assumptions influence the estimate. It cannot establish an individual's clinical outcome. The schedule optimizer evaluates eligible forecast windows. When data is missing, check the availability state before interpreting a result.

Gemini 2.5 Flash explains the calculated plan at temperature 0.2. The server sends instructions separately from plan data. The app also supplies a deterministic explanation when the provider is unavailable.

## Reference standards

The revised US PM2.5 hazardous band reaches AQI 500 at a 24-hour concentration of 325.4 µg/m³. Avir uses the same interpolation slope above that concentration. See [EPA Table 6 and footnote 4](https://document.airnow.gov/technical-assistance-document-for-the-reporting-of-daily-air-quailty.pdf). CPCB requires evidence for pollutant coverage and averaging before a snapshot qualifies for the full index. See [CPCB’s National Air Quality Index](https://www.cpcb.nic.in/displaypdf.php?id=bmF0aW9uYWwtYWlyLXF1YWxpdHktaW5kZXgvQWJvdXRfQVFJLnBkZg).

## Run locally

Use Node.js 20 or later. Install dependencies with `npm ci`, then run `npm run dev`. Open http://localhost:3000. Optional server environment variables are `GEMINI_API_KEY`, `OPENAQ_API_KEY` and `DATA_GOV_IN_API_KEY`. Provider availability varies by location and configuration. The hosted site's connection policy restricts direct Wi-Fi connections to local hardware.

## Verification

Run `npm test`, `npx tsc --noEmit` and `npm run build`. Vitest prints the exact file and assertion-case totals for the checkout. Unit suites cover AQI, exposure, forecasting and persistence. Integration suites cover provider data, API routes, failure handling and component behavior. Security and accessibility suites cover selected safeguards. Browser, hardware and assistive-technology checks require separate verification. [Release CI](https://github.com/XiaoArnav/avir/actions/workflows/ci.yml).

With Python Playwright and Chromium installed, run `python3 tests/browser/routine_outage.py <app-url>` against a test deployment. The check saves a walk during an outage, restores a controlled forecast, accepts the suggested window and verifies persistence at three viewport widths. The provider fixtures run only inside the test browser.

## Demo walkthrough (3 minutes 45 seconds)

| Time | Action |
| --- | --- |
| 0:00 to 0:40 | Type a city. Open the source inspector and read the source, value and timestamp currently displayed. |
| 0:40 to 1:35 | Enter a 30-minute outdoor activity and its scheduling constraints. Generate a plan. |
| 1:35 to 2:20 | Compare the original and proposed windows, or explain why a shift is unavailable. Show the inputs to the exposure calculation. |
| 2:20 to 3:00 | Show the plan route's instruction and structured inputs alongside the resulting explanation. Identify whether Gemini or the deterministic fallback produced it. |
| 3:00 to 3:45 | Block the telemetry request in browser developer tools and select an uncached city. Show the unavailable state. Restore the network and reload. |
