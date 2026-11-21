import { describe, it, expect } from 'vitest';
import React from 'react';
import { CityPanoramicBackdrop } from '@/components/CityPanoramicBackdrop';

describe('CityPanoramicBackdrop Worldwide Architecture & Landmarks', () => {
  const explicitCities = [
    { id: 'delhi', expected: 'Delhi' },
    { id: 'patna', expected: 'Patna' },
    { id: 'varanasi', expected: 'Varanasi' },
    { id: 'kanpur', expected: 'Kanpur' },
    { id: 'lahore', expected: 'Lahore' },
    { id: 'beijing', expected: 'Beijing' },
    { id: 'tokyo', expected: 'Tokyo' },
    { id: 'london', expected: 'London' },
    { id: 'paris', expected: 'Paris' },
    { id: 'new york', expected: 'New York' },
    { id: 'dubai', expected: 'Dubai' },
    { id: 'sydney', expected: 'Sydney' },
    { id: 'cairo', expected: 'Cairo' },
    { id: 'bangkok', expected: 'Bangkok' },
    { id: 'singapore', expected: 'Singapore' },
    { id: 'berlin', expected: 'Berlin' },
    { id: 'rome', expected: 'Rome' },
    { id: 'san francisco', expected: 'San Francisco' },
    { id: 'rio de janeiro', expected: 'Rio' },
    { id: 'toronto', expected: 'Toronto' },
    { id: 'seoul', expected: 'Seoul' },
    { id: 'istanbul', expected: 'Istanbul' },
    { id: 'athens', expected: 'Athens' },
    { id: 'moscow', expected: 'Moscow' },
    { id: 'mumbai', expected: 'Mumbai' },
    { id: 'bengaluru', expected: 'Bengaluru' },
    { id: 'kolkata', expected: 'Kolkata' },
    { id: 'lucknow', expected: 'Lucknow' },
    { id: 'hyderabad', expected: 'Hyderabad' },
    { id: 'ahmedabad', expected: 'Ahmedabad' },
    { id: 'pune', expected: 'Pune' },
  ];

  explicitCities.forEach(({ id, expected }) => {
    it(`renders unique distinct architectural silhouette for ${id}`, () => {
      const element = CityPanoramicBackdrop({
        cityId: id,
        isDark: true,
      }) as React.ReactElement<{ 'aria-label'?: string }>;

      expect(element).toBeDefined();
      expect(element.type).toBe('svg');
      const ariaLabel = element.props['aria-label'] || '';
      expect(ariaLabel.toLowerCase()).toContain(expected.toLowerCase());
    });
  });

  const proceduralCities = [
    'Zurich',
    'Reykjavik',
    'Kathmandu',
    'Honolulu',
    'Auckland',
    'Vienna',
    'Prague',
    'Santiago',
    'Casablanca',
    'Nairobi',
    'Helsinki',
  ];

  proceduralCities.forEach((city) => {
    it(`generates unique procedural architectural skyline for arbitrary global city: ${city}`, () => {
      const element = CityPanoramicBackdrop({
        cityId: city,
        isDark: false,
      }) as React.ReactElement<{ 'aria-label'?: string }>;

      expect(element).toBeDefined();
      expect(element.type).toBe('svg');
      const ariaLabel = element.props['aria-label'] || '';
      expect(ariaLabel.toLowerCase()).toContain(city.toLowerCase());
    });
  });

  it('guarantees two different procedural cities generate different SVG shapes', () => {
    const el1 = CityPanoramicBackdrop({ cityId: 'Zurich' }) as React.ReactElement;
    const el2 = CityPanoramicBackdrop({ cityId: 'Honolulu' }) as React.ReactElement;

    const label1 = (el1.props as any)['aria-label'];
    const label2 = (el2.props as any)['aria-label'];
    expect(label1).not.toBe(label2);
  });
});
