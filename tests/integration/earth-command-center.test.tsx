import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { EarthCommandCenter } from '@/components/home/EarthCommandCenter';
import { WorldDataExplorer } from '@/components/WorldDataExplorer';
import { TopNav } from '@/components/TopNav';
import { ImpactScorecard } from '@/components/ImpactScorecard';
import { SegmentedTabs } from '@/components/SegmentedTabs';
import { AtmosphericMetrics, RecommendationPlan } from '@/domain/types';
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

    it('renders pollutant telemetry readouts and exposure guidance when drawer is open', () => {
      const html = ReactDOMServer.renderToString(
        <EarthCommandCenter
          currentCity={mockCity}
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

      expect(html).toContain('PM2.5');
      expect(html).toContain('185');
      expect(html).toContain('PM10');
      expect(html).toContain('310');
      expect(html).toContain('Exposure Guidance');
      expect(html).toContain('Open Daily Plan Workspace');
      expect(html).toContain('3D ORBITAL TELEMETRY');
    });

    it('keeps bottom metro gradient non-blocking so globe toolbar controls stay clickable', () => {
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

      expect(html).toContain('bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none');
      expect(html).toContain('pointer-events-auto max-w-full');
      expect(html).not.toContain('inset-0 w-full h-full z-0');
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
      expect(html).toContain('flex-wrap items-center gap-1.5');
    });
  });

  describe('Mobile Navigation, Header & ImpactScorecard Regression Checks', () => {
    it('TopNav keeps full ARIA label and responsive label for small mobile widths', () => {
      const html = ReactDOMServer.renderToString(
        <TopNav
          onOpenSettings={vi.fn()}
          onOpenExplainer={vi.fn()}
          onOpenRwa={vi.fn()}
          onOpenMultiSource={vi.fn()}
          hasCustomKey={false}
        />
      );

      expect(html).toContain('Inspect Atmospheric Data Sources and Quality');
      expect(html).toContain('>Sources<');
    });

    it('SegmentedTabs wraps full tab labels cleanly without truncating on mobile', () => {
      const html = ReactDOMServer.renderToString(
        <SegmentedTabs activeTab="overview" onChangeTab={vi.fn()} />
      );

      expect(html).toContain('flex-wrap sm:flex-nowrap');
      expect(html).toContain('Daily Plan');
      expect(html).not.toContain('class="relative z-10 truncate"');
    });

    it('ImpactScorecard displays placeholder em-dash when optional avoidedCigarettesMonthly is undefined', () => {
      const planWithoutCigs: RecommendationPlan = {
        city: 'Bengaluru',
        generatedAt: '2026-11-28T00:00:00.000Z',
        metrics: mockMetrics,
        category: 'Good',
        summaryAdvisory: 'Advisory',
        routineShifts: [],
        corsiRosenthalBox: {
          fanType: '20_inch_box_fan',
          filterType: 'MERV_13',
          numberOfFilters: 4,
          estimatedCADR_CFM: 450,
          estimatedCADR_M3H: 765,
          roomVolumeM3: 45,
          airChangesPerHour: 17,
          clearingHalfLifeMinutes: 2.4,
          estimatedCostINR: 3450,
        },
        impactMetrics: {
          totalInhaledBaselineUg: 50,
          totalInhaledOptimizedUg: 22,
          netAvoidedPM25Ug: 28,
          avoidedCigarettesMonthly: undefined,
          isImpactCalculated: true,
        },
      };

      const html = ReactDOMServer.renderToString(<ImpactScorecard plan={planWithoutCigs} />).replace(/<!-- -->/g, '');
      expect(html).toContain('28');
      expect(html).toContain('— <span');
      expect(html).toContain('cigs / mo');
    });
  });
});
