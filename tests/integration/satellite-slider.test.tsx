import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { SatelliteComparisonSlider } from '@/components/environment/SatelliteComparisonSlider';
import { buildSatelliteComparison } from '@/services/environment/satellite-imagery-service';

describe('Phase 6 Integration: SatelliteComparisonSlider Component', () => {
  const sampleComparison = buildSatelliteComparison({
    city: 'Delhi NCR',
    latitude: 28.6139,
    longitude: 77.209,
    dateA: '2026-11-01',
    dateB: '2026-11-20',
    productA: 'VIIRS',
    productB: 'VIIRS',
  });

  it('renders satellite comparison slider with accessibility role and aria values', () => {
    const html = ReactDOMServer.renderToString(
      <SatelliteComparisonSlider comparison={sampleComparison} />
    );

    // Header and metadata
    expect(html).toContain('NASA SATELLITE IMAGERY COMPARISON');
    expect(html).toContain('Delhi NCR');
    expect(html).toContain('2026-11-01');
    expect(html).toContain('2026-11-20');

    // Accessibility attributes
    expect(html).toContain('role="slider"');
    expect(html).toContain('aria-label="Satellite imagery before and after comparison slider"');
    expect(html).toContain('aria-valuenow="50"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="100"');

    // Both image layers present
    expect(html).toContain('wvs.earthdata.nasa.gov/api/v1/snapshot');
    expect(html).toContain('TIME=2026-11-01');
    expect(html).toContain('TIME=2026-11-20');

    // Disclaimer
    expect(html).toContain('Optical satellite surface imagery visualizes atmospheric reflectance');
    expect(html).toContain('NASA EOSDIS Global Imagery Browse Services (GIBS)');
  });
});
