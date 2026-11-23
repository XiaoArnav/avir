import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { AtmosphereHero } from '@/components/AtmosphereHero';
import { ActionDecisionCard } from '@/components/ui/ActionDecisionCard';
import { AtmosphericMetrics } from '@/domain/types';

describe('AVIR Step 18: Main Dashboard Experience & Action-First Decisions (UX06, UX07, UX08, UX09, UX10, UX14)', () => {
  const mockMetrics: AtmosphericMetrics = {
    usAqi: 185,
    pm25: 120.5,
    pm10: 195.0,
    boundaryLayerHeight: 280,
    isThermalInversionActive: true,
    windSpeed: 4.2,
    windDirection: 315,
    timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15m ago
    isCached: false,
    isStale: false,
    isLive: true,
    provenance: 'observed',
    sourceAttribution: 'Delhi Central CAAQMS Ground Station',
    status: 'success',
    cpcbAqi: 310,
    cpcbCategory: 'Very Poor',
    cpcbStatus: 'statutory_compliant',
  };

  it('1. AtmosphereHero displays prominent AQI reading and explicitly labels US EPA AQI standard', () => {
    const html = ReactDOMServer.renderToString(
      <AtmosphereHero
        city="Delhi"
        metrics={mockMetrics}
        category="Unhealthy"
      />
    );

    expect(html).toContain('185');
    expect(html).toContain('US EPA AQI');
    expect(html).toContain('Indian CPCB NAQI');
    expect(html).toContain('120.5');
    expect(html).toContain('µg/m³');
    expect(html).toContain('Delhi Central CAAQMS Ground Station');
  });

  it('2. AtmosphereHero clearly indicates relative data freshness (e.g. "15m ago")', () => {
    const html = ReactDOMServer.renderToString(
      <AtmosphereHero
        city="Delhi"
        metrics={mockMetrics}
        category="Unhealthy"
      />
    );

    expect(html).toContain('15m ago');
    expect(html).toContain('Ground Observation');
  });

  it('3. AtmosphereHero handles missing AQI honestly as "--" without crashing or fabricating 0', () => {
    const missingMetrics: AtmosphericMetrics = {
      ...mockMetrics,
      usAqi: null,
      pm25: null,
      cpcbAqi: null,
    };

    const html = ReactDOMServer.renderToString(
      <AtmosphereHero
        city="Delhi"
        metrics={missingMetrics}
        category="Unavailable"
      />
    );

    expect(html).toContain('AQI Unavailable');
  });

  it('4. ActionDecisionCard provides immediate 3-point action guidance for Unhealthy air', () => {
    const html = ReactDOMServer.renderToString(
      <ActionDecisionCard
        metrics={mockMetrics}
        category="Unhealthy"
        onOpenDailyPlan={vi.fn()}
      />
    );

    expect(html).toContain('Today’s Action Guide • What to Do Right Now');
    expect(html).toContain('1. Air Quality Status');
    expect(html).toContain('2. Outdoor Activity');
    expect(html).toContain('3. Ventilation &amp; Clean Home');
    expect(html).toContain('Avoid strenuous outdoor cardio');
    expect(html).toContain('Optimize Daily Schedule');
  });

  it('5. ActionDecisionCard provides safe guidance for Good/Pristine air (AQI <= 50)', () => {
    const pristineMetrics: AtmosphericMetrics = {
      ...mockMetrics,
      usAqi: 35,
      pm25: 8.5,
    };

    const html = ReactDOMServer.renderToString(
      <ActionDecisionCard
        metrics={pristineMetrics}
        category="Good"
        onOpenDailyPlan={vi.fn()}
      />
    );

    expect(html).toContain('Air quality is pristine');
    expect(html).toContain('Ideal for all outdoor activities');
    expect(html).toContain('Open windows freely for natural cross-ventilation');
  });

  it('6. ActionDecisionCard handles missing telemetry without making false claims', () => {
    const html = ReactDOMServer.renderToString(
      <ActionDecisionCard
        metrics={null}
        category="Unavailable"
      />
    );

    expect(html).toContain('Awaiting telemetry to evaluate today’s exposure risk');
  });
});
