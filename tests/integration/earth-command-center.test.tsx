import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { EarthCommandCenter } from '@/components/home/EarthCommandCenter';
import { WorldDataExplorer } from '@/components/WorldDataExplorer';
import { AtmosphericMetrics } from '@/domain/types';
import { GeocodedLocation } from '@/services/telemetry-service';

describe('Earth Command Center & World Data Redesign (PR C)', () => {
  const mockCity: GeocodedLocation = {
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
    windDirection: 290,
    groundStation: {
      stationId: 'delhi-cpcb-01',
      stationName: 'Mandir Marg, Delhi - CPCB',
      distanceKm: 3.2,
      latitude: 28.62,
      longitude: 77.20,
      provider: 'CPCB',
      stationType: 'official_reference',
      lastUpdated: '2026-11-23T09:45:00Z',
      pm25: 185,
      pm10: 310,
    },
  };

  describe('EarthCommandCenter Component', () => {
    it('renders mission header, active coordinates, and CPCB status', () => {
      const html = ReactDOMServer.renderToString(
        <EarthCommandCenter
          currentCity={mockCity}
          metrics={mockMetrics}
          isLoading={false}
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
      expect(html).toContain('28.6139° N');
      expect(html).toContain('77.2090° E');
      expect(html).toContain('GROUND STATION');
    });

    it('renders pollutant telemetry readouts and exposure guidance', () => {
      const html = ReactDOMServer.renderToString(
        <EarthCommandCenter
          currentCity={mockCity}
          metrics={mockMetrics}
          isLoading={false}
          onSelectCity={vi.fn()}
          onRefreshTelemetry={vi.fn()}
          onOpenExplainer={vi.fn()}
          onOpenShare={vi.fn()}
          onOpenMultiSource={vi.fn()}
          onOpenDailyPlan={vi.fn()}
        />
      );

      expect(html).toContain('PM2.5');
      expect(html).toContain('185');
      expect(html).toContain('PM10');
      expect(html).toContain('310');
      expect(html).toContain('Exposure Guidance');
      expect(html).toContain('Open Daily Plan Workspace');
      expect(html).toContain('3D ORBITAL TELEMETRY');
    });
  });

  describe('WorldDataExplorer with 3D Globe Mode', () => {
    it('renders view mode toggles including 3D globe view', () => {
      const html = ReactDOMServer.renderToString(
        <WorldDataExplorer
          onSelectCity={vi.fn()}
          activeCityName="Delhi-NCR"
        />
      );

      expect(html).toContain('Worldwide Modeled Telemetry');
      expect(html).toContain('Switch to grid card view');
      expect(html).toContain('Switch to ranked table view');
      expect(html).toContain('Switch to 3D earth globe view');
    });
  });
});
