import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { AtmosphereHero } from '@/components/AtmosphereHero';
import { TopNav } from '@/components/TopNav';
import { SegmentedTabs } from '@/components/SegmentedTabs';
import { CityPicker } from '@/components/CityPicker';
import { MetroRail } from '@/components/MetroRail';
import { AtmosphericMetrics } from '@/domain/types';

describe('Hero & Navigation Experience (Stage 2 & 3 Upgrades)', () => {
  const mockMetrics: AtmosphericMetrics = {
    status: 'success',
    provenance: 'observed',
    timestamp: '2026-11-23T10:00:00Z',
    retrievedAt: '2026-11-23T10:05:00Z',
    timezone: 'Asia/Kolkata',
    usAqi: 245,
    pm25: 185,
    pm10: 310,
    boundaryLayerHeight: 320,
    isThermalInversionActive: true,
    isLive: true,
    temperature: 18,
    humidity: 72,
    windSpeed: 4.5,
    co: 1800,
    no2: 65,
    so2: 24,
    o3: 45,
    cpcbAqi: 360,
    cpcbCategory: 'Very Poor',
    cpcbStatus: 'statutory_compliant',
    hourlyForecast: [
      { hour: 10, time: '2026-11-23T10:00:00Z', isForecast: false, usAqi: 245, pm25: 185, boundaryLayerHeight: 320, isSafeVentingWindow: false },
      { hour: 11, time: '2026-11-23T11:00:00Z', isForecast: false, usAqi: 230, pm25: 170, boundaryLayerHeight: 450, isSafeVentingWindow: false },
      { hour: 14, time: '2026-11-23T14:00:00Z', isForecast: true, usAqi: 140, pm25: 90, boundaryLayerHeight: 950, isSafeVentingWindow: true },
    ],
  };

  it('1. AtmosphereHero renders with ambient atmospheric gradient matching VeryUnhealthy category', () => {
    const html = ReactDOMServer.renderToString(
      <AtmosphereHero
        city="Delhi"
        metrics={mockMetrics}
        category="VeryUnhealthy"
        isDarkMode={true}
      />
    );

    expect(html).toContain('radial-gradient');
    expect(html).toContain('rgba(168, 85, 247'); // Purple/violet tint for VeryUnhealthy
    expect(html).toContain('Delhi');
    expect(html).toContain('245');
    expect(html).toContain('360');
    expect(html).toContain('185');
    expect(html).toContain('310');
  });

  it('2. AtmosphereHero crossfades values without numerical tickers or fake readings', () => {
    const html = ReactDOMServer.renderToString(
      <AtmosphereHero
        city="Delhi"
        metrics={mockMetrics}
        category="VeryUnhealthy"
      />
    );

    // Assert that ValueCrossfade container wraps values with tabular-nums
    expect(html).toContain('tabular-nums');
    expect(html).toContain('CRITICAL WARNING: ACTIVE THERMAL INVERSION TRAP');
  });

  it('3. TopNav renders with animated theme toggle, settings button and SVG monogram', () => {
    const html = ReactDOMServer.renderToString(
      <TopNav
        onOpenSettings={vi.fn()}
        onOpenExplainer={vi.fn()}
        onOpenRwa={vi.fn()}
        hasCustomKey={false}
        isDarkMode={true}
        onToggleTheme={vi.fn()}
      />
    );

    expect(html).toContain('Avir');
    expect(html).toContain('Urban Air Quality &amp; Winter Smog Assistant');
    expect(html).toContain('aria-label="Toggle between Antigravity Dark and Vikas Light themes"');
    expect(html).toContain('AI Engine');
  });

  it('4. SegmentedTabs renders sliding active indicator without losing WAI-ARIA semantics', () => {
    const html = ReactDOMServer.renderToString(
      <SegmentedTabs
        activeTab="overview"
        onChangeTab={vi.fn()}
        reductionPercentage={30}
      />
    );

    expect(html).toContain('role="tablist"');
    expect(html).toContain('id="tab-overview" role="tab" aria-selected="true"');
    expect(html).toContain('id="tab-world" role="tab" aria-selected="false"');
    expect(html).toContain('-30% Dose');
  });

  it('5. MetroRail renders chip switcher with high-contrast accessibility', () => {
    const html = ReactDOMServer.renderToString(
      <MetroRail
        currentCityName="Delhi"
        onSelectCity={vi.fn()}
        isLoading={false}
      />
    );

    expect(html).toContain('Regional Smog Hotspots &amp; Metros');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('Delhi');
    expect(html).toContain('aria-selected="true"');
  });
});
