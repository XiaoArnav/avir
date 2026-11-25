import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildGibsSnapshotUrl,
  getBoundingBoxForCoordinates,
  resolveImageryProduct,
  validateGeographicBoundingBox,
  validateImageryDate,
  SUPPORTED_IMAGERY_PRODUCTS,
  SATELLITE_IMAGERY_DISCLAIMER,
} from '@/domain/imagery-types';
import {
  getAvailableImageryDates,
  buildSatelliteComparison,
  parseGibsXmlTimeMatch,
  verifyImageryAvailability,
} from '@/services/environment/satellite-imagery-service';

describe('Phase 6: NASA GIBS Satellite Imagery & Comparison Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1-2. validates canonical NASA GIBS product identifiers and rejects unsupported products without silent substitution', () => {
    const viirs = resolveImageryProduct('VIIRS');
    expect(viirs.gibsLayer).toBe('VIIRS_NOAA21_CorrectedReflectance_TrueColor');
    expect(viirs.measurementType).toContain('Corrected');
    expect(viirs.resolutionM).toBe(375);

    const hls = resolveImageryProduct('HLS_S30');
    expect(hls.gibsLayer).toBe('HLS_S30_Nadir_BRDF_Adjusted_Reflectance');
    expect(hls.measurementType).toContain('Surface Reflectance');
    expect(hls.resolutionM).toBe(30);
    expect(hls.measurementType).not.toBe(viirs.measurementType);

    expect(() => resolveImageryProduct('MODIS')).toThrow(/Unsupported NASA GIBS imagery product/);
    expect(() => resolveImageryProduct('__proto__')).toThrow(/Unsupported NASA GIBS imagery product/);
    expect(() => resolveImageryProduct('')).toThrow(/Unsupported NASA GIBS imagery product/);
  });

  it('3-8. enforces strict YYYY-MM-DD UTC dates, leap-year calendar rules, future rejection, and UTC midnight boundaries', () => {
    const refBeforeMidnight = new Date('2026-11-24T23:59:59Z');
    const refAfterMidnight = new Date('2026-11-25T00:00:01Z');

    // Valid dates & valid leap day (2024 is leap year)
    expect(validateImageryDate('2024-02-29', { referenceNow: refBeforeMidnight })).toBe('2024-02-29');
    expect(validateImageryDate('2026-11-24', { referenceNow: refBeforeMidnight })).toBe('2026-11-24');

    // Malformed strings
    expect(() => validateImageryDate('2026-11-1')).toThrow();
    expect(() => validateImageryDate('2026/11/20')).toThrow();
    expect(() => validateImageryDate('2026-11-20T00:00:00Z')).toThrow();
    expect(() => validateImageryDate('not-a-date')).toThrow();

    // Impossible calendar & non-leap Feb 29 dates
    expect(() => validateImageryDate('2025-02-29')).toThrow();
    expect(() => validateImageryDate('2026-02-30')).toThrow();
    expect(() => validateImageryDate('2026-04-31')).toThrow();
    expect(() => validateImageryDate('2026-13-01')).toThrow();

    // Future rejection at exact UTC boundary
    expect(() =>
      validateImageryDate('2026-11-25', { referenceNow: refBeforeMidnight })
    ).toThrow(/Future imagery date/);
    expect(validateImageryDate('2026-11-25', { referenceNow: refAfterMidnight })).toBe('2026-11-25');
  });

  it('9-12. validates coordinates, rejects NaN/Infinity/invalid radii, handles high latitudes, and refuses inverted or silently truncated IDL/polar extents', () => {
    // Valid Delhi box
    const bbox = getBoundingBoxForCoordinates(28.6139, 77.209, 50);
    expect(bbox.west).toBeLessThan(77.209);
    expect(bbox.east).toBeGreaterThan(77.209);
    expect(bbox.south).toBeLessThan(28.6139);
    expect(bbox.north).toBeGreaterThan(28.6139);
    expect(bbox.south).toBeGreaterThanOrEqual(-85);
    expect(bbox.north).toBeLessThanOrEqual(85);

    // High latitude (75°N, r=50km): longitude span widens properly without truncation
    const arcticBbox = getBoundingBoxForCoordinates(75, 10, 50);
    expect(arcticBbox.east - arcticBbox.west).toBeGreaterThan((arcticBbox.north - arcticBbox.south) * 2.5);

    // Polar truncation refused explicitly
    expect(() => getBoundingBoxForCoordinates(89.5, 10, 150)).toThrow(/polar|single-snapshot/i);

    // International date line crossing refused rather than silently truncated or inverted
    expect(() => getBoundingBoxForCoordinates(0, 179.8, 80)).toThrow(/date line|±180/i);
    expect(() => getBoundingBoxForCoordinates(0, -179.8, 80)).toThrow(/date line|±180/i);

    // Invalid coordinates & radius values
    expect(() => getBoundingBoxForCoordinates(NaN, 77.2, 80)).toThrow();
    expect(() => getBoundingBoxForCoordinates(28.6, Infinity, 80)).toThrow();
    expect(() => getBoundingBoxForCoordinates(-91, 77.2, 80)).toThrow();
    expect(() => getBoundingBoxForCoordinates(28.6, 181, 80)).toThrow();
    expect(() => getBoundingBoxForCoordinates(28.6, 77.2, 0)).toThrow();
    expect(() => getBoundingBoxForCoordinates(28.6, 77.2, -50)).toThrow();
    expect(() => getBoundingBoxForCoordinates(28.6, 77.2, Infinity)).toThrow();

    // Direct bbox validator rejects inverted boxes
    expect(() =>
      validateGeographicBoundingBox({ west: 78, south: 28, east: 77, north: 29 })
    ).toThrow(/inverted/i);
    expect(() =>
      validateGeographicBoundingBox({ west: 76, south: 30, east: 77, north: 29 })
    ).toThrow(/inverted/i);
  });

  it('13. constructs valid keyless NASA WVS GetSnapshot URLs and rejects invalid inputs', () => {
    const bbox = { west: 76.8, south: 28.3, east: 77.6, north: 28.9 };
    const refNow = new Date('2026-11-24T12:00:00Z');

    const url = buildGibsSnapshotUrl({
      product: 'VIIRS',
      date: '2026-11-20',
      bbox,
      width: 1024,
      height: 768,
      referenceNow: refNow,
    });

    expect(url).toContain('https://wvs.earthdata.nasa.gov/api/v1/snapshot?REQUEST=GetSnapshot');
    expect(url).toContain('TIME=2026-11-20');
    expect(url).toContain('BBOX=28.3000,76.8000,28.9000,77.6000');
    expect(url).toContain('CRS=EPSG:4326');
    expect(url).toContain(`LAYERS=${SUPPORTED_IMAGERY_PRODUCTS.VIIRS.gibsLayer}`);
    expect(url).toContain('FORMAT=image/jpeg');
    expect(url).toContain('WIDTH=1024');
    expect(url).toContain('HEIGHT=768');

    const hlsUrl = buildGibsSnapshotUrl({
      product: 'HLS_S30',
      date: '2026-11-20',
      bbox,
      referenceNow: refNow,
    });
    expect(hlsUrl).toContain(`LAYERS=${SUPPORTED_IMAGERY_PRODUCTS.HLS_S30.gibsLayer}`);
    expect(hlsUrl).toContain('FORMAT=image/png');

    expect(() =>
      buildGibsSnapshotUrl({
        product: 'INVALID_LAYER' as any,
        date: '2026-11-20',
        bbox,
        referenceNow: refNow,
      })
    ).toThrow();
    expect(() =>
      buildGibsSnapshotUrl({
        product: 'VIIRS',
        date: '2026-11-20',
        bbox: { west: 78, south: 28, east: 77, north: 29 },
        referenceNow: refNow,
      })
    ).toThrow();
    expect(() =>
      buildGibsSnapshotUrl({
        product: 'VIIRS',
        date: '2026-11-20',
        bbox,
        width: 10,
        referenceNow: refNow,
      })
    ).toThrow();
  });

  it('14-16. never labels calendar dates as verified available imagery and verifies NASA GIBS XML domain states cleanly', async () => {
    const refNow = new Date('2026-11-25T05:00:00Z');
    const candidates = getAvailableImageryDates(14, { product: 'VIIRS', referenceNow: refNow });

    expect(candidates).toHaveLength(14);
    expect(candidates[0].date).toBe('2026-11-24');
    expect(candidates.every((c) => c.availability === 'unverified')).toBe(true);
    expect(candidates.every((c) => c.verifiedObservationDate === null)).toBe(true);
    expect(new Date(candidates[0].date).getTime()).toBeGreaterThan(
      new Date(candidates[13].date).getTime()
    );

    const bbox = getBoundingBoxForCoordinates(28.6139, 77.209, 50);

    // Date before VIIRS NOAA-21 operational start -> 'unavailable'
    const preMission = await verifyImageryAvailability({
      product: 'VIIRS',
      date: '2022-01-15',
      bbox,
      referenceNow: refNow,
    });
    expect(preMission.availability).toBe('unavailable');
    expect(preMission.verifiedObservationDate).toBeNull();

    // NASA GIBS XML Domains confirms date -> 'verified_available'
    const verified = await verifyImageryAvailability({
      product: 'VIIRS',
      date: '2026-11-20',
      bbox,
      referenceNow: refNow,
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          `<Domains><SpaceTimeConstraint><Dimension>Time</Dimension><Value>2026-01-01/2026-11-24/P1D</Value></SpaceTimeConstraint></Domains>`,
      }) as any,
    });
    expect(verified.availability).toBe('verified_available');
    expect(verified.verifiedObservationDate).toBe('2026-11-20');

    // NASA GIBS XML excludes requested date -> 'unavailable'
    const missingInXml = await verifyImageryAvailability({
      product: 'HLS_S30',
      date: '2026-11-22',
      bbox,
      referenceNow: refNow,
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          `<Domains><SpaceTimeConstraint><Value>2026-11-01/2026-11-20/P1D</Value></SpaceTimeConstraint></Domains>`,
      }) as any,
    });
    expect(missingInXml.availability).toBe('unavailable');

    // Network failure / HTTP 503 -> 'unverified' (never fabricated!)
    const offline = await verifyImageryAvailability({
      product: 'VIIRS',
      date: '2026-11-20',
      bbox,
      referenceNow: refNow,
      fetchImpl: vi.fn().mockRejectedValue(new Error('Network offline')) as any,
    });
    expect(offline.availability).toBe('unverified');
    expect(offline.verifiedObservationDate).toBeNull();

    expect(parseGibsXmlTimeMatch('not-xml', '2026-11-20')).toBe('unparseable');
  });

  it('23-24. builds aligned before/after comparisons with honest availability, attribution, and scientific disclaimer', () => {
    const refNow = new Date('2026-11-25T05:00:00Z');
    const comparison = buildSatelliteComparison({
      city: 'Delhi NCR',
      latitude: 28.6139,
      longitude: 77.209,
      dateA: '2026-11-01',
      dateB: '2026-11-20',
      productA: 'VIIRS',
      productB: 'HLS_S30',
      referenceNow: refNow,
    });

    expect(comparison.city).toBe('Delhi NCR');
    expect(comparison.crs).toBe('EPSG:4326');
    expect(comparison.slotA.coverageExtent).toEqual(comparison.slotB.coverageExtent);
    expect(comparison.slotA.date).toBe('2026-11-01');
    expect(comparison.slotB.date).toBe('2026-11-20');

    // Unverified by default without metadata confirmation
    expect(comparison.slotA.availability).toBe('unverified');
    expect(comparison.slotA.verifiedAcquisitionDate).toBeNull();
    expect(comparison.slotA.imageUrl).toContain('TIME=2026-11-01');
    expect(comparison.slotB.imageUrl).toContain('TIME=2026-11-20');

    // Date prior to NOAA-21 VIIRS start marks slot unavailable with null imageUrl
    const unavailableComparison = buildSatelliteComparison({
      city: 'Delhi NCR',
      latitude: 28.6139,
      longitude: 77.209,
      dateA: '2022-05-01',
      dateB: '2026-11-20',
      productA: 'VIIRS',
      productB: 'HLS_S30',
      referenceNow: refNow,
    });
    expect(unavailableComparison.slotA.availability).toBe('unavailable');
    expect(unavailableComparison.slotA.imageUrl).toBeNull();
    expect(unavailableComparison.slotA.date).toBe('2022-05-01');

    // Strict scientific disclaimer invariant
    expect(comparison.disclaimer).toBe(SATELLITE_IMAGERY_DISCLAIMER);
    expect(comparison.disclaimer).toContain('PM2.5, PM10, AQI');
    expect(comparison.disclaimer).toContain('does not independently prove pollution trends');
  });
});
