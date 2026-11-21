import { describe, it, expect } from 'vitest';
import React from 'react';
import { CityPanoramicBackdrop } from '@/components/CityPanoramicBackdrop';

describe('CityPanoramicBackdrop Architecture & Landmarks', () => {
  const cities = [
    { id: 'delhi', expectedLandmark: 'Delhi NCR' },
    { id: 'patna', expectedLandmark: 'Patna' },
    { id: 'varanasi', expectedLandmark: 'Varanasi' },
    { id: 'kanpur', expectedLandmark: 'Kanpur' },
    { id: 'lahore', expectedLandmark: 'Lahore' },
    { id: 'beijing', expectedLandmark: 'Beijing' },
    { id: 'tokyo', expectedLandmark: 'Tokyo' },
    { id: 'london', expectedLandmark: 'London' },
    { id: 'paris', expectedLandmark: 'Paris' },
    { id: 'new york', expectedLandmark: 'New York' },
    { id: 'dubai', expectedLandmark: 'Dubai' },
    { id: 'sydney', expectedLandmark: 'Sydney' },
    { id: 'cairo', expectedLandmark: 'Cairo' },
    { id: 'bangkok', expectedLandmark: 'Bangkok' },
    { id: 'mumbai', expectedLandmark: 'Mumbai' },
    { id: 'bengaluru', expectedLandmark: 'Bengaluru' },
    { id: 'kolkata', expectedLandmark: 'Kolkata' },
    { id: 'lucknow', expectedLandmark: 'Lucknow' },
    { id: 'hyderabad', expectedLandmark: 'Hyderabad' },
    { id: 'ahmedabad', expectedLandmark: 'Ahmedabad' },
    { id: 'pune', expectedLandmark: 'Pune' },
  ];

  cities.forEach(({ id, expectedLandmark }) => {
    it(`renders unique distinct architectural silhouette for ${id}`, () => {
      const element = CityPanoramicBackdrop({
        cityId: id,
        isDark: true,
      }) as React.ReactElement<{ 'aria-label'?: string }>;

      expect(element).toBeDefined();
      expect(element.type).toBe('svg');
      const ariaLabel = element.props['aria-label'] || '';
      expect(ariaLabel.toLowerCase()).toContain(expectedLandmark.toLowerCase());
    });
  });

  it('renders universal architectural horizon when city is unknown fallback', () => {
    const element = CityPanoramicBackdrop({
      cityId: 'unknown-remote-town',
      isDark: false,
    }) as React.ReactElement<{ 'aria-label'?: string }>;

    expect(element).toBeDefined();
    expect(element.type).toBe('svg');
    const ariaLabel = element.props['aria-label'] || '';
    expect(ariaLabel.toLowerCase()).toContain('metropolitan');
  });
});

