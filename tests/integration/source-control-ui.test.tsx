import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { CompactCityCard } from '@/components/home/CompactCityCard';
import { MultiSourceInspectorModal } from '@/components/MultiSourceInspectorModal';
import { ResolvedSourceData, SourcePreference } from '@/services/source-control/source-control-types';
import { EnvironmentalSourceRecord, AtmosphericMetrics } from '@/domain/types';

describe('Avir Source Control — UI Component Integration (Integration)', () => {
  const mockResolvedSource: ResolvedSourceData = {
    preference: { version: 1, mode: 'official_ground' },
    resolvedSource: null,
    resolutionStatus: 'resolved',
    selectionReason: 'User selected official government ground station.',
    isFallback: false,
    pollutant: 'pm25',
    concentration: 165.4,
    unit: 'µg/m³',
    observedAt: '2026-11-24T12:00:00Z',
    validAt: null,
    retrievedAt: '2026-11-24T12:05:00Z',
    averagingPeriodMinutes: 60,
    qualityFlag: 'valid',
    stationId: 'delhi-anand-vihar',
    stationName: 'Anand Vihar CAAQMS',
    providerId: 'cpcb',
    providerName: 'Central Pollution Control Board',
    networkName: 'CAAQMS',
    sourceKind: 'official_ground_station',
    distanceKm: 6.2,
    isModel: false,
    attribution: 'CPCB / DPCC',
    limitations: ['Local surface reading'],
    displayAqi: 335,
    aqiStandard: 'cpcb',
    aqiCategory: 'Very Poor',
    aqiCategoryColor: '#F97316',
    isOfficialPublishedAqi: false,
    aqiCalculationNotes: 'Derived CPCB NAQI sub-index',
    availableAlternatives: [],
  };

  const mockFallbackSource: ResolvedSourceData = {
    ...mockResolvedSource,
    resolutionStatus: 'fallback',
    isFallback: true,
    fallbackReason: 'Official station is offline. Utilizing CAMS numerical model.',
    stationName: 'CAMS Global Atmospheric Model (Fallback)',
    sourceKind: 'atmospheric_model',
  };

  const mockUnavailableSource: ResolvedSourceData = {
    ...mockResolvedSource,
    resolutionStatus: 'unavailable',
    concentration: null,
    displayAqi: null,
    selectionReason: 'Official ground monitoring is currently offline in this area.',
  };

  it('1. CompactCityCard renders active source name and "Data Source" badge', () => {
    const html = ReactDOMServer.renderToString(
      <CompactCityCard
        cityName="Delhi-NCR"
        aqiValue={335}
        categoryLabel="Very Poor"
        categoryColor="#F97316"
        primaryPollutant="PM2.5"
        standard="cpcb"
        onToggleStandard={() => {}}
        provenanceLabel="Official CAAQMS"
        isOfficialGround={true}
        freshnessLabel="Just now"
        onOpenDetails={() => {}}
        resolvedSource={mockResolvedSource}
        onOpenSourceControl={() => {}}
      />
    );

    expect(html).toContain('Data Source:');
    expect(html).toContain('Anand Vihar CAAQMS');
    expect(html).not.toContain('Fallback Applied:');
  });

  it('2. CompactCityCard displays amber fallback banner when fallback model is active', () => {
    const html = ReactDOMServer.renderToString(
      <CompactCityCard
        cityName="Delhi-NCR"
        aqiValue={180}
        categoryLabel="Moderate"
        categoryColor="#EAB308"
        primaryPollutant="PM2.5"
        standard="cpcb"
        onToggleStandard={() => {}}
        provenanceLabel="CAMS Model"
        isOfficialGround={false}
        freshnessLabel="Just now"
        onOpenDetails={() => {}}
        resolvedSource={mockFallbackSource}
        onOpenSourceControl={() => {}}
      />
    );

    expect(html).toContain('Fallback Applied:');
    expect(html).toContain('Atmospheric Model Active');
  });

  it('3. CompactCityCard displays honest unavailable status when preferred source is offline without fallback', () => {
    const html = ReactDOMServer.renderToString(
      <CompactCityCard
        cityName="Delhi-NCR"
        aqiValue={null}
        categoryLabel="Data Unavailable"
        categoryColor="#64748B"
        primaryPollutant="PM2.5"
        standard="cpcb"
        onToggleStandard={() => {}}
        provenanceLabel="CPCB Offline"
        isOfficialGround={false}
        freshnessLabel="Awaiting Telemetry"
        onOpenDetails={() => {}}
        resolvedSource={mockUnavailableSource}
        onOpenSourceControl={() => {}}
      />
    );

    expect(html).toContain('Source Status:');
    expect(html).toContain('Offline / Data Unavailable');
  });

  it('4. MultiSourceInspectorModal renders Avir Source Control Section 0 with all 5 modes', () => {
    const pref: SourcePreference = { version: 1, mode: 'automatic' };

    const mockSourceRecord: EnvironmentalSourceRecord = {
      id: 'cpcb-1',
      providerId: 'cpcb',
      providerName: 'CPCB',
      sourceName: 'ITO Monitoring Station',
      sourceKind: 'official_ground_station',
      status: 'fresh',
      latitude: 28.62,
      longitude: 77.24,
      distanceKm: 2.1,
      observedAt: '2026-11-24T12:00:00Z',
      validAt: null,
      retrievedAt: '2026-11-24T12:05:00Z',
      measurements: [{ pollutant: 'pm25', value: 175, unit: 'µg/m³', observedAt: '2026-11-24T12:00:00Z' }],
      attribution: 'CPCB',
      provenance: { isModel: false, licenseOrAttribution: 'CPCB Open Data', limitations: [] },
    };

    const html = ReactDOMServer.renderToString(
      <MultiSourceInspectorModal
        isOpen={true}
        onClose={() => {}}
        cityName="Delhi-NCR"
        environmentalSources={[mockSourceRecord]}
        sourcePreference={pref}
        resolvedSource={mockResolvedSource}
      />
    );

    expect(html).toContain('Avir Source Control &amp; Selection');
    expect(html).toContain('Automatic (Optimal)');
    expect(html).toContain('Official CPCB Ground');
    expect(html).toContain('OpenAQ Network');
    expect(html).toContain('CAMS Atmospheric Model');
    expect(html).toContain('Specific Station');
    expect(html).toContain('Allow fallback to Atmospheric Model');
    expect(html).toContain('Available Environmental Sources for');
    expect(html).toContain('ITO Monitoring Station');
  });
});
