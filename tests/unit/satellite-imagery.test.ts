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
    const bbox = getBoundingBoxForCoordinates(28.6139, 77.209, 50);
    expect(bbox.west).toBeLessThan(77.209);
    expect(bbox.east).toBeGreaterThan(77.209);
    expect(bbox.south).toBeLessThan(28.6139);
    expect(bbox.north).toBeGreaterThan(28.6139);
    expect(bbox.south).toBeGreaterThanOrEqual(-85);
    expect(bbox.north).toBeLessThanOrEqual(85);

    const arcticBbox = getBoundingBoxForCoordinates(75, 10, 50);
    expect(arcticBbox.east - arcticBbox.west).toBeGreaterThan((arcticBbox.north - arcticBbox.south) * 2.5);

    expect(() => getBoundingBoxForCoordinates(89.5, 10, 150)).toThrow(/polar|single-snapshot/i);
    expect(() => getBoundingBoxForCoordinates(0, 179.8, 80)).toThrow(/date line|±180/i);
    expect(() => getBoundingBoxForCoordinates(0, -179.8, 80)).toThrow(/date line|±180/i);

    expect(() => getBoundingBoxForCoordinates(NaN, 77.2, 80)).toThrow();
    expect(() => getBoundingBoxForCoordinates(28.6, Infinity, 80)).toThrow();
    expect(() => getBoundingBoxForCoordinates(-91, 77.2, 80)).toThrow();
    expect(() => getBoundingBoxForCoordinates(28.6, 181, 80)).toThrow();
    expect(() => getBoundingBoxForCoordinates(28.6, 77.2, 0)).toThrow();
    expect(() => getBoundingBoxForCoordinates(28.6, 77.2, -50)).toThrow();
    expect(() => getBoundingBoxForCoordinates(28.6, 77.2, Infinity)).toThrow();

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
  });

  it('Issue 1 regression: parses NASA GIBS DescribeDomains multi-interval comma-separated Domain ranges, namespaces, steps, and malformed ranges accurately', () => {
    const multiIntervalDomainXml = `
      <Domains xmlns:ows="http://www.opengis.net/ows/1.1" xmlns:wmts="http://www.opengis.net/wmts/1.0">
        <DimensionDomain>
          <ows:Identifier>TileMatrix</ows:Identifier>
          <Domain>0,1,2</Domain>
        </DimensionDomain>
        <wmts:DimensionDomain>
          <ows:Identifier>time</ows:Identifier>
          <wmts:Domain>
            2018-05-26/2018-11-03/P1D,
            2019-08-23/2021-09-03/P1D,
            2025-12-25,
            2026-11-01/2026-11-25/P8D
          </wmts:Domain>
          <Size>4</Size>
        </wmts:DimensionDomain>
      </Domains>
    `;

    // Matches first interval, second interval, single date, and third stepped interval (P8D)
    expect(parseGibsXmlTimeMatch(multiIntervalDomainXml, '2018-07-04')).toBe('matched');
    expect(parseGibsXmlTimeMatch(multiIntervalDomainXml, '2020-06-15')).toBe('matched');
    expect(parseGibsXmlTimeMatch(multiIntervalDomainXml, '2025-12-25')).toBe('matched');
    expect(parseGibsXmlTimeMatch(multiIntervalDomainXml, '2026-11-09')).toBe('matched'); // 2026-11-01 + 8d
    expect(parseGibsXmlTimeMatch(multiIntervalDomainXml, '2026-11-17')).toBe('matched'); // 2026-11-01 + 16d

    // Gap between intervals & off-step date within P8D range -> strictly 'not_present'
    expect(parseGibsXmlTimeMatch(multiIntervalDomainXml, '2019-01-10')).toBe('not_present');
    expect(parseGibsXmlTimeMatch(multiIntervalDomainXml, '2026-11-05')).toBe('not_present');

    // Malformed intervals must NOT silently pass as 'not_present' or 'matched'
    expect(
      parseGibsXmlTimeMatch(
        '<DimensionDomain><ows:Identifier>time</ows:Identifier><Domain>2026-11-20/2026-11-01/P1D</Domain></DimensionDomain>',
        '2026-11-10'
      )
    ).toBe('unparseable');
    expect(
      parseGibsXmlTimeMatch(
        '<DimensionDomain><ows:Identifier>time</ows:Identifier><Domain>2026-02-30/2026-03-05/P1D</Domain></DimensionDomain>',
        '2026-03-02'
      )
    ).toBe('unparseable');
    expect(
      parseGibsXmlTimeMatch(
        '<DimensionDomain><ows:Identifier>time</ows:Identifier><Domain>2026-11-01/2026-11-05/P1D, corrupt-interval</Domain></DimensionDomain>',
        '2026-11-15'
      )
    ).toBe('unparseable');
    expect(
      parseGibsXmlTimeMatch(
        '<DimensionDomain><ows:Identifier>TileMatrix</ows:Identifier><Domain>0,1,2</Domain></DimensionDomain>',
        '2026-11-20'
      )
    ).toBe('unparseable');
    expect(
      parseGibsXmlTimeMatch(
        '<DimensionDomain><ows:Identifier>time</ows:Identifier><Domain></Domain><Size>0</Size></DimensionDomain>',
        '2026-11-20'
      )
    ).toBe('not_present');
  });

  it('Issue 2 regression: distinguishes global_date_listed from regional verification and never populates verifiedObservationDate from DescribeDomains alone', async () => {
    const refNow = new Date('2026-11-25T05:00:00Z');
    const candidates = getAvailableImageryDates(14, { product: 'VIIRS', referenceNow: refNow });

    expect(candidates).toHaveLength(14);
    expect(candidates[0].date).toBe('2026-11-24');
    expect(candidates.every((c) => c.availability === 'unverified')).toBe(true);
    expect(candidates.every((c) => !c.globalDateListed && !c.regionalCoverageVerified)).toBe(true);
    expect(candidates.every((c) => c.verifiedObservationDate === null)).toBe(true);

    const bbox = getBoundingBoxForCoordinates(28.6139, 77.209, 50);

    // Date before VIIRS NOAA-21 operational start -> confirmed 'unavailable'
    const preMission = await verifyImageryAvailability({
      product: 'VIIRS',
      date: '2022-01-15',
      bbox,
      referenceNow: refNow,
    });
    expect(preMission.availability).toBe('unavailable');
    expect(preMission.globalDateListed).toBe(false);
    expect(preMission.regionalCoverageVerified).toBe(false);
    expect(preMission.verifiedObservationDate).toBeNull();

    // DescribeDomains match in second comma-separated interval -> 'global_date_listed' (NOT regional verified!)
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => `<Domains xmlns:ows="http://www.opengis.net/ows/1.1">
        <DimensionDomain>
          <ows:Identifier>time</ows:Identifier>
          <Domain>2023-02-10/2023-02-23/P1D,2024-02-29/2026-11-24/P1D</Domain>
        </DimensionDomain>
      </Domains>`,
    });
    const globalListed = await verifyImageryAvailability({
      product: 'VIIRS',
      date: '2026-11-20',
      bbox,
      referenceNow: refNow,
      fetchImpl: fetchMock as any,
    });
    // Verifies request targets global domains cleanly (`all/all.xml`) since BBOX has no effect in GIBS
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/default/250m/all/all.xml'),
      expect.anything()
    );
    expect(globalListed.availability).toBe('global_date_listed');
    expect(globalListed.globalDateListed).toBe(true);
    expect(globalListed.regionalCoverageVerified).toBe(false);
    expect(globalListed.verifiedObservationDate).toBeNull();

    // Generic HTTP 404 without confirmed domain absence -> stays 'unverified' (not falsely unavailable)
    const bare404 = await verifyImageryAvailability({
      product: 'HLS_S30',
      date: '2026-11-20',
      bbox,
      referenceNow: refNow,
      fetchImpl: vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      }) as any,
    });
    expect(bare404.availability).toBe('unverified');

    // HTTP 404 with explicit valid empty time domain -> confirmed 'unavailable'
    const explicit404 = await verifyImageryAvailability({
      product: 'HLS_S30',
      date: '2026-11-22',
      bbox,
      referenceNow: refNow,
      fetchImpl: vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () =>
          '<DimensionDomain><ows:Identifier>time</ows:Identifier><Domain></Domain><Size>0</Size></DimensionDomain>',
      }) as any,
    });
    expect(explicit404.availability).toBe('unavailable');

    // Network failure -> 'unverified' (never fabricated!)
    const offline = await verifyImageryAvailability({
      product: 'VIIRS',
      date: '2026-11-20',
      bbox,
      referenceNow: refNow,
      fetchImpl: vi.fn().mockRejectedValue(new Error('Network offline')) as any,
    });
    expect(offline.availability).toBe('unverified');
    expect(offline.globalDateListed).toBe(false);
    expect(offline.verifiedObservationDate).toBeNull();
  });

  it('23-24. builds aligned before/after comparisons keeping requested dates separate from verified acquisition dates and preserving scientific disclaimers', () => {
    const refNow = new Date('2026-11-25T05:00:00Z');

    // Even if verifiedDateA is passed with global_date_listed, verifiedAcquisitionDate MUST remain null!
    const comparison = buildSatelliteComparison({
      city: 'Delhi NCR',
      latitude: 28.6139,
      longitude: 77.209,
      dateA: '2026-11-01',
      dateB: '2026-11-20',
      productA: 'VIIRS',
      productB: 'HLS_S30',
      availabilityA: 'global_date_listed',
      availabilityB: 'unverified',
      verifiedDateA: '2026-11-01',
      referenceNow: refNow,
    });

    expect(comparison.city).toBe('Delhi NCR');
    expect(comparison.crs).toBe('EPSG:4326');
    expect(comparison.slotA.coverageExtent).toEqual(comparison.slotB.coverageExtent);
    expect(comparison.slotA.date).toBe('2026-11-01');
    expect(comparison.slotB.date).toBe('2026-11-20');
    expect(comparison.slotA.availability).toBe('global_date_listed');
    expect(comparison.slotA.verifiedAcquisitionDate).toBeNull();
    expect(comparison.slotB.availability).toBe('unverified');
    expect(comparison.slotB.verifiedAcquisitionDate).toBeNull();

    // Only genuinely verified_regional state may carry verifiedAcquisitionDate
    const regionalComparison = buildSatelliteComparison({
      city: 'Delhi NCR',
      latitude: 28.6139,
      longitude: 77.209,
      dateA: '2026-11-01',
      dateB: '2026-11-20',
      availabilityA: 'verified_regional',
      verifiedDateA: '2026-11-01',
      referenceNow: refNow,
    });
    expect(regionalComparison.slotA.verifiedAcquisitionDate).toBe('2026-11-01');
    expect(regionalComparison.slotB.verifiedAcquisitionDate).toBeNull();

    // Strict scientific disclaimer invariant
    expect(comparison.disclaimer).toBe(SATELLITE_IMAGERY_DISCLAIMER);
    expect(comparison.disclaimer).toContain('PM2.5, PM10, AQI');
    expect(comparison.disclaimer).toContain('does not independently prove pollution trends');
  });
});
