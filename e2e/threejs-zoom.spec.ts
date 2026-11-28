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

    // Switch from default CesiumJS engine to Three.js before Three.js-specific zoom assertions
    const engineButton = page.getByRole('button', { name: /toggle 3d engine/i });
    await expect(engineButton).toBeVisible();
    await expect(engineButton).toHaveText('CESIUM');
    await engineButton.click();
    await expect(engineButton).toHaveText('THREE');
    await page.waitForFunction(() => Boolean(window.__avirThreeCamera));
  });

  test('Test A: Zoom In button decreases camera distance proportionally', async ({ page }) => {
    const zoomInBtn = page.getByRole('button', { name: 'Zoom In' });
    await expect(zoomInBtn).toBeVisible();

    // Check initial distance (should be around DEFAULT_CAMERA_DISTANCE = 260)
    await page.waitForFunction(() => {
      return Boolean(window.__avirThreeCamera && typeof window.__avirThreeCamera.getDistance() === 'number');
    });

    const initialDistance = await page.evaluate(() => window.__avirThreeCamera!.getTargetDistance());
    expect(initialDistance).toBeCloseTo(260, 0);

    // Click Zoom In
    await zoomInBtn.click({ force: true });

    // Target distance should decrease proportionally: (260 - 90) * 0.65 + 90 = 170 * 0.65 + 90 = 200.5
    const targetAfterZoomIn = await page.evaluate(() => window.__avirThreeCamera!.getTargetDistance());
    expect(targetAfterZoomIn).toBeLessThan(initialDistance);
    expect(targetAfterZoomIn).toBeCloseTo(200.5, 1);
  });

  test('Test B: Zoom Out button increases camera distance proportionally', async ({ page }) => {
    const zoomOutBtn = page.getByRole('button', { name: 'Zoom Out' });
    await expect(zoomOutBtn).toBeVisible();

    await page.waitForFunction(() => {
      return Boolean(window.__avirThreeCamera && typeof window.__avirThreeCamera.getDistance() === 'number');
    });

    const initialDistance = await page.evaluate(() => window.__avirThreeCamera!.getTargetDistance());

    // Click Zoom Out
    await zoomOutBtn.click({ force: true });

    // Target distance should increase proportionally: (260 - 90) * 1.45 + 90 = 170 * 1.45 + 90 = 336.5
    const targetAfterZoomOut = await page.evaluate(() => window.__avirThreeCamera!.getTargetDistance());
    expect(targetAfterZoomOut).toBeGreaterThan(initialDistance);
    expect(targetAfterZoomOut).toBeCloseTo(336.5, 1);
  });

  test('Test C: Maximum Zoom In reaches minimum altitude boundary without penetrating Earth surface', async ({ page }) => {
    const zoomInBtn = page.getByRole('button', { name: 'Zoom In' });
    await expect(zoomInBtn).toBeVisible();

    await page.waitForFunction(() => window.__avirThreeCamera !== undefined);

    // Click Zoom In multiple times (10 times) to hit the physical min altitude bound (D_min = 102)
    for (let i = 0; i < 10; i++) {
      await zoomInBtn.click({ force: true });
    }

    const minTarget = await page.evaluate(() => window.__avirThreeCamera!.getTargetDistance());
    // EARTH_RADIUS (90) + MIN_ALTITUDE (12) = 102
    expect(minTarget).toBeGreaterThanOrEqual(102);
    expect(minTarget).toBeCloseTo(102, 1);

    // Wait for damped camera distance to settle near target
    await page.waitForTimeout(600);
    const settledDistance = await page.evaluate(() => window.__avirThreeCamera!.getDistance());
    expect(settledDistance).toBeGreaterThanOrEqual(101.9);
  });

  test('Test D: Maximum Zoom Out reaches orbital view with Earth visible and recoverable', async ({ page }) => {
    const zoomOutBtn = page.getByRole('button', { name: 'Zoom Out' });
    await expect(zoomOutBtn).toBeVisible();

    await page.waitForFunction(() => window.__avirThreeCamera !== undefined);

    // Click Zoom Out multiple times (10 times) to hit max orbital distance (D_max = 1000)
    for (let i = 0; i < 10; i++) {
      await zoomOutBtn.click({ force: true });
    }

    const maxTarget = await page.evaluate(() => window.__avirThreeCamera!.getTargetDistance());
    expect(maxTarget).toBeLessThanOrEqual(1000);
    expect(maxTarget).toBeCloseTo(1000, 1);

    // Wait for damped camera distance to settle
    await page.waitForTimeout(600);
    const settledDistance = await page.evaluate(() => window.__avirThreeCamera!.getDistance());
    expect(settledDistance).toBeLessThanOrEqual(1000.1);
    expect(settledDistance).toBeGreaterThan(900);
  });

  test('Test E: Alternating mouse wheel and button zoom maintains single continuous target without snapping', async ({ page }) => {
    const zoomInBtn = page.getByRole('button', { name: 'Zoom In' });
    await page.waitForFunction(() => window.__avirThreeCamera !== undefined);

    // Step 1: Click Zoom In button
    await zoomInBtn.click({ force: true });
    const targetAfterBtn = await page.evaluate(() => window.__avirThreeCamera!.getTargetDistance());
    expect(targetAfterBtn).toBeCloseTo(200.5, 1);

    // Step 2: Dispatch mouse wheel scroll on canvas
    const canvas = page.locator('canvas').first();
    await canvas.dispatchEvent('wheel', { deltaY: -100, deltaMode: 0 });

    const targetAfterWheel = await page.evaluate(() => window.__avirThreeCamera!.getTargetDistance());
    // Wheel scrolled in from targetAfterBtn, so it should be strictly less than targetAfterBtn
    expect(targetAfterWheel).toBeLessThan(targetAfterBtn);

    // Step 3: Click Zoom In button again
    await zoomInBtn.click({ force: true });
    const targetAfterNextBtn = await page.evaluate(() => window.__avirThreeCamera!.getTargetDistance());
    // It must proportionally zoom in from targetAfterWheel without snapping back to 200.5 or 260
    expect(targetAfterNextBtn).toBeLessThan(targetAfterWheel);
  });

  test('Test F: Reset view restores default 260 distance and target orientation', async ({ page }) => {
    const zoomInBtn = page.getByRole('button', { name: 'Zoom In' });
    const resetBtn = page.getByRole('button', { name: 'Reset Globe Orientation' });

    await page.waitForFunction(() => window.__avirThreeCamera !== undefined);

    // Zoom in twice
    await zoomInBtn.click({ force: true });
    await zoomInBtn.click({ force: true });
    const zoomedTarget = await page.evaluate(() => window.__avirThreeCamera!.getTargetDistance());
    expect(zoomedTarget).toBeLessThan(200);

    // Click Reset
    await resetBtn.click({ force: true });
    const resetTarget = await page.evaluate(() => window.__avirThreeCamera!.getTargetDistance());
    expect(resetTarget).toBe(260);

    // Wait for damped camera distance to settle back to 260
    await expect
      .poll(() => page.evaluate(() => window.__avirThreeCamera!.getDistance()), {
        timeout: 2500,
      })
      .toBeCloseTo(260, 0);
  });

  test('Test G: Drag rotation followed by zoom preserves orientation', async ({ page }) => {
    const zoomInBtn = page.getByRole('button', { name: 'Zoom In' });
    const rotateBtn = page.getByRole('button', { name: /pause rotation|start auto-rotation/i });
    await page.waitForFunction(() => window.__avirThreeCamera !== undefined);

    // Pause continuous auto-rotation so orientation assertion isolates drag + zoom preservation
    const rotateLabel = await rotateBtn.getAttribute('aria-label');
    if (rotateLabel?.toLowerCase().includes('pause')) {
      await rotateBtn.click();
    }

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    // Drag canvas horizontally
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 80, box!.y + box!.height / 2, { steps: 5 });
    await page.mouse.up();

    // Allow exponential drag damping to settle before recording reference orientation
    await page.waitForTimeout(400);
    const orientationAfterDrag = await page.evaluate(() => window.__avirThreeCamera!.getOrientation());

    // Zoom in with normal click (no force bypass)
    await zoomInBtn.click();

    // Verify orientation was preserved and not reset to default
    const orientationAfterZoom = await page.evaluate(() => window.__avirThreeCamera!.getOrientation());
    expect(orientationAfterZoom.y).toBeCloseTo(orientationAfterDrag.y, 1);
  });

  test('Test H: Rotation toggling does not recreate WebGL canvas element', async ({ page }) => {
    await page.waitForFunction(() => window.__avirThreeCamera !== undefined);

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    // Mark the canvas element with a custom property
    await page.evaluate(() => {
      const c = document.querySelector('canvas') as (HTMLCanvasElement & { __testCanvasIdentity?: string }) | null;
      if (c) c.__testCanvasIdentity = 'VIR_CANVAS_INSTANCE_1';
    });

    // Toggle auto-rotation (Pause / Resume)
    const rotateBtn = page.getByRole('button', { name: /pause rotation|start auto-rotation/i });
    await expect(rotateBtn).toBeVisible();
    await rotateBtn.click({ force: true });
    await rotateBtn.click({ force: true });

    // Assert the canvas element identity remains identical (no DOM destruction/recreation)
    const canvasIdentity = await page.evaluate(() => {
      const c = document.querySelector('canvas') as (HTMLCanvasElement & { __testCanvasIdentity?: string }) | null;
      return c?.__testCanvasIdentity;
    });
    expect(canvasIdentity).toBe('VIR_CANVAS_INSTANCE_1');
  });

  test('Wheel Scroll A: Mouse wheel zoom over Three.js zooms globe without scrolling page or passive warnings', async ({ page }) => {
    const passiveWarnings: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.toLowerCase().includes('passive') || text.toLowerCase().includes('preventdefault')) {
        passiveWarnings.push(text);
      }
    });

    await page.waitForFunction(() => window.__avirThreeCamera !== undefined);

    // Ensure page is scrollable
    const canScrollPage = await page.evaluate(
      () => document.documentElement.scrollHeight > window.innerHeight
    );
    expect(canScrollPage).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    // Hover in open center-top canvas region away from CompactCityCard (left) and GlobeControls (bottom-right)
    const targetX = box!.x + box!.width * 0.62;
    const targetY = box!.y + box!.height * 0.42;
    const hitTag = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.tagName,
      { x: targetX, y: targetY }
    );
    expect(hitTag).toBe('CANVAS');

    const initialScrollY = await page.evaluate(() => window.scrollY);
    const initialDistance = await page.evaluate(() => window.__avirThreeCamera!.getTargetDistance());
    expect(initialScrollY).toBe(0);

    await page.mouse.move(targetX, targetY);
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(150);

    const distanceAfterWheel = await page.evaluate(() => window.__avirThreeCamera!.getTargetDistance());
    const scrollYAfterWheel = await page.evaluate(() => window.scrollY);

    // Expected proportional zoom in from 260: 90 + 170 * exp(-120 * 0.0015) ≈ 231.997
    expect(distanceAfterWheel).toBeLessThan(initialDistance);
    expect(distanceAfterWheel).toBeCloseTo(90 + (initialDistance - 90) * Math.exp(-120 * 0.0015), 1);
    expect(scrollYAfterWheel).toBe(0);
    expect(passiveWarnings).toEqual([]);
  });

  test('Wheel Scroll B: Reverse wheel scroll over Three.js zooms out without scrolling page', async ({ page }) => {
    await page.waitForFunction(() => window.__avirThreeCamera !== undefined);
    await page.evaluate(() => window.scrollTo(0, 0));

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    const targetX = box!.x + box!.width * 0.62;
    const targetY = box!.y + box!.height * 0.42;

    await page.mouse.move(targetX, targetY);
    await page.mouse.wheel(0, -120);
    const afterIn = await page.evaluate(() => window.__avirThreeCamera!.getTargetDistance());

    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(150);
    const afterOut = await page.evaluate(() => window.__avirThreeCamera!.getTargetDistance());
    const scrollY = await page.evaluate(() => window.scrollY);

    expect(afterOut).toBeGreaterThan(afterIn);
    expect(scrollY).toBe(0);
  });

  test('Wheel Scroll C: Scrolling outside Three.js scrolls page normally without changing globe zoom', async ({ page }) => {
    await page.waitForFunction(() => window.__avirThreeCamera !== undefined);
    await page.evaluate(() => window.scrollTo(0, 0));

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    const targetBeforeOutside = await page.evaluate(() => window.__avirThreeCamera!.getTargetDistance());

    // Move pointer clearly below the globe over normal page content
    const outsideX = box!.x + box!.width * 0.5;
    const outsideY = box!.y + box!.height + 80;
    const hitTag = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.tagName,
      { x: outsideX, y: outsideY }
    );
    expect(hitTag).not.toBe('CANVAS');

    await page.mouse.move(outsideX, outsideY);
    await page.mouse.wheel(0, 350);

    await page.waitForFunction(() => window.scrollY > 50, undefined, { timeout: 5000 });
    const scrollYAfterOutside = await page.evaluate(() => window.scrollY);
    const targetAfterOutside = await page.evaluate(() => window.__avirThreeCamera!.getTargetDistance());

    expect(scrollYAfterOutside).toBeGreaterThan(50);
    expect(targetAfterOutside).toBe(targetBeforeOutside);
  });

  test('Wheel Scroll D: Repeated small trackpad-like deltas and ctrlKey zoom execute cleanly once per input', async ({ page }) => {
    const passiveWarnings: string[] = [];
    page.on('console', (msg) => {
      if (msg.text().toLowerCase().includes('unable to preventdefault inside passive')) {
        passiveWarnings.push(msg.text());
      }
    });

    await page.waitForFunction(() => window.__avirThreeCamera !== undefined);
    await page.evaluate(() => window.scrollTo(0, 0));

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    const targetX = box!.x + box!.width * 0.62;
    const targetY = box!.y + box!.height * 0.42;
    await page.mouse.move(targetX, targetY);

    const initialDistance = await page.evaluate(() => window.__avirThreeCamera!.getTargetDistance());

    // 10 small trackpad-like scroll steps of -12px
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, -12);
    }

    await page.waitForTimeout(150);
    const afterTrackpad = await page.evaluate(() => window.__avirThreeCamera!.getTargetDistance());

    // Single execution invariant: 10 steps of -12px from 260 equals exp(10 * -12 * 0.0015) ≈ exp(-0.18)
    const expectedSingle = 90 + (initialDistance - 90) * Math.exp(-120 * 0.0015);
    expect(afterTrackpad).toBeCloseTo(expectedSingle, 1);

    // Trackpad pinch represented as ctrlKey wheel event
    await canvas.dispatchEvent('wheel', { deltaY: -40, deltaMode: 0, ctrlKey: true });
    const afterPinchWheel = await page.evaluate(() => window.__avirThreeCamera!.getTargetDistance());
    expect(afterPinchWheel).toBeLessThan(afterTrackpad);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(passiveWarnings).toEqual([]);
  });

  test('Wheel Scroll E: Scrolling at min and max zoom boundaries stays bounded without page scroll or errors', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.waitForFunction(() => window.__avirThreeCamera !== undefined);
    await page.evaluate(() => window.scrollTo(0, 0));

    const zoomInBtn = page.getByRole('button', { name: 'Zoom In' });
    const zoomOutBtn = page.getByRole('button', { name: 'Zoom Out' });
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    // Hit minimum bound (102) then scroll deeper in over globe
    for (let i = 0; i < 12; i++) {
      await zoomInBtn.click({ force: true });
    }
    expect(await page.evaluate(() => window.__avirThreeCamera!.getTargetDistance())).toBeCloseTo(102, 1);

    await page.evaluate(() => window.scrollTo(0, 0));
    const minBox = await canvas.boundingBox();
    expect(minBox).not.toBeNull();
    await page.mouse.move(minBox!.x + minBox!.width * 0.62, minBox!.y + minBox!.height * 0.42);
    await page.mouse.wheel(0, -240);
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(150);

    expect(await page.evaluate(() => window.__avirThreeCamera!.getTargetDistance())).toBeCloseTo(102, 1);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    // Hit maximum bound (1000) then scroll farther out over globe
    for (let i = 0; i < 14; i++) {
      await zoomOutBtn.click({ force: true });
    }
    expect(await page.evaluate(() => window.__avirThreeCamera!.getTargetDistance())).toBeCloseTo(1000, 1);

    await page.evaluate(() => window.scrollTo(0, 0));
    const maxBox = await canvas.boundingBox();
    expect(maxBox).not.toBeNull();
    await page.mouse.move(maxBox!.x + maxBox!.width * 0.62, maxBox!.y + maxBox!.height * 0.42);
    await page.mouse.wheel(0, 240);
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(150);

    expect(await page.evaluate(() => window.__avirThreeCamera!.getTargetDistance())).toBeCloseTo(1000, 1);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(pageErrors).toEqual([]);
  });

  test('Wheel Scroll F: Switching Three.js -> Cesium -> Three.js maintains single listener without leaks or page scroll', async ({ page }) => {
    await page.waitForFunction(() => window.__avirThreeCamera !== undefined);
    await page.evaluate(() => window.scrollTo(0, 0));

    // Switch Three.js -> Cesium and wait for Cesium to initialize cleanly
    const toggleBtn = page.getByRole('button', { name: /Toggle 3D Engine/i });
    await toggleBtn.click({ force: true });
    await expect(page.getByRole('button', { name: /currently CesiumJS/i })).toBeVisible({ timeout: 10000 });
    await page.waitForSelector('.cesium-viewer', { timeout: 10000 });

    // Switch Cesium -> Three.js
    await page.getByRole('button', { name: /currently CesiumJS/i }).click({ force: true });
    await expect(page.getByRole('button', { name: /currently Three\.js/i })).toBeVisible({ timeout: 10000 });

    await page.waitForFunction(() => window.__avirThreeCamera !== undefined);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(100);

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const targetX = box!.x + box!.width * 0.62;
    const targetY = box!.y + box!.height * 0.42;

    const debugInfo = await page.evaluate(
      ({ x, y }) => ({
        tag: document.elementFromPoint(x, y)?.tagName,
        globeCanvasCount: document.querySelectorAll(
          '[aria-label="Interactive 3D Earth Globe showing atmospheric air quality telemetry"] canvas'
        ).length,
        cesiumCount: document.querySelectorAll('.cesium-viewer').length,
        scrollY: window.scrollY,
      }),
      { x: targetX, y: targetY }
    );
    expect(debugInfo.tag).toBe('CANVAS');
    expect(debugInfo.globeCanvasCount).toBe(1);
    expect(debugInfo.cesiumCount).toBe(0);

    const initialDistance = await page.evaluate(() => window.__avirThreeCamera!.getTargetDistance());
    await page.mouse.move(targetX, targetY);
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(150);

    const afterDistance = await page.evaluate(() => window.__avirThreeCamera!.getTargetDistance());
    const expectedSingle = 90 + (initialDistance - 90) * Math.exp(-120 * 0.0015);

    // Must match single zoom update (if listener leaked/duplicated, delta would be twice as steep)
    expect(afterDistance).toBeCloseTo(expectedSingle, 1);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('Wheel Scroll G: Scrolling inside Environmental Details drawer scrolls drawer without affecting globe zoom', async ({ page }) => {
    await page.waitForFunction(() => window.__avirThreeCamera !== undefined);
    const targetBeforeDrawer = await page.evaluate(() => window.__avirThreeCamera!.getTargetDistance());

    const detailsBtn = page.getByRole('button', { name: /View Environmental Details/i });
    await detailsBtn.click();

    const drawerDialog = page.getByRole('dialog', { name: /Detailed Environmental Intelligence/i });
    await expect(drawerDialog).toBeVisible();

    const scrollablePanel = drawerDialog.locator('> div').first();
    const drawerBox = await scrollablePanel.boundingBox();
    expect(drawerBox).not.toBeNull();

    const scrollTopBefore = await scrollablePanel.evaluate((el) => el.scrollTop);
    await page.mouse.move(drawerBox!.x + drawerBox!.width / 2, drawerBox!.y + drawerBox!.height / 2);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(150);

    const scrollTopAfter = await scrollablePanel.evaluate((el) => el.scrollTop);
    const targetAfterDrawerScroll = await page.evaluate(() => window.__avirThreeCamera!.getTargetDistance());

    expect(scrollTopAfter).toBeGreaterThan(scrollTopBefore);
    expect(targetAfterDrawerScroll).toBe(targetBeforeDrawer);
  });

  test('Wheel Scroll H: Touch pinch gesture over Three.js continues to scale camera distance', async ({ page }) => {
    await page.waitForFunction(() => window.__avirThreeCamera !== undefined);

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    const initialDistance = await page.evaluate(() => window.__avirThreeCamera!.getTargetDistance());
    const cx = box!.x + box!.width * 0.62;
    const cy = box!.y + box!.height * 0.42;

    // Simulate two-finger pinch spread (60px -> 120px, scaleRatio = 2.0)
    await page.evaluate(
      ({ x, y }) => {
        const el = document.querySelector('canvas');
        if (!el) return;
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: x - 30, clientY: y }));
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 2, pointerType: 'touch', clientX: x + 30, clientY: y }));
        el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 2, pointerType: 'touch', clientX: x + 90, clientY: y }));
        el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: x - 30, clientY: y }));
        el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 2, pointerType: 'touch', clientX: x + 90, clientY: y }));
      },
      { x: cx, y: cy }
    );

    const afterPinch = await page.evaluate(() => window.__avirThreeCamera!.getTargetDistance());
    expect(afterPinch).toBeLessThan(initialDistance);
    expect(afterPinch).toBeCloseTo(90 + (initialDistance - 90) / 2, 1);
  });
});
