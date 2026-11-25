/**
 * Global Atmospheric Wind-Field Mathematics & Bilinear Interpolation (Phase 3)
 *
 * Renderer-independent operations on validated equirectangular 10m wind grids:
 * - Bilinear U/V vector interpolation with longitude seam wrapping and antimeridian continuity
 * - Missing cell and out-of-bounds rejection (never fabricates fallback vectors)
 * - Calm wind threshold detection
 * - Geographic displacement accounting for latitudinal cosine contraction with polar safety clamps
 * - Scalar overlay sampling and deterministic fixed-scale raster generation (adapted from MIT-licensed
 *   God's Eye View architecture with attribution to Bilawal Sidhu)
 */

import type {
  GlobalWindGridGeometry,
  GlobalWindOverlayKind,
  GlobalWindSnapshot,
  WindInspectionReading,
  WindSpeedUnit,
} from './wind-types';

export const METERS_PER_DEGREE_LAT = 111_320;
export const CALM_WIND_THRESHOLD_MS = 0.15;
export const MAX_ADVECTION_LATITUDE = 88.5;
const MIN_COS_LAT_GUARD = 0.025; // Prevents division by zero near +-90 deg poles

export const WIND_SPEED_UNIT_FACTORS: Readonly<Record<WindSpeedUnit, number>> = Object.freeze({
  'km/h': 3.6,
  'm/s': 1,
  mph: 2.2369362921,
});

const COMPASS_16 = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
] as const;

export interface WindGridView {
  width: number;
  height: number;
  lo1: number;
  la1: number;
  dx: number;
  dy: number;
  u: Float32Array;
  v: Float32Array;
}

export interface SampledWindVector {
  u: number;
  v: number;
  speedMs: number;
  isCalm: boolean;
  valid: boolean;
}

export interface WindOverlayScaleSpec {
  kind: 'speed' | 'temperature' | 'pressure';
  label: string;
  units: string;
  min: number;
  max: number;
  stops: readonly string[];
}

export const WIND_OVERLAY_SCALES: Readonly<
  Record<'speed' | 'temperature' | 'pressure', WindOverlayScaleSpec>
> = Object.freeze({
  speed: Object.freeze({
    kind: 'speed',
    label: '10 m Wind Speed',
    units: 'm/s',
    min: 0,
    max: 30,
    stops: ['#133a67', '#2876a3', '#66c9d1', '#c8dfac', '#f1cf79', '#ee9761'],
  }),
  temperature: Object.freeze({
    kind: 'temperature',
    label: '2 m Air Temperature',
    units: '°C',
    min: -40,
    max: 50,
    stops: [
      '#31235b',
      '#403b92',
      '#315fc1',
      '#268fce',
      '#31bdd0',
      '#8ad4aa',
      '#f0d255',
      '#ee8a34',
      '#d74638',
      '#9f274d',
    ],
  }),
  pressure: Object.freeze({
    kind: 'pressure',
    label: 'Mean Sea-Level Pressure',
    units: 'hPa',
    min: 960,
    max: 1050,
    stops: ['#705ca0', '#6985b4', '#a5c3cd', '#d8c99a', '#dbad61'],
  }),
});

