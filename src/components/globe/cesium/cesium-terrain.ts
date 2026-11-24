/**
 * Cesium 3D Elevation Terrain Provider (Phase 5 Part B)
 * 
 * Configures Re:Earth keyless quantized-mesh ellipsoidal terrain:
 * - Upstream endpoint: https://terrain.reearth.land/cesium-mesh/ellipsoid
 * - Legal Attribution: Re:Earth / Mapterhorn ellipsoidal quantized mesh, CC BY 4.0
 * - Fallback: Gracefully falls back to Cesium.EllipsoidTerrainProvider() on network failure or 429 throttling.
 */

export const REEARTH_KEYLESS_TERRAIN_URL = 'https://terrain.reearth.land/cesium-mesh/ellipsoid';
export const TERRAIN_ATTRIBUTION = 'Terrain: Re:Earth / Mapterhorn (CC BY 4.0)';

export interface TerrainProviderResult {
  provider: any;
  isRealTerrain: boolean;
  attribution: string | null;
}

/**
 * Creates keyless quantized-mesh terrain provider with automatic fallback to standard Ellipsoid.
 */
export async function createKeylessTerrainProvider(Cesium: any): Promise<TerrainProviderResult> {
  if (!Cesium || typeof Cesium.CesiumTerrainProvider?.fromUrl !== 'function') {
    return {
      provider: Cesium?.EllipsoidTerrainProvider ? new Cesium.EllipsoidTerrainProvider() : null,
      isRealTerrain: false,
      attribution: null,
    };
  }

  try {
    const provider = await Cesium.CesiumTerrainProvider.fromUrl(REEARTH_KEYLESS_TERRAIN_URL, {
      requestVertexNormals: true,
      requestWaterMask: false,
    });

    return {
      provider,
      isRealTerrain: true,
      attribution: TERRAIN_ATTRIBUTION,
    };
  } catch (error) {
    console.warn(
      '[Avir Cesium] Re:Earth terrain unavailable or throttled, falling back to flat ellipsoid:',
      error
    );
    return {
      provider: new Cesium.EllipsoidTerrainProvider(),
      isRealTerrain: false,
      attribution: null,
    };
  }
}
