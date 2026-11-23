import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { RoutineBuilder } from '@/components/RoutineBuilder';
import { IAQStudio } from '@/components/IAQStudio';
import { RwaBulletinModal } from '@/components/RwaBulletinModal';
import { SettingsModal } from '@/components/SettingsModal';

describe('Workspaces & Supporting UI Redesign (PR D)', () => {
  describe('RoutineBuilder Workspace', () => {
    it('renders with elevated holographic HUD panel and corner brackets', () => {
      const html = ReactDOMServer.renderToString(
        <RoutineBuilder currentPm25={120} />
      );

      expect(html).toContain('holo-panel-elevated');
      expect(html).toContain('hud-corner-brackets');
      expect(html).toContain('Daily Schedule Builder');
      expect(html).toContain('Total Modeled Exposure');
    });
  });

  describe('IAQStudio Workspace', () => {
    it('renders with elevated holographic HUD panel and CADR presets', () => {
      const html = ReactDOMServer.renderToString(<IAQStudio />);

      expect(html).toContain('holo-panel-elevated');
      expect(html).toContain('hud-corner-brackets');
      expect(html).toContain('Air-Cleaner Sizing &amp; Particle Decay');
      expect(html).toContain('CFM');
    });
  });

  describe('RwaBulletinModal Community Advisory', () => {
    it('renders with holographic backdrop blur and HUD brackets', () => {
      const html = ReactDOMServer.renderToString(
        <RwaBulletinModal
          isOpen={true}
          onClose={vi.fn()}
          cityName="New Delhi"
          metrics={null}
        />
      );

      expect(html).toContain('hud-corner-brackets');
      expect(html).toContain('Community Air-Quality Advisory');
      expect(html).toContain('Resident Welfare Association');
    });
  });

  describe('SettingsModal AI Engine Controls', () => {
    it('renders with holographic styling, HUD brackets, and dual engine notice', () => {
      const html = ReactDOMServer.renderToString(
        <SettingsModal
          isOpen={true}
          onClose={vi.fn()}
          geminiApiKey=""
          onSaveKey={vi.fn()}
        />
      );

      expect(html).toContain('hud-corner-brackets');
      expect(html).toContain('Dual-Engine Safety');
      expect(html).toContain('Google Gemini API Key');
    });
  });
});
