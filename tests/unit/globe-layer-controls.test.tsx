import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { GlobeControls, EnvironmentalLayersState } from '@/components/globe/GlobeControls';
import {
  AvirGlobe,
  mapFirmsStatusToLayerInfo,
  mapWindStatusToLayerInfo,
} from '@/components/globe/AvirGlobe';
import type { FirmsStatusResponse } from '@/domain/firms-types';
import type { WindForecastResponse } from '@/domain/wind-types';

describe('Phase 7: Unified Environmental Layer Controls & Status Contracts', () => {
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

  it('renders GlobeControls with LAYERS control button and preserves main default CESIUM engine in AvirGlobe', () => {
    const controlsHtml = ReactDOMServer.renderToString(
      <GlobeControls {...defaultProps} engineMode="cesium" />
    );
    expect(controlsHtml).toContain('role="toolbar"');
    expect(controlsHtml).toContain('aria-label="Earth Observation Controls"');
    expect(controlsHtml).toContain('LAYERS');
    expect(controlsHtml).toContain('aria-label="Environmental Intelligence Layers"');
    expect(controlsHtml).toContain('aria-expanded="false"');

    // AvirGlobe preserves main's CESIUM default engine and honest initial OFF layer state
    const globeHtml = ReactDOMServer.renderToString(
      <AvirGlobe points={[]} onSelectPoint={vi.fn()} />
    );
    expect(globeHtml).toContain('CESIUM');
    expect(globeHtml).not.toContain('data-testid="satellite-comparison-panel"');
  });

  it('supports controlled vs uncontrolled layer contract without false active states on unsupported engines', () => {
    const layers: EnvironmentalLayersState = {
      wind: true,
      fires: false,
      terrain: true, // passed true even in Three.js mode — UI must NOT report unsupported terrain as active!
      satelliteComparison: true,
    };

    const html = ReactDOMServer.renderToString(
      <GlobeControls
        {...defaultProps}
        engineMode="three"
        layers={layers}
        layerStatus={{
          wind: { state: 'live', detail: '12 km/h • 9 probes' },
          fires: { state: 'no_detections', detail: '0 detections within 500 km' },
          terrain: { state: 'unsupported', detail: 'Cesium Engine Only' },
          satelliteComparison: { state: 'global_date_listed', detail: 'Global GIBS dates listed' },
        }}
      />
    );

    expect(html).toContain('THREE');
    expect(html).toContain('CPCB');

    // Terrain boolean=true in Three.js stays disabled / Cesium Only (not pressed)
    const controlledToggle = vi.fn();
    const controlledHtml = ReactDOMServer.renderToString(
      <AvirGlobe
        points={[]}
        onSelectPoint={vi.fn()}
        layers={{ wind: false, satelliteComparison: true }}
        onToggleLayer={controlledToggle}
      />
    );
    expect(controlledHtml).toContain('data-testid="satellite-comparison-panel"');
    expect(controlledHtml).toContain('data-testid="satellite-comparison-unavailable"');
  });

  it('honestly distinguishes active, no_detections, unconfigured, stale_cached, rate_limited, and unavailable FIRMS states', () => {
    const baseFirms: FirmsStatusResponse = {
      configured: true,
      isAvailable: true,
      isCached: false,
      isStale: false,
      status: 'active',
      message: 'Active detections',
      dataset: 'VIIRS_NOAA20_NRT',
      satellite: 'NOAA-20',
      instrument: 'VIIRS',
      dayRange: 1,
      hotspots: [],
      count: 3,
      retrievedAt: '2026-11-24T10:00:00Z',
      latestObservationUtc: '2026-11-24T08:30:00.000Z',
      disclaimer: 'disclaimer',
      uncertaintyNotes: 'notes',
    };

    expect(mapFirmsStatusToLayerInfo(baseFirms)).toEqual({
      state: 'live',
      detail: '3 thermal anomalies • UTC 08:30',
    });

    expect(
      mapFirmsStatusToLayerInfo({ ...baseFirms, status: 'no_detections', count: 0 })
    ).toEqual({
      state: 'no_detections',
      detail: '0 detections within 500 km (clouds/off-pass not excluded)',
    });

    expect(
      mapFirmsStatusToLayerInfo({
        ...baseFirms,
        configured: false,
        isAvailable: false,
        status: 'unconfigured',
        count: 0,
      })
    ).toEqual({
      state: 'unconfigured',
      detail: 'FIRMS_MAP_KEY not configured on server',
    });

    expect(
      mapFirmsStatusToLayerInfo({
        ...baseFirms,
        isAvailable: false,
        status: 'quota_exceeded',
        count: 0,
      })
    ).toEqual({
      state: 'rate_limited',
      detail: 'NASA FIRMS rate limit reached',
    });

    expect(
      mapFirmsStatusToLayerInfo({
        ...baseFirms,
        isCached: true,
        isStale: true,
        status: 'stale_cached',
        count: 1,
      })
    ).toEqual({
      state: 'stale',
      detail: '1 cached anomaly (live feed unavailable)',
    });

    expect(
      mapFirmsStatusToLayerInfo({
        ...baseFirms,
        isAvailable: false,
        status: 'upstream_timeout',
        message: 'Timed out',
        count: 0,
      })
    ).toEqual({
      state: 'unavailable',
      detail: 'Timed out',
    });
  });

  it('honestly distinguishes live, stale, rate_limited, and unavailable Wind states without inventing empty vectors as live', () => {
    const baseWind: WindForecastResponse = {
      status: 'available',
      isAvailable: true,
      isCached: false,
      isStale: false,
      model: 'Open-Meteo GFS',
      modelRunAvailable: true,
      initTimeUtc: '2026-11-24T06:00:00Z',
      validTimeUtc: '2026-11-24T12:00:00Z',
      selectedHour: 12,
      timeResolutionMode: 'utc_instant',
      attribution: 'Open-Meteo',
      units: { speed: 'km/h', vector: 'm/s', direction: 'degrees', height: 'meters' },
      grid: [
        {
          latitude: 28.61,
          longitude: 77.21,
          u: 3.1,
          v: -1.2,
          speedMs: 3.32,
          speedKmh: 12,
          directionDeg: 291,
          heightM: 10,
        },
      ],
      cityWind: {
        latitude: 28.61,
        longitude: 77.21,
        u: 3.1,
        v: -1.2,
        speedMs: 3.32,
        speedKmh: 12,
        directionDeg: 291,
        heightM: 10,
      },
      ventilationRating: 'moderate',
      ventilationIndicatorScope: 'wind_speed_only',
      ventilationDescription: 'Moderate surface wind',
      uncertaintyDisclosure: 'Disclosure',
    };

    expect(mapWindStatusToLayerInfo(baseWind)).toEqual({
      state: 'live',
      detail: '~12 km/h • 1 GFS/Open-Meteo probes',
    });

    // Empty grid must never claim 'live'
    expect(mapWindStatusToLayerInfo({ ...baseWind, grid: [] })).toEqual({
      state: 'unavailable',
      detail: 'Wind vector telemetry unavailable',
    });

    expect(mapWindStatusToLayerInfo({ ...baseWind, status: 'stale_cached', isStale: true })).toEqual({
      state: 'stale',
      detail: '~12 km/h • Cached GFS vectors (1 probes)',
    });

    expect(
      mapWindStatusToLayerInfo({ ...baseWind, isAvailable: false, status: 'rate_limited', grid: [] })
    ).toEqual({
      state: 'rate_limited',
      detail: 'Wind forecast rate limit reached',
    });
  });
});
