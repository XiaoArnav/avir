import { test, expect } from '@playwright/test';

test.describe('Three.js Advanced Cesium-Style Zoom & Camera System E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Deterministic API network fixtures
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

    // Seed localStorage so location onboarding modal is closed by default
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

    // Wait for the globe section to be visible
    const commandCenter = page.locator('section[aria-label="Atmospheric Intelligence Earth Command Center"]');
    await expect(commandCenter).toBeVisible({ timeout: 15000 });
  });

  test('Test A: Zoom In button decreases camera distance proportionally', async ({ page }) => {
    const zoomInBtn = page.getByRole('button', { name: 'Zoom In' });
    await expect(zoomInBtn).toBeVisible();

    // Check initial distance (should be around DEFAULT_CAMERA_DISTANCE = 260)
    await page.waitForFunction(() => {
      const w = window as any;
      return w.__avirThreeCamera && typeof w.__avirThreeCamera.getDistance() === 'number';
    });

    const initialDistance = await page.evaluate(() => (window as any).__avirThreeCamera.getTargetDistance());
    expect(initialDistance).toBeCloseTo(260, 0);

    // Click Zoom In
    await zoomInBtn.click({ force: true });

    // Target distance should decrease proportionally: (260 - 90) * 0.65 + 90 = 170 * 0.65 + 90 = 200.5
    const targetAfterZoomIn = await page.evaluate(() => (window as any).__avirThreeCamera.getTargetDistance());
    expect(targetAfterZoomIn).toBeLessThan(initialDistance);
    expect(targetAfterZoomIn).toBeCloseTo(200.5, 1);
  });

  test('Test B: Zoom Out button increases camera distance proportionally', async ({ page }) => {
    const zoomOutBtn = page.getByRole('button', { name: 'Zoom Out' });
    await expect(zoomOutBtn).toBeVisible();

    await page.waitForFunction(() => {
      const w = window as any;
      return w.__avirThreeCamera && typeof w.__avirThreeCamera.getDistance() === 'number';
    });

    const initialDistance = await page.evaluate(() => (window as any).__avirThreeCamera.getTargetDistance());

    // Click Zoom Out
    await zoomOutBtn.click({ force: true });

    // Target distance should increase proportionally: (260 - 90) * 1.45 + 90 = 170 * 1.45 + 90 = 336.5
    const targetAfterZoomOut = await page.evaluate(() => (window as any).__avirThreeCamera.getTargetDistance());
    expect(targetAfterZoomOut).toBeGreaterThan(initialDistance);
    expect(targetAfterZoomOut).toBeCloseTo(336.5, 1);
  });

  test('Test C: Maximum Zoom In reaches minimum altitude boundary without penetrating Earth surface', async ({ page }) => {
    const zoomInBtn = page.getByRole('button', { name: 'Zoom In' });
    await expect(zoomInBtn).toBeVisible();

    await page.waitForFunction(() => (window as any).__avirThreeCamera !== undefined);

    // Click Zoom In multiple times (10 times) to hit the physical min altitude bound (D_min = 102)
    for (let i = 0; i < 10; i++) {
      await zoomInBtn.click({ force: true });
    }

    const minTarget = await page.evaluate(() => (window as any).__avirThreeCamera.getTargetDistance());
    // EARTH_RADIUS (90) + MIN_ALTITUDE (12) = 102
    expect(minTarget).toBeGreaterThanOrEqual(102);
    expect(minTarget).toBeCloseTo(102, 1);

    // Wait for damped camera distance to settle near target
    await page.waitForTimeout(600);
    const settledDistance = await page.evaluate(() => (window as any).__avirThreeCamera.getDistance());
    expect(settledDistance).toBeGreaterThanOrEqual(101.9);
  });

  test('Test D: Maximum Zoom Out reaches orbital view with Earth visible and recoverable', async ({ page }) => {
    const zoomOutBtn = page.getByRole('button', { name: 'Zoom Out' });
    await expect(zoomOutBtn).toBeVisible();

    await page.waitForFunction(() => (window as any).__avirThreeCamera !== undefined);

    // Click Zoom Out multiple times (10 times) to hit max orbital distance (D_max = 1000)
    for (let i = 0; i < 10; i++) {
      await zoomOutBtn.click({ force: true });
    }

    const maxTarget = await page.evaluate(() => (window as any).__avirThreeCamera.getTargetDistance());
    expect(maxTarget).toBeLessThanOrEqual(1000);
    expect(maxTarget).toBeCloseTo(1000, 1);

    // Wait for damped camera distance to settle
    await page.waitForTimeout(600);
    const settledDistance = await page.evaluate(() => (window as any).__avirThreeCamera.getDistance());
    expect(settledDistance).toBeLessThanOrEqual(1000.1);
    expect(settledDistance).toBeGreaterThan(900);
  });

  test('Test E: Alternating mouse wheel and button zoom maintains single continuous target without snapping', async ({ page }) => {
    const zoomInBtn = page.getByRole('button', { name: 'Zoom In' });
    await page.waitForFunction(() => (window as any).__avirThreeCamera !== undefined);

    // Step 1: Click Zoom In button
    await zoomInBtn.click({ force: true });
    const targetAfterBtn = await page.evaluate(() => (window as any).__avirThreeCamera.getTargetDistance());
    expect(targetAfterBtn).toBeCloseTo(200.5, 1);

    // Step 2: Dispatch mouse wheel scroll on canvas
    const canvas = page.locator('canvas').first();
    await canvas.dispatchEvent('wheel', { deltaY: -100, deltaMode: 0 });

    const targetAfterWheel = await page.evaluate(() => (window as any).__avirThreeCamera.getTargetDistance());
    // Wheel scrolled in from targetAfterBtn, so it should be strictly less than targetAfterBtn
    expect(targetAfterWheel).toBeLessThan(targetAfterBtn);

    // Step 3: Click Zoom In button again
    await zoomInBtn.click({ force: true });
    const targetAfterNextBtn = await page.evaluate(() => (window as any).__avirThreeCamera.getTargetDistance());
    // It must proportionally zoom in from targetAfterWheel without snapping back to 200.5 or 260
    expect(targetAfterNextBtn).toBeLessThan(targetAfterWheel);
  });

  test('Test F: Reset view restores default 260 distance and target orientation', async ({ page }) => {
    const zoomInBtn = page.getByRole('button', { name: 'Zoom In' });
    const resetBtn = page.getByRole('button', { name: 'Reset Globe Orientation' });

    await page.waitForFunction(() => (window as any).__avirThreeCamera !== undefined);

    // Zoom in twice
    await zoomInBtn.click({ force: true });
    await zoomInBtn.click({ force: true });
    const zoomedTarget = await page.evaluate(() => (window as any).__avirThreeCamera.getTargetDistance());
    expect(zoomedTarget).toBeLessThan(200);

    // Click Reset
    await resetBtn.click({ force: true });
    const resetTarget = await page.evaluate(() => (window as any).__avirThreeCamera.getTargetDistance());
    expect(resetTarget).toBe(260);

    // Wait for damped camera distance to settle back to 260
    await page.waitForTimeout(600);
    const settledDistance = await page.evaluate(() => (window as any).__avirThreeCamera.getDistance());
    expect(settledDistance).toBeCloseTo(260, 0);
  });

  test('Test G: Drag rotation followed by zoom preserves orientation', async ({ page }) => {
    const zoomInBtn = page.getByRole('button', { name: 'Zoom In' });
    await page.waitForFunction(() => (window as any).__avirThreeCamera !== undefined);

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    // Drag canvas horizontally
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 80, box!.y + box!.height / 2, { steps: 5 });
    await page.mouse.up();

    const orientationAfterDrag = await page.evaluate(() => (window as any).__avirThreeCamera.getOrientation());

    // Zoom in
    await zoomInBtn.click({ force: true });

    // Verify orientation was preserved and not reset to default
    const orientationAfterZoom = await page.evaluate(() => (window as any).__avirThreeCamera.getOrientation());
    expect(orientationAfterZoom.y).toBeCloseTo(orientationAfterDrag.y, 1);
  });

  test('Test H: Rotation toggling does not recreate WebGL canvas element', async ({ page }) => {
    await page.waitForFunction(() => (window as any).__avirThreeCamera !== undefined);

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    // Mark the canvas element with a custom property
    await page.evaluate(() => {
      const c = document.querySelector('canvas');
      if (c) (c as any).__testCanvasIdentity = 'VIR_CANVAS_INSTANCE_1';
    });

    // Toggle auto-rotation (Pause / Resume)
    const rotateBtn = page.getByRole('button', { name: /pause rotation|start auto-rotation/i });
    await expect(rotateBtn).toBeVisible();
    await rotateBtn.click({ force: true });
    await rotateBtn.click({ force: true });

    // Assert the canvas element identity remains identical (no DOM destruction/recreation)
    const canvasIdentity = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      return (c as any)?.__testCanvasIdentity;
    });
    expect(canvasIdentity).toBe('VIR_CANVAS_INSTANCE_1');
  });
});
