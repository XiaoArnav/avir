import { test, expect } from '@playwright/test';

test('first-visit city selection clears the example city AQI while the new city loads', async ({ page }) => {
  // A genuinely new visitor, not the persisted-user setup used by the other E2E suites.
  await page.addInitScript(() => localStorage.clear());

  const hours = Array.from({ length: 24 }, (_, index) => {
    const date = new Date(Date.now() + index * 3_600_000);
    return date.toISOString().slice(0, 13) + ':00';
  });

  let releaseBengaluru: (() => void) | null = null;
  const bengaluruGate = new Promise<void>((resolve) => {
    releaseBengaluru = resolve;
  });

  await page.route('**/*air-quality-api.open-meteo.com/**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const latitude = Number(requestUrl.searchParams.get('latitude'));
    if (latitude > 12 && latitude < 14) {
      await bengaluruGate;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        latitude,
        longitude: Number(requestUrl.searchParams.get('longitude')),
        timezone: 'Asia/Kolkata',
        current: {
          time: new Date().toISOString().slice(0, 16),
          pm2_5: 120,
          pm10: 180,
          us_aqi: 190,
          nitrogen_dioxide: 35,
          sulphur_dioxide: 12,
          carbon_monoxide: 850,
          ozone: 40,
        },
        hourly: {
          time: hours,
          pm2_5: hours.map(() => 120),
        },
      }),
    });
  });

  await page.route('**/*api.open-meteo.com/v1/forecast**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        timezone: 'Asia/Kolkata',
        current: {
          temperature_2m: 26,
          relative_humidity_2m: 50,
          wind_speed_10m: 12,
          wind_direction_10m: 290,
        },
        hourly: {
          time: hours,
          boundary_layer_height: hours.map(() => 900),
          temperature_2m: hours.map(() => 26),
          relative_humidity_2m: hours.map(() => 50),
          wind_speed_10m: hours.map(() => 12),
          wind_direction_10m: hours.map(() => 290),
        },
      }),
    });
  });

  try {
    await page.goto('/');
    const onboarding = page.getByRole('dialog', { name: 'Explore the air around you.' });
    await expect(onboarding).toBeVisible();

    const delhiCard = page.locator('article[aria-label="Current air quality observation for Delhi-NCR"]');
    await expect(page.locator('#main-content > div[role="status"]')).toContainText(
      'Air quality data updated for Delhi-NCR',
      { timeout: 20_000 }
    );
    await expect(delhiCard.locator('span.tabular-nums').first()).not.toHaveText('--');

    // This path used to call setSelectedCity() directly rather than handleCitySelect().
    await onboarding.getByRole('button', { name: 'Bengaluru', exact: true }).click();

    const bengaluruCard = page.locator('article[aria-label="Current air quality observation for Bengaluru"]');
    await expect(bengaluruCard).toBeVisible();
    await expect(page.locator('#main-content > div[role="status"]')).toContainText(
      'Loading live air quality measurements for Bengaluru'
    );
    // Critical assertion: Delhi's previous AQI must not appear under Bengaluru's name.
    await expect(bengaluruCard.locator('span.tabular-nums').first()).toHaveText('--');
  } finally {
    releaseBengaluru?.();
  }
});
