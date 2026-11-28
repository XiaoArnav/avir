import { test, expect } from '@playwright/test';

test('first-visit city selection clears the example city AQI while the new city loads', async ({ page }) => {
  // A genuinely new visitor, not the persisted-user setup used by the other E2E suites.
  await page.addInitScript(() => localStorage.clear());

  const hours = Array.from({ length: 24 }, (_, index) => {
    const date = new Date(Date.now() + index * 3_600_000);
    return date.toISOString().slice(0, 13) + ':00';
  });

  let releaseBengaluru: () => void = () => {};
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

    // Type "Bengaluru" in the modal search box because the initial chip list shows the first 6 Indian cities.
    await onboarding.getByPlaceholder('Search Delhi, Mumbai, Bengaluru, Tokyo...').fill('Bengaluru');
    // This path used to call setSelectedCity() directly rather than handleCitySelect().
    await onboarding.getByRole('button', { name: 'Bengaluru', exact: true }).click();

    const bengaluruCard = page.locator('article[aria-label="Current air quality observation for Bengaluru"]');
    await expect(bengaluruCard).toBeVisible();
    await expect(page.locator('#main-content > div[role="status"]')).toContainText(
      'Loading live air quality measurements for Bengaluru'
    );
    // Critical assertion: Delhi's previous AQI must not appear under Bengaluru's name.
    await expect(bengaluruCard.locator('span.tabular-nums').first()).toHaveText('--');
    // Release Bengaluru fetch and verify Bengaluru resolves its own fresh value & persists manual selection
    releaseBengaluru();
    await expect(page.locator('#main-content > div[role="status"]')).toContainText(
      'Air quality data updated for Bengaluru',
      { timeout: 20_000 }
    );
    await expect(bengaluruCard.locator('span.tabular-nums').first()).not.toHaveText('--');
    const savedCityRaw = await page.evaluate(() => localStorage.getItem('avir_selected_city_v1'));
    expect(savedCityRaw).not.toBeNull();
    expect(JSON.parse(savedCityRaw!).name).toBe('Bengaluru');
  } finally {
    releaseBengaluru();
  }
});

test('first-visit GPS outside India uses unknown country fallback, clears stale Delhi readings, and never persists GPS coordinates', async ({ browser }) => {
  const context = await browser.newContext({
    geolocation: { latitude: 47.6062, longitude: -122.3321 },
    permissions: ['geolocation'],
  });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.clear());

  const hours = Array.from({ length: 24 }, (_, index) => {
    const date = new Date(Date.now() + index * 3_600_000);
    return date.toISOString().slice(0, 13) + ':00';
  });

  let releaseSeattle: () => void = () => {};
  const seattleGate = new Promise<void>((resolve) => {
    releaseSeattle = resolve;
  });

  await page.route('**/api/geo/reverse*', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Reverse geocoding unavailable' }),
    });
  });

  await page.route('**/*air-quality-api.open-meteo.com/**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const latitude = Number(requestUrl.searchParams.get('latitude'));
    const isSeattle = latitude > 45;
    if (isSeattle) {
      await seattleGate;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        latitude,
        longitude: Number(requestUrl.searchParams.get('longitude')),
        timezone: isSeattle ? 'America/Los_Angeles' : 'Asia/Kolkata',
        current: {
          time: new Date().toISOString().slice(0, 16),
          pm2_5: isSeattle ? 8 : 120,
          pm10: isSeattle ? 14 : 180,
          us_aqi: isSeattle ? 42 : 190,
          nitrogen_dioxide: 20,
          sulphur_dioxide: 8,
          carbon_monoxide: 400,
          ozone: 35,
        },
        hourly: {
          time: hours,
          pm2_5: hours.map(() => (isSeattle ? 8 : 120)),
        },
      }),
    });
  });

  await page.route('**/*api.open-meteo.com/v1/forecast**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        timezone: 'UTC',
        current: {
          temperature_2m: 16,
          relative_humidity_2m: 65,
          wind_speed_10m: 9,
          wind_direction_10m: 220,
        },
        hourly: {
          time: hours,
          boundary_layer_height: hours.map(() => 800),
          temperature_2m: hours.map(() => 16),
          relative_humidity_2m: hours.map(() => 65),
          wind_speed_10m: hours.map(() => 9),
          wind_direction_10m: hours.map(() => 220),
        },
      }),
    });
  });

  try {
    await page.goto('/');
    const onboarding = page.getByRole('dialog', { name: 'Explore the air around you.' });
    await expect(onboarding).toBeVisible();

    await expect(page.locator('#main-content > div[role="status"]')).toContainText(
      'Air quality data updated for Delhi-NCR',
      { timeout: 20_000 }
    );

    await onboarding.getByRole('button', { name: /Use my current location/i }).click();

    const seattleCard = page.locator('article[aria-label="Current air quality observation for Near 47.61°N, 122.33°W"]');
    await expect(seattleCard).toBeVisible({ timeout: 10_000 });
    await expect(seattleCard.locator('span.tabular-nums').first()).toHaveText('--');
    await expect(seattleCard).not.toContainText('India');

    releaseSeattle();
    await expect(page.locator('#main-content > div[role="status"]')).toContainText(
      'Air quality data updated for Near 47.61°N, 122.33°W',
      { timeout: 20_000 }
    );
    await expect(seattleCard.locator('span.tabular-nums').first()).not.toHaveText('--');

    const storageState = await page.evaluate(() => ({
      onboarded: localStorage.getItem('avir_location_onboarded_v1'),
      persistedCity: localStorage.getItem('avir_selected_city_v1'),
    }));
    expect(storageState.onboarded).toBe('true');
    expect(storageState.persistedCity).toBeNull();
  } finally {
    releaseSeattle();
    await context.close();
  }
});

