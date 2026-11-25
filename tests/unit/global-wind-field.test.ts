import { describe, it, expect } from 'vitest';
import {
  CALM_WIND_THRESHOLD_MS,
  WIND_OVERLAY_SCALES,
  WindGridView,
  advectWindPosition,
  convertWindSpeed,
  createWindOverlayRaster,
  inspectWindAtPoint,
  metersPerDegreeLon,
  normalizeLongitude,
  sampleWindScalar,
  sampleWindVector,
  shortestLongitudeDeltaDeg,
  validateWindGrid,
  windCompassPoint,
  windFromDirectionDeg,
  windSpeedMs,
  windToDirectionDeg,
} from '@/domain/wind-field';
import {
  WIND_CELL_DEGREES,
  WIND_NARROW_PATH_LIMIT,
  WIND_PATH_LIMIT,
  WIND_REDUCED_PERF_PATH_LIMIT,
  bakeWindStreamlines,
  groupWindPaths,
  resolveAdaptivePathBudget,
} from '@/domain/wind-streamlines';
import type { GlobalWindSnapshot } from '@/domain/wind-types';

function createUniformGrid(width = 36, height = 19, uVal = 10, vVal = 0): WindGridView {
  const dx = 360 / width;
  const dy = 180 / (height - 1);
  return {
    width,
    height,
    lo1: 0,
    la1: 90,
    dx,
    dy,
    u: new Float32Array(width * height).fill(uVal),
    v: new Float32Array(width * height).fill(vVal),
  };
}

function makeSnapshotFromGrid(grid: WindGridView): GlobalWindSnapshot {
  const count = grid.width * grid.height;
  return {
    manifest: {
      schemaVersion: 2,
      model: 'gfs',
      modelName: 'NOAA GFS (0.25° -> 1° grid)',
      provider: 'NOAA / NCEP Open Data',
      initTimeUtc: '2026-11-25T00:00:00.000Z',
      validTimeUtc: '2026-11-25T06:00:00.000Z',
      forecastHour: 6,
      retrievedAtUtc: '2026-11-25T06:01:00.000Z',
      grid: {
        width: grid.width,
        height: grid.height,
        lo1: grid.lo1,
        la1: grid.la1,
        dx: grid.dx,
        dy: grid.dy,
        bounds: { west: -180, south: -90, east: 180, north: 90 },
        resolutionDeg: grid.dx,
        nativeResolutionDeg: 0.25,
      },
      level: '10 m above ground',
      units: 'm/s',
      overlay: 'temperature',
      scalar: {
        kind: 'temperature',
        units: '°C',
        level: '2 m above ground',
        min: -40,
        max: 50,
      },
      scalarError: null,
      status: 'available',
      freshness: 'current',
      ageMinutes: 1,
      isAvailable: true,
      isCached: false,
      isStale: false,
      unavailableReason: null,
      attribution: 'NOAA / NCEP GFS',
      license: 'Public Domain',
      cycle: { date: '20261125', hour: 0, forecastHour: 6 },
      gridUrl: '/api/environment/wind/global/grid?model=gfs&overlay=temperature&date=20261125&hour=0&step=6',
    },
    u: grid.u,
    v: grid.v,
    scalarValues: new Float32Array(count).fill(22.5),
  };
}

