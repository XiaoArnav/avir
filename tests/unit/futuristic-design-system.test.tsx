import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import {
  HoloPanel,
  FuturisticBadge,
  TelemetryReadout,
  MissionHeader,
  FloatingDock,
} from '@/components/ui/futuristic';

describe('Futuristic Design System — Stage A Primitives', () => {
  describe('HoloPanel', () => {
    it('renders with title, badge, and children', () => {
      const html = ReactDOMServer.renderToString(
        <HoloPanel
          title="Atmospheric Core"
          badge={<span data-testid="test-badge">ACTIVE</span>}
        >
          <div data-testid="panel-content">Core content</div>
        </HoloPanel>
      );

      expect(html).toContain('Atmospheric Core');
      expect(html).toContain('ACTIVE');
      expect(html).toContain('Core content');
    });

    it('applies elevation classes and HUD corner brackets', () => {
      const html = ReactDOMServer.renderToString(
        <HoloPanel elevation="raised" brackets>
          <span>Elevated panel</span>
        </HoloPanel>
      );

      expect(html).toContain('holo-panel-elevated');
      expect(html).toContain('hud-corner-brackets');
    });

    it('renders as semantic section element', () => {
      const html = ReactDOMServer.renderToString(
        <HoloPanel as="section">
          <p>Section content</p>
        </HoloPanel>
      );

      expect(html).toContain('<section');
      expect(html).toContain('</section>');
    });
  });

  describe('FuturisticBadge', () => {
    it('renders label with appropriate styling', () => {
      const html = ReactDOMServer.renderToString(
        <FuturisticBadge label="STATION ACTIVE" variant="emerald" pulse />
      );
      expect(html).toContain('STATION ACTIVE');
      expect(html).toContain('text-emerald-700');
    });
  });

  describe('TelemetryReadout', () => {
    it('renders numerical value, unit, and provenance tag', () => {
      const html = ReactDOMServer.renderToString(
        <TelemetryReadout
          testId="pm25-readout"
          label="PM2.5"
          value={124.6}
          unit="µg/m³"
          provenance="official"
          uncertainty={4.2}
        />
      );

      expect(html).toContain('PM2.5');
      expect(html).toContain('125'); // Math.round(124.6)
      expect(html).toContain('µg/m³');
      expect(html).toContain('CPCB GROUND');
      expect(html).toContain('4.2');
    });

    it('gracefully renders fallback for null or missing values without fabricating data', () => {
      const html = ReactDOMServer.renderToString(
        <TelemetryReadout
          testId="null-readout"
          label="OZONE"
          value={null}
          unit="ppb"
          provenance="unavailable"
        />
      );

      expect(html).toContain('--');
      expect(html).toContain('NO FEED');
      expect(html).toContain('Sensor Offline');
    });
  });

  describe('MissionHeader', () => {
    it('displays location coordinates and allows standard toggle', () => {
      const handleToggle = vi.fn();
      const html = ReactDOMServer.renderToString(
        <MissionHeader
          cityName="New Delhi"
          latitude={28.6139}
          longitude={77.209}
          elevationMeters={216}
          hasOfficialGround
          stationName="Mandir Marg"
          standard="cpcb"
          onToggleStandard={handleToggle}
        />
      );

      expect(html).toContain('AVIR // COMMAND');
      expect(html).toContain('New Delhi');
      expect(html).toContain('28.6139° N');
      expect(html).toContain('77.2090° E');
      expect(html).toContain('CPCB NAQI');
      expect(html).toContain('EPA US');
      expect(html).toContain('ALT');
      expect(html).toContain('216');
    });
  });

  describe('FloatingDock', () => {
    it('renders all workspace tabs with role="tab" and aria-selected', () => {
      const handleChangeTab = vi.fn();
      const html = ReactDOMServer.renderToString(
        <FloatingDock activeTab="overview" onChangeTab={handleChangeTab} />
      );

      expect(html).toContain('role="tablist"');
      expect(html).toContain('Air Quality');
      expect(html).toContain('World Data');
      expect(html).toContain('Daily Plan');
      expect(html).toContain('Clean Home');
      expect(html).toContain('Community');
      expect(html).toContain('aria-selected="true"');
    });
  });
});
