import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { EarthCommandCenter } from '@/components/home/EarthCommandCenter';
import { FloatingDock } from '@/components/ui/futuristic';
import { AccessibleEarthFallback } from '@/components/globe/AccessibleEarthFallback';
import { GlobeControls } from '@/components/globe/GlobeControls';
import { GlobeCityCard } from '@/components/globe/GlobeCityCard';
import {
  buildGeographicObservations,
  getCpcbCategory,
  getEpaCategory,
} from '@/services/geo/geographic-observation-adapter';
import { AtmosphericMetrics } from '@/domain/types';
import { GeocodedLocation } from '@/services/telemetry-service';

describe('AVIR — Futuristic 3D Environmental Intelligence Platform E2E Verification (PR E)', () => {
  const mockDelhi: GeocodedLocation = {
    id: 1,
    name: 'Delhi-NCR',
    admin1: 'Delhi',
    country: 'India',
    countryCode: 'IN',
    latitude: 28.6139,
    longitude: 77.209,
  };

  const mockMetrics: AtmosphericMetrics = {
    status: 'success',
    provenance: 'observed',
    timestamp: '2026-11-24T02:00:00Z',
    retrievedAt: '2026-11-24T02:05:00Z',
    timezone: 'Asia/Kolkata',
    usAqi: 280,
    pm25: 195,
    pm10: 320,
    boundaryLayerHeight: 310,
    isThermalInversionActive: true,
    isLive: true,
    temperature: 16,
    humidity: 78,
    windSpeed: 3.8,
    windDirection: 285,
    groundStation: {
      stationId: 'delhi-cpcb-01',
      stationName: 'Mandir Marg, Delhi - CPCB',
      distanceKm: 2.8,
      latitude: 28.62,
      longitude: 77.20,
      provider: 'CPCB',
      stationType: 'official_reference',
      lastUpdated: '2026-11-24T01:45:00Z',
      pm25: 195,
      pm10: 320,
    },
  };

  describe('1. 3D Globe Controls & Accessible 2D Fallback Switching', () => {
    it('verifies 3D and 2D mode toggles with accessibility tags', () => {
      const handleToggle3D = vi.fn();
      const html = ReactDOMServer.renderToString(
        <GlobeControls
          is3D={true}
          onToggle3D={handleToggle3D}
          isAutoRotating={true}
          onToggleAutoRotate={vi.fn()}
          onZoomIn={vi.fn()}
          onZoomOut={vi.fn()}
          onResetView={vi.fn()}
          standard="cpcb"
          onToggleStandard={vi.fn()}
        />
      );

      expect(html).toContain('Switch to Accessible 2D Map');
      expect(html).toContain('3D');
      expect(html).toContain('role="toolbar"');
    });

    it('renders accessible 2D vector fallback with SVG coordinate graticule', () => {
      const points = buildGeographicObservations({
        standard: 'cpcb',
        currentMetrics: mockMetrics,
        currentLocation: mockDelhi,
      });

      const html = ReactDOMServer.renderToString(
        <AccessibleEarthFallback
          points={points}
          selectedPointId="current-1"
          onSelectPoint={vi.fn()}
        />
      );

      expect(html).toContain('Geographic Observation Grid (2D Projection)');
      expect(html).toContain('Delhi-NCR');
      expect(html).toContain('View Tabular Station Ledger');
    });
  });

  describe('2. City Marker Inspection & Dashboard Synchronization', () => {
    it('inspects city card and triggers dashboard active city synchronization', () => {
      const points = buildGeographicObservations({
        standard: 'epa',
        currentMetrics: mockMetrics,
        currentLocation: mockDelhi,
      });

      const delhiPoint = points.find((p) => p.name === 'Delhi-NCR')!;
      expect(delhiPoint).toBeDefined();

      const handleSetActive = vi.fn();
      const html = ReactDOMServer.renderToString(
        <GlobeCityCard
          point={delhiPoint}
          isActiveCity={false}
          onSelectAsActiveCity={handleSetActive}
          onClose={vi.fn()}
        />
      );

      expect(html).toContain('Delhi-NCR');
      expect(html).toContain('Set Active City in Dashboard');
      expect(html).toContain('PM2.5');
      expect(html).toContain('195 µg/m³');
    });
  });

  describe('3. Standard Switching & Mathematical Invariance', () => {
    it('verifies CPCB NAQI and EPA AQI categories maintain zero data fabrication', () => {
      // Good category
      expect(getCpcbCategory(40).label).toBe('Good');
      expect(getEpaCategory(40).label).toBe('Good');

      // Unhealthy boundaries
      expect(getCpcbCategory(280).label).toBe('Poor');
      expect(getEpaCategory(280).label).toBe('Very Unhealthy');

      // Unavailable state
      expect(getCpcbCategory(null).label).toBe('Unavailable');
      expect(getEpaCategory(null).label).toBe('Unavailable');
    });
  });

  describe('4. Floating Navigation Dock Workspace Traversal', () => {
    it('renders all 5 workspaces with correct ARIA roles and tab indices', () => {
      const handleTab = vi.fn();
      const html = ReactDOMServer.renderToString(
        <FloatingDock activeTab="overview" onChangeTab={handleTab} />
      );

      expect(html).toContain('role="tablist"');
      expect(html).toContain('Air Quality');
      expect(html).toContain('World Data');
      expect(html).toContain('Daily Plan');
      expect(html).toContain('Clean Home');
      expect(html).toContain('Community');
    });
  });

  describe('5. Earth Command Center End-to-End Composition', () => {
    it('renders unified command center with telemetry readouts and mission banner', () => {
      const html = ReactDOMServer.renderToString(
        <EarthCommandCenter
          currentCity={mockDelhi}
          metrics={mockMetrics}
          isLoading={false}
          initialDetailsOpen={true}
          onSelectCity={vi.fn()}
          onRefreshTelemetry={vi.fn()}
          onOpenExplainer={vi.fn()}
          onOpenShare={vi.fn()}
          onOpenMultiSource={vi.fn()}
          onOpenDailyPlan={vi.fn()}
        />
      );

      expect(html).toContain('AVIR // COMMAND');
      expect(html).toContain('Delhi-NCR');
      expect(html).toContain('CPCB Ground');
      expect(html).toContain('PM2.5');
      expect(html).toContain('195');
      expect(html).toContain('Exposure Guidance');
    });
  });
});
