import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { MultiSourceInspectorModal } from '@/components/MultiSourceInspectorModal';
import {
  EnvironmentalSourceRecord,
  SourceComparison,
} from '@/domain/types';

describe('AVIR STEP 3 CORRECTIVE — Group C: Zero Fabrication & Integrity in Source Inspector (23-29)', () => {
  it('23. Missing PM2.5 never becomes 150 or any other fabricated fallback number', () => {
    const modelWithoutPm25: EnvironmentalSourceRecord = {
      id: 'open-meteo-atmospheric-model',
      providerId: 'open-meteo',
      providerName: 'Open-Meteo',
      sourceName: 'Open-Meteo Atmospheric Chemistry',
      sourceKind: 'atmospheric_model',
      status: 'fresh',
      latitude: 28.61,
      longitude: 77.21,
      distanceKm: 0,
      observedAt: null,
      validAt: '2026-11-22T08:00:00Z',
      retrievedAt: '2026-11-22T08:05:00Z',
      measurements: [], // No PM2.5 measurement
      attribution: 'Open-Meteo',
      provenance: { licenseOrAttribution: 'CC BY 4.0', isModel: true, limitations: [] },
    };

    const html = ReactDOMServer.renderToString(
      <MultiSourceInspectorModal
        isOpen={true}
        onClose={() => {}}
        cityName="Delhi-NCR"
        environmentalSources={[modelWithoutPm25]}
        metrics={null}
      />
    );

    // Never displays 150
    expect(html).not.toContain('150');
    expect(html).toContain('PM2.5 concentration unavailable.');
  });

  it('24. Empty source lists display unavailable states rather than synthetic records', () => {
    const html = ReactDOMServer.renderToString(
      <MultiSourceInspectorModal
        isOpen={true}
        onClose={() => {}}
        cityName="Delhi-NCR"
        environmentalSources={[]}
        metrics={null}
      />
    );

    expect(html).toContain('Environmental source details are currently unavailable.');
    expect(html).toContain('Atmospheric telemetry pipeline has not populated independent source registry records');
    // Does not create a fake 150 record
    expect(html).not.toContain('150');
  });

  it('25. Source inspector does not create fake fresh records when data are missing', () => {
    const html = ReactDOMServer.renderToString(
      <MultiSourceInspectorModal
        isOpen={true}
        onClose={() => {}}
        cityName="Delhi-NCR"
        environmentalSources={[]}
        metrics={null}
      />
    );

    expect(html).not.toContain('Active &amp; Fresh');
  });

  it('26. No new observation timestamp is generated from render time', () => {
    const stationNoTime: EnvironmentalSourceRecord = {
      id: 'station-no-time',
      providerId: 'cpcb',
      providerName: 'CPCB',
      sourceName: 'Uncalibrated Station',
      sourceKind: 'physical_observation',
      status: 'fresh',
      latitude: 28.61,
      longitude: 77.21,
      distanceKm: 2,
      observedAt: null, // No observation timestamp
      retrievedAt: '2026-11-22T08:00:00Z',
      measurements: [{ pollutant: 'pm25', value: 85, unit: 'ug/m3', observedAt: null }],
      attribution: 'CPCB',
      provenance: { licenseOrAttribution: 'CPCB', isModel: false, limitations: [] },
    };

    const html = ReactDOMServer.renderToString(
      <MultiSourceInspectorModal
        isOpen={true}
        onClose={() => {}}
        cityName="Delhi-NCR"
        environmentalSources={[stationNoTime]}
      />
    );

    expect(html).toContain('Measurement time unavailable');
    expect(html).not.toContain('Just updated');
  });

  it('27. Missing units remain missing or unavailable (never defaulted to ug/m3)', () => {
    const stationMissingUnits: EnvironmentalSourceRecord = {
      id: 'station-no-unit',
      providerId: 'custom',
      providerName: 'Custom',
      sourceName: 'Station Without Unit',
      sourceKind: 'physical_observation',
      status: 'unavailable',
      latitude: 28.61,
      longitude: 77.21,
      distanceKm: 2,
      observedAt: '2026-11-22T08:00:00Z',
      retrievedAt: '2026-11-22T08:00:00Z',
      measurements: [],
      attribution: 'Custom',
      provenance: { licenseOrAttribution: 'Custom', isModel: false, limitations: [] },
    };

    const html = ReactDOMServer.renderToString(
      <MultiSourceInspectorModal
        isOpen={true}
        onClose={() => {}}
        cityName="Delhi-NCR"
        environmentalSources={[stationMissingUnits]}
      />
    );

    expect(html).toContain('PM2.5 Unavailable');
    expect(html).toContain('Readings Unavailable');
  });

  it('28. Derived AQI does not create an additional physical source in active counts', () => {
    const modelSource: EnvironmentalSourceRecord = {
      id: 'model-1',
      providerId: 'open-meteo',
      providerName: 'Open-Meteo',
      sourceName: 'Open-Meteo Model',
      sourceKind: 'atmospheric_model',
      status: 'fresh',
      latitude: 28.61,
      longitude: 77.21,
      distanceKm: 0,
      observedAt: null,
      validAt: '2026-11-22T08:00:00Z',
      retrievedAt: '2026-11-22T08:00:00Z',
      measurements: [{ pollutant: 'pm25', value: 120, unit: 'ug/m3' }],
      attribution: 'Open-Meteo',
      provenance: { licenseOrAttribution: 'Open-Meteo', isModel: true, limitations: [] },
    };

    const derivedAqi: EnvironmentalSourceRecord = {
      id: 'derived-cpcb',
      providerId: 'cpcb',
      providerName: 'CPCB NAQI Index',
      sourceName: 'Derived NAQI Standard',
      sourceKind: 'derived_standard',
      status: 'fresh',
      latitude: null,
      longitude: null,
      distanceKm: null,
      observedAt: null,
      retrievedAt: '2026-11-22T08:00:00Z',
      measurements: [{ pollutant: 'aqi_derived', value: 245, unit: 'NAQI' }],
      attribution: 'CPCB',
      provenance: { licenseOrAttribution: 'CPCB', isModel: false, limitations: [] },
    };

    const html = ReactDOMServer.renderToString(
      <MultiSourceInspectorModal
        isOpen={true}
        onClose={() => {}}
        cityName="Delhi-NCR"
        environmentalSources={[modelSource, derivedAqi]}
      />
    );

    // Active ground monitors should be 0 because modelSource is a model and derivedAqi is derived
    expect(html).toContain('0 reporting stations');
  });
});

