import { describe, it, expect } from 'vitest';
import {
  buildMultiSourceFeeds,
  calculateMultiSourceConsensus,
} from '@/domain/advanced-air-math';
import { MultiSourceTelemetryFeed } from '@/domain/types';
import { MultiSourceInspectorModal } from '@/components/MultiSourceInspectorModal';

describe('Multi-Source Atmospheric Consensus & Uncertainty Engine', () => {
  it('builds 5 independent open-source reporting feeds', () => {
    const feeds = buildMultiSourceFeeds({
      pm25: 180,
      usAqi: 230,
      cpcbAqi: 245,
      boundaryLayerHeight: 180,
      isThermalInversion: true,
    });

    expect(feeds.length).toBe(5);
    const names = feeds.map((f) => f.sourceName);
    expect(names).toContain('Copernicus Atmosphere (CAMS)');
    expect(names).toContain('NOAA GFS Aerosol Mesh');
    expect(names).toContain('CPCB NAQI Benchmark');
    expect(names).toContain('US EPA AirNow Standard');
    expect(names).toContain('Surface Sensor Mesh (OpenAQ)');
  });

  it('calculates weighted consensus average, min, max and uncertainty spread', () => {
    const mockFeeds: MultiSourceTelemetryFeed[] = [
      {
        id: 'cams',
        sourceName: 'Copernicus CAMS',
        provider: 'ECMWF',
        aqi: 200,
        pm25: 150,
        confidence: 'High',
        standard: 'EU-CAQI',
        description: 'Reanalysis',
      },
      {
        id: 'noaa',
        sourceName: 'NOAA GFS',
        provider: 'NOAA',
        aqi: 210,
        pm25: 160,
        confidence: 'High',
        standard: 'US-EPA',
        description: 'Aerosol mesh',
      },
      {
        id: 'cpcb',
        sourceName: 'CPCB NAQI',
        provider: 'CPCB',
        aqi: 205,
        pm25: 155,
        confidence: 'Calibrated',
        standard: 'CPCB-NAQI',
        description: 'India standard',
      },
      {
        id: 'epa',
        sourceName: 'US EPA',
        provider: 'EPA',
        aqi: 202,
        pm25: 152,
        confidence: 'High',
        standard: 'US-EPA',
        description: 'AirNow',
      },
      {
        id: 'openaq',
        sourceName: 'Surface Mesh',
        provider: 'OpenAQ',
        aqi: 215,
        pm25: 165,
        confidence: 'Calibrated',
        standard: 'US-EPA',
        description: 'Ground sensor',
      },
    ];

    const consensus = calculateMultiSourceConsensus(mockFeeds);

    expect(consensus.aqiMin).toBe(200);
    expect(consensus.aqiMax).toBe(215);
    expect(consensus.consensusAqi).toBeGreaterThanOrEqual(200);
    expect(consensus.consensusAqi).toBeLessThanOrEqual(215);
    expect(consensus.deviationSpread).toBe(8); // (215 - 200) / 2 = 7.5 -> 8
    expect(consensus.confidenceScorePercent).toBeGreaterThanOrEqual(90);
    expect(consensus.agreementLevel).toBe('High Consensus');
    expect(consensus.summaryNote).toContain('consensus');
  });

  it('detects high inversion variance when surface ground sensors deviate from satellite reanalysis', () => {
    const divergentFeeds: MultiSourceTelemetryFeed[] = [
      {
        id: 'satellite-reanalysis',
        sourceName: 'Copernicus CAMS',
        provider: 'ECMWF',
        aqi: 140,
        pm25: 55,
        confidence: 'High',
        standard: 'EU-CAQI',
        description: 'Column average',
      },
      {
        id: 'surface-ground',
        sourceName: 'Surface Sensor Mesh',
        provider: 'OpenAQ',
        aqi: 280,
        pm25: 230,
        confidence: 'Calibrated',
        standard: 'US-EPA',
        description: 'Ground breathing level',
      },
    ];

    const consensus = calculateMultiSourceConsensus(divergentFeeds);

    expect(consensus.agreementLevel).toBe('Inversion Spread');
    expect(consensus.summaryNote).toContain('Thermal Inversion variance');
    expect(consensus.aqiMin).toBe(140);
    expect(consensus.aqiMax).toBe(280);
  });

  it('renders MultiSourceInspectorModal cleanly without throwing', () => {
    const modal = MultiSourceInspectorModal({
      isOpen: true,
      onClose: () => {},
      cityName: 'Delhi',
      ensemble: {
        feeds: [],
        consensusAqi: 210,
        consensusPm25: 160,
        aqiMin: 195,
        aqiMax: 225,
        deviationSpread: 15,
        confidenceScorePercent: 94,
        agreementLevel: 'High Consensus',
        summaryNote: 'All feeds agree within 15 AQI points.',
      },
    });

    expect(modal).not.toBeNull();
  });
});
