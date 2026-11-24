import { describe, it, expect, vi } from 'vitest';
import {
  REEARTH_KEYLESS_TERRAIN_URL,
  TERRAIN_ATTRIBUTION,
  createKeylessTerrainProvider,
} from '@/components/globe/cesium/cesium-terrain';

describe('Cesium 3D Elevation Terrain Provider (Phase 5 Part B)', () => {
  it('defines the canonical keyless Re:Earth quantized-mesh endpoint', () => {
    expect(REEARTH_KEYLESS_TERRAIN_URL).toBe(
      'https://terrain.reearth.land/cesium-mesh/ellipsoid'
    );
  });

  it('defines the legally required attribution badge', () => {
    expect(TERRAIN_ATTRIBUTION).toContain('Re:Earth / Mapterhorn');
    expect(TERRAIN_ATTRIBUTION).toContain('CC BY 4.0');
  });

  it('creates quantized-mesh terrain provider when upstream call succeeds', async () => {
    const mockProvider = { isRealQuantizedMesh: true };
    const mockCesium = {
      CesiumTerrainProvider: {
        fromUrl: vi.fn().mockResolvedValue(mockProvider),
      },
      EllipsoidTerrainProvider: vi.fn(),
    };

    const res = await createKeylessTerrainProvider(mockCesium);
    expect(res.isRealTerrain).toBe(true);
    expect(res.provider).toBe(mockProvider);
    expect(res.attribution).toBe(TERRAIN_ATTRIBUTION);
    expect(mockCesium.CesiumTerrainProvider.fromUrl).toHaveBeenCalledWith(
      REEARTH_KEYLESS_TERRAIN_URL,
      expect.objectContaining({ requestVertexNormals: true })
    );
  });

  it('gracefully falls back to EllipsoidTerrainProvider on network failure or 429 throttling', async () => {
    const mockEllipsoid = { isEllipsoidFallback: true };
    const mockCesium = {
      CesiumTerrainProvider: {
        fromUrl: vi.fn().mockRejectedValue(new Error('HTTP 429 Rate limited')),
      },
      EllipsoidTerrainProvider: vi.fn().mockImplementation(() => mockEllipsoid),
    };

    const res = await createKeylessTerrainProvider(mockCesium);
    expect(res.isRealTerrain).toBe(false);
    expect(res.provider).toBe(mockEllipsoid);
    expect(res.attribution).toBeNull();
  });
});
