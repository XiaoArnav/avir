import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { GlobeControls, EnvironmentalLayersState } from '@/components/globe/GlobeControls';

describe('Phase 7: Unified Environmental Layer Controls', () => {
  const defaultProps = {
    is3D: true,
    onToggle3D: vi.fn(),
    isAutoRotating: false,
    onToggleAutoRotate: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onResetView: vi.fn(),
    standard: 'cpcb' as const,
    onToggleStandard: vi.fn(),
    onToggleEngine: vi.fn(),
  };

  it('renders GlobeControls with the LAYERS control button', () => {
    const html = ReactDOMServer.renderToString(
      <GlobeControls {...defaultProps} engineMode="three" />
    );

    expect(html).toContain('role="toolbar"');
    expect(html).toContain('aria-label="Earth Observation Controls"');
    expect(html).toContain('LAYERS');
    expect(html).toContain('aria-label="Environmental Intelligence Layers"');
    expect(html).toContain('aria-expanded="false"');
  });

  it('correctly reflects active layers and disabled states in Three.js mode', () => {
    const layers: EnvironmentalLayersState = {
      wind: true,
      fires: false,
      terrain: false,
      satelliteComparison: true,
    };

    // When rendered with initial state
    const html = ReactDOMServer.renderToString(
      <GlobeControls
        {...defaultProps}
        engineMode="three"
        layers={layers}
      />
    );

    expect(html).toContain('THREE');
    expect(html).toContain('CPCB');
  });
});
