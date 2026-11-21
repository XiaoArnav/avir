# Avir — UI/UX Review & Improvement Plan

<row align="center" gap={2} wrap="wrap">
  <badge color="secondary">Product UI audit</badge>
  <text color="secondary" size="xs">Based on the live site and its public GitHub repository</text>
</row>

I reviewed <Link url="https://avir-blue.vercel.app/" title="Avir"/>. It's an urban air-quality assistant that combines pollution monitoring, household vulnerability profiles, routine optimization, DIY air purification, and community guidance.

**My biggest recommendation is to turn Avir from a configuration-heavy technical interface into an air-quality dashboard that immediately helps users make decisions.**

The application has a compelling feature set, but the initial experience puts considerable emphasis on configuring household details before reaching the main value: understanding local air conditions and what to do about them.

An effective redesign should make the experience feel more like a polished environmental intelligence product, while preserving the underlying scientific functionality.

## 1. What's already working well

Your codebase has several strong foundations:

- A dedicated AQI hero with large numerical readings, pollution status, and city-specific skyline illustrations.
- Fast switching between 10 predefined cities, plus global location search.
- Four distinct feature areas rather than one overcrowded continuous page.
- Light and dark themes with glass-style cards.
- Basic accessibility support, including focus indicators, reduced-motion handling, and touch targets.

The important thing is **not to throw away the existing design**. It needs a clearer hierarchy, simpler language, stronger data presentation, and more consistent interactions.

## 2. The biggest UI improvements

<box gap={4}>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" padding={3}>
      <icon name="layout-dashboard" size="lg"/>
    </box>
    <box flex="1" gap={1}>
      **1. Make the homepage action-first**

      <badge color="warning">High priority</badge>

      Your AQI hero already exists, but the homepage would be stronger if it paired pollution readings with an immediate recommendation.

      Put three answers prominently above the fold: *How bad is the air? Is it advisable to go outside? What should I change today?*

      Move the detailed household form beneath these results or into an expandable personalization panel.
    </box>
  </row>
  <divider color="subtle"/>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" padding={3}>
      <icon name="type" size="lg"/>
    </box>
    <box flex="1" gap={1}>
      **2. Simplify technical terminology**

      Rename existing labels to make Avir approachable to a broader audience.

      | Current label | Suggested label |
      |---|---|
      | Telemetry & Profile | Air Quality |
      | Routine Shifter | My Daily Plan |
      | Frugal IAQ Studio | Clean My Home |
      | Community RWA Circular | Community |
      | Boundary Layer | Air Mixing Height |
      | Vulnerability & Household Configuration | Personalize Your Plan |
      | Quantified Protective Impact Scorecard | Estimated Exposure Reduction |

      Keep the scientific terminology in an expandable explanation rather than the primary navigation.
    </box>
  </row>
  <divider color="subtle"/>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" padding={3}>
      <icon name="chart-no-axes-combined" size="lg"/>
    </box>
    <box flex="1" gap={1}>
      **3. Add a meaningful air-quality trend visualization**

      Your interface has detailed atmospheric data, but users would benefit from a clear hourly pollution chart showing changing PM2.5 or AQI levels.

      Include a simple 24-hour forecast where supported by real data, with separate visual indications for observed readings and predictions.

      <box gap={1}>
        <text color="secondary" weight="medium" size="xs">Example chart structure — illustrative values only</text>
        <Chart content={{"chartType":"line","meta":{"footer":"Illustrative values, not live Avir readings"},"xKey":"time","series":[{"dataKey":"aqi","label":"US AQI","valueFormat":"integer"}],"yAxisMin":0,"data":[{"time":"6 AM","aqi":195},{"time":"9 AM","aqi":180},{"time":"12 PM","aqi":145},{"time":"3 PM","aqi":130},{"time":"6 PM","aqi":160},{"time":"9 PM","aqi":190}]}}/>
      </box>
    </box>
  </row>
  <divider color="subtle"/>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" padding={3}>
      <icon name="sliders-horizontal" size="lg"/>
    </box>
    <box flex="1" gap={1}>
      **4. Make personalization optional and progressive**

      Currently, the household form asks for age group, clinical vulnerabilities, room size, and a custom routine.

      Break it into two steps. First ask who the plan is for and what activity they need help with. Reveal medical considerations and room dimensions only when relevant.

      Also, the current code defaults to a child with a respiratory condition selected. A neutral initial state would avoid presenting an unexpectedly personalized plan.
    </box>
  </row>
  <divider color="subtle"/>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" padding={3}>
      <icon name="smartphone" size="lg"/>
    </box>
    <box flex="1" gap={1}>
      **5. Improve the mobile experience**

      Your four navigation tabs use a horizontally scrollable row, and several supporting labels are only 10–12px in the source.

      Use a larger body text scale, shorter labels, and a mobile bottom navigation with four clear actions. Put the AQI summary and today's advice first, followed by an expandable pollutant breakdown.

      Target a minimum of 14px for important secondary text and 16px for primary body copy.
    </box>
  </row>
