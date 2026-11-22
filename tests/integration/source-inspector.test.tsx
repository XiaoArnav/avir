import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { MultiSourceInspectorModal } from '@/components/MultiSourceInspectorModal';
import {
  EnvironmentalSourceRecord,
  SourceComparison,
  AtmosphericMetrics,
} from '@/domain/types';

describe('AVIR STEP 3 — Group G: Source Inspector UI & Accessibility (50-58)', () => {
  const mockModelSource: EnvironmentalSourceRecord = {
    id: 'open-meteo-atmospheric-model',
    providerId: 'open-meteo',
    providerName: 'Open-Meteo',
    sourceName: 'Open-Meteo Atmospheric Chemistry (ECMWF IFS & CAMS)',
    sourceKind: 'atmospheric_model',
    status: 'fresh',
    latitude: 28.6139,
    longitude: 77.2090,
    distanceKm: 0,
    observedAt: '2026-11-22T08:00:00Z',
    retrievedAt: '2026-11-22T08:05:00Z',
    ingestedAt: '2026-11-22T08:05:00Z',
    measurements: [{ pollutant: 'pm25', value: 142.0, unit: 'ug/m3' }],
    attribution: 'Open-Meteo (CC BY 4.0)',
    provenance: {
      network: 'ECMWF IFS',
      licenseOrAttribution: 'CC BY 4.0',
      isModel: true,
      limitations: ['11km grid cell simulation'],
    },
  };

  const mockGroundSource: EnvironmentalSourceRecord = {
    id: 'openaq-5001',
    providerId: 'openaq',
    providerName: 'AirNow Gov',
    sourceName: 'US Embassy Chanakyapuri (OpenAQ)',
    sourceKind: 'physical_observation',
    status: 'fresh',
    latitude: 28.5983,
    longitude: 77.1897,
    distanceKm: 2.6,
    observedAt: '2026-11-22T08:00:00Z',
    retrievedAt: '2026-11-22T08:05:00Z',
    ingestedAt: '2026-11-22T08:05:00Z',
    measurements: [{ pollutant: 'pm25', value: 154.0, unit: 'ug/m3' }],
    attribution: 'AirNow Gov',
    provenance: {
      network: 'US State Department AirNow',
      licenseOrAttribution: 'OpenAQ (CC BY 4.0)',
      isModel: false,
      limitations: ['Direct surface monitor at breathing height'],
    },
  };

  const mockComparableComparison: SourceComparison = {
    targetPollutant: 'pm25',
    mode: 'mode_c_comparable',
    status: 'comparable',
    sourcesCompared: [
      {
        sourceId: 'open-meteo-atmospheric-model',
        provider: 'Open-Meteo',
        name: 'Open-Meteo Atmospheric Chemistry',
        value: 142.0,
        unit: 'ug/m3',
        measuredAt: '2026-11-22T08:00:00Z',
        kind: 'atmospheric_model',
      },
      {
        sourceId: 'openaq-5001',
        provider: 'AirNow Gov',
        name: 'US Embassy Chanakyapuri (OpenAQ)',
        value: 154.0,
        unit: 'ug/m3',
        measuredAt: '2026-11-22T08:00:00Z',
        distanceKm: 2.6,
        kind: 'physical_observation',
      },
    ],
    eligibleSourceIds: ['open-meteo-atmospheric-model', 'openaq-5001'],
    excludedSourceIds: [],
    reasons: [],
    absoluteDifferenceUgM3: 12.0,
    relativeDifferencePercent: 8,
    minConcentration: 142.0,
    maxConcentration: 154.0,
    summary: 'Two comparable PM2.5 sources are available. Their reported concentrations differ by 12 µg/m³.',
    comparedAt: '2026-11-22T08:05:00Z',
  };

  it('50. Source panel displays the actual count of independent sources', () => {
    const rawHtml = ReactDOMServer.renderToString(
      <MultiSourceInspectorModal
        isOpen={true}
        onClose={() => {}}
        cityName="Delhi-NCR"
        environmentalSources={[mockModelSource, mockGroundSource]}
        sourceComparison={mockComparableComparison}
      />
    );
    const html = rawHtml.replace(/<!--.*?-->/g, '');

    // Displays independent sources count
    expect(html).toContain('Independent Environmental Sources (2)');
    expect(html).toContain('1 reporting station');
  });

  it('51. A source model/observed classification is clearly visible with distinct badges', () => {
    const rawHtml = ReactDOMServer.renderToString(
      <MultiSourceInspectorModal
        isOpen={true}
        onClose={() => {}}
        cityName="Delhi-NCR"
        environmentalSources={[mockModelSource, mockGroundSource]}
        sourceComparison={mockComparableComparison}
      />
    );
    const html = rawHtml.replace(/<!--.*?-->/g, '');

    expect(html).toContain('Atmospheric Model');
    expect(html).toContain('Physical Reference Monitor');
  });

  it('52. Missing measurements display honest unavailable states rather than NaN or 0', () => {
    const unavailableStation: EnvironmentalSourceRecord = {
      id: 'ground-cpcb-ito',
      providerId: 'cpcb',
      providerName: 'CPCB',
      sourceName: 'ITO CAAQMS (Offline)',
      sourceKind: 'official_ground_station',
      status: 'registry_only',
      latitude: 28.63,
      longitude: 77.25,
      distanceKm: 2.1,
      observedAt: null,
      retrievedAt: new Date().toISOString(),
      ingestedAt: new Date().toISOString(),
      measurements: [],
      attribution: 'CPCB',
      provenance: { licenseOrAttribution: 'CPCB', isModel: false, limitations: [] },
    };

    const html = ReactDOMServer.renderToString(
      <MultiSourceInspectorModal
        isOpen={true}
        onClose={() => {}}
        cityName="Delhi-NCR"
        environmentalSources={[mockModelSource, unavailableStation]}
      />
    );

    expect(html).toContain('PM2.5 Unavailable');
    expect(html).toContain('Registry Verified');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('undefined');
  });

  it('53. Regulatory standards appear in Section D separate from independent data feeds', () => {
    const html = ReactDOMServer.renderToString(
      <MultiSourceInspectorModal
        isOpen={true}
        onClose={() => {}}
        cityName="Delhi-NCR"
        environmentalSources={[mockModelSource, mockGroundSource]}
        sourceComparison={mockComparableComparison}
        metrics={{
          usAqi: 215,
          cpcbAqi: 235,
          cpcbStatus: 'statutory_compliant',
        } as any}
      />
    );

    expect(html).toContain('Section D • Derived Regulatory Interpretations');
    expect(html).toContain('US EPA AirNow Standard');
    expect(html).toContain('CPCB NAQI (India)');
    expect(html).toContain('215 AQI');
    expect(html).toContain('235 NAQI');
  });

  it('54. Agreement UI is hidden or replaced by informative explanation when data are incompatible (Mode B)', () => {
    const incompatibleComparison: SourceComparison = {
      targetPollutant: 'pm25',
      mode: 'mode_b_incompatible',
      status: 'incompatible',
      sourcesCompared: [],
      eligibleSourceIds: [],
      excludedSourceIds: ['s1', 's2'],
      reasons: ['Incompatible averaging periods: 1h vs 24h.'],
      incompatibilityReasons: ['Incompatible averaging periods: 1h vs 24h.'],
      absoluteDifferenceUgM3: null,
      relativeDifferencePercent: null,
      minConcentration: 120,
      maxConcentration: 180,
      summary: 'Measurements cannot be compared directly: Incompatible averaging periods. Both sources are shown independently.',
      comparedAt: new Date().toISOString(),
    };

    const html = ReactDOMServer.renderToString(
      <MultiSourceInspectorModal
        isOpen={true}
        onClose={() => {}}
        cityName="Delhi-NCR"
        environmentalSources={[mockModelSource]}
        sourceComparison={incompatibleComparison}
      />
    );

    expect(html).toContain('Mode B (Incompatible)');
    expect(html).toContain('Sources Ineligible for Quantitative Comparison');
    // Does not display a consensus agreement percentage
    expect(html).not.toContain('% Model Agreement');
  });

  it('55. The source panel returns null when isOpen is false', () => {
    const html = ReactDOMServer.renderToString(
      <MultiSourceInspectorModal
        isOpen={false}
        onClose={() => {}}
        cityName="Delhi-NCR"
      />
    );

    expect(html).toBe('');
  });

  it('56. Dark mode and light mode classes are present and accessible', () => {
    const html = ReactDOMServer.renderToString(
      <MultiSourceInspectorModal
        isOpen={true}
        onClose={() => {}}
        cityName="Delhi-NCR"
        environmentalSources={[mockModelSource]}
      />
    );

    expect(html).toContain('dark:bg-zinc-900');
    expect(html).toContain('dark:text-white');
    expect(html).toContain('dark:border-zinc-800');
  });

  it('57. Narrow mobile viewport layouts do not overflow (uses responsive grid & flex wrappers)', () => {
    const html = ReactDOMServer.renderToString(
      <MultiSourceInspectorModal
        isOpen={true}
        onClose={() => {}}
        cityName="Delhi-NCR"
        environmentalSources={[mockModelSource, mockGroundSource]}
        sourceComparison={mockComparableComparison}
      />
    );

    expect(html).toContain('flex flex-col sm:flex-row');
    expect(html).toContain('grid grid-cols-1 sm:grid-cols-3');
    expect(html).toContain('overflow-y-auto');
  });

  it('58. Provider errors do not crash the inspector or dashboard', () => {
    const errorSource: EnvironmentalSourceRecord = {
      id: 'openaq-error',
      providerId: 'openaq',
      providerName: 'OpenAQ',
      sourceName: 'OpenAQ Network (Rate Limited)',
      sourceKind: 'physical_observation',
      status: 'unreachable',
      errorCode: 'RATE_LIMIT',
      explanation: 'OpenAQ API rate limit exceeded.',
      latitude: null,
      longitude: null,
      distanceKm: null,
      observedAt: null,
      retrievedAt: new Date().toISOString(),
      ingestedAt: new Date().toISOString(),
      measurements: [],
      attribution: 'OpenAQ',
      provenance: { licenseOrAttribution: 'OpenAQ', isModel: false, limitations: [] },
    };

    const html = ReactDOMServer.renderToString(
      <MultiSourceInspectorModal
        isOpen={true}
        onClose={() => {}}
        cityName="Delhi-NCR"
        environmentalSources={[mockModelSource, errorSource]}
      />
    );

    expect(html).toContain('OpenAQ API rate limit exceeded.');
    expect(html).toContain('Readings Unavailable');
  });
});