/** Normalize longitude into [-180, 180). */
export function normalizeLongitude(lon: number): number {
  if (!Number.isFinite(lon)) return Number.NaN;
  const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

/** Compute signed shortest angular difference (toLon - fromLon) in (-180, 180]. */
export function shortestLongitudeDeltaDeg(fromLon: number, toLon: number): number {
  const diff = ((((toLon - fromLon + 180) % 360) + 360) % 360) - 180;
  return diff === -180 ? 180 : Object.is(diff, -0) ? 0 : diff;
}

export function clampLatitude(lat: number, limit = 90): number {
  return Math.max(-limit, Math.min(limit, lat));
}

/** Return meters per degree of longitude at latitude, bounded safely away from 0 at poles. */
export function metersPerDegreeLon(lat: number): number {
  const cos = Math.max(MIN_COS_LAT_GUARD, Math.cos((clampLatitude(lat) * Math.PI) / 180));
  return METERS_PER_DEGREE_LAT * cos;
}

export function windSpeedMs(u: number, v: number): number {
  if (!Number.isFinite(u) || !Number.isFinite(v)) return Number.NaN;
  return Math.hypot(u, v);
}

export function convertWindSpeed(speedMs: number, unit: WindSpeedUnit): number {
  if (!Number.isFinite(speedMs) || speedMs < 0) return Number.NaN;
  const factor = WIND_SPEED_UNIT_FACTORS[unit] ?? WIND_SPEED_UNIT_FACTORS['km/h'];
  return speedMs * factor;
}

/** Meteorological direction wind is blowing FROM (degrees clockwise from North), or null if calm/invalid. */
export function windFromDirectionDeg(u: number, v: number): number | null {
  const speed = windSpeedMs(u, v);
  if (!Number.isFinite(speed) || speed < CALM_WIND_THRESHOLD_MS) return null;
  const deg = ((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360;
  return Object.is(deg, -0) ? 0 : deg;
}

/** Direction wind vector points TOWARD (degrees clockwise from North), or null if calm/invalid. */
export function windToDirectionDeg(u: number, v: number): number | null {
  const speed = windSpeedMs(u, v);
  if (!Number.isFinite(speed) || speed < CALM_WIND_THRESHOLD_MS) return null;
  const deg = ((Math.atan2(u, v) * 180) / Math.PI + 360) % 360;
  return Object.is(deg, -0) ? 0 : deg;
}

export function windCompassPoint(u: number, v: number): string {
  const speed = windSpeedMs(u, v);
  if (!Number.isFinite(speed)) return 'Unavailable';
  const fromDeg = windFromDirectionDeg(u, v);
  if (fromDeg === null) return 'Calm';
  return COMPASS_16[Math.round(fromDeg / 22.5) % 16];
}

export function toWindGridView(snapshot: GlobalWindSnapshot | WindGridView): WindGridView | null {
  if (!snapshot) return null;
  if ('manifest' in snapshot) {
    const g: GlobalWindGridGeometry = snapshot.manifest.grid;
    return {
      width: g.width,
      height: g.height,
      lo1: g.lo1,
      la1: g.la1,
      dx: g.dx,
      dy: g.dy,
      u: snapshot.u,
      v: snapshot.v,
    };
  }
  return snapshot;
}

/** Strict geometry & buffer validation; permits NaN individual cells when `requireAllFinite = false`. */
export function validateWindGrid(
  grid: WindGridView | null | undefined,
  { requireAllFinite = true }: { requireAllFinite?: boolean } = {}
): { ok: boolean; reason?: string } {
  if (!grid) return { ok: false, reason: 'Grid is missing.' };
  const { width, height, lo1, la1, dx, dy, u, v } = grid;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 2 ||
    height < 2 ||
    width * height > 1_000_000
  ) {
    return { ok: false, reason: 'Malformed wind grid dimensions.' };
  }
  if (![lo1, la1, dx, dy].every(Number.isFinite) || dx <= 0 || dy <= 0) {
    return { ok: false, reason: 'Invalid wind grid spacing or origin.' };
  }
  const count = width * height;
  if (!(u instanceof Float32Array) || !(v instanceof Float32Array)) {
    return { ok: false, reason: 'Wind U/V buffers must be Float32Array.' };
  }
  if (u.length !== count || v.length !== count) {
    return { ok: false, reason: 'Wind U/V buffer lengths do not match grid dimensions.' };
  }
  let finiteCount = 0;
  for (let i = 0; i < count; i++) {
    const validCell = Number.isFinite(u[i]) && Number.isFinite(v[i]);
    if (validCell) {
      finiteCount++;
    } else if (requireAllFinite) {
      return { ok: false, reason: `Non-finite wind sample at index ${i}.` };
    }
  }
  if (finiteCount === 0) {
    return { ok: false, reason: 'Wind grid contains no valid finite samples.' };
  }
  return { ok: true };
}

/**
 * Samples a north-to-south equirectangular wind grid bilinearly.
 * Rejects non-finite coordinates, out-of-range latitudes [-90, 90], or missing grid corners
 * without synthesizing artificial wind flow.
 */
export function sampleWindVector(
  grid: WindGridView,
  lon: number,
  lat: number,
  out: SampledWindVector = { u: 0, v: 0, speedMs: 0, isCalm: false, valid: false }
): SampledWindVector {
  if (
    !grid ||
    !Number.isFinite(lon) ||
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90 ||
    grid.width < 2 ||
    grid.height < 2 ||
    !(grid.dx > 0) ||
    !(grid.dy > 0)
  ) {
    out.u = 0;
    out.v = 0;
    out.speedMs = 0;
    out.isCalm = false;
    out.valid = false;
    return out;
  }

  const { width, height, lo1, la1, dx, dy, u, v } = grid;
  const wrapsGlobally = width * dx >= 359.99;

  let x: number;
  let x0: number;
  let x1: number;
  if (wrapsGlobally) {
    const lonDelta = ((((lon - lo1) % 360) + 360) % 360);
    x = lonDelta / dx;
    const base = Math.floor(x);
    x0 = ((base % width) + width) % width;
    x1 = (x0 + 1) % width;
    x = x - base;
  } else {
    const rel = lon - lo1;
    const wrappedRel = rel < 0 ? rel + 360 : rel;
    const clampedX = Math.max(0, Math.min(width - 1, wrappedRel / dx));
    x0 = Math.min(width - 2, Math.floor(clampedX));
    x1 = x0 + 1;
    x = clampedX - x0;
  }

  const y = Math.max(0, Math.min(height - 1, (la1 - lat) / dy));
  const y0 = Math.floor(y);
  const y1 = Math.min(height - 1, y0 + 1);
  const ty = y - y0;
  const tx = x;

  const a = y0 * width + x0;
  const b = y0 * width + x1;
  const c = y1 * width + x0;
  const d = y1 * width + x1;

  const ua = u[a], ub = u[b], uc = u[c], ud = u[d];
  const va = v[a], vb = v[b], vc = v[c], vd = v[d];

  if (
    !Number.isFinite(ua) ||
    !Number.isFinite(ub) ||
    !Number.isFinite(uc) ||
    !Number.isFinite(ud) ||
    !Number.isFinite(va) ||
    !Number.isFinite(vb) ||
    !Number.isFinite(vc) ||
    !Number.isFinite(vd)
  ) {
    out.u = 0;
    out.v = 0;
    out.speedMs = 0;
    out.isCalm = false;
    out.valid = false;
    return out;
  }

  const su = (ua * (1 - tx) + ub * tx) * (1 - ty) + (uc * (1 - tx) + ud * tx) * ty;
  const sv = (va * (1 - tx) + vb * tx) * (1 - ty) + (vc * (1 - tx) + vd * tx) * ty;
  const speed = Math.hypot(su, sv);

  out.u = Object.is(su, -0) ? 0 : su;
  out.v = Object.is(sv, -0) ? 0 : sv;
  out.speedMs = speed;
  out.isCalm = speed < CALM_WIND_THRESHOLD_MS;
  out.valid = true;
  return out;
}

/**
 * Integrates one bounded RK2 midpoint geographic displacement step along the wind field.
 * Stops safely at invalid cells, calm zones, and high-latitude polar boundaries.
 */
export function advectWindPosition(
  grid: WindGridView,
  lon: number,
  lat: number,
  dtSeconds: number,
  maxDegPerStep = 0.75,
  scratch: SampledWindVector = { u: 0, v: 0, speedMs: 0, isCalm: false, valid: false }
): [number, number] | null {
  sampleWindVector(grid, lon, lat, scratch);
  if (!scratch.valid || scratch.isCalm) return null;

  const lonRate = scratch.u / metersPerDegreeLon(lat);
  const latRate = scratch.v / METERS_PER_DEGREE_LAT;
  const maxRate = Math.max(Math.abs(lonRate), Math.abs(latRate), 1e-12);
  const boundedDt = Math.sign(dtSeconds) * Math.min(Math.abs(dtSeconds), maxDegPerStep / maxRate);

  const midLat = lat + latRate * boundedDt * 0.5;
  if (Math.abs(midLat) > MAX_ADVECTION_LATITUDE) return null;

  const midLon = normalizeLongitude(lon + lonRate * boundedDt * 0.5);
  sampleWindVector(grid, midLon, midLat, scratch);
  if (!scratch.valid) return null;

  const nextLat = lat + (scratch.v * boundedDt) / METERS_PER_DEGREE_LAT;
  const rawDeltaLon = (scratch.u * boundedDt) / metersPerDegreeLon(midLat);
  if (!Number.isFinite(nextLat) || !Number.isFinite(rawDeltaLon)) return null;
  if (Math.abs(nextLat) > MAX_ADVECTION_LATITUDE || Math.abs(rawDeltaLon) > 15) return null;

  const nextLon = normalizeLongitude(lon + rawDeltaLon);
  if (Math.abs(shortestLongitudeDeltaDeg(lon, nextLon)) + Math.abs(nextLat - lat) < 1e-8) {
    return null;
  }

  return [nextLon, nextLat];
}

export function sampleWindScalar(
  snapshot: GlobalWindSnapshot,
  lon: number,
  lat: number,
  kind: GlobalWindOverlayKind = snapshot.manifest.overlay
): number | null {
  if (!snapshot || !Number.isFinite(lon) || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    return null;
  }

  const grid = toWindGridView(snapshot);
  if (!grid) return null;

  if (kind === 'none' || kind === 'speed') {
    const sample = sampleWindVector(grid, lon, lat);
    return sample.valid ? sample.speedMs : null;
  }

  const scalarMeta = snapshot.manifest.scalar;
  const values = snapshot.scalarValues;
  if (!scalarMeta || scalarMeta.kind !== kind || !(values instanceof Float32Array)) {
    return null;
  }

  const { width, height, lo1, la1, dx, dy } = grid;
  if (values.length !== width * height) return null;

  const x = ((((lon - lo1) % 360) + 360) % 360) / dx;
  const xBase = Math.floor(x);
  const tx = x - xBase;
  const left = ((xBase % width) + width) % width;
  const right = (left + 1) % width;

  const y = Math.max(0, Math.min(height - 1, (la1 - lat) / dy));
  const y0 = Math.floor(y);
  const y1 = Math.min(height - 1, y0 + 1);
  const ty = y - y0;

  const a = values[y0 * width + left];
  const b = values[y0 * width + right];
  const c = values[y1 * width + left];
  const d = values[y1 * width + right];
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c) || !Number.isFinite(d)) {
    return null;
  }

  const val = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  return Number.isFinite(val) ? val : null;
}