</box>

## 3. Proposed homepage layout

Here is the information architecture I would build around the components already in your repository.

<box border radius="2xl" padding={3} gap={3} background="surface">
  <row align="center" justify="between">
    <row align="center" gap={2}>
      <box background="rgba(16,185,129,0.12)" radius="lg" padding={2}>
        <icon name="wind" color="success" size="lg"/>
      </box>
      <box gap="0">
        <title size="lg">Avir</title>
        <caption>Air intelligence</caption>
      </box>
    </row>
    <row align="center" gap={2}>
      <icon name="map-pin" color="secondary"/>
      <text weight="medium" size="sm">Delhi-NCR</text>
      <icon name="settings-2" color="secondary"/>
    </row>
  </row>
  <divider color="subtle"/>
  <box gap={1} padding={{top:2,bottom:1}}>
    <title size="xl">Know your air. Plan your day.</title>
    <text color="secondary" size="sm">Real-time pollution insights and practical ways to reduce exposure.</text>
  </box>
  <box background="surface-secondary" radius="xl" padding={4} gap={3}>
    <row align="center" justify="between">
      <text weight="medium" size="xs" color="secondary">CURRENT AIR QUALITY</text>
      <text color="secondary" size="2xs"><icon name="clock" inline/> Updated 10 min ago</text>
    </row>
    <row align="center" gap={4}>
      <box gap="0">
        <title size="2xl" color="default" tabularNums>185</title>
        <caption>Example US AQI</caption>
      </box>
      <box flex="1" gap={2}>
        <box align="start">
          <badge color="danger">Unhealthy</badge>
        </box>
        <text size="sm">Consider reducing prolonged outdoor exertion.</text>
      </box>
    </row>
    <grid columns={2} gap={2}>
      <grid-item>
        <box background="surface" padding={3} radius="lg" gap={1}>
          <caption>PM2.5</caption>
          <title size="lg">92 <text inline size="2xs" color="secondary">µg/m³</text></title>
        </box>
      </grid-item>
      <grid-item>
        <box background="surface" padding={3} radius="lg" gap={1}>
          <caption>PM10</caption>
          <title size="lg">148 <text inline size="2xs" color="secondary">µg/m³</text></title>
        </box>
      </grid-item>
    </grid>
  </box>
  <box gap={2}>
    <title size="lg">Your actions today</title>
    <row align="start" gap={3}>
      <icon name="footprints" color="secondary"/>
      <box flex="1" gap={1}>
        **Outdoor activity**
        <text size="sm" color="secondary">Review hourly conditions before planning exercise.</text>
      </box>
    </row>
    <divider color="subtle"/>
    <row align="start" gap={3}>
      <icon name="house" color="secondary"/>
      <box flex="1" gap={1}>
        **Indoor air**
        <text size="sm" color="secondary">Explore filtration options for your room.</text>
      </box>
    </row>
  </box>
  <row gap={2}>
    <box background="surface-tertiary" radius="lg" padding={3} flex="1" align="center" gap={1}>
      <icon name="activity" color="default"/>
      <text weight="medium" size="xs">Air Quality</text>
    </box>
    <box radius="lg" padding={3} flex="1" align="center" gap={1}>
      <icon name="calendar-clock" color="secondary"/>
      <text size="xs">My Plan</text>
    </box>
    <box radius="lg" padding={3} flex="1" align="center" gap={1}>
      <icon name="house" color="secondary"/>
      <text size="xs">Clean Home</text>
    </box>
    <box radius="lg" padding={3} flex="1" align="center" gap={1}>
      <icon name="users" color="secondary"/>
      <text size="xs">Community</text>
    </box>
  </row>
  <caption>Conceptual layout with illustrative pollution data, not a screenshot or current reading from Avir.</caption>
</box>

This would make the app understandable within seconds of opening it.

## 4. Visual design system

I would preserve Avir's existing dark-and-light identity, but introduce more consistency.

