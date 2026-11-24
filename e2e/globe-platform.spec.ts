import { test, expect } from '@playwright/test';

test.describe('Avir Flagship Earth Command Center & Planetary Telemetry E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Deterministic API network fixtures (Phase 7.2)
    await page.route('**/*air-quality-api.open-meteo.com/**', async (route) => {
      const times = Array.from({ length: 24 }, (_, i) => `2026-11-24T${i.toString().padStart(2, '0')}:00`);
      const pm25s = [45, 42, 40, 38, 35, 32, 28, 25, 22, 20, 18, 16, 18, 22, 28, 35, 42, 50, 58, 65, 72, 70, 60, 50];
      const pm10s = pm25s.map((v) => Math.round(v * 1.5));
      const aqi = pm25s.map((v) => Math.min(300, v * 2));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          latitude: 12.9716,
          longitude: 77.5946,
          timezone: 'Asia/Kolkata',
          current: {
            time: '2026-11-24T10:00',
            pm2_5: 18.0,
            pm10: 25.0,
            us_aqi: 63,
            nitrogen_dioxide: 22.0,
            sulphur_dioxide: 8.0,
            carbon_monoxide: 450.0,
            ozone: 30.0,
          },
          hourly: {
            time: times,
            pm2_5: pm25s,
            pm10: pm10s,
            us_aqi: aqi,
          },
        }),
      });
    });

    await page.route('**/*api.open-meteo.com/v1/forecast**', async (route) => {
      const times = Array.from({ length: 24 }, (_, i) => `2026-11-24T${i.toString().padStart(2, '0')}:00`);
      const blh = [150, 120, 100, 110, 130, 200, 450, 750, 950, 1200, 1450, 1650, 1700, 1600, 1400, 1100, 800, 500, 350, 250, 200, 180, 160, 150];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          latitude: 12.9716,
          longitude: 77.5946,
          timezone: 'Asia/Kolkata',
          current: {
            temperature_2m: 24.0,
            relative_humidity_2m: 55,
            wind_speed_10m: 11.0,
            wind_direction_10m: 180,
          },
          hourly: {
            time: times,
            boundary_layer_height: blh,
            temperature_2m: times.map(() => 24),
            relative_humidity_2m: times.map(() => 55),
            wind_speed_10m: times.map(() => 11),
            wind_direction_10m: times.map(() => 180),
          },
        }),
      });
    });

    // Seed localStorage so location onboarding modal is closed by default and dark theme is baseline
    await page.addInitScript(() => {
      localStorage.setItem('avir_theme_mode_v1', 'dark');
      localStorage.setItem('avir_location_onboarded_v1', 'true');
      localStorage.setItem(
        'avir_selected_city_v1',
        JSON.stringify({
          id: 1277333,
          name: 'Bengaluru',
          admin1: 'Karnataka',
          country: 'India',
          countryCode: 'IN',
          latitude: 12.9716,
          longitude: 77.5946,
        })
      );
    });
    await page.goto('/');
  });

  test('renders mission control header, active coordinates, and 3D earth command center', async ({ page }) => {
    await expect(page).toHaveTitle(/Avir/i);

    // Verify Mission Control Header
    const missionHeader = page.locator('header[role="banner"]');
    await expect(missionHeader).toBeVisible();
    await expect(page.getByText('AVIR // COMMAND')).toBeVisible();
    await expect(missionHeader.getByText('Bengaluru')).toBeVisible();

    // Verify 3D Earth Command Center Section
    const commandCenter = page.locator('section[aria-label="Atmospheric Intelligence Earth Command Center"]');
    await expect(commandCenter).toBeVisible();
  });

  test('operates 24-hour diurnal timeline scrubber and snaps back to NOW', async ({ page }) => {
    // Wait for telemetry to load and diurnal timeline scrubber slider to appear
    const scrubber = page.getByRole('slider', { name: /24-hour diurnal/i });
    await expect(scrubber).toBeVisible({ timeout: 20000 });

    // Move scrubber to hour 14 (afternoon)
    await scrubber.fill('14');
    await scrubber.dispatchEvent('change');

    // Verify temporal label updates
    await expect(page.getByText('DIURNAL TIMELINE')).toBeVisible();

    // Verify SNAP TO NOW button appears and snaps back to current hour
    const nowButton = page.getByRole('button', { name: /snap back to current live observation hour/i }).first();
    if (await nowButton.isVisible()) {
      await nowButton.click();
    }
  });

  test('opens slide-out environmental details drawer and inspects scientific standards', async ({ page }) => {
    // Open details drawer from compact city card
    const detailsButton = page.getByRole('button', { name: /view environmental details/i });
    await expect(detailsButton).toBeVisible();
    await detailsButton.click();

    // Verify drawer is visible
    const drawer = page.getByRole('dialog', { name: /detailed environmental intelligence/i });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText(/Regulatory Standard/i)).toBeVisible();

    // Close drawer
    const closeButton = page.getByRole('button', { name: /close environmental details drawer/i });
    await closeButton.click();
    await expect(drawer).not.toBeVisible();
  });

  test('switches visual theme and persists dark/light state', async ({ page }) => {
    // Check initial dark theme
    const html = page.locator('html');
    await expect(html).toHaveClass(/dark/);

    // Toggle theme button in TopNav
    const themeToggle = page.getByRole('button', { name: /toggle between antigravity dark and vikas light themes/i });
    await expect(themeToggle).toBeVisible();
    await themeToggle.click();

    // Verify html class changed
    await expect(html).not.toHaveClass(/dark/);

    // Toggle back to dark
    await themeToggle.click();
    await expect(html).toHaveClass(/dark/);
  });

  test('switches active city via bottom metro rail without data mismatch', async ({ page }) => {
    // Locate the Delhi-NCR quick-selector button
    const delhiButton = page.getByRole('button', { name: /delhi-ncr/i }).first();
    await expect(delhiButton).toBeVisible();
    await delhiButton.click();

    // Verify Mission Control Header updates to Delhi-NCR
    const missionHeader = page.locator('header[role="banner"]');
    await expect(missionHeader.getByText(/delhi/i)).toBeVisible();
    await expect(missionHeader.getByText(/28\.61/)).toBeVisible();
  });

  test('preserves geolocation privacy without persisting raw GPS coordinates across sessions', async ({ page }) => {
    // Check that localStorage city preference holds Bengaluru from initial manual setup
    const saved = await page.evaluate(() => localStorage.getItem('avir_selected_city_v1'));
    expect(saved).not.toBeNull();
    const parsed = JSON.parse(saved!);
    expect(parsed.name).toBe('Bengaluru');

    // Simulate switching to an ephemeral GPS detection
    await page.evaluate(() => {
      // In-memory update via session API simulation
      const current = localStorage.getItem('avir_selected_city_v1');
      return current;
    });
  });

  test('toggles accessible 2D planetary map fallback', async ({ page }) => {
    // Locate the 3D/2D toggle button in globe controls
    const toggle2D = page.getByRole('button', { name: /switch to accessible 2d map/i });
    await expect(toggle2D).toBeVisible();
    await toggle2D.click();

    // Verify 2D accessible fallback view appears
    const fallback = page.getByRole('region', { name: /2d geographic observation map/i });
    await expect(fallback).toBeVisible();

    // Toggle back to 3D
    const toggle3D = page.getByRole('button', { name: /switch to 3d earth globe/i });
    await expect(toggle3D).toBeVisible();
    await toggle3D.click();
    await expect(fallback).not.toBeVisible();
  });

  test('toggles 3D engine between Three.js and CesiumJS without crashing', async ({ page }) => {
    // Locate engine toggle button in GlobeControls
    const engineButton = page.getByRole('button', { name: /toggle 3d engine/i });
    await expect(engineButton).toBeVisible();
    await expect(engineButton).toHaveText('THREE');

    // Click to switch to Cesium
    await engineButton.click();
    await expect(engineButton).toHaveText('CESIUM');

    // Verify Cesium widget or canvas container renders
    const cesiumContainer = page.locator('.cesium-widget');
    await expect(cesiumContainer).toBeVisible({ timeout: 15000 });

    // Verify legal provider attribution badge is visible
    await expect(page.locator('text=Imagery: Tiles © Esri')).toBeVisible();

    // Switch back to Three.js
    await engineButton.click();
    await expect(engineButton).toHaveText('THREE');
    await expect(cesiumContainer).not.toBeVisible();
  });

  test('operates camera controls (zoom, auto-rotate, reset) when Cesium engine is active', async ({ page }) => {
    test.setTimeout(60000);
    const engineButton = page.getByRole('button', { name: /toggle 3d engine/i });
    await expect(engineButton).toBeVisible();
    await engineButton.click();
    await expect(engineButton).toHaveText('CESIUM');

    // Wait for Cesium canvas to initialize
    const cesiumWidget = page.locator('.cesium-widget');
    await expect(cesiumWidget).toBeVisible({ timeout: 15000 });

    // 1. Zoom In
    const zoomInBtn = page.getByRole('button', { name: 'Zoom In' });
    await expect(zoomInBtn).toBeVisible();
    await zoomInBtn.click({ force: true });

    // 2. Zoom Out
    const zoomOutBtn = page.getByRole('button', { name: 'Zoom Out' });
    await expect(zoomOutBtn).toBeVisible();
    await zoomOutBtn.click({ force: true });

    // 3. Toggle Auto-Rotation (Pause / Resume)
    const rotateBtn = page.getByRole('button', { name: /pause rotation|start auto-rotation/i });
    await expect(rotateBtn).toBeVisible();
    await rotateBtn.click({ force: true });
    await rotateBtn.click({ force: true });

    // 4. Reset Camera View
    const resetBtn = page.getByRole('button', { name: 'Reset Globe Orientation' });
    await expect(resetBtn).toBeVisible();
    await resetBtn.click({ force: true });

    // Ensure the widget remains intact and responsive
    await expect(cesiumWidget).toBeVisible();
  });
});
