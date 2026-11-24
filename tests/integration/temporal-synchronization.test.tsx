import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { EarthCommandCenter } from '@/components/home/EarthCommandCenter';
import { DiurnalForecastTimeline } from '@/components/DiurnalForecastTimeline';
import { AtmosphericMetrics, HourlyAtmosphericPoint } from '@/domain/types';
import { GeocodedLocation } from '@/services/telemetry-service';

describe('Canonical Temporal State & Timezone Synchronization', () => {
  const mockCity: GeocodedLocation = {
    id: 1,
    name: 'Bengaluru',
    admin1: 'Karnataka',
    country: 'India',
    countryCode: 'IN',
    latitude: 12.9716,
    longitude: 77.5946,
  };

  const mockHourlyForecast: HourlyAtmosphericPoint[] = [
    {
      time: '2026-11-24T10:00:00+05:30',
      hour: 10,
      pm25: 18,
      pm10: 25,
      usAqi: 63,
      boundaryLayerHeight: 850,
      isForecast: false,
      validAtUtc: '2026-11-24T04:30:00Z',
      timezone: 'Asia/Kolkata',
      localDisplayTime: '10:00 AM',
    },
    {
      time: '2026-11-24T14:00:00+05:30',
      hour: 14,
      pm25: 35,
      pm10: 50,
      usAqi: 99,
      boundaryLayerHeight: 1650,
      isForecast: true,
      validAtUtc: '2026-11-24T08:30:00Z',
      timezone: 'Asia/Kolkata',
      localDisplayTime: '02:00 PM',
    },
    {
      time: '2026-11-24T22:00:00+05:30',
      hour: 22,
      pm25: 85,
      pm10: 120,
      usAqi: 166,
      boundaryLayerHeight: 180, // Inversion trap
      isForecast: true,
      validAtUtc: '2026-11-24T16:30:00Z',
      timezone: 'Asia/Kolkata',
      localDisplayTime: '10:00 PM',
    },
  ];

  const mockMetrics: AtmosphericMetrics = {
    status: 'success',
    provenance: 'observed',
    timestamp: '2026-11-24T04:30:00Z',
    retrievedAt: '2026-11-24T04:35:00Z',
    timezone: 'Asia/Kolkata',
    cpcbAqi: 63,
    usAqi: 63,
    pm25: 18,
    pm10: 25,
    boundaryLayerHeight: 850,
    isThermalInversionActive: false,
    isLive: true,
    temperature: 24,
    humidity: 55,
    windSpeed: 10,
    windDirection: 180,
    hourlyForecast: mockHourlyForecast,
  };

  it('EarthCommandCenter renders live observation by default with CPCB standard', () => {
    const html = ReactDOMServer.renderToString(
      <EarthCommandCenter
        currentCity={mockCity}
        metrics={mockMetrics}
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

    expect(html).toContain('Bengaluru');
    expect(html).toContain('63'); // Live CPCB NAQI
    expect(html).not.toContain('DIURNAL FORECAST');
  });

  it('EarthCommandCenter reflects selected temporal forecast slice when scrubbing future hours', () => {
    const forecastPoint = mockHourlyForecast[1]; // 14:00 forecast
    const html = ReactDOMServer.renderToString(
      <EarthCommandCenter
        currentCity={mockCity}
        metrics={mockMetrics}
        isLoading={false}
        selectedTemporalPoint={forecastPoint}
        themeMode="dark"
        onSelectCity={vi.fn()}
        onRefreshTelemetry={vi.fn()}
        onOpenExplainer={vi.fn()}
        onOpenShare={vi.fn()}
        onOpenMultiSource={vi.fn()}
        onOpenDailyPlan={vi.fn()}
        onSnapToNow={vi.fn()}
      />
    );

    expect(html).toContain('DIURNAL FORECAST: 02:00 PM');
    expect(html).toContain('SNAP TO NOW');
    expect(html).toContain('Forecast for 02:00 PM');
  });

  it('DiurnalForecastTimeline renders and synchronizes with given selectedValidAtUtc', () => {
    const onSelectTimePoint = vi.fn();
    const onSnapToNow = vi.fn();

    const html = ReactDOMServer.renderToString(
      <DiurnalForecastTimeline
        hourlyForecast={mockHourlyForecast}
        cityName="Bengaluru"
        currentHour={10}
        selectedValidAtUtc="2026-11-24T08:30:00Z"
        onSelectTimePoint={onSelectTimePoint}
        onSnapToNow={onSnapToNow}
      />
    );

    expect(html).toContain('DIURNAL TIMELINE');
    expect(html).toContain('02:00 PM');
    expect(html).toContain('[FORECAST]');
    expect(html).toContain('NOW');
  });
});
