import type { GeographicObservationPoint } from '@/services/geo/geographic-observation-adapter';

export interface ActiveCityEnvironmentTarget {
  name: string;
  latitude: number;
  longitude: number;
}

export function isValidGeographicCoordinate(
  latitude: number | undefined | null,
  longitude: number | undefined | null
): boolean {
  return (
    typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/**
 * Resolves the authoritative coordinates for the active dashboard city.
 * Prefers explicit activeCityLatitude/activeCityLongitude props from EarthCommandCenter.
 * Never falls back to an inspected marker (selectedPoint) or points[0].
 */
export function resolveActiveCityEnvironmentTarget({
  activeCityName,
  activeCityLatitude,
  activeCityLongitude,
  points,
}: {
  activeCityName?: string;
  activeCityLatitude?: number;
  activeCityLongitude?: number;
  points: GeographicObservationPoint[];
}): ActiveCityEnvironmentTarget | null {
  const normalizedName = activeCityName?.trim() || '';

  if (activeCityLatitude !== undefined || activeCityLongitude !== undefined) {
    if (!isValidGeographicCoordinate(activeCityLatitude, activeCityLongitude)) {
      return null;
    }
    return {
      name: normalizedName || 'Active City',
      latitude: activeCityLatitude as number,
      longitude: activeCityLongitude as number,
    };
  }

  if (!normalizedName) {
    return null;
  }

  const exactMatch = points.find(
    (p) => p.name.trim().toLowerCase() === normalizedName.toLowerCase()
  );
  if (!exactMatch || !isValidGeographicCoordinate(exactMatch.latitude, exactMatch.longitude)) {
    return null;
  }

  return {
    name: normalizedName,
    latitude: exactMatch.latitude,
    longitude: exactMatch.longitude,
  };
}