describe('Phase 3 & 4: Wind-Field Vector Mathematics, Bilinear Interpolation & Streamlines', () => {
  it('bilinearly interpolates U and V components accurately and wraps longitudes seamlessly', () => {
    // 4 cols (0, 90, 180, 270), 3 rows (90N, 0, 90S)
    const grid: WindGridView = {
      width: 4,
      height: 3,
      lo1: 0,
      la1: 90,
      dx: 90,
      dy: 90,
      u: new Float32Array([
        0, 10, 20, 10,
        4, 12, 20, 8,
        0, 2, 4, 2,
      ]),
      v: new Float32Array([
        0, 0, 0, 0,
        2, 6, 10, 4,
        0, 0, 0, 0,
      ]),
    };

    // Exact grid vertex at lon=90, lat=0
    const p1 = sampleWindVector(grid, 90, 0);
    expect(p1.valid).toBe(true);
    expect(p1.u).toBeCloseTo(12, 5);
    expect(p1.v).toBeCloseTo(6, 5);

    // Midpoint across wrap seam: lon=315° (equivalently -45°) midway between 270 (idx 3) and 0 (idx 0)
    const pNeg = sampleWindVector(grid, -45, 0);
    const pPos = sampleWindVector(grid, 315, 0);
    expect(pNeg.valid).toBe(true);
    expect(pPos.valid).toBe(true);
    expect(pNeg.u).toBeCloseTo(6, 5); // avg(8, 4)
    expect(pNeg.v).toBeCloseTo(3, 5); // avg(4, 2)
    expect(pPos.u).toBeCloseTo(pNeg.u, 6);
    expect(pPos.v).toBeCloseTo(pNeg.v, 6);

    // Equivalence with shifted origin lo1 = 180 (ECMWF IFS convention)
    const ifsOriginGrid: WindGridView = {
      ...grid,
      lo1: 180,
      u: new Float32Array([
        20, 10, 0, 10,
        20, 8, 4, 12,
        4, 2, 0, 2,
      ]),
      v: new Float32Array([
        0, 0, 0, 0,
        10, 4, 2, 6,
        0, 0, 0, 0,
      ]),
    };
    const pIfs = sampleWindVector(ifsOriginGrid, -45, 0);
    expect(pIfs.u).toBeCloseTo(pNeg.u, 5);
    expect(pIfs.v).toBeCloseTo(pNeg.v, 5);
  });

  it('rejects out-of-range latitudes, NaN coordinates, and missing grid cells without inventing flow', () => {
    const grid = createUniformGrid(12, 7, 8, 4);
    grid.u[3 * 12 + 5] = Number.NaN;

    expect(sampleWindVector(grid, 77, 91).valid).toBe(false);
    expect(sampleWindVector(grid, 77, -91).valid).toBe(false);
    expect(sampleWindVector(grid, Number.NaN, 28).valid).toBe(false);
    expect(sampleWindVector(grid, 77, Number.POSITIVE_INFINITY).valid).toBe(false);

    // Sample touching the NaN corner must return invalid cleanly
    const nanCellLon = 5 * grid.dx;
    const nanCellLat = 90 - 3 * grid.dy;
    const missing = sampleWindVector(grid, nanCellLon + 1, nanCellLat - 1);
    expect(missing.valid).toBe(false);
    expect(missing.u).toBe(0);
    expect(missing.v).toBe(0);

    // Non-finite grids fail strict validation
    expect(validateWindGrid(grid, { requireAllFinite: true }).ok).toBe(false);
    expect(validateWindGrid(grid, { requireAllFinite: false }).ok).toBe(true);
  });

  it('detects calm wind cleanly without fabricating bearing or advection', () => {
    const calmGrid = createUniformGrid(12, 7, 0.05, 0.05);
    const sample = sampleWindVector(calmGrid, 77.2, 28.6);
    expect(sample.valid).toBe(true);
    expect(sample.speedMs).toBeLessThan(CALM_WIND_THRESHOLD_MS);
    expect(sample.isCalm).toBe(true);
    expect(windFromDirectionDeg(0.05, 0.05)).toBeNull();
    expect(windToDirectionDeg(0.05, 0.05)).toBeNull();
    expect(windCompassPoint(0.05, 0.05)).toBe('Calm');
    expect(advectWindPosition(calmGrid, 77.2, 28.6, 1800)).toBeNull();
  });

  it('computes wind speeds, unit conversions, and cardinal meteorological/flow directions accurately', () => {
    expect(windSpeedMs(3, 4)).toBe(5);
    expect(convertWindSpeed(10, 'm/s')).toBe(10);
    expect(convertWindSpeed(10, 'km/h')).toBe(36);
    expect(convertWindSpeed(10, 'mph')).toBeCloseTo(22.369, 2);

    // Pure eastward flow (u=+10, v=0) comes FROM West (270°) and blows TOWARD East (90°)
    expect(windFromDirectionDeg(10, 0)).toBeCloseTo(270, 5);
    expect(windToDirectionDeg(10, 0)).toBeCloseTo(90, 5);
    expect(windCompassPoint(10, 0)).toBe('W');

    // Pure northward flow (u=0, v=+10) comes FROM South (180°) and blows TOWARD North (0°)
    expect(windFromDirectionDeg(0, 10)).toBeCloseTo(180, 5);
    expect(windCompassPoint(0, 10)).toBe('S');

    // Pure southward flow (u=0, v=-10) comes FROM North (0°)
    expect(windFromDirectionDeg(0, -10)).toBeCloseTo(0, 5);
    expect(windCompassPoint(0, -10)).toBe('N');
  });

  it('crosses the antimeridian (±180°) smoothly without discontinuities and stays bounded near poles', () => {
    const eastFlowGrid = createUniformGrid(36, 19, 15, 0);
    const stepAcrossSeam = advectWindPosition(eastFlowGrid, 179.6, 10, 3600, 1.5);
    expect(stepAcrossSeam).not.toBeNull();
    const [nextLon, nextLat] = stepAcrossSeam!;
    expect(nextLon).toBeLessThan(0); // Wrapped across +180 into -179.. range
    expect(Math.abs(shortestLongitudeDeltaDeg(179.6, nextLon))).toBeLessThan(2);
    expect(nextLat).toBeCloseTo(10, 5);

    // Polar longitudinal scaling never divides by zero or produces Infinity
    expect(Number.isFinite(metersPerDegreeLon(89.99))).toBe(true);
    expect(metersPerDegreeLon(90)).toBeGreaterThan(0);

    const poleNorthWind = createUniformGrid(36, 19, 0, 20);
    expect(advectWindPosition(poleNorthWind, 0, 88.6, 1800)).toBeNull();
    expect(advectWindPosition(poleNorthWind, 0, -88.6, -1800)).toBeNull();
  });

  it('bakes reproducible equal-area streamlines, groups 30° cells, and honors adaptive budgets', () => {
    const grid = createUniformGrid(36, 19, 12, 3);
    const paths1 = bakeWindStreamlines(grid, { count: 200, steps: 8 });
    const paths2 = bakeWindStreamlines(grid, { count: 200, steps: 8 });

    expect(paths1.length).toBeGreaterThan(150);
    expect(paths1.length).toBe(paths2.length);
    expect(paths1[0]).toEqual(paths2[0]);

    // Check antimeridian continuity on every consecutive coordinate pair
    for (const p of paths1) {
      for (let i = 1; i < p.coordinates.length; i++) {
        const dLon = Math.abs(shortestLongitudeDeltaDeg(p.coordinates[i - 1][0], p.coordinates[i][0]));
        const dLat = Math.abs(p.coordinates[i][1] - p.coordinates[i - 1][1]);
        expect(dLon).toBeLessThanOrEqual(10);
        expect(dLat).toBeLessThanOrEqual(5);
      }
    }

    const cells = groupWindPaths(paths1, WIND_CELL_DEGREES);
    expect(cells.length).toBeGreaterThan(10);

    expect(resolveAdaptivePathBudget({ viewportWidth: 1440 })).toBe(WIND_PATH_LIMIT);
    expect(resolveAdaptivePathBudget({ viewportWidth: 390 })).toBe(WIND_NARROW_PATH_LIMIT);
    expect(resolveAdaptivePathBudget({ viewportWidth: 1440, reducedPerformance: true })).toBe(
      WIND_REDUCED_PERF_PATH_LIMIT
    );
    expect(normalizeLongitude(181)).toBeCloseTo(-179, 5);
  });

  it('generates scalar overlay rasters and inspects wind readings cleanly at arbitrary coordinates', () => {
    const grid = createUniformGrid(36, 19, -5, 5);
    const snapshot = makeSnapshotFromGrid(grid);

    const tempVal = sampleWindScalar(snapshot, 77.209, 28.6139, 'temperature');
    expect(tempVal).toBeCloseTo(22.5, 4);

    const pressureUnavailable = sampleWindScalar(snapshot, 77.209, 28.6139, 'pressure');
    expect(pressureUnavailable).toBeNull();
    expect(WIND_OVERLAY_SCALES.temperature.units).toBe('°C');

    const raster = createWindOverlayRaster(snapshot, 'temperature', 36, 18);
    expect(raster).not.toBeNull();
    expect(raster!.rgba.length).toBe(36 * 18 * 4);
    expect(createWindOverlayRaster(snapshot, 'pressure', 36, 18)).toBeNull();

    const reading = inspectWindAtPoint(snapshot, 28.6139, 77.209, {
      speedUnits: 'mph',
      overlay: 'temperature',
    });
    expect(reading).not.toBeNull();
    expect(reading!.compassPoint).toBe('SE');
    expect(reading!.speedUnits).toBe('mph');
    expect(reading!.scalarValue).toBeCloseTo(22.5, 1);
    expect(reading!.scalarUnits).toBe('°C');
    expect(reading!.model).toBe('gfs');
  });
});
