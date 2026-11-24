import { describe, it, expect } from 'vitest';
import {
  buildGibsSnapshotUrl,
  getBoundingBoxForCoordinates,
  SUPPORTED_IMAGERY_PRODUCTS,
  SATELLITE_IMAGERY_DISCLAIMER,
} from '@/domain/imagery-types';
import {
  getAvailableImageryDates,
  buildSatelliteComparison,
} from '@/services/environment/satellite-imagery-service';

describe('Phase 6: NASA GIBS Satellite Imagery & Comparison Service', () => {
  it('correctly constructs a keyless NASA GIBS WVS snapshot URL', () => {
    const bbox = {
      west: 76.8,
      south: 28.3,
      east: 77.6,
      north: 28.9,
    };

    const url = buildGibsSnapshotUrl({
      product: 'VIIRS',
      date: '2026-11-20',
      bbox,
      width: 1024,
      height: 768,
    });

    expect(url).toContain('https://wvs.earthdata.nasa.gov/api/v1/snapshot?REQUEST=GetSnapshot');
    expect(url).toContain('TIME=2026-11-20');
    expect(url).toContain('BBOX=28.3000,76.8000,28.9000,77.6000');
    expect(url).toContain('CRS=EPSG:4326');
    expect(url).toContain(`LAYERS=${SUPPORTED_IMAGERY_PRODUCTS.VIIRS.gibsLayer}`);
    expect(url).toContain('FORMAT=image/jpeg');
    expect(url).toContain('WIDTH=1024');
    expect(url).toContain('HEIGHT=768');
  });

  it('calculates bounded bounding boxes for given coordinates', () => {
    // Delhi: 28.6139, 77.2090
    const bbox = getBoundingBoxForCoordinates(28.6139, 77.209, 50);

    expect(bbox.west).toBeLessThan(77.209);
    expect(bbox.east).toBeGreaterThan(77.209);
    expect(bbox.south).toBeLessThan(28.6139);
    expect(bbox.north).toBeGreaterThan(28.6139);

    // Coordinate limits
    expect(bbox.west).toBeGreaterThanOrEqual(-180);
    expect(bbox.east).toBeLessThanOrEqual(180);
    expect(bbox.south).toBeGreaterThanOrEqual(-85);
    expect(bbox.north).toBeLessThanOrEqual(85);
  });

  it('generates a list of recent available dates', () => {
    const dates = getAvailableImageryDates(14);
    expect(dates).toHaveLength(14);
    expect(dates[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Chronologically descending
    expect(new Date(dates[0]).getTime()).toBeGreaterThan(new Date(dates[13]).getTime());
  });

  it('builds a complete before/after comparison pair with attribution and disclaimer', () => {
    const comparison = buildSatelliteComparison({
      city: 'Delhi NCR',
      latitude: 28.6139,
      longitude: 77.209,
      dateA: '2026-11-01',
      dateB: '2026-11-20',
      productA: 'VIIRS',
      productB: 'VIIRS',
    });

    expect(comparison.city).toBe('Delhi NCR');
    expect(comparison.coordinates.lat).toBe(28.6139);
    expect(comparison.coordinates.lng).toBe(77.209);

    expect(comparison.slotA.date).toBe('2026-11-01');
    expect(comparison.slotA.imageUrl).toContain('TIME=2026-11-01');
    expect(comparison.slotA.attribution).toContain('NASA EOSDIS');

    expect(comparison.slotB.date).toBe('2026-11-20');
    expect(comparison.slotB.imageUrl).toContain('TIME=2026-11-20');

    // Strict scientific truthfulness invariant
    expect(comparison.disclaimer).toBe(SATELLITE_IMAGERY_DISCLAIMER);
    expect(comparison.disclaimer).toContain(
      'does not directly measure ground-level PM2.5 or PM10 particulate mass concentrations'
    );
  });
});
