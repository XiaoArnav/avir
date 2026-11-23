import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { DiurnalForecastTimeline } from '@/components/DiurnalForecastTimeline';
import { WindDispersionVisualizer } from '@/components/WindDispersionVisualizer';
import { HourlyAtmosphericPoint } from '@/domain/types';

describe('AVIR Step 19: Scientific Data Visualizations & Diurnal Trend (UX15, UX16, UX17, UX18, UX19, UX20, UX21)', () => {
  const mockHourlyForecast: HourlyAtmosphericPoint[] = [
    {
      time: '2026-11-23T08:00:00Z',
      hour: 8,
      usAqi: 210,
      pm25: 140.0,
      boundaryLayerHeight: 180,
      isForecast: false,
      isModel: false,
      localDisplayTime: '08:00',
      localDisplayDate: '23 Nov',
    },
    {
      time: '2026-11-23T09:00:00Z',
      hour: 9,
      usAqi: 190,
      pm25: 125.0,
      boundaryLayerHeight: 250,
      isForecast: false,
      isModel: true,
      localDisplayTime: '09:00',
      localDisplayDate: '23 Nov',
    },
    {
      time: '2026-11-23T10:00:00Z',
      hour: 10,
      usAqi: null, // Data gap
      pm25: null,
      boundaryLayerHeight: 350,
      isForecast: true,
      isModel: true,
      localDisplayTime: '10:00',
      localDisplayDate: '23 Nov',
    },
    {
      time: '2026-11-23T11:00:00Z',
      hour: 11,
      usAqi: 110,
      pm25: 65.0,
      boundaryLayerHeight: 600,
      isForecast: true,
      isModel: true,
      localDisplayTime: '11:00',
      localDisplayDate: '23 Nov',
    },
    {
      time: '2026-11-23T12:00:00Z',
      hour: 12,
      usAqi: 95,
      pm25: 50.0,
      boundaryLayerHeight: 750,
      isForecast: true,
      isModel: true,
      localDisplayTime: '12:00',
      localDisplayDate: '23 Nov',
    },
    {
      time: '2026-11-23T13:00:00Z',
      hour: 13,
      usAqi: 85,
      pm25: 42.0,
      boundaryLayerHeight: 820,
      isForecast: true,
      isModel: true,
      localDisplayTime: '13:00',
      localDisplayDate: '23 Nov',
    },
  ];

  it('1. DiurnalForecastTimeline renders continuous SVG trajectory with distinct observation and forecast styles', () => {
    const html = ReactDOMServer.renderToString(
      <DiurnalForecastTimeline
        hourlyForecast={mockHourlyForecast}
        cityName="Delhi"
      />
    );

    expect(html).toContain('<svg');
    expect(html).toContain('role="img"');
    expect(html).toContain('24-Hour Diurnal Trend');
    expect(html).toContain('stroke-dasharray="4 3"'); // Forecast dashed line
  });

  it('2. DiurnalForecastTimeline breaks paths across missing data gaps without fabricating values', () => {
    const html = ReactDOMServer.renderToString(
      <DiurnalForecastTimeline
        hourlyForecast={mockHourlyForecast}
        cityName="Delhi"
      />
    );

    // Verifies segmented paths were created (trajectory-segment-0 and trajectory-segment-1 around the null hour 10)
    expect(html).toContain('trajectory-segment-0');
    expect(html).toContain('trajectory-segment-1');
  });

  it('3. DiurnalForecastTimeline features Metric Mode selector between PM2.5 mass and US AQI index', () => {
    const html = ReactDOMServer.renderToString(
      <DiurnalForecastTimeline
        hourlyForecast={mockHourlyForecast}
        cityName="Delhi"
      />
    );

    expect(html).toContain('PM2.5 (µg/m³)');
    expect(html).toContain('US EPA AQI');
  });

  it('4. DiurnalForecastTimeline renders accessible data table button and table structure', () => {
    const html = ReactDOMServer.renderToString(
      <DiurnalForecastTimeline
        hourlyForecast={mockHourlyForecast}
        cityName="Delhi"
      />
    );

    expect(html).toContain('Toggle accessible tabular data');
  });

  it('5. WindDispersionVisualizer treats missing wind telemetry as unavailable without fabricating fallback 5 km/h', () => {
    const html = ReactDOMServer.renderToString(
      <WindDispersionVisualizer
        windSpeed={null}
        windDirection={null}
        boundaryLayerHeight={null}
        isThermalInversion={false}
      />
    );

    expect(html).toContain('Wind Telemetry Unavailable');
    expect(html).toContain('Zero synthetic velocity substituted');
    expect(html).not.toContain('5 km/h');
  });

  it('6. WindDispersionVisualizer with valid wind explicitly notes illustrative dispersion model status', () => {
    const html = ReactDOMServer.renderToString(
      <WindDispersionVisualizer
        windSpeed={12.4}
        windDirection={290}
        boundaryLayerHeight={320}
        isThermalInversion={false}
      />
    );

    expect(html).toContain('12.4 km/h');
    expect(html).toContain('WNW');
    expect(html).toContain('*Illustrative dispersion model');
  });

  it('7. DiurnalForecastTimeline uses scientific "Lower Smog" instead of unqualified "Safe to go outside"', () => {
    const html = ReactDOMServer.renderToString(
      <DiurnalForecastTimeline
        hourlyForecast={mockHourlyForecast}
        cityName="Delhi"
      />
    );

    expect(html).toContain('Lower Smog');
    expect(html).not.toContain('Safe to go outside');
  });
});
