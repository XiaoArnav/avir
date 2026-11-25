import { test, expect } from '@playwright/test';

test.describe('Avir Source Control — Multi-Provider Telemetry & User Selection E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Deterministic API network fixtures
    await page.route('**/*air-quality-api.open-meteo.com/**', async (route) => {
      const times = Array.from({ length: 24 }, (_, i) => `2026-11-24T${i.toString().padStart(2, '0')}:00`);
      const pm25s = [45, 42, 40, 38, 35, 32, 28, 25, 22, 20, 18, 16, 18, 22, 28, 35, 42, 50, 58, 65, 72, 70, 60, 50];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          latitude: 28.6139,
          longitude: 77.2090,
          timezone: 'Asia/Kolkata',
          current: {
            time: '2026-11-24T12:00',
            pm2_5: 125.0,
            pm10: 180.0,
            us_aqi: 187,
            nitrogen_dioxide: 35.0,
            sulphur_dioxide: 12.0,
            carbon_monoxide: 850.0,
            ozone: 40.0,
          },
          hourly: {
            time: times,
            pm2_5: pm25s,
            pm10: pm25s.map(v => Math.round(v * 1.5)),
            us_aqi: pm25s.map(v => Math.min(300, v * 2)),
          },
        }),
      });
    });

    await page.route('**/*api.open-meteo.com/v1/forecast**', async (route) => {
      const times = Array.from({ length: 24 }, (_, i) => `2026-11-24T${i.toString().padStart(2, '0')}:00`);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          latitude: 28.6139,
          longitude: 77.2090,
          timezone: 'Asia/Kolkata',
          current: {
            temperature_2m: 26.0,
            relative_humidity_2m: 50,
            wind_speed_10m: 12.0,
            wind_direction_10m: 290,
          },
          hourly: {
            time: times,
            boundary_layer_height: times.map(() => 900),
            temperature_2m: times.map(() => 26),
            relative_humidity_2m: times.map(() => 50),
            wind_speed_10m: times.map(() => 12),
            wind_direction_10m: times.map(() => 290),
          },
        }),
      });
    });

    // Seed localStorage so location onboarding modal is closed and default city is set
    await page.addInitScript(() => {
      localStorage.setItem('avir_theme_mode_v1', 'dark');
      localStorage.setItem('avir_location_onboarded_v1', 'true');
      localStorage.setItem(
        'avir_selected_city_v1',
        JSON.stringify({
          id: 1,
          name: 'Delhi-NCR',
          admin1: 'Delhi',
          country: 'India',
          countryCode: 'IN',
          latitude: 28.6139,
          longitude: 77.2090,
        })
      );
    });
  });

  test('1. CompactCityCard displays active Data Source pill and opens Source Control modal', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Switch off default CesiumJS to lightweight Three.js so SwiftShader WebGL shader compilation does not starve CPU during multi-step telemetry UI interactions in CI
    const engineButton = page.getByRole('button', { name: /toggle 3d engine/i });
    await expect(engineButton).toHaveText('CESIUM');
    await engineButton.click();
    await expect(engineButton).toHaveText('THREE');

    // Verify Data Source indicator is visible in CompactCityCard
    const dataSourceBtn = page.getByRole('button', { name: /current data source/i }).first();
    await expect(dataSourceBtn).toBeVisible({ timeout: 5000 });

    // Click to open Avir Source Control
    await dataSourceBtn.click();

    // Verify modal opens with Source Control Section 0
    const modalTitle = page.locator('#modal-sources-title');
    await expect(modalTitle).toBeVisible();

    const sourceControlHeading = page.getByRole('heading', { name: /avir source control & selection/i });
    await expect(sourceControlHeading).toBeVisible();
  });

  test('2. Allows switching data source modes and persists selection to localStorage', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Switch off default CesiumJS to lightweight Three.js so SwiftShader WebGL shader compilation does not starve CPU during multi-step telemetry UI interactions in CI
    const engineButton = page.getByRole('button', { name: /toggle 3d engine/i });
    await expect(engineButton).toHaveText('CESIUM');
    await engineButton.click();
    await expect(engineButton).toHaveText('THREE');

    // Open Source Control modal
    const dataSourceBtn = page.getByRole('button', { name: /current data source/i }).first();
    await dataSourceBtn.click();

    // Switch to CAMS Atmospheric Model
    const modelModeBtn = page.getByRole('button', { name: /cams atmospheric model/i });
    await expect(modelModeBtn).toBeVisible();
    await modelModeBtn.click();

    // Verify active mode indicator updates
    await expect(page.getByText(/active mode: atmospheric model/i)).toBeVisible();

    // Verify localStorage has persisted the preference
    const persisted = await page.evaluate(() => localStorage.getItem('avir_source_preference_v1'));
    expect(persisted).toBeTruthy();
    expect(persisted).toContain('atmospheric_model');
  });

  test('3. Fallback toggle and reset to defaults work reliably', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Switch off default CesiumJS to lightweight Three.js so SwiftShader WebGL shader compilation does not starve CPU during multi-step telemetry UI interactions in CI
    const engineButton = page.getByRole('button', { name: /toggle 3d engine/i });
    await expect(engineButton).toHaveText('CESIUM');
    await engineButton.click();
    await expect(engineButton).toHaveText('THREE');

    // Open Source Control modal
    const dataSourceBtn = page.getByRole('button', { name: /current data source/i }).first();
    await dataSourceBtn.click();

    // Toggle fallback checkbox
    const fallbackToggle = page.locator('#source-fallback-toggle');
    await expect(fallbackToggle).toBeVisible();
    await fallbackToggle.check();
    await expect(fallbackToggle).toBeChecked();

    // Click Reset Defaults button
    const resetBtn = page.getByRole('button', { name: /reset defaults/i });
    await resetBtn.click();

    // Active mode should reset to automatic
    await expect(page.getByText(/active mode: automatic/i)).toBeVisible();

    // Close modal via Escape key
    await page.keyboard.press('Escape');
    await expect(page.locator('#modal-sources-title')).not.toBeVisible();
  });

  test('4. Downstream calculators, ActionDecisionCard, Daily Plan, Refresh & City Switch synchronize strictly with selected source', async ({ page }) => {
    const recentIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const futureTimes = Array.from({ length: 24 }, (_, i) => {
      const d = new Date(Date.now() + (i - 1) * 3600 * 1000);
      return d.toISOString().slice(0, 13) + ':00';
    });

    // Controlled Open-Meteo fixture: CAMS current = 90 µg/m³ (EPA AQI ~169), forecast = 18..72 µg/m³
    await page.unroute('**/*air-quality-api.open-meteo.com/**');
    await page.route('**/*air-quality-api.open-meteo.com/**', async (route) => {
      const pm25s = futureTimes.map((_, i) => (i >= 11 && i <= 14 ? 18 : 65));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          latitude: 28.6139,
          longitude: 77.2090,
          timezone: 'Asia/Kolkata',
          current: {
            time: recentIso.slice(0, 16),
            pm2_5: 90.0,
            pm10: 145.0,
            us_aqi: 169,
            nitrogen_dioxide: 30.0,
            sulphur_dioxide: 10.0,
            carbon_monoxide: 700.0,
            ozone: 38.0,
          },
          hourly: {
            time: futureTimes,
            pm2_5: pm25s,
            pm10: pm25s.map((v) => Math.round(v * 1.4)),
            us_aqi: pm25s.map((v) => Math.min(300, Math.round(v * 2.2))),
          },
        }),
      });
    });

    await page.unroute('**/*api.open-meteo.com/v1/forecast**');
    await page.route('**/*api.open-meteo.com/v1/forecast**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          latitude: 28.6139,
          longitude: 77.2090,
          timezone: 'Asia/Kolkata',
          current: {
            temperature_2m: 24.0,
            relative_humidity_2m: 50,
            wind_speed_10m: 10.0,
            wind_direction_10m: 290,
          },
          hourly: {
            time: futureTimes,
            boundary_layer_height: futureTimes.map((_, i) => (i >= 11 && i <= 14 ? 1200 : 250)),
            temperature_2m: futureTimes.map(() => 24),
            relative_humidity_2m: futureTimes.map(() => 50),
            wind_speed_10m: futureTimes.map(() => 10),
            wind_direction_10m: futureTimes.map(() => 290),
          },
        }),
      });
    });

    // Prevent live Sensor.Community calls during controlled E2E
    await page.route('**/*sensor.community/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    // Controlled CPCB fixture: 180 µg/m³ for Delhi, empty/unavailable for Bengaluru
    await page.route('**/api/telemetry/cpcb**', async (route) => {
      const url = route.request().url();
      const isDelhi = url.includes('lat=28.61') || url.includes('Delhi');
      const sources = isDelhi
        ? [
            {
              id: 'cpcb-delhi-anand-vihar',
              providerId: 'cpcb',
              providerName: 'Central Pollution Control Board',
              sourceName: 'Anand Vihar, Delhi - DPCC',
              sourceKind: 'official_ground_station',
              status: 'fresh',
              stationId: 'site_142',
              latitude: 28.65,
              longitude: 77.31,
              distanceKm: 4.5,
              observedAt: recentIso,
              validAt: null,
              retrievedAt: recentIso,
              measurements: [
                { pollutant: 'pm25', value: 180.0, unit: 'µg/m³', observedAt: recentIso, averagingPeriodMinutes: 60, qualityFlag: 'valid' },
              ],
              attribution: 'CPCB / DPCC Real-Time CAAQMS',
              provenance: { network: 'CAAQMS', licenseOrAttribution: 'GODL', isModel: false, limitations: [] },
            },
          ]
        : [];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sources }) });
    });

    // Controlled OpenAQ fixture: 125 µg/m³ for Delhi, empty for Bengaluru
    await page.route('**/api/telemetry/sources**', async (route) => {
      const url = route.request().url();
      const isDelhi = url.includes('lat=28.61');
      const sources = isDelhi
        ? [
            {
              id: 'openaq-station-992',
              providerId: 'openaq',
              providerName: 'OpenAQ Network',
              sourceName: 'US Diplomatic Post Chanakyapuri',
              sourceKind: 'physical_observation',
              status: 'fresh',
              stationId: '992',
              latitude: 28.60,
              longitude: 77.19,
              distanceKm: 4.2,
              observedAt: recentIso,
              validAt: null,
              retrievedAt: recentIso,
              measurements: [
                { pollutant: 'pm25', value: 125.0, unit: 'µg/m³', observedAt: recentIso, averagingPeriodMinutes: 60, qualityFlag: 'valid' },
              ],
              attribution: 'OpenAQ Network',
              provenance: { network: 'AirNow-DOS', licenseOrAttribution: 'CC0', isModel: false, limitations: [] },
            },
          ]
        : [];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sources }) });
    });

    // Seed saved CPCB Official Ground preference so initial loading must respect CPCB (180 µg/m³) immediately
    await page.addInitScript(() => {
      localStorage.setItem(
        'avir_source_preference_v1',
        JSON.stringify({ version: 1, mode: 'official_ground', allowFallbackToModel: false })
      );
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Switch off default CesiumJS to lightweight Three.js so SwiftShader WebGL shader compilation does not starve CPU during multi-step telemetry UI interactions in CI
    const engineButton = page.getByRole('button', { name: /toggle 3d engine/i });
    await expect(engineButton).toHaveText('CESIUM');
    await engineButton.click();
    await expect(engineButton).toHaveText('THREE');

    // 1. Verify CPCB (180 µg/m³) resolved on initial load across card, calculators, & ActionDecisionCard
    await expect(page.getByText(/Anand Vihar, Delhi - DPCC/i).first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/Inhalation dose model across transit modes in 180 µg\/m³ ambient air/i)).toBeVisible();
    await expect(page.getByText(/Estimated replacement cycles based on 180 µg\/m³ ambient particulate load/i)).toBeVisible();
    await expect(page.getByText(/Very Unhealthy air alert/i)).toBeVisible();

    // Also verify Daily Plan RoutineBuilder reflects 180 µg/m³ and baseline plan uses CPCB (504 µg)
    await page.getByRole('tab', { name: /Daily Plan/i }).click();
    await expect(page.getByText(/Ambient air: 180 µg\/m³/i)).toBeVisible();
    await expect(page.getByText(/504 µg inhaled/i)).toBeVisible();
    await page.getByRole('tab', { name: /Air Quality/i }).first().click();

    // 2. Switch to OpenAQ (125 µg/m³) -> downstream calculators must update to 125 µg/m³
    await page.getByRole('button', { name: /current data source/i }).first().click();
    await page.getByRole('button', { name: /OpenAQ Network/i }).click();
    await page.keyboard.press('Escape');

    await expect(page.getByText(/Inhalation dose model across transit modes in 125 µg\/m³ ambient air/i)).toBeVisible();
    await expect(page.getByText(/Estimated replacement cycles based on 125 µg\/m³ ambient particulate load/i)).toBeVisible();

    // 3. Switch to CAMS Model (90 µg/m³) -> downstream calculators & ActionDecisionCard update to 90 µg/m³ / Unhealthy smog
    await page.getByRole('button', { name: /current data source/i }).first().click();
    await page.getByRole('button', { name: /CAMS Atmospheric Model/i }).click();
    await page.keyboard.press('Escape');

    await expect(page.getByText(/Inhalation dose model across transit modes in 90 µg\/m³ ambient air/i)).toBeVisible();
    await expect(page.getByText(/Estimated replacement cycles based on 90 µg\/m³ ambient particulate load/i)).toBeVisible();
    await expect(page.getByText(/Unhealthy smog/i)).toBeVisible();

    // 4. Switch to CPCB again + Manual Telemetry Refresh preserves CPCB 180 µg/m³
    await page.getByRole('button', { name: /current data source/i }).first().click();
    await page.getByRole('button', { name: /Statutory CAAQMS reference/i }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByText(/Inhalation dose model across transit modes in 180 µg\/m³ ambient air/i)).toBeVisible();

    const refreshBtn = page.getByRole('button', { name: /Refresh telemetry/i }).first();
    await refreshBtn.click();
    await expect(page.getByText(/Inhalation dose model across transit modes in 180 µg\/m³ ambient air/i)).toBeVisible({ timeout: 8000 });

    // 5. Switch City to Bengaluru (no CPCB live station in fixture, fallback disabled -> honest Unavailable state)
    await page.getByRole('button', { name: 'Bengaluru' }).click();
    await expect(page.getByText(/Offline \/ Data Unavailable/i).first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/Awaiting live particulate readings to calculate commute inhalation dose/i)).toBeVisible();
    await expect(page.getByText(/Awaiting live particulate readings to calculate accurate mask and HEPA filter/i)).toBeVisible();
    await expect(page.getByText(/Awaiting telemetry to evaluate today’s exposure risk/i)).toBeVisible();

    // 6. Enable Explicit Model Fallback on Bengaluru -> calculators switch transparently to CAMS 90 µg/m³ & Fallback banner displays
    await page.getByRole('button', { name: /current data source/i }).first().click();
    await page.locator('#source-fallback-toggle').check();
    await page.keyboard.press('Escape');

    await expect(page.getByText(/Fallback Applied:/i).first()).toBeVisible();
    await expect(page.getByText(/Inhalation dose model across transit modes in 90 µg\/m³ ambient air/i)).toBeVisible();
  });
});