function buildColorPalette(stops: readonly string[]): number[][] {
  const rgbStops = stops.map((hex) =>
    (hex.match(/\w\w/g) ?? ['00', '00', '00']).map((part) => parseInt(part, 16))
  );
  return Array.from({ length: 128 }, (_, i) => {
    const pos = (i / 127) * (rgbStops.length - 1);
    const idx = Math.min(rgbStops.length - 2, Math.floor(pos));
    const frac = pos - idx;
    return rgbStops[idx].map((val, ch) => Math.round(val + (rgbStops[idx + 1][ch] - val) * frac));
  });
}

const SCALAR_PALETTES: Record<'speed' | 'temperature' | 'pressure', number[][]> = {
  speed: buildColorPalette(WIND_OVERLAY_SCALES.speed.stops),
  temperature: buildColorPalette(WIND_OVERLAY_SCALES.temperature.stops),
  pressure: buildColorPalette(WIND_OVERLAY_SCALES.pressure.stops),
};

/**
 * Builds an equirectangular (-180..+180 deg, +90..-90 deg) RGBA overlay raster for
 * Speed, 2m Temperature, or MSL Pressure once on snapshot load (never per animation frame).
 */
export function createWindOverlayRaster(
  snapshot: GlobalWindSnapshot,
  kind: 'speed' | 'temperature' | 'pressure',
  width = 360,
  height = 181
): { width: number; height: number; rgba: Uint8ClampedArray } | null {
  const scale = WIND_OVERLAY_SCALES[kind];
  if (
    !scale ||
    !snapshot ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 2 ||
    height < 2 ||
    width > 720 ||
    height > 362
  ) {
    return null;
  }

  if (
    kind !== 'speed' &&
    (!snapshot.manifest.scalar ||
      snapshot.manifest.scalar.kind !== kind ||
      !(snapshot.scalarValues instanceof Float32Array))
  ) {
    return null;
  }

  const rgba = new Uint8ClampedArray(width * height * 4);
  const palette = SCALAR_PALETTES[kind];
  let finiteCount = 0;

  for (let y = 0; y < height; y++) {
    const lat = 90 - ((y + 0.5) / height) * 180;
    for (let x = 0; x < width; x++) {
      const lon = -180 + ((x + 0.5) / width) * 360;
      const val = sampleWindScalar(snapshot, lon, lat, kind);
      if (val === null) continue;
      const t = Math.max(0, Math.min(1, (val - scale.min) / (scale.max - scale.min)));
      const rgb = palette[Math.round(t * 127)];
      const offset = (y * width + x) * 4;
      rgba[offset] = rgb[0];
      rgba[offset + 1] = rgb[1];
      rgba[offset + 2] = rgb[2];
      const alpha =
        kind === 'speed'
          ? 0.22 + 0.43 * Math.sqrt(t)
          : kind === 'pressure'
            ? 0.24 + 0.3 * Math.min(1, Math.abs(val - 1013) / 40)
            : 0.78;
      rgba[offset + 3] = Math.round(255 * alpha);
      finiteCount++;
    }
  }

  return finiteCount > 0 ? { width, height, rgba } : null;
}

