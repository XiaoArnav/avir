import { describe, it, expect } from 'vitest';
import {
  parseFirmsCsv,
  filterHotspotsNearCoordinates,
  FIRMS_SCIENTIFIC_DISCLAIMER,
} from '@/domain/firms-types';
import { fetchFirmsHotspots } from '@/services/environment/firms-service';

describe('NASA FIRMS Active-Fire Hotspots Service (Phase 4)', () => {
  const sampleViirsCsv = `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
28.62,77.21,345.2,0.38,0.36,2026-11-24,0830,NOAA-20,VIIRS,nominal,2.0NRT,295.4,14.5,D
28.95,76.85,362.8,0.42,0.38,2026-11-24,0830,NOAA-20,VIIRS,high,2.0NRT,301.2,42.8,D
12.98,77.60,312.0,0.50,0.40,2026-11-24,0830,NOAA-20,VIIRS,low,2.0NRT,290.0,5.2,D`;

  it('correctly parses NASA FIRMS VIIRS CSV data stream', () => {
    const hotspots = parseFirmsCsv(sampleViirsCsv, 'NOAA-20', 'VIIRS');
    expect(hotspots).toHaveLength(3);

    const first = hotspots[0];
    expect(first.latitude).toBe(28.62);
    expect(first.longitude).toBe(77.21);
    expect(first.brightness).toBe(345.2);
    expect(first.frp).toBe(14.5);
    expect(first.confidence).toBe('nominal');
    expect(first.satellite).toBe('NOAA-20');
    expect(first.instrument).toBe('VIIRS');
    expect(first.daynight).toBe('D');
    expect(first.provider).toContain('NASA FIRMS');
  });

  it('filters hotspots within a specified radial distance', () => {
    const hotspots = parseFirmsCsv(sampleViirsCsv, 'NOAA-20', 'VIIRS');

    // Filter within 100km of Delhi (28.61, 77.21)
    const delhiResult = filterHotspotsNearCoordinates(hotspots, 28.61, 77.21, 100);
    expect(delhiResult.count).toBe(2);
    expect(delhiResult.nearestKm).toBeLessThan(10);

    // Filter within 50km of Bengaluru (12.97, 77.59)
    const blrResult = filterHotspotsNearCoordinates(hotspots, 12.97, 77.59, 50);
    expect(blrResult.count).toBe(1);
    expect(blrResult.filtered[0].brightness).toBe(312.0);
  });

  it('returns unconfigured status when FIRMS_MAP_KEY is absent, never inventing fake fires', async () => {
    const res = await fetchFirmsHotspots({
      latitude: 28.61,
      longitude: 77.21,
      apiKey: '', // explicit empty key
    });

    expect(res.configured).toBe(false);
    expect(res.status).toBe('unconfigured');
    expect(res.count).toBe(0);
    expect(res.hotspots).toHaveLength(0);
    expect(res.message).toContain('FIRMS_MAP_KEY is not configured');
    expect(res.disclaimer).toBe(FIRMS_SCIENTIFIC_DISCLAIMER);
  });

  it('contains mandatory scientific disclaimer preventing false causality claims', () => {
    expect(FIRMS_SCIENTIFIC_DISCLAIMER).toContain('Satellite thermal detections do not constitute verified wildfire incidents');
    expect(FIRMS_SCIENTIFIC_DISCLAIMER).toContain('proximity alone does not prove smoke transport');
  });
});
