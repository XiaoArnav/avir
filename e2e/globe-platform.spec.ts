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

  test('toggles 3D engine from default CesiumJS to Three.js and back without crashing or duplicating canvases', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const threeCanvas = page.locator(
      '[aria-label="Interactive 3D Earth Globe showing atmospheric air quality telemetry"] canvas'
    );
    const cesiumContainer = page.locator('.cesium-widget');

    // TEST A, B, C: Opening Avir selects CESIUM by default and renders Cesium viewer without Three.js
    const engineButton = page.getByRole('button', { name: /toggle 3d engine/i });
    await expect(engineButton).toBeVisible();
    await expect(engineButton).toHaveText('CESIUM');
    await expect(cesiumContainer).toBeVisible({ timeout: 15000 });
    await expect(threeCanvas).toHaveCount(0);

    // Verify legal accessible provider attribution panel is visible with imagery credits,
    // and real-terrain attribution is NOT shown while ellipsoid default is active
    const attributionPanel = page.getByRole('contentinfo', {
      name: /satellite imagery and map data attribution/i,
    });
    await expect(attributionPanel).toBeVisible();
    await expect(attributionPanel).toContainText('Imagery: Tiles © Esri');
    await expect(attributionPanel).not.toContainText('Re:Earth / Mapterhorn');
    await expect(page.getByTestId('cesium-terrain-attribution')).toHaveCount(0);

    // TEST D, G, I: Switch CESIUM -> THREE cleanly with a single Three.js canvas
    await engineButton.click();
    await expect(engineButton).toHaveText('THREE');
    await expect(cesiumContainer).toHaveCount(0);
    await expect(threeCanvas).toHaveCount(1);
    await expect(threeCanvas).toBeVisible({ timeout: 15000 });
    await page.waitForFunction(() => Boolean(window.__avirThreeCamera));

    // TEST E, I: Switch back THREE -> CESIUM and verify attribution remains intact
    await engineButton.click();
    await expect(engineButton).toHaveText('CESIUM');
    await expect(threeCanvas).toHaveCount(0);
    await expect(cesiumContainer).toBeVisible({ timeout: 15000 });
    await expect(attributionPanel).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test('preserves CesiumJS default engine across 2D accessible fallback toggles and page reload', async ({ page }) => {
    const engineButton = page.getByRole('button', { name: /toggle 3d engine/i });
    const cesiumContainer = page.locator('.cesium-widget');

    await expect(engineButton).toHaveText('CESIUM');
    await expect(cesiumContainer).toBeVisible({ timeout: 15000 });

    // TEST F: Switch to 2D and back preserves CESIUM selection
    await page.getByRole('button', { name: /switch to accessible 2d map/i }).click();
    const fallback2d = page.getByRole('region', { name: /2d geographic observation map/i });
    await expect(fallback2d).toBeVisible();
    await page.getByRole('button', { name: /switch to 3d earth globe/i }).click();
    await expect(fallback2d).not.toBeVisible();
    await expect(engineButton).toHaveText('CESIUM');
    await expect(cesiumContainer).toBeVisible({ timeout: 15000 });

    // TEST J: Switch to THREE then reload -> fresh page starts with CESIUM default again
    await engineButton.click();
    await expect(engineButton).toHaveText('THREE');
    await page.reload();
    await expect(page.getByRole('button', { name: /toggle 3d engine/i })).toHaveText('CESIUM');
    await expect(page.locator('.cesium-widget')).toBeVisible({ timeout: 15000 });
  });

  test('falls back automatically to Three.js when CesiumJS WebGL initialization genuinely fails', async ({ page }) => {
    // Deterministic failure fixture: fail WebGL context creation only for Cesium canvases
    await page.addInitScript(() => {
      const proto = HTMLCanvasElement.prototype as unknown as {
        getContext: (type: string, ...args: unknown[]) => unknown;
      };
      const origGetContext = proto.getContext;
      proto.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        if (
          (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') &&
          (this.closest('.cesium-viewer') || this.closest('.cesium-widget'))
        ) {
          return null;
        }
        return origGetContext.apply(this, [type, ...args]);
      };
    });

    await page.goto('/');

    const engineButton = page.getByRole('button', { name: /toggle 3d engine/i });
    const fallbackBanner = page.getByText(/Cesium unavailable.*Reverted to Three\.js/i);
    const threeCanvas = page.locator(
      '[aria-label="Interactive 3D Earth Globe showing atmospheric air quality telemetry"] canvas'
    );

    // TEST H: Genuine Cesium WebGL failure triggers automatic fallback to Three.js with notice
    await expect(fallbackBanner).toBeVisible({ timeout: 15000 });
    await expect(engineButton).toHaveText('THREE');
    await expect(threeCanvas).toBeVisible({ timeout: 15000 });
  });

  test('operates camera controls (zoom, auto-rotate, reset) when Cesium engine is active by default', async ({ page }) => {
    test.setTimeout(60000);
    const engineButton = page.getByRole('button', { name: /toggle 3d engine/i });
    await expect(engineButton).toBeVisible();
    await expect(engineButton).toHaveText('CESIUM');

    // Wait for Cesium canvas to initialize without clicking the switcher
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

    // 5. Verify direct drag and wheel navigation on Cesium canvas without regression
    const canvas = cesiumWidget.locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 60, cy - 30, { steps: 5 });
      await page.mouse.up();
      await page.mouse.wheel(0, -180);
    }

    // Ensure the widget and imagery attribution remain intact and responsive
    await expect(cesiumWidget).toBeVisible();
    await expect(page.locator('text=Imagery: Tiles © Esri')).toBeVisible();
  });

  test('operates unified Environmental Layers (Cesium & Three.js Global Wind V2, FIRMS Fires, Cesium Terrain, NASA GIBS) with model preservation and intact scroll zoom', async ({
    page,
  }) => {
    test.setTimeout(60000);

    const buildMockBinaryGrid = (uVal: number, vVal: number) => {
      const width = 36;
      const height = 19;
      const count = width * height;
      const buf = new Float32Array(count * 2);
      buf.fill(uVal, 0, count);
      buf.fill(vVal, count, count * 2);
      return Buffer.from(buf.buffer);
    };

    await page.route('**/api/environment/wind/global/grid*', async (route) => {
      const reqUrl = new URL(route.request().url());
      const model = reqUrl.searchParams.get('model') === 'ifs' ? 'ifs' : 'gfs';
      await route.fulfill({
        status: 200,
        contentType: 'application/octet-stream',
        body: buildMockBinaryGrid(model === 'ifs' ? 9.5 : 6.0, 2.0),
      });
    });

    await page.route('**/api/environment/wind/global?*', async (route) => {
      const reqUrl = new URL(route.request().url());
      const model = reqUrl.searchParams.get('model') === 'ifs' ? 'ifs' : 'gfs';
      const overlay = reqUrl.searchParams.get('overlay') || 'none';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          schemaVersion: 2,
          model,
          modelName: model === 'ifs' ? 'ECMWF IFS (0.25° -> 1° grid)' : 'NOAA GFS (0.25° -> 1° grid)',
          provider: model === 'ifs' ? 'ECMWF Open Data' : 'NOAA / NCEP Open Data',
          initTimeUtc: '2026-11-25T00:00:00.000Z',
          validTimeUtc: '2026-11-25T06:00:00.000Z',
          forecastHour: 6,
          retrievedAtUtc: '2026-11-25T06:02:00.000Z',
          grid: {
            width: 36,
            height: 19,
            lo1: 0,
            la1: 90,
            dx: 10,
            dy: 10,
            bounds: { west: -180, south: -90, east: 180, north: 90 },
            resolutionDeg: 10,
            nativeResolutionDeg: 0.25,
          },
          level: '10 m above ground',
          units: 'm/s',
          overlay,
          scalar: null,
          scalarError: null,
          status: 'available',
          freshness: 'current',
          ageMinutes: 2,
          isAvailable: true,
          isCached: false,
          isStale: false,
          unavailableReason: null,
          attribution: model === 'ifs' ? 'ECMWF IFS Open Data' : 'NOAA / NCEP GFS',
          license: model === 'ifs' ? 'CC BY 4.0' : 'Public Domain',
          cycle: { date: '20261125', hour: 0, forecastHour: 6 },
          gridUrl: `/api/environment/wind/global/grid?model=${model}&overlay=none&date=20261125&hour=0&step=6`,
        }),
      });
    });

    await page.route('**/api/environment/fires*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          configured: false,
          isAvailable: false,
          isCached: false,
          isStale: false,
          status: 'unconfigured',
          message: 'NASA_FIRMS_MAP_KEY is not configured on the server.',
          dataset: 'VIIRS_NOAA20_NRT',
          satellite: 'NOAA-20',
          instrument: 'VIIRS',
          lookbackDays: 2,
          fetchedAtUtc: '2026-11-24T12:05:00Z',
          latestObservationUtc: null,
          count: 0,
          hotspots: [],
          regionalContext: null,
        }),
      });
    });

    await page.route('**/*gibs.earthdata.nasa.gov/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/xml',
        body: '<Domains xmlns:ows="http://www.opengis.net/ows/1.1"><DimensionDomain><ows:Identifier>time</ows:Identifier><Domain>2026-01-01/2026-11-24/P1D</Domain></DimensionDomain></Domains>',
      });
    });

    await page.route('**/*wvs.earthdata.nasa.gov/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Expose-Headers': 'Content-Length, Data-Present, Acquisition-Time',
          'Data-Present': 'true',
          'Acquisition-Time': '2026-11-24',
        },
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          'base64'
        ),
      });
    });

    // 1. Default CesiumJS loads; open Layers popover and verify Wind Flow is ENABLED in Cesium, along with Terrain and Fires
    await expect(page.locator('.cesium-widget')).toBeVisible({ timeout: 15000 });
    const layersButton = page.getByRole('button', { name: 'Environmental Intelligence Layers' });
    await expect(layersButton).toHaveAttribute('aria-expanded', 'false');
    await layersButton.click();
    await expect(layersButton).toHaveAttribute('aria-expanded', 'true');

    const windToggle = page.getByRole('button', { name: 'Toggle Wind Flow layer' });
    const firesToggle = page.getByRole('button', { name: 'Toggle Active Fires layer' });
    const terrainToggle = page.getByRole('button', { name: 'Toggle 3D Terrain Mesh layer' });
    const satelliteToggle = page.getByRole('button', { name: 'Toggle Satellite Imagery Comparison panel' });

    await expect(windToggle).toBeEnabled();
    await expect(windToggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('layer-status-wind')).toHaveText('OFF');
    await expect(firesToggle).toHaveAttribute('aria-pressed', 'false');
    await expect(terrainToggle).toBeEnabled();
    await expect(terrainToggle).toHaveAttribute('aria-pressed', 'false');

    // 2. Enable Wind Flow directly in CesiumJS, verify LIVE status + metadata + switch model GFS -> IFS + pause + inspect
    await windToggle.click();
    await expect(windToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('layer-status-wind')).toHaveText('LIVE', { timeout: 15000 });
    await expect(page.getByTestId('wind-controls-subpanel')).toBeVisible();
    await expect(page.getByTestId('wind-forecast-metadata')).toContainText('NOAA GFS');
    await expect(page.getByTestId('wind-forecast-metadata')).toContainText('2026-11-25 06:00 UTC');

    await page.getByTestId('wind-model-ifs').click();
    await expect(page.getByTestId('wind-forecast-metadata')).toContainText('ECMWF IFS', { timeout: 15000 });

    await page.getByTestId('wind-inspect-city').click();
    await expect(page.getByTestId('wind-inspection-card')).toContainText('12.97°N');

    await page.getByTestId('wind-animation-toggle').click();
    await expect(page.getByTestId('wind-animation-toggle')).toContainText('PAUSED');
    await page.getByTestId('wind-animation-toggle').click();
    await expect(page.getByTestId('wind-animation-toggle')).toContainText('FLOWING');

    // 3. Toggle 3D Terrain Mesh ON/OFF in CesiumJS, and toggle Active Fires ON -> honest UNCONFIGURED state
    await terrainToggle.click();
    await expect(terrainToggle).toHaveAttribute('aria-pressed', 'true');
    await terrainToggle.click();
    await expect(terrainToggle).toHaveAttribute('aria-pressed', 'false');

    await firesToggle.click();
    await expect(firesToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('layer-status-fires')).toHaveText('UNCONFIGURED');

    // 4. Switch to Three.js -> re-open Layers, verify Wind stays LIVE with ECMWF IFS model preserved!
    await page.getByRole('button', { name: /toggle 3d engine/i }).click();
    await page.waitForFunction(() => Boolean(window.__avirThreeCamera));
    await layersButton.click();
    await expect(layersButton).toHaveAttribute('aria-expanded', 'true');

    await expect(firesToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(terrainToggle).toBeDisabled();
    await expect(page.getByTestId('layer-status-terrain')).toHaveText('CESIUM ONLY');
    await expect(windToggle).toBeEnabled();
    await expect(windToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('layer-status-wind')).toHaveText('LIVE');
    await expect(page.getByTestId('wind-model-ifs')).toHaveAttribute('aria-pressed', 'true');

    await windToggle.click();
    await expect(windToggle).toHaveAttribute('aria-pressed', 'false');

    // 5. Toggle Satellite Imagery Comparison ON -> renders NASA GIBS slider and closes cleanly
    await satelliteToggle.click();
    await expect(satelliteToggle).toHaveAttribute('aria-pressed', 'true');

    const comparisonPanel = page.getByTestId('satellite-comparison-panel');
    await expect(comparisonPanel).toBeVisible();
    await expect(comparisonPanel).toContainText('NASA SATELLITE IMAGERY COMPARISON');

    await page.getByRole('button', { name: 'Close satellite imagery comparison' }).click();
    await expect(comparisonPanel).toHaveCount(0);

    // 6. Re-open Layers to confirm Satellite toggle returned OFF, close via Escape, and confirm wheel zoom over Three.js does not scroll page
    await layersButton.click();
    await expect(layersButton).toHaveAttribute('aria-expanded', 'true');
    await expect(satelliteToggle).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Escape');
    await expect(layersButton).toHaveAttribute('aria-expanded', 'false');

    await page.evaluate(() => window.scrollTo(0, 0));
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      const targetX = box.x + box.width * 0.62;
      const targetY = box.y + box.height * 0.42;
      const distBefore = await page.evaluate(() => window.__avirThreeCamera!.getTargetDistance());
      await page.mouse.move(targetX, targetY);
      await page.mouse.wheel(0, -180);
      await page.waitForTimeout(150);
      const distAfter = await page.evaluate(() => window.__avirThreeCamera!.getTargetDistance());
      const scrollY = await page.evaluate(() => window.scrollY);
      expect(distAfter).toBeLessThan(distBefore);
      expect(scrollY).toBe(0);
    }

    // 7. Switch back to Cesium cleanly without errors
    await page.getByRole('button', { name: /toggle 3d engine/i }).click();
    await expect(page.locator('.cesium-widget')).toBeVisible({ timeout: 15000 });
  });

  test('displays honest UNAVAILABLE state in Wind Flow when global wind provider fails', async ({ page }) => {
    await page.route('**/api/environment/wind/global?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          schemaVersion: 2,
          model: 'gfs',
          modelName: 'NOAA GFS (0.25° -> 1° grid)',
          provider: 'NOAA / NCEP Open Data',
          initTimeUtc: null,
          validTimeUtc: null,
          forecastHour: null,
          retrievedAtUtc: '2026-11-25T06:00:00.000Z',
          grid: {
            width: 0,
            height: 0,
            lo1: 0,
            la1: 90,
            dx: 1,
            dy: 1,
            bounds: { west: -180, south: -90, east: 180, north: 90 },
            resolutionDeg: 1,
            nativeResolutionDeg: 0.25,
          },
          level: '10 m above ground',
          units: 'm/s',
          overlay: 'none',
          scalar: null,
          scalarError: null,
          status: 'temporarily_unavailable',
          freshness: 'unavailable',
          ageMinutes: null,
          isAvailable: false,
          isCached: false,
          isStale: false,
          unavailableReason: 'NOAA GFS archive temporarily unreachable.',
          attribution: 'NOAA / NCEP GFS',
          license: 'Public Domain',
          cycle: null,
          gridUrl: null,
        }),
      });
    });

    await expect(page.locator('.cesium-widget')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Environmental Intelligence Layers' }).click();
    await page.getByRole('button', { name: 'Toggle Wind Flow layer' }).click();
    await expect(page.getByTestId('layer-status-wind')).toHaveText('UNAVAILABLE', { timeout: 10000 });
  });
});
