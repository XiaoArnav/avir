import { describe, it, expect } from 'vitest';
import { createGpsFallbackLocation } from '@/components/location/gps-location-fallback';

describe('createGpsFallbackLocation', () => {
  it('assigns unknown countryCode "UN" and preserves Seattle coordinates cleanly', () => {
    const fallback = createGpsFallbackLocation(47.606, -122.332);

    expect(fallback.countryCode).toBe('UN');
    expect(fallback.countryCode).not.toBe('IN');
    expect(fallback.country).toBe('Detected Location');
    expect(fallback.name).toBe('Near 47.61°N, 122.33°W');
    expect(fallback.latitude).toBe(47.606);
    expect(fallback.longitude).toBe(-122.332);
    expect(fallback.id).toBe(
      Math.abs(Math.round(47.606 * 1000) * 10000 + (Math.round(-122.332 * 1000) % 10000))
    );
  });

  it('formats southern and eastern hemisphere coordinates with unknown countryCode "UN"', () => {
    const sydneyFallback = createGpsFallbackLocation(-33.869, 151.209);

    expect(sydneyFallback.countryCode).toBe('UN');
    expect(sydneyFallback.name).toBe('Near 33.87°S, 151.21°E');
    expect(sydneyFallback.latitude).toBe(-33.869);
    expect(sydneyFallback.longitude).toBe(151.209);
  });
});
