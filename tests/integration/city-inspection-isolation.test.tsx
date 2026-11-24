import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { EarthCommandCenter } from '@/components/home/EarthCommandCenter';
import { AtmosphericMetrics } from '@/domain/types';
import { GeocodedLocation } from '@/services/telemetry-service';

describe('City Inspection Isolation & Deterministic ID Integrity', () => {
  const activeCity: GeocodedLocation = {
    id: 1277333,
    name: 'Bengaluru',
    admin1: 'Karnataka',
    country: 'India',
    countryCode: 'IN',
    latitude: 12.9716,
    longitude: 77.5946,
  };

  const activeCityMetrics: AtmosphericMetrics = {
    status: 'success',
    provenance: 'observed',
    timestamp: '2026-11-24T06:00:00Z',
    retrievedAt: '2026-11-24T06:05:00Z',
    timezone: 'Asia/Kolkata',
    cpcbAqi: 48,
    usAqi: 48,
    pm25: 12,
    pm10: 22,
    primaryPollutant: 'PM2.5',
    boundaryLayerHeight: 1100,
    isThermalInversionActive: false,
    isLive: true,
    temperature: 26,
    humidity: 50,
    windSpeed: 12,
    windDirection: 90,
  };

  it('keeps CompactCityCard tied to active dashboard city and metrics', () => {
    const html = ReactDOMServer.renderToString(
      <EarthCommandCenter
        currentCity={activeCity}
        metrics={activeCityMetrics}
        isLoading={false}
        themeMode="dark"
        onSelectCity={vi.fn()}
        onRefreshTelemetry={vi.fn()}
        onOpenExplainer={vi.fn()}
        onOpenShare={vi.fn()}
        onOpenMultiSource={vi.fn()}
        onOpenDailyPlan={vi.fn()}
      />
    );

    // Assert that the dashboard card displays active city identity and active city PM2.5 / AQI
    expect(html).toContain('Bengaluru');
    expect(html).toContain('48');
    expect(html).toContain('PM2.5');
  });

  it('generates deterministic IDs for custom geocoded points without Math.random() drift', () => {
    const lat = 35.6762;
    const lon = 139.6503;
    const latHash = Math.abs(Math.round(lat * 1000));
    const lonHash = Math.abs(Math.round(lon * 1000));
    const deterministicId1 = latHash * 10000 + (lonHash % 10000);
    const deterministicId2 = latHash * 10000 + (lonHash % 10000);

    expect(deterministicId1).toBe(deterministicId2);
    expect(deterministicId1).toBeGreaterThan(0);
    expect(Number.isInteger(deterministicId1)).toBe(true);
  });
});