test('late GPS reverse-geocoding response cannot override manual Bengaluru selection or persist GPS coordinates', async ({ browser }) => {
  const context = await browser.newContext({
    geolocation: { latitude: 47.6062, longitude: -122.3321 },
    permissions: ['geolocation'],
  });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.clear());

  const hours = Array.from({ length: 24 }, (_, index) => {
    const date = new Date(Date.now() + index * 3_600_000);
    return date.toISOString().slice(0, 13) + ':00';
  });

  let markReverseRequested: () => void = () => {};
  const reverseRequested = new Promise<void>((resolve) => {
    markReverseRequested = resolve;
  });
  let releaseReverse: () => void = () => {};
  const reverseGate = new Promise<void>((resolve) => {
    releaseReverse = resolve;
  });

  await page.route('**/api/geo/reverse*', async (route) => {
    markReverseRequested();
    await reverseGate;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'gps-seattle',
        name: 'Seattle',
        country: 'United States',
        countryCode: 'US',
        latitude: 47.606,
        longitude: -122.332,
      }),
    });
  });

  await page.route('**/*air-quality-api.open-meteo.com/**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const latitude = Number(requestUrl.searchParams.get('latitude'));
    const isBengaluru = latitude > 12 && latitude < 14;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        latitude,
        longitude: Number(requestUrl.searchParams.get('longitude')),
        timezone: isBengaluru ? 'Asia/Kolkata' : 'UTC',
        current: {
          time: new Date().toISOString().slice(0, 16),
          pm2_5: isBengaluru ? 18 : 120,
          pm10: isBengaluru ? 30 : 180,
          us_aqi: isBengaluru ? 63 : 190,
          nitrogen_dioxide: 20,
          sulphur_dioxide: 8,
          carbon_monoxide: 400,
          ozone: 35,
        },
        hourly: {
          time: hours,
          pm2_5: hours.map(() => (isBengaluru ? 18 : 120)),
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

    await onboarding.getByRole('button', { name: /Use my current location/i }).click();
    await reverseRequested;

    // Manually choose Bengaluru while reverse-geocoding is still in flight
    await onboarding.getByPlaceholder('Search Delhi, Mumbai, Bengaluru, Tokyo...').fill('Bengaluru');
    await onboarding.getByRole('button', { name: 'Bengaluru', exact: true }).click();
    await expect(onboarding).toBeHidden();

    const bengaluruCard = page.locator('article[aria-label="Current air quality observation for Bengaluru"]');
    await expect(bengaluruCard).toBeVisible();

    // Release delayed GPS reverse-geocoding response and wait past the 400 ms timer
    releaseReverse();
    await page.waitForTimeout(700);

    await expect(bengaluruCard).toBeVisible();
    await expect(page.locator('article[aria-label="Current air quality observation for Seattle"]')).toHaveCount(0);

    const savedCityRaw = await page.evaluate(() => localStorage.getItem('avir_selected_city_v1'));
    expect(savedCityRaw).not.toBeNull();
    expect(JSON.parse(savedCityRaw!).name).toBe('Bengaluru');
  } finally {
    markReverseRequested();
    releaseReverse();
    await context.close();
  }
});

