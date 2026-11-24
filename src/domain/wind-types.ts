/**
 * Global Wind-Flow & Atmospheric Intelligence Domain Types (Phase 3)
 * 
 * Defines canonical data contracts and atmospheric physics conversions for:
 * - 10-meter wind vectors (U eastward, V northward in m/s)
 * - Meteorological wind direction (0-360 degrees from North)
 * - Ventilation and atmospheric dispersion rating
 * - Time-synchronized forecast provenances
 */

export interface WindVectorPoint {
  latitude: number;
  longitude: number;
  u: number; // m/s (eastward component)
  v: number; // m/s (northward component)
  speedKmh: number;
  speedMs: number;
  directionDeg: number;
  heightM: number;
}

export type VentilationRating = 'good' | 'moderate' | 'poor' | 'stagnant';

export interface WindForecastResponse {
  model: string;
  initTimeUtc: string;
  validTimeUtc: string;
  selectedHour: number;
  attribution: string;
  units: {
    speed: 'km/h';
    vector: 'm/s';
    direction: 'degrees';
    height: 'meters';
  };
  grid: WindVectorPoint[];
  cityWind?: WindVectorPoint | null;
  ventilationRating: VentilationRating;
  ventilationDescription: string;
}

/**
 * Converts meteorological wind speed and direction into physical U and V Cartesian vector components.
 * 
 * In meteorology:
 * - Direction is the azimuth FROM which the wind blows (0° = North, 90° = East, 180° = South, 270° = West).
 * - U is the zonal component (positive eastward).
 * - V is the meridional component (positive northward).
 * 
 * Formulas:
 *   speed_m/s = speed_km/h / 3.6
 *   u = -speed_m/s * sin(direction_rad)
 *   v = -speed_m/s * cos(direction_rad)
 */
export function calculateWindUV(
  speedKmh: number,
  directionDeg: number
): { u: number; v: number; speedMs: number } {
  const speed = Math.max(0, speedKmh);
  const speedMs = speed / 3.6;
  const rad = (directionDeg * Math.PI) / 180;

  const u = -speedMs * Math.sin(rad);
  const v = -speedMs * Math.cos(rad);

  const roundedU = Math.abs(u) < 0.0001 ? 0 : Math.round(u * 100) / 100;
  const roundedV = Math.abs(v) < 0.0001 ? 0 : Math.round(v * 100) / 100;

  return {
    u: roundedU,
    v: roundedV,
    speedMs: Math.round(speedMs * 100) / 100,
  };
}

/**
 * Evaluates the atmospheric ventilation potential based on surface wind speed
 * and optional planetary boundary layer height.
 * 
 * High wind (> 15 km/h) promotes active advective dispersion.
 * Low wind (< 5 km/h) creates stagnant conditions where winter smog accumulates.
 */
export function getVentilationRating(
  speedKmh: number,
  boundaryLayerM?: number | null
): { rating: VentilationRating; description: string } {
  if (speedKmh >= 18 || (boundaryLayerM && boundaryLayerM > 1200)) {
    return {
      rating: 'good',
      description: 'Strong advective wind promotes active atmospheric mixing and dispersion of surface emissions.',
    };
  }

  if (speedKmh >= 9 || (boundaryLayerM && boundaryLayerM > 600)) {
    return {
      rating: 'moderate',
      description: 'Moderate breeze supports baseline pollutant dispersion; localized traffic corridors may still experience accumulation.',
    };
  }

  if (speedKmh >= 4) {
    return {
      rating: 'poor',
      description: 'Light air movement restricts horizontal pollutant transport, favoring particulate accumulation near ground level.',
    };
  }

  return {
    rating: 'stagnant',
    description: 'Calm or stagnant atmospheric conditions. Minimal horizontal or vertical dispersion traps localized combustion emissions.',
  };
}
