/**
 * NASA GIBS Recent Satellite Imagery & Environmental Comparison Types (Phase 6)
 * 
 * Provides keyless NASA EOSDIS GIBS (Global Imagery Browse Services) integrations:
 * - Products: VIIRS True Color (250m) and Harmonized Landsat-Sentinel (HLS, 30m)
 * - WVS (Web-scale Vector Snapshot) URL generation
 * - Before / After environmental comparison models
 * - Scientific disclaimer regarding optical imagery vs ground-level PM2.5 concentrations
 */

export interface ImageryProductDefinition {
  id: 'VIIRS' | 'HLS_S30';
  name: string;
  sensor: string;
  gibsLayer: string;
  resolutionM: number;
  format: 'jpeg' | 'png';
  attribution: string;
}

export const SUPPORTED_IMAGERY_PRODUCTS: Record<string, ImageryProductDefinition> = {
  VIIRS: {
    id: 'VIIRS',
    name: 'VIIRS Daily True Color',
    sensor: 'VIIRS on NOAA-21',
    gibsLayer: 'VIIRS_NOAA21_CorrectedReflectance_TrueColor',
    resolutionM: 250,
    format: 'jpeg',
    attribution: 'Imagery: NASA EOSDIS Global Imagery Browse Services (GIBS)',
  },
  HLS_S30: {
    id: 'HLS_S30',
    name: 'Harmonized Landsat Sentinel-2',
    sensor: 'MSI on Sentinel-2A/B',
    gibsLayer: 'HLS_S30_Nadir_BRDF_Adjusted_Reflectance',
    resolutionM: 30,
    format: 'png',
    attribution: 'Imagery: NASA / USGS Harmonized Landsat Sentinel-2',
  },
};

export const SATELLITE_IMAGERY_DISCLAIMER =
  'Optical satellite surface imagery visualizes atmospheric reflectance, visible smoke/haze plumes, and land cover. Surface optical imagery does not directly measure ground-level PM2.5 or PM10 particulate mass concentrations without co-located chemical composition retrieval and planetary boundary layer calibration.';

export interface GeographicBoundingBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface SatelliteImageSlot {
  date: string; // YYYY-MM-DD
  productId: 'VIIRS' | 'HLS_S30';
  productName: string;
  sensor: string;
  resolutionM: number;
  imageUrl: string;
  attribution: string;
  cloudCoverEstimatedPct?: number;
}

export interface SatelliteComparisonPair {
  city: string;
  coordinates: { lat: number; lng: number };
  slotA: SatelliteImageSlot;
  slotB: SatelliteImageSlot;
  disclaimer: string;
}

/**
 * Builds a direct keyless NASA GIBS Web-scale Vector Snapshot (WVS) URL.
 */
export function buildGibsSnapshotUrl(params: {
  product: 'VIIRS' | 'HLS_S30';
  date: string; // YYYY-MM-DD
  bbox: GeographicBoundingBox;
  width?: number;
  height?: number;
}): string {
  const { product, date, bbox, width = 800, height = 600 } = params;
  const prod = SUPPORTED_IMAGERY_PRODUCTS[product] || SUPPORTED_IMAGERY_PRODUCTS.VIIRS;

  const w = bbox.west.toFixed(4);
  const s = bbox.south.toFixed(4);
  const e = bbox.east.toFixed(4);
  const n = bbox.north.toFixed(4);

  const format = prod.format === 'png' ? 'image/png' : 'image/jpeg';

  return `https://wvs.earthdata.nasa.gov/api/v1/snapshot?REQUEST=GetSnapshot&TIME=${date}&BBOX=${s},${w},${n},${e}&CRS=EPSG:4326&LAYERS=${prod.gibsLayer}&WRAP=day&FORMAT=${format}&WIDTH=${width}&HEIGHT=${height}`;
}

/**
 * Derives a balanced geographic bounding box around coordinates for regional imagery inspection.
 * Default 100 km view window.
 */
export function getBoundingBoxForCoordinates(
  lat: number,
  lng: number,
  radiusKm: number = 80
): GeographicBoundingBox {
  const degSpanLat = radiusKm / 111.195;
  const latCos = Math.max(0.15, Math.cos((lat * Math.PI) / 180));
  const degSpanLng = radiusKm / (111.195 * latCos);

  return {
    west: Math.max(-180, lng - degSpanLng),
    south: Math.max(-85, lat - degSpanLat),
    east: Math.min(180, lng + degSpanLng),
    north: Math.min(85, lat + degSpanLat),
  };
}
