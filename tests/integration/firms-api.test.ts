import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/environment/fires/route';
import { NextRequest } from 'next/server';

describe('NASA FIRMS Active-Fire API Route (/api/environment/fires)', () => {
  it('rejects invalid latitude with HTTP 400', async () => {
    const req = new NextRequest('http://localhost:3000/api/environment/fires?lat=-100&lng=77.59');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('latitude');
  });

  it('rejects invalid longitude with HTTP 400', async () => {
    const req = new NextRequest('http://localhost:3000/api/environment/fires?lat=12.97&lng=250');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('longitude');
  });

  it('rejects invalid radiusKm with HTTP 400', async () => {
    const req = new NextRequest('http://localhost:3000/api/environment/fires?lat=12.97&lng=77.59&radiusKm=5000');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('radiusKm');
  });

  it('returns structured unconfigured status when FIRMS_MAP_KEY is unconfigured in environment', async () => {
    const req = new NextRequest('http://localhost:3000/api/environment/fires?lat=28.6139&lng=77.2090&radiusKm=300');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.disclaimer).toBeDefined();
    expect(json.hotspots).toBeInstanceOf(Array);
    if (!process.env.FIRMS_MAP_KEY) {
      expect(json.configured).toBe(false);
      expect(json.status).toBe('unconfigured');
      expect(json.count).toBe(0);
    }
  });
});
