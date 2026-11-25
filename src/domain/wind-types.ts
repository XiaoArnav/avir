/**
 * Global Wind-Flow & Atmospheric Intelligence Domain Types (V2)
 *
 * Defines canonical data contracts and atmospheric physics conversions for:
 * - City-level 10m wind vectors (`WindForecastResponse`)
 * - Global 10m wind-vector fields (`GlobalWindManifest`, `GlobalWindSnapshot`)
 *   from NOAA GFS and ECMWF IFS open-data GRIB2 feeds
 * - Meteorological wind direction (0-360 degrees from North)
 * - Surface wind ventilation indicators and location inspection readings
 */

export type GlobalWindModelId = 'gfs' | 'ifs';
export type GlobalWindOverlayKind = 'none' | 'speed' | 'temperature' | 'pressure';
export type WindSpeedUnit = 'km/h' | 'm/s' | 'mph';
export type GlobalWindFreshnessStatus =
  | 'current'
  | 'forecast'
  | 'historical'
  | 'stale'
  | 'unavailable';

export interface WindVectorPoint {
  latitude: number;
  longitude: number;
  u: number; // m/s (eastward component)
  v: number; // m/s (northward component)
  speedKmh: number;
  speedMs: number;
  directionDeg: number;
  heightM: number;
  label?: string;
  role?: 'active_target' | 'reference_probe';
  validTimeUtc?: string;
  sourceModel?: string;
}

export type VentilationRating = 'good' | 'moderate' | 'poor' | 'stagnant' | 'unavailable';

export type WindForecastStatus =
  | 'available'
  | 'partial'
  | 'stale_cached'
  | 'temporarily_unavailable'
  | 'upstream_timeout'
  | 'rate_limited'
  | 'invalid_upstream_response';

export interface WindForecastResponse {
  status: WindForecastStatus;
  isAvailable: boolean;
  isCached: boolean;
  isStale: boolean;
  cachedAtUtc?: string | null;
  unavailableReason?: string | null;
  model: string;
  modelRunAvailable: boolean;
  initTimeUtc: string | null;
  validTimeUtc: string | null;
  selectedHour: number;
  timeResolutionMode: 'utc_hour' | 'utc_instant';
  freshness?: GlobalWindFreshnessStatus;
  attribution: string;
  units: {
    speed: 'km/h';
    vector: 'm/s';
    direction: 'degrees';
    height: 'meters';
  };
  grid: WindVectorPoint[];
  cityWind: WindVectorPoint | null;
  ventilationRating: VentilationRating;
  ventilationIndicatorScope: 'wind_speed_only' | 'wind_and_blh' | 'unavailable';
  ventilationDescription: string;
  uncertaintyDisclosure: string;
}

export interface GlobalWindGridBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface GlobalWindGridGeometry {
  width: number;
  height: number;
  lo1: number;
  la1: number;
  dx: number;
  dy: number;
  bounds: GlobalWindGridBounds;
  resolutionDeg: number;
  nativeResolutionDeg: number;
}

export interface GlobalWindScalarMetadata {
  kind: 'temperature' | 'pressure';
  units: '°C' | 'hPa';
  level: string;
  min: number;
  max: number;
}

export interface GlobalWindCycleInfo {
  date: string; // YYYYMMDD
  hour: number; // 0, 6, 12, 18
  forecastHour: number;
}

export interface GlobalWindManifest {
  schemaVersion: 2;
  model: GlobalWindModelId;
  modelName: string;
  provider: string;
  initTimeUtc: string | null;
  validTimeUtc: string | null;
  forecastHour: number | null;
  retrievedAtUtc: string | null;
  grid: GlobalWindGridGeometry;
  level: '10 m above ground';
  units: 'm/s';
  overlay: GlobalWindOverlayKind;
  scalar?: GlobalWindScalarMetadata | null;
  scalarError?: string | null;
  status: WindForecastStatus;
  freshness: GlobalWindFreshnessStatus;
  ageMinutes: number | null;
  isAvailable: boolean;
  isCached: boolean;
  isStale: boolean;
  unavailableReason?: string | null;
  attribution: string;
  license: string;
  cycle: GlobalWindCycleInfo | null;
  gridUrl: string | null;
}

export interface GlobalWindSnapshot {
  manifest: GlobalWindManifest;
  u: Float32Array;
  v: Float32Array;
  scalarValues?: Float32Array | null;
}