/**
 * Inspects wind at any geographic location from the active validated global snapshot.
 * Strictly returns null if coordinates are invalid or snapshot data is unavailable.
 */
export function inspectWindAtPoint(
  snapshot: GlobalWindSnapshot | null | undefined,
  latitude: number,
  longitude: number,
  options: { speedUnits?: WindSpeedUnit; overlay?: GlobalWindOverlayKind } = {}
): WindInspectionReading | null {
  if (!snapshot || !snapshot.manifest.isAvailable) return null;
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90
  ) {
    return null;
  }

  const grid = toWindGridView(snapshot);
  if (!grid) return null;
  const normalizedLon = normalizeLongitude(longitude);
  const vec = sampleWindVector(grid, normalizedLon, latitude);
  if (!vec.valid) return null;

  const speedUnits = options.speedUnits ?? 'km/h';
  const overlay = options.overlay ?? snapshot.manifest.overlay ?? 'none';

  let scalarValue: number | null = null;
  let scalarUnits: string | null = null;
  if (overlay === 'temperature' || overlay === 'pressure') {
    scalarValue = sampleWindScalar(snapshot, normalizedLon, latitude, overlay);
    scalarUnits = overlay === 'temperature' ? '°C' : 'hPa';
  } else if (overlay === 'speed') {
    scalarValue = convertWindSpeed(vec.speedMs, speedUnits);
    scalarUnits = speedUnits;
  }

  return {
    latitude,
    longitude: normalizedLon,
    u: Math.round(vec.u * 100) / 100,
    v: Math.round(vec.v * 100) / 100,
    speedMs: Math.round(vec.speedMs * 100) / 100,
    speedDisplay: Math.round(convertWindSpeed(vec.speedMs, speedUnits) * 10) / 10,
    speedUnits,
    fromDirectionDeg: vec.isCalm ? null : Math.round(windFromDirectionDeg(vec.u, vec.v) ?? 0),
    toDirectionDeg: vec.isCalm ? null : Math.round(windToDirectionDeg(vec.u, vec.v) ?? 0),
    compassPoint: windCompassPoint(vec.u, vec.v),
    isCalm: vec.isCalm,
    scalarKind: overlay,
    scalarValue: scalarValue !== null ? Math.round(scalarValue * 10) / 10 : null,
    scalarUnits,
    model: snapshot.manifest.model,
    modelName: snapshot.manifest.modelName,
    initTimeUtc: snapshot.manifest.initTimeUtc,
    validTimeUtc: snapshot.manifest.validTimeUtc,
    freshness: snapshot.manifest.freshness,
    disclaimer:
      'Interpolated 10 m model forecast on ~1° global grid. Synoptic forecast flow — not a direct local sensor measurement or pollution-attribution proof.',
  };
}