test('dismissing onboarding modal while GPS detection is pending prevents delayed GPS selection', async ({ browser }) => {
  const context = await browser.newContext({
    geolocation: { latitude: 47.6062, longitude: -122.3321 },
    permissions: ['geolocation'],
  });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.clear());

  const hours = Array.from({ length: 24 }, (_, index) => {
    const date = new Date(Date.now() + index * 3_600_000);
    return date.toISOString().slice(0, 13) + ':00';
  });

  let markReverseRequested: () => void = () => {};
  const reverseRequested = new Promise<void>((resolve) => {
    markReverseRequested = resolve;
  });
  let releaseReverse: () => void = () => {};
  const reverseGate = new Promise<void>((resolve) => {
    releaseReverse = resolve;
  });

  await page.route('**/api/geo/reverse*', async (route) => {
    markReverseRequested();
    await reverseGate;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'gps-seattle',
        name: 'Seattle',
        country: 'United States',
        countryCode: 'US',
        latitude: 47.606,
        longitude: -122.332,
      }),
    });
  });

  await page.route('**/*air-quality-api.open-meteo.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        latitude: 28.6139,
        longitude: 77.209,
        timezone: 'Asia/Kolkata',
        current: {
          time: new Date().toISOString().slice(0, 16),
          pm2_5: 120,
          pm10: 180,
          us_aqi: 190,
          nitrogen_dioxide: 20,
          sulphur_dioxide: 8,
          carbon_monoxide: 400,
          ozone: 35,
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

    await onboarding.getByRole('button', { name: /Use my current location/i }).click();
    await reverseRequested;

    await onboarding.getByRole('button', { name: 'Dismiss location selection' }).click();
    await expect(onboarding).toBeHidden();

    releaseReverse();
    await page.waitForTimeout(700);

    await expect(page.locator('article[aria-label="Current air quality observation for Delhi-NCR"]')).toBeVisible();
    await expect(page.locator('article[aria-label="Current air quality observation for Seattle"]')).toHaveCount(0);
    const savedCityRaw = await page.evaluate(() => localStorage.getItem('avir_selected_city_v1'));
    expect(savedCityRaw).toBeNull();
  } finally {
    markReverseRequested();
    releaseReverse();
    await context.close();
  }
});

test('delayed previous-city telemetry resolves after switching to Bengaluru without overwriting Bengaluru measurements', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());

  const hours = Array.from({ length: 24 }, (_, index) => {
    const date = new Date(Date.now() + index * 3_600_000);
    return date.toISOString().slice(0, 13) + ':00';
  });

  let markDelhiRequested: () => void = () => {};
  const delhiRequested = new Promise<void>((resolve) => {
    markDelhiRequested = resolve;
  });
  let releaseDelhi: () => void = () => {};
  const delhiGate = new Promise<void>((resolve) => {
    releaseDelhi = resolve;
  });
  let releaseBengaluru: () => void = () => {};
  const bengaluruGate = new Promise<void>((resolve) => {
    releaseBengaluru = resolve;
  });

  await page.route('**/*air-quality-api.open-meteo.com/**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const latitude = Number(requestUrl.searchParams.get('latitude'));
    const isBengaluru = latitude > 12 && latitude < 14;
    if (isBengaluru) {
      await bengaluruGate;
    } else {
      markDelhiRequested();
      await delhiGate;
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
          pm2_5: isBengaluru ? 18 : 199,
          pm10: isBengaluru ? 30 : 280,
          us_aqi: isBengaluru ? 63 : 249,
          nitrogen_dioxide: 25,
          sulphur_dioxide: 10,
          carbon_monoxide: 500,
          ozone: 38,
        },
        hourly: {
          time: hours,
          pm2_5: hours.map(() => (isBengaluru ? 18 : 199)),
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
          temperature_2m: 25,
          relative_humidity_2m: 55,
          wind_speed_10m: 11,
          wind_direction_10m: 260,
        },
        hourly: {
          time: hours,
          boundary_layer_height: hours.map(() => 850),
          temperature_2m: hours.map(() => 25),
          relative_humidity_2m: hours.map(() => 55),
          wind_speed_10m: hours.map(() => 11),
          wind_direction_10m: hours.map(() => 260),
        },
      }),
    });
  });

  try {
    await page.goto('/');
    const onboarding = page.getByRole('dialog', { name: 'Explore the air around you.' });
    await expect(onboarding).toBeVisible();

    await delhiRequested;

    // Switch to Bengaluru while Delhi telemetry is pending, then release delayed Delhi response immediately
    await onboarding.getByPlaceholder('Search Delhi, Mumbai, Bengaluru, Tokyo...').fill('Bengaluru');
    await onboarding.getByRole('button', { name: 'Bengaluru', exact: true }).click();
    releaseDelhi();

    const bengaluruCard = page.locator('article[aria-label="Current air quality observation for Bengaluru"]');
    await expect(bengaluruCard).toBeVisible();
    await expect(bengaluruCard.locator('span.tabular-nums').first()).toHaveText('--');
    await expect(page.locator('#main-content > div[role="status"]')).toContainText(
      'Loading live air quality measurements for Bengaluru'
    );
    await expect(bengaluruCard).not.toContainText('249');
    await expect(bengaluruCard).not.toContainText('360');

    releaseBengaluru();
    await expect(page.locator('#main-content > div[role="status"]')).toContainText(
      'Air quality data updated for Bengaluru',
      { timeout: 20_000 }
    );
    await expect(bengaluruCard.locator('span.tabular-nums').first()).toHaveText('30');
    await expect(page.locator('#main-content > div[role="status"]')).toContainText('US EPA AQI: 63');
  } finally {
    markDelhiRequested();
    releaseDelhi();
    releaseBengaluru();
  }
});
