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
});
