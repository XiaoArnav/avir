/**
 * Global Atmospheric Wind Streamline Generator (Phase 4)
 *
 * Reproducible, renderer-independent streamline path baker using equal-area
 * Fibonacci/Golden-Angle seeding across the global wind vector grid.
 * Adapted from MIT-licensed God's Eye View architecture (Bilawal Sidhu).
 */

import {
  WindGridView,
  SampledWindVector,
  advectWindPosition,
  normalizeLongitude,
  sampleWindVector,
  shortestLongitudeDeltaDeg,
} from './wind-field';

export const WIND_PATH_LIMIT = 7200;
export const WIND_NARROW_PATH_LIMIT = 1200;
export const WIND_REDUCED_PERF_PATH_LIMIT = 2400;
export const WIND_PATH_STEPS = 16;
export const WIND_DISPLAY_HEIGHT_METERS = 12000;
export const WIND_CELL_DEGREES = 30;
const GOLDEN_ANGLE = 137.50776405003785;

export interface WindStreamlinePath {
  coordinates: Array<[number, number]>; // [longitude, latitude]
  speedMs: number;
  seed: number;
  phase: number;
}

export interface WindStreamlineCell {
  id: number;
  paths: WindStreamlinePath[];
}

export interface AdaptiveBudgetOptions {
  viewportWidth?: number;
  reducedPerformance?: boolean;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  explicitCap?: number;
}

export function resolveAdaptivePathBudget(options: AdaptiveBudgetOptions = {}): number {
  const {
    viewportWidth = 1280,
    reducedPerformance = false,
    hardwareConcurrency = 8,
    deviceMemory = 8,
    explicitCap,
  } = options;

  let budget = WIND_PATH_LIMIT;
  if (Number.isFinite(viewportWidth) && viewportWidth > 0 && viewportWidth < 700) {
    budget = WIND_NARROW_PATH_LIMIT;
  } else if (
    reducedPerformance ||
    (Number.isFinite(hardwareConcurrency) && hardwareConcurrency <= 2) ||
    (Number.isFinite(deviceMemory) && deviceMemory <= 2)
  ) {
    budget = WIND_REDUCED_PERF_PATH_LIMIT;
  }

  if (typeof explicitCap === 'number' && Number.isFinite(explicitCap) && explicitCap > 0) {
    budget = Math.min(budget, Math.floor(explicitCap));
  }

  return Math.max(0, Math.min(WIND_PATH_LIMIT, budget));
}

/**
 * Generates reproducible geographic streamlines once per validated forecast snapshot.
 * Equal-area sin(lat) seeding prevents polar overcrowding. Each vertex steps along
 * interpolated 10m wind vectors and halts cleanly on missing cells, calm wind, or poles.
 */
export function bakeWindStreamlines(
  grid: WindGridView,
  options: {
    count?: number;
    steps?: number;
    stepSeconds?: number;
  } = {}
): WindStreamlinePath[] {
  if (!grid || grid.width < 2 || grid.height < 2 || !(grid.dx > 0) || !(grid.dy > 0)) {
    return [];
  }

  const budget = Math.min(
    WIND_PATH_LIMIT,
    Math.max(0, Math.floor(Number.isFinite(options.count) ? (options.count as number) : WIND_PATH_LIMIT))
  );
  if (budget === 0) return [];

  const halfSteps = Math.min(
    WIND_PATH_STEPS,
    Math.max(1, Math.floor(Number.isFinite(options.steps) ? (options.steps as number) : WIND_PATH_STEPS))
  );
  const interval = Math.min(
    3600,
    Math.max(1, Number.isFinite(options.stepSeconds) ? (options.stepSeconds as number) : 1800)
  );

  const paths: WindStreamlinePath[] = [];
  const scratch: SampledWindVector = { u: 0, v: 0, speedMs: 0, isCalm: false, valid: false };
  const rad = Math.PI / 180;
  const sinSouth = Math.sin(-88 * rad);
  const sinNorth = Math.sin(88 * rad);
  const sinSpan = sinNorth - sinSouth;

  for (let seed = 0; seed < budget; seed++) {
    const lon = normalizeLongitude(seed * GOLDEN_ANGLE);
    const share = (seed + 0.5) / budget;
    const lat = Math.asin(sinSouth + share * sinSpan) / rad;
    const center: [number, number] = [lon, lat];

    sampleWindVector(grid, lon, lat, scratch);
    if (!scratch.valid || scratch.isCalm) continue;
    const speedMs = scratch.speedMs;

    const backward: Array<[number, number]> = [];
    const forward: Array<[number, number]> = [];

    for (const [direction, collector] of [
      [-1, backward],
      [1, forward],
    ] as const) {
      let point: [number, number] = center;
      for (let step = 0; step < halfSteps; step++) {
        const next = advectWindPosition(
          grid,
          point[0],
          point[1],
          direction * interval,
          0.75,
          scratch
        );
        if (!next) break;
        // Guard against large angular jumps near poles
        if (Math.abs(shortestLongitudeDeltaDeg(point[0], next[0])) > 10) break;
        collector.push(next);
        point = next;
      }
    }

    const coordinates: Array<[number, number]> = [...backward.reverse(), center, ...forward];
    if (coordinates.length < 3) continue;

    paths.push({
      coordinates,
      speedMs,
      seed,
      phase: ((seed + 1) * 0.6180339887498949) % 1,
    });
  }

  return paths;
}

/** Groups baked paths into 30° spatial culling cells by midpoint coordinate. */
export function groupWindPaths(
  paths: WindStreamlinePath[],
  cellDegrees = WIND_CELL_DEGREES
): WindStreamlineCell[] {
  if (!Number.isFinite(cellDegrees) || cellDegrees <= 0 || cellDegrees > 180) {
    throw new RangeError('Wind cell size must be between 0 and 180 degrees.');
  }

  const columns = Math.ceil(360 / cellDegrees);
  const rows = Math.ceil(180 / cellDegrees);
  const cells = new Map<number, WindStreamlineCell>();

  for (const path of paths) {
    const [lon, lat] = path.coordinates[Math.floor(path.coordinates.length / 2)];
    const col = Math.min(columns - 1, Math.max(0, Math.floor((normalizeLongitude(lon) + 180) / cellDegrees)));
    const row = Math.min(rows - 1, Math.max(0, Math.floor((lat + 90) / cellDegrees)));
    const id = row * columns + col;
    let cell = cells.get(id);
    if (!cell) {
      cell = { id, paths: [] };
      cells.set(id, cell);
    }
    cell.paths.push(path);
  }

  return Array.from(cells.values());
}
