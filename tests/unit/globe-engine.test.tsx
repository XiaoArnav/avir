import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import {
  AccessibleEarthFallback,
  GlobeControls,
  GlobeCityCard,
  AvirGlobe,
} from '@/components/globe';
import { GeographicObservationPoint } from '@/services/geo/geographic-observation-adapter';

describe('3D Earth Engine & Globe Controls (PR B)', () => {
  const mockPoints: GeographicObservationPoint[] = [
    {
      id: 'pt-delhi',
      name: 'Delhi-NCR',
      country: 'India',
      countryCode: 'IN',
      region: 'Asia',
      latitude: 28.6139,
      longitude: 77.209,
      aqi: 280,
      cpcbAqi: 280,
      usAqi: 280,
      pm25: 195,
      pm10: 320,
      category: 'unhealthy',
      categoryLabel: 'Poor',
      categoryColor: '#F97316',
      primaryPollutant: 'PM2.5',
      provenance: 'observed',
      source: 'CPCB Ground Feed',
      timestamp: '2026-11-23T12:00:00Z',
      isOfficialGround: true,
    },
    {
      id: 'pt-tokyo',
      name: 'Tokyo',
      country: 'Japan',
      countryCode: 'JP',
      region: 'Asia',
      latitude: 35.6762,
      longitude: 139.6503,
      aqi: 42,
      cpcbAqi: 42,
      usAqi: 42,
      pm25: 10,
      pm10: 18,
      category: 'good',
      categoryLabel: 'Good',
      categoryColor: '#10B981',
      primaryPollutant: 'PM2.5',
      provenance: 'modeled_forecast',
      source: 'Open-Meteo',
      timestamp: '2026-11-23T12:00:00Z',
      isOfficialGround: false,
    },
  ];

  describe('AccessibleEarthFallback', () => {
    it('renders 2D projection with stations count and table ledger', () => {
      const handleSelect = vi.fn();
      const html = ReactDOMServer.renderToString(
        <AccessibleEarthFallback
          points={mockPoints}
          selectedPointId="pt-delhi"
          onSelectPoint={handleSelect}
        />
      );

      expect(html).toContain('Geographic Observation Grid (2D Projection)');
      expect(html).toContain('STATIONS MONITORED');
      expect(html).toContain('2');
      expect(html).toContain('Delhi-NCR');
      expect(html).toContain('Tokyo');
      expect(html).toContain('280');
      expect(html).toContain('42');
      expect(html).toContain('View Tabular Station Ledger');
    });
  });

  describe('GlobeControls', () => {
    it('renders 3D/2D toggle, zoom controls, and standard selector', () => {
      const html = ReactDOMServer.renderToString(
        <GlobeControls
          is3D={true}
          onToggle3D={vi.fn()}
          isAutoRotating={true}
          onToggleAutoRotate={vi.fn()}
          onZoomIn={vi.fn()}
          onZoomOut={vi.fn()}
          onResetView={vi.fn()}
          standard="cpcb"
          onToggleStandard={vi.fn()}
        />
      );

      expect(html).toContain('role="toolbar"');
      expect(html).toContain('Switch to Accessible 2D Map');
      expect(html).toContain('Pause rotation');
      expect(html).toContain('Zoom In');
      expect(html).toContain('Zoom Out');
      expect(html).toContain('CPCB');
    });
  });

  describe('GlobeCityCard', () => {
    it('renders city information and allows dashboard synchronization', () => {
      const handleSelectActive = vi.fn();
      const handleClose = vi.fn();

      const html = ReactDOMServer.renderToString(
        <GlobeCityCard
          point={mockPoints[0]}
          isActiveCity={false}
          onSelectAsActiveCity={handleSelectActive}
          onClose={handleClose}
        />
      );

      expect(html).toContain('Delhi-NCR');
      expect(html).toContain('280');
      expect(html).toContain('Poor');
      expect(html).toContain('195 µg/m³');
      expect(html).toContain('320 µg/m³');
      expect(html).toContain('Set Active City in Dashboard');
    });
  });

  describe('AvirGlobe Container', () => {
    it('renders globe container with atmospheric glow and HUD watermark', () => {
      const html = ReactDOMServer.renderToString(
        <AvirGlobe
          points={mockPoints}
          selectedPointId="pt-delhi"
          activeCityName="Delhi-NCR"
          onSelectPoint={vi.fn()}
        />
      );

      expect(html).toContain('3D ORBITAL TELEMETRY');
      expect(html).toContain('bg-radial-atmosphere');
    });
  });
});
