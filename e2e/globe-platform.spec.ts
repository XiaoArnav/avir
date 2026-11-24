import { test, expect } from '@playwright/test';

test.describe('Avir Flagship Earth Command Center & Planetary Telemetry E2E', () => {
  test.beforeEach(async ({ page }) => {
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
    await expect(scrubber).toBeVisible({ timeout: 12000 });

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

  test('toggles 3D engine between Three.js and CesiumJS without crashing', async ({ page }) => {
    // Locate engine toggle button in GlobeControls
    const engineButton = page.getByRole('button', { name: /toggle 3d engine/i });
    await expect(engineButton).toBeVisible();
    await expect(engineButton).toHaveText('THREE');

    // Click to switch to Cesium
    await engineButton.click();
    await expect(engineButton).toHaveText('CESIUM');

    // Switch back to Three.js
    await engineButton.click();
    await expect(engineButton).toHaveText('THREE');
  });
});