<box gap={2}>
  <text weight="medium">Suggested color palette</text>
  <grid columns={5} gap={2}>
    {#each [{c:"#0B1118",l:"Background",t:"dark"},{c:"#17212C",l:"Cards",t:"dark"},{c:"#10B981",l:"Accent",t:"dark"},{c:"#F6F7F5",l:"Light",t:"light"},{c:"#F59E0B",l:"Warning",t:"light"}] as p}
      <grid-item>
        <box gap={1}>
          <box background={p.c} radius="lg" height="62px" border/>
          <text size="2xs" weight="medium">{p.l}</text>
          <caption>{p.c}</caption>
        </box>
      </grid-item>
    {/each}
  </grid>
</box>

Use a typography hierarchy with approximately 36–48px hero headings on desktop, 24–28px section headings, 16px body text, and 14px secondary labels. Maintain an 8px spacing system and use one consistent card-radius scale.

I would also reduce the number of nested borders and glass panels. Your source contains several translucent surfaces within other translucent surfaces, which can make every element feel equally important.

Reserve green for primary actions or positive states. Keep AQI warning colors tied to their actual severity levels rather than styling every pollutant measurement identically.

## 5. Critical issues I found in the code

These are not just cosmetic; they should be fixed alongside the redesign.

| Priority | Issue | Recommended correction |
|---|---|---|
| <badge color="danger">P0</badge> | The telemetry service returns synthetic pollution values if the API fails, without distinguishing them from live readings. | Show unavailable data or an explicitly labeled sample/offline state. |
| <badge color="danger">P0</badge> | Switching cities can temporarily show old metrics under the newly selected city's name. | Clear or mark stale metrics while the next city's data loads. |
| <badge color="danger">P0</badge> | The hero estimates CPCB AQI as `US AQI × 1.05`. | Calculate from appropriate pollutant breakpoints or omit the unsupported conversion. |
| <badge color="warning">P1</badge> | The routine tab displays a fixed `-64% Dose` badge. | Show a computed reduction only when a current plan supports it. |
| <badge color="warning">P1</badge> | The scorecard always labels the protection status as `Optimal Defense`. | Use conditional, evidence-based language. |
| <badge color="warning">P1</badge> | The hero's source attribution says Copernicus and NOAA, while telemetry requests use Open-Meteo APIs. | Clearly identify the actual service, model, update time, and whether values are forecasts. |
| <badge color="warning">P1</badge> | Refreshing telemetry does not regenerate the current recommendation plan. | Refresh dependent results or mark the plan as requiring recalculation. |

The existing 24-hour atmospheric graphic also relies on a predefined daily pattern. If retained, label it as an illustrative model rather than a measured hourly AQI forecast. Avoid presenting fixed midday ventilation hours as universally safe.

These findings are grounded in the source of <Link url="https://github.com/XiaoArnav/avir" title="XiaoArnav/avir"/> and the live page content. I could inspect the published site and source, but I couldn't run a full interactive visual browser audit, so I haven't assigned an unsupported pixel-perfect UI score.

## 6. Implementation order

<box gap={2}>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" padding={2}>
      <icon name="shield-check"/>
    </box>
    <box flex="1" gap={1}>
      **Phase 1 — Trust and reliability**

      Fix live/sample data distinction, city switching, AQI conversions, hardcoded outcomes, and loading/error states.
      <caption>Files: `telemetry-service.ts`, `page.tsx`, `AtmosphereHero.tsx`, `ImpactScorecard.tsx`</caption>
    </box>
  </row>
  <divider color="subtle"/>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" padding={2}>
      <icon name="panels-top-left"/>
    </box>
    <box flex="1" gap={1}>
      **Phase 2 — Homepage redesign**

      Reorganize the AQI hero, add a clear daily recommendation panel, simplify the information hierarchy, and replace technical navigation labels.
      <caption>Files: `page.tsx`, `TopNav.tsx`, `SegmentedTabs.tsx`, `MetroRail.tsx`</caption>
    </box>
  </row>
  <divider color="subtle"/>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" padding={2}>
      <icon name="palette"/>
    </box>
    <box flex="1" gap={1}>
      **Phase 3 — Visual polish and mobile UX**

      Standardize colors, typography, spacing, responsive layouts, accessibility, loading skeletons, and empty states.
      <caption>Files: `globals.css`, `FamilyProfileForm.tsx`, `CityPicker.tsx`, and remaining components</caption>
    </box>
  </row>
  <divider color="subtle"/>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" padding={2}>
      <icon name="chart-spline"/>
    </box>
    <box flex="1" gap={1}>
      **Phase 4 — Product differentiation**

      Add a verified AQI history/forecast chart, easy-to-understand daily recommendations, and a better visual guide to assembling DIY air purifiers.
      <caption>Files: `AtmosphereHero.tsx`, `RoutineShifter.tsx`, `IAQStudio.tsx`</caption>
    </box>
  </row>
</box>

## Overall recommendation

Avir already has the foundations of a serious air-quality product. The main opportunity is to make the science feel accessible, trustworthy, and useful in everyday decisions.

**I would aim for a design inspired by the clarity of <Entity category="brand" value="Apple Weather" disambig="Apple weather forecasting application"/> and the data presentation of <Entity category="brand" value="IQAir" disambig="Air quality monitoring and environmental technology company"/>, without copying either interface.**

Keep Avir's identity, city skyline artwork, and household planning capabilities. Focus on a cleaner AQI hero, clear actions, more legible typography, and transparent live-data states. Those changes should make a bigger difference than adding gradients or animations.