export interface WindInspectionReading {
  latitude: number;
  longitude: number;
  u: number;
  v: number;
  speedMs: number;
  speedDisplay: number;
  speedUnits: WindSpeedUnit;
  fromDirectionDeg: number | null;
  toDirectionDeg: number | null;
  compassPoint: string;
  isCalm: boolean;
  scalarKind: GlobalWindOverlayKind;
  scalarValue: number | null;
  scalarUnits: string | null;
  model: GlobalWindModelId;
  modelName: string;
  initTimeUtc: string | null;
  validTimeUtc: string | null;
  freshness: GlobalWindFreshnessStatus;
  disclaimer: string;
}

/**
 * Converts meteorological wind speed (km/h) and direction (degrees from North)
 * into physical U (eastward) and V (northward) Cartesian vector components (m/s).
 *
 * Strictly rejects negative speeds, NaN, Infinity, and out-of-range directions [0, 360].
 * Preserves calm wind (0 km/h) cleanly as zero velocity.
 */
export function calculateWindUV(
  speedKmh: number,
  directionDeg: number
): { u: number; v: number; speedMs: number } {
  if (typeof speedKmh !== 'number' || !Number.isFinite(speedKmh) || speedKmh < 0) {
    throw new RangeError('Wind speedKmh must be a finite non-negative number.');
  }
  if (
    typeof directionDeg !== 'number' ||
    !Number.isFinite(directionDeg) ||
    directionDeg < 0 ||
    directionDeg > 360
  ) {
    throw new RangeError('Wind directionDeg must be a finite number between 0 and 360 degrees.');
  }

  if (speedKmh === 0) {
    return { u: 0, v: 0, speedMs: 0 };
  }

  const speedMs = speedKmh / 3.6;
  const rad = (directionDeg * Math.PI) / 180;

  const rawU = -speedMs * Math.sin(rad);
  const rawV = -speedMs * Math.cos(rad);

  const u = Math.abs(rawU) < 1e-6 ? 0 : Math.round(rawU * 1000) / 1000;
  const v = Math.abs(rawV) < 1e-6 ? 0 : Math.round(rawV * 1000) / 1000;
  const roundedSpeedMs = Math.round(speedMs * 1000) / 1000;

  return {
    u: Object.is(u, -0) ? 0 : u,
    v: Object.is(v, -0) ? 0 : v,
    speedMs: roundedSpeedMs,
  };
}

/**
 * Evaluates a qualitative atmospheric ventilation indicator from surface wind speed
 * and optional validated planetary boundary layer height.
 *
 * Note: Wind speed alone does not measure full pollutant dispersion or emission transport;
 * stability, vertical mixing depth, terrain, and emissions also govern ground concentrations.
 */
export function getVentilationRating(
  speedKmh: number | null | undefined,
  boundaryLayerM?: number | null
): {
  rating: VentilationRating;
  scope: 'wind_speed_only' | 'wind_and_blh' | 'unavailable';
  description: string;
} {
  if (typeof speedKmh !== 'number' || !Number.isFinite(speedKmh) || speedKmh < 0) {
    return {
      rating: 'unavailable',
      scope: 'unavailable',
      description:
        'Surface wind measurement is unavailable; wind-based ventilation indicator cannot be determined.',
    };
  }

  const hasValidBlh =
    typeof boundaryLayerM === 'number' && Number.isFinite(boundaryLayerM) && boundaryLayerM >= 0;
  const scope: 'wind_speed_only' | 'wind_and_blh' = hasValidBlh
    ? 'wind_and_blh'
    : 'wind_speed_only';
  const scopeSuffix = hasValidBlh
    ? ' Incorporates supplied surface wind speed and boundary-layer height; local stability, terrain, and emissions still vary.'
    : ' Surface wind-speed indicator only; boundary-layer mixing depth, stability, terrain, and local emissions are not measured here.';

  if (speedKmh >= 18 || (hasValidBlh && (boundaryLayerM as number) > 1200)) {
    return {
      rating: 'good',
      scope,
      description: `Strong advective wind promotes active atmospheric mixing relative to stagnant periods.${scopeSuffix}`,
    };
  }

  if (speedKmh >= 9 || (hasValidBlh && (boundaryLayerM as number) > 600)) {
    return {
      rating: 'moderate',
      scope,
      description: `Moderate surface wind indicates partial horizontal ventilation; localized traffic corridors may still accumulate pollutants.${scopeSuffix}`,
    };
  }

  if (speedKmh >= 4) {
    return {
      rating: 'poor',
      scope,
      description: `Light surface wind restricts horizontal air movement.${scopeSuffix}`,
    };
  }

  return {
    rating: 'stagnant',
    scope,
    description: `Calm or stagnant atmospheric conditions limit horizontal wind transport near ground level.${scopeSuffix}`,
  };
}
