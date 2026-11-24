import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/environment/wind/route';
import { NextRequest } from 'next/server';

describe('Global Wind-Flow API Route (/api/environment/wind)', () => {
  it('rejects invalid latitude with HTTP 400', async () => {
    const req = new NextRequest('http://localhost:3000/api/environment/wind?lat=95&lng=77.59');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('latitude');
  });

  it('rejects invalid longitude with HTTP 400', async () => {
    const req = new NextRequest('http://localhost:3000/api/environment/wind?lat=12.97&lng=200');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('longitude');
  });

  it('rejects invalid hour with HTTP 400', async () => {
    const req = new NextRequest('http://localhost:3000/api/environment/wind?lat=12.97&lng=77.59&hour=25');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('hour');
  });

  it('returns valid wind forecast and ventilation metadata for valid parameters', async () => {
    const req = new NextRequest('http://localhost:3000/api/environment/wind?lat=12.9716&lng=77.5946&hour=14');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.model).toBeDefined();
    expect(json.attribution).toContain('Open-Meteo');
    expect(json.units).toEqual({
      speed: 'km/h',
      vector: 'm/s',
      direction: 'degrees',
      height: 'meters',
    });
    expect(json.grid).toBeInstanceOf(Array);
    expect(json.grid.length).toBeGreaterThan(0);
    expect(json.cityWind).toBeDefined();
    expect(json.cityWind.u).toBeDefined();
    expect(json.cityWind.v).toBeDefined();
    expect(json.ventilationRating).toMatch(/good|moderate|poor|stagnant/);
  });
});
