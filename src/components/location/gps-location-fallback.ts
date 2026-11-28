import type { GeocodedLocation } from '@/services/telemetry-service';

/**
 * Builds an unpersisted coordinate-derived fallback location when reverse geocoding
 * has not verified the country, using explicit unknown countryCode `'UN'`.
 */
export function createGpsFallbackLocation(
  latitude: number,
  longitude: number
): GeocodedLocation {
  const latLabel = latitude >= 0 ? `${latitude.toFixed(2)}°N` : `${Math.abs(latitude).toFixed(2)}°S`;
  const lonLabel = longitude >= 0 ? `${longitude.toFixed(2)}°E` : `${Math.abs(longitude).toFixed(2)}°W`;

  return {
    id: Math.abs(Math.round(latitude * 1000) * 10000 + (Math.round(longitude * 1000) % 10000)),
    name: `Near ${latLabel}, ${lonLabel}`,
    country: 'Detected Location',
    countryCode: 'UN',
    latitude,
    longitude,
  };
}