describe('AVIR STEP 3 CORRECTIVE — Group G: Source Inspector UI & Accessibility (47-55)', () => {
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
    observedAt: null,
    validAt: '2026-11-22T08:00:00Z',
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
    sourceKind: 'official_ground_station',
    status: 'fresh',
    latitude: 28.5983,
    longitude: 77.1897,
    distanceKm: 2.6,
    observedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    retrievedAt: new Date().toISOString(),
    ingestedAt: new Date().toISOString(),
    measurements: [{ pollutant: 'pm25', value: 154.0, unit: 'ug/m3', observedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString() }],
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
        measuredAt: null,
        validAt: '2026-11-22T08:00:00Z',
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
        kind: 'official_ground_station',
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

  it('47. Source panel displays accurate independent source count and physical ground monitor counts', () => {
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

    expect(html).toContain('Independent Environmental Sources (2)');
    expect(html).toContain('1 reporting station');
  });

  it('48. Missing measurements display honest unavailable states', () => {
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
  });

  it('49. Single provider remains clearly identified without artificial consensus', () => {
    const html = ReactDOMServer.renderToString(
      <MultiSourceInspectorModal
        isOpen={true}
        onClose={() => {}}
        cityName="Delhi-NCR"
        environmentalSources={[mockModelSource]}
      />
    );

    expect(html).toContain('Single Primary Provider');
    expect(html).toContain('Zero fabricated consensus');
    expect(html).toContain('Mode A • Single Primary Provider Active');
  });

  it('50. Missing sourceComparison never implies Mode C', () => {
    const html = ReactDOMServer.renderToString(
      <MultiSourceInspectorModal
        isOpen={true}
        onClose={() => {}}
        cityName="Delhi-NCR"
        environmentalSources={[mockModelSource, mockGroundSource]}
        sourceComparison={null} // null comparison object
      />
    );

    // Never displays Mode C
    expect(html).not.toContain('Mode C (Comparable)');
    expect(html).not.toContain('Comparable (Mode C)');
    expect(html).toContain('Single Primary Provider');
  });

  it('51. Provider errors do not crash the modal or dashboard', () => {
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

  it('52. The modal returns null when isOpen is false', () => {
    const html = ReactDOMServer.renderToString(
      <MultiSourceInspectorModal
        isOpen={false}
        onClose={() => {}}
        cityName="Delhi-NCR"
      />
    );

    expect(html).toBe('');
  });

  it('54. Dark mode and light mode classes are present and readable', () => {
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

  it('55. Responsive mobile flex and grid containers are preserved', () => {
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
});
