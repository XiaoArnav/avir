import { describe, it, expect } from 'vitest';
import {
  buildMultiSourceFeeds,
  calculateMultiSourceConsensus,
} from '@/domain/advanced-air-math';
import { MultiSourceTelemetryFeed } from '@/domain/types';
import { MultiSourceInspectorModal } from '@/components/MultiSourceInspectorModal';

describe('Multi-Source Atmospheric Consensus & Uncertainty Engine', () => {
  it('15 & 18. Does not multiply one provider into 5 independent sources; labels standards as derived', () => {
    const feeds = buildMultiSourceFeeds({
      pm25: 180,
      usAqi: 230,
      cpcbAqi: 245,
      boundaryLayerHeight: 180,
      isThermalInversion: true,
    });

    // 1 primary model + derived standards (CPCB, US-EPA)
    expect(feeds.length).toBeLessThan(5);
    const primaryModel = feeds.find((f) => f.provenance === 'modeled_forecast');
    expect(primaryModel).toBeDefined();
    expect(primaryModel?.sourceName).toContain('Open-Meteo');

    // Standards are derived calculations, NOT independent monitoring feeds
    const derivedFeeds = feeds.filter((f) => f.provenance === 'derived_calculation');
    expect(derivedFeeds.length).toBeGreaterThanOrEqual(1);
    expect(derivedFeeds.some((f) => f.sourceName.includes('CPCB'))).toBe(true);
    expect(derivedFeeds.some((f) => f.sourceName.includes('US EPA'))).toBe(true);
  });

  it('16 & 17. Single primary feed does not calculate artificial consensus score or model spread', () => {
    const feeds = buildMultiSourceFeeds({
      pm25: 150,
      usAqi: 200,
      cpcbAqi: 200,
      boundaryLayerHeight: 200,
      isThermalInversion: false,
    });

    const consensus = calculateMultiSourceConsensus(feeds);
    // When only 1 independent feed exists:
    expect(consensus.confidenceScorePercent).toBeNull();
    expect(consensus.deviationSpread).toBeNull();
    expect(consensus.agreementLevel).toBe('Single Primary Provider');
    expect(consensus.summaryNote).toContain('Open-Meteo numerical models');
  });

  it('calculates weighted consensus average, min, max and spread when 2+ genuinely independent feeds exist', () => {
    const mockFeeds: MultiSourceTelemetryFeed[] = [
      {
        id: 'model-primary',
        sourceName: 'Open-Meteo Model',
        provider: 'Open-Meteo',
        aqi: 200,
        pm25: 150,
        confidence: 'High',
        standard: 'US-EPA',
        description: 'Atmospheric model',
        provenance: 'modeled_forecast',
      },
      {
        id: 'ground-ref',
        sourceName: 'Ground Truth Monitor',
        provider: 'CPCB CAAQMS',
        aqi: 215,
        pm25: 165,
        confidence: 'High',
        standard: 'US-EPA',
        description: 'Physical ground monitor',
        provenance: 'observed',
      },
      {
        id: 'cpcb-standard',
        sourceName: 'CPCB Standard',
        provider: 'CPCB',
        aqi: 205,
        pm25: 155,
        confidence: 'Calibrated',
        standard: 'CPCB-NAQI',
        description: 'India standard',
        provenance: 'derived_calculation',
      },
    ];

    const consensus = calculateMultiSourceConsensus(mockFeeds);

    // Derived feeds are excluded from independent consensus calculation
    expect(consensus.aqiMin).toBe(200);
    expect(consensus.aqiMax).toBe(215);
    expect(consensus.consensusAqi).toBeGreaterThanOrEqual(200);
    expect(consensus.consensusAqi).toBeLessThanOrEqual(215);
    expect(consensus.deviationSpread).toBe(8); // (215 - 200) / 2 = 7.5 -> 8
    expect(consensus.confidenceScorePercent).not.toBeNull();
    expect(consensus.agreementLevel).toBe('High Consensus');
    expect(consensus.summaryNote).toContain('independent feeds');
  });

  it('detects high variance when physical ground sensor diverges from regional model grid', () => {
    const divergentFeeds: MultiSourceTelemetryFeed[] = [
      {
        id: 'satellite-reanalysis',
        sourceName: 'Regional Model',
        provider: 'Open-Meteo',
        aqi: 140,
        pm25: 55,
        confidence: 'High',
        standard: 'US-EPA',
        description: 'Model grid',
        provenance: 'modeled_forecast',
      },
      {
        id: 'surface-ground',
        sourceName: 'Surface Monitor',
        provider: 'Sensor.Community',
        aqi: 280,
        pm25: 230,
        confidence: 'Calibrated',
        standard: 'US-EPA',
        description: 'Ground level',
        provenance: 'observed',
      },
    ];

    const consensus = calculateMultiSourceConsensus(divergentFeeds);

    expect(consensus.agreementLevel).toBe('High Divergence');
    expect(consensus.summaryNote).toContain('divergence');
    expect(consensus.aqiMin).toBe(140);
    expect(consensus.aqiMax).toBe(280);
  });

  it('19. returns explicit unavailable state and null metrics when feeds are empty', () => {
    const emptyConsensus = calculateMultiSourceConsensus([]);
    expect(emptyConsensus.isUnavailable).toBe(true);
    expect(emptyConsensus.consensusAqi).toBeNull();
    expect(emptyConsensus.consensusPm25).toBeNull();
    expect(emptyConsensus.confidenceScorePercent).toBeNull();
    expect(emptyConsensus.deviationSpread).toBeNull();
  });

  it('20. renders MultiSourceInspectorModal cleanly without throwing', () => {
    const modal = MultiSourceInspectorModal({
      isOpen: true,
      onClose: () => {},
      cityName: 'Delhi',
      ensemble: {
        primaryModel: 'Open-Meteo ECMWF IFS',
        weatherModel: 'NOAA GFS',
        pm25Min: 150,
        pm25Max: 170,
        provenanceNote: 'Calculated from Open-Meteo ensemble',
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
