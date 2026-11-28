import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/geo/reverse/route';

describe('GET /api/geo/reverse (Reverse Geocoding Endpoint)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 400 when coordinates are missing', async () => {
    const req = new NextRequest('http://localhost:3000/api/geo/reverse');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('MISSING_COORDINATES');
  });

  it('returns 400 for invalid latitude/longitude range', async () => {
    const req = new NextRequest('http://localhost:3000/api/geo/reverse?lat=120&lon=77');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('INVALID_LATITUDE');
  });

  it('resolves coordinates via local spatial index when upstream is simulated unreachable', async () => {
    // Mock fetch to simulate network error or timeout
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    // Coordinates near Delhi-NCR (28.61, 77.20)
    const req = new NextRequest('http://localhost:3000/api/geo/reverse?lat=28.6139&lon=77.2090');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.name).toBe('Approx. near Delhi-NCR');
    expect(json.country).toBe('India');
    expect(json.source).toBe('spatial_index');
    expect(typeof json.id).toBe('number');
    expect(res.headers.get('Cache-Control')).toBe('private, no-cache, no-store, must-revalidate');
  });

  it('resolves coordinates via upstream Nominatim response', async () => {
    const mockNominatimResponse = {
      name: 'Bengaluru',
      address: {
        city: 'Bengaluru',
        state: 'Karnataka',
        country: 'India',
        country_code: 'in',
      },
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockNominatimResponse,
    } as unknown as Response);

    const req = new NextRequest('http://localhost:3000/api/geo/reverse?lat=12.9716&lon=77.5946');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.name).toBe('Bengaluru');
    expect(json.admin1).toBe('Karnataka');
    expect(json.countryCode).toBe('IN');
    expect(json.source).toBe('nominatim');
  });

  it('preserves unknown countryCode "UN" instead of defaulting to India when Nominatim omits country_code', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: 'Seattle',
        address: {
          city: 'Seattle',
          state: 'Washington',
          country: 'United States',
          // country_code intentionally omitted
        },
      }),
    } as unknown as Response);

    const req = new NextRequest('http://localhost:3000/api/geo/reverse?lat=47.6062&lon=-122.3321');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.name).toBe('Seattle');
    expect(json.country).toBe('United States');
    expect(json.countryCode).toBe('UN');
    expect(json.source).toBe('nominatim');
  });
});
