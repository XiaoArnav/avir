import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { DiurnalForecastTimeline } from '@/components/DiurnalForecastTimeline';
import { ActionDecisionCard } from '@/components/ui/ActionDecisionCard';
import { RoutineBuilder } from '@/components/RoutineBuilder';
import { AccessibleDialog } from '@/components/ui/AccessibleDialog';
import { HourlyAtmosphericPoint, AtmosphericMetrics } from '@/domain/types';

describe('Charts & Interactive Features (Stage 4 & 5 Upgrades)', () => {
  const mockHourlyForecast: HourlyAtmosphericPoint[] = [
    { hour: 0, usAqi: 220, pm25: 160, boundaryLayerHeight: 280, isForecast: false },
    { hour: 1, usAqi: 240, pm25: 175, boundaryLayerHeight: 260, isForecast: false },
    { hour: 2, usAqi: 250, pm25: 185, boundaryLayerHeight: 250, isForecast: false },
    { hour: 12, usAqi: 120, pm25: 65, boundaryLayerHeight: 850, isForecast: true, isSafeVentingWindow: true },
    { hour: 13, usAqi: 110, pm25: 55, boundaryLayerHeight: 920, isForecast: true, isSafeVentingWindow: true },
  ];

  const mockMetrics: AtmosphericMetrics = {
    status: 'success',
    provenance: 'observed',
    timestamp: '2026-11-23T10:00:00Z',
    retrievedAt: '2026-11-23T10:05:00Z',
    timezone: 'Asia/Kolkata',
    usAqi: 185,
    pm25: 120.5,
    pm10: 210,
    boundaryLayerHeight: 450,
    isThermalInversionActive: false,
    isLive: true,
  };

  it('1. DiurnalForecastTimeline renders trajectory chart with metric mode switcher and active point summary', () => {
    const html = ReactDOMServer.renderToString(
      <DiurnalForecastTimeline
        hourlyForecast={mockHourlyForecast}
        cityName="Delhi"
        currentHour={1}
      />
    );

    expect(html).toContain('PM2.5 (µg/m³)');
    expect(html).toContain('US EPA AQI');
    expect(html).toContain('24-Hour Diurnal Trend');
    expect(html).toContain('Toggle accessible tabular data');
    expect(html).toContain('Station Observation');
    expect(html).toContain('Max:');
  });

  it('2. ActionDecisionCard renders 3-point action guide with interactive schedule CTA', () => {
    const handleOpenPlan = vi.fn();
    const html = ReactDOMServer.renderToString(
      <ActionDecisionCard
        metrics={mockMetrics}
        category="Unhealthy"
        onOpenDailyPlan={handleOpenPlan}
      />
    );

    expect(html).toContain('Today’s Action Guide • What to Do Right Now');
    expect(html).toContain('1. Air Quality Status');
    expect(html).toContain('2. Outdoor Activity');
    expect(html).toContain('3. Ventilation &amp; Clean Home');
    expect(html).toContain('Optimize Daily Schedule');
  });

  it('3. RoutineBuilder renders activities with motion layout wrapper and optimization button', () => {
    const html = ReactDOMServer.renderToString(
      <RoutineBuilder
        currentPm25={120.5}
        onOptimizeClick={vi.fn()}
      />
    );

    expect(html).toContain('Personal Routine Builder');
    expect(html).toContain('Add Activity');
    expect(html).toContain('Optimize with Forecast');
    expect(html).toContain('role="group"');
    expect(html).toContain('Morning Jog / Outdoor Exercise');
  });

  it('4. AccessibleDialog renders accessible dialog with smooth motion structure and focus trap setup', () => {
    const html = ReactDOMServer.renderToString(
      <AccessibleDialog
        isOpen={true}
        onClose={vi.fn()}
        title="Interactive Exposure Details"
        description="Verify multi-compartment ventilation dynamics"
      >
        <p>Modal body with mathematical dose equations</p>
      </AccessibleDialog>
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('Interactive Exposure Details');
    expect(html).toContain('Close dialog');
  });
});
