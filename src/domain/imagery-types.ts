/**
 * NASA GIBS Recent Satellite Imagery & Environmental Comparison Types (Phase 6)
 *
 * Provides keyless NASA EOSDIS GIBS (Global Imagery Browse Services) integrations:
 * - Products:
 *   - VIIRS_NOAA21_CorrectedReflectance_TrueColor (NOAA-21 VIIRS corrected top-of-atmosphere true color, GIBS 250m grid / 375m-750m native)
 *   - HLS_S30_Nadir_BRDF_Adjusted_Reflectance (Sentinel-2A/B/C MSI NBAR surface reflectance, 30m grid)
 * - Worldview Snapshots (WVS) URL generation with strict EPSG:4326 geographic & calendar validation
 * - Explicit availability tracking ('candidate' | 'verified_available' | 'unavailable' | 'unverified')
 * - Scientific disclaimer distinguishing optical surface reflectance from ground-level PM2.5/PM10/AQI
 */

export type ImageryProductId = 'VIIRS' | 'HLS_S30';

export type ImageryAvailabilityState =
  | 'candidate'
  | 'verified_available'
  | 'unavailable'
  | 'unverified';

export interface ImageryProductDefinition {
  id: ImageryProductId;
  name: string;
  measurementType: string;
  sensor: string;
  gibsLayer: string;
  gibsTileMatrixSet: string;
  resolutionM: number; // Native swath/grid resolution in meters
  resolutionDescription: string;
  temporalCoverageStart: string; // YYYY-MM-DD UTC earliest NASA GIBS availability
  format: 'jpeg' | 'png';
  mimeType: 'image/jpeg' | 'image/png';
  attribution: string;
}

export const SUPPORTED_IMAGERY_PRODUCTS: Record<ImageryProductId, ImageryProductDefinition> = {
  VIIRS: {
    id: 'VIIRS',
    name: 'VIIRS NOAA-21 Corrected Reflectance (True Color)',
    measurementType: 'Corrected Top-of-Atmosphere True-Color Reflectance',
    sensor: 'VIIRS on NOAA-21',
    gibsLayer: 'VIIRS_NOAA21_CorrectedReflectance_TrueColor',
    gibsTileMatrixSet: '250m',
    resolutionM: 375,
    resolutionDescription: '375m I-band / 750m M-band native (served on GIBS 250m grid)',
    temporalCoverageStart: '2023-02-10',
    format: 'jpeg',
    mimeType: 'image/jpeg',
    attribution: 'Imagery: NASA EOSDIS Global Imagery Browse Services (GIBS) / NOAA-21 VIIRS',
  },
  HLS_S30: {
    id: 'HLS_S30',
    name: 'Harmonized Landsat Sentinel-2 (NBAR Surface Reflectance)',
    measurementType: 'Nadir BRDF-Adjusted Surface Reflectance (NBAR)',
    sensor: 'MSI on Sentinel-2A/B/C',
    gibsLayer: 'HLS_S30_Nadir_BRDF_Adjusted_Reflectance',
    gibsTileMatrixSet: '31.25m',
    resolutionM: 30,
    resolutionDescription: '30m MGRS native surface reflectance (served on GIBS 31.25m grid)',
    temporalCoverageStart: '2015-11-28',
    format: 'png',
    mimeType: 'image/png',
    attribution: 'Imagery: NASA / USGS Harmonized Landsat Sentinel-2 via EOSDIS GIBS',
  },
};

export const SATELLITE_IMAGERY_DISCLAIMER =
  'Optical satellite surface imagery visualizes atmospheric reflectance, visible smoke/haze plumes, and land cover. Surface optical imagery does not directly measure ground-level PM2.5, PM10, AQI, or human respiratory exposure without co-located chemical composition retrieval and planetary boundary layer calibration, and before/after imagery does not independently prove pollution trends.';

export interface GeographicBoundingBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface ImageryDateEntry {
  date: string; // Requested / candidate UTC date (YYYY-MM-DD)
  availability: ImageryAvailabilityState;
  productId: ImageryProductId;
  verifiedObservationDate: string | null;
  source: 'calendar_candidate' | 'nasa_gibs_wmts_domains' | 'nasa_gibs_capabilities';
  note: string;
}

export interface SatelliteImageSlot {
  date: string; // Originally requested YYYY-MM-DD UTC
  verifiedAcquisitionDate: string | null; // Verified date only if confirmed by NASA GIBS metadata
  availability: ImageryAvailabilityState;
  availabilityNote: string;
  productId: ImageryProductId;
  productName: string;
  measurementType: string;
  sensor: string;
  resolutionM: number;
  resolutionDescription: string;
  coverageExtent: GeographicBoundingBox;
  imageUrl: string | null;
  attribution: string;
  cloudCoverEstimatedPct?: number;
}

export interface SatelliteComparisonPair {
  city: string;
  coordinates: { lat: number; lng: number };
  coverageExtent: GeographicBoundingBox;
  crs: 'EPSG:4326';
  slotA: SatelliteImageSlot;
  slotB: SatelliteImageSlot;
  disclaimer: string;
}

const EARTH_MEAN_RADIUS_KM = 6371.0088;
const MAX_SAFE_RADIUS_KM = 2000;
const MIN_SNAPSHOT_DIM = 64;
const MAX_SNAPSHOT_DIM = 4096;
const STRICT_ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Resolves a supported NASA GIBS product identifier strictly without silent substitution.
 */
export function resolveImageryProduct(product: string): ImageryProductDefinition {
  if (
    typeof product !== 'string' ||
    !Object.prototype.hasOwnProperty.call(SUPPORTED_IMAGERY_PRODUCTS, product)
  ) {
    throw new RangeError(
      `Unsupported NASA GIBS imagery product identifier: "${String(product)}". Allowed: VIIRS, HLS_S30.`
    );
  }
  return SUPPORTED_IMAGERY_PRODUCTS[product as ImageryProductId];
}

/**
 * Validates strict YYYY-MM-DD UTC dates, rejecting invalid calendar dates,
 * non-leap Feb 29 dates, and dates in the future relative to UTC today.
 */
export function validateImageryDate(
  rawDate: string,
  options: { referenceNow?: Date; allowFuture?: boolean } = {}
): string {
  if (typeof rawDate !== 'string' || !STRICT_ISO_DATE_REGEX.test(rawDate)) {
    throw new RangeError(`Invalid imagery date "${String(rawDate)}". Expected strict YYYY-MM-DD UTC format.`);
  }

  const [yearStr, monthStr, dayStr] = rawDate.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new RangeError(`Invalid calendar imagery date "${rawDate}".`);
  }

  const epoch = Date.UTC(year, month - 1, day);
  const parsed = new Date(epoch);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new RangeError(`Impossible calendar imagery date "${rawDate}".`);
  }

  if (!options.allowFuture) {
    const refNow = options.referenceNow ?? new Date();
    const todayUtc = refNow.toISOString().slice(0, 10);
    if (rawDate > todayUtc) {
      throw new RangeError(
        `Future imagery date "${rawDate}" rejected (current UTC date is "${todayUtc}").`
      );
    }
  }

  return rawDate;
}

/**
 * Validates a GeographicBoundingBox against EPSG:4326 and non-inversion invariants.
 */
export function validateGeographicBoundingBox(bbox: GeographicBoundingBox): GeographicBoundingBox {
  if (!bbox || typeof bbox !== 'object') {
    throw new RangeError('Invalid geographic bounding box: object required.');
  }
  const { west, south, east, north } = bbox;
  if (
    !Number.isFinite(west) ||
    !Number.isFinite(south) ||
    !Number.isFinite(east) ||
    !Number.isFinite(north)
  ) {
    throw new RangeError('Invalid geographic bounding box: coordinates must be finite numbers.');
  }
  if (south < -90 || north > 90 || west < -180 || east > 180) {
    throw new RangeError('Invalid geographic bounding box: coordinates out of [-180,180] / [-90,90] bounds.');
  }
  if (south >= north || west >= east) {
    throw new RangeError(
      'Invalid or inverted geographic bounding box: requires south < north and west < east.'
    );
  }
  return { west, south, east, north };
}

/**
 * Builds a direct keyless NASA GIBS Worldview Snapshots (WVS) URL
 * after strictly validating product, date, bbox, projection, and dimensions.
 */
export function buildGibsSnapshotUrl(params: {
  product: ImageryProductId | string;
  date: string; // YYYY-MM-DD UTC
  bbox: GeographicBoundingBox;
  width?: number;
  height?: number;
  referenceNow?: Date;
}): string {
  const { product, date, bbox, width = 800, height = 600, referenceNow } = params;
  const prod = resolveImageryProduct(product);
  const validDate = validateImageryDate(date, { referenceNow });
  const validBbox = validateGeographicBoundingBox(bbox);

  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < MIN_SNAPSHOT_DIM ||
    width > MAX_SNAPSHOT_DIM ||
    height < MIN_SNAPSHOT_DIM ||
    height > MAX_SNAPSHOT_DIM
  ) {
    throw new RangeError(
      `Invalid snapshot pixel dimensions ${String(width)}x${String(height)}. Must be integers within ${MIN_SNAPSHOT_DIM}..${MAX_SNAPSHOT_DIM}.`
    );
  }

  const w = validBbox.west.toFixed(4);
  const s = validBbox.south.toFixed(4);
  const e = validBbox.east.toFixed(4);
  const n = validBbox.north.toFixed(4);

  return `https://wvs.earthdata.nasa.gov/api/v1/snapshot?REQUEST=GetSnapshot&TIME=${validDate}&BBOX=${s},${w},${n},${e}&CRS=EPSG:4326&LAYERS=${encodeURIComponent(prod.gibsLayer)}&WRAP=day&FORMAT=${prod.mimeType}&WIDTH=${width}&HEIGHT=${height}`;
}

/**
 * Derives a validated geographic bounding box around coordinates for a single NASA WVS EPSG:4326 snapshot.
 * Throws explicitly if inputs are non-finite, out of bounds, exceed polar bounds, or cross ±180° date line
 * rather than silently truncating coverage or creating inverted bounding boxes.
 */
export function getBoundingBoxForCoordinates(
  lat: number,
  lng: number,
  radiusKm: number = 80
): GeographicBoundingBox {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new RangeError(`Invalid latitude (${String(lat)}). Must be finite within [-90, 90].`);
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new RangeError(`Invalid longitude (${String(lng)}). Must be finite within [-180, 180].`);
  }
  if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > MAX_SAFE_RADIUS_KM) {
    throw new RangeError(
      `Invalid radiusKm (${String(radiusKm)}). Must be > 0 and <= ${MAX_SAFE_RADIUS_KM}.`
    );
  }

  const angularRadiusRad = radiusKm / EARTH_MEAN_RADIUS_KM;
  const degSpanLat = (angularRadiusRad * 180) / Math.PI;
  const rawSouth = lat - degSpanLat;
  const rawNorth = lat + degSpanLat;

  if (rawSouth < -85 || rawNorth > 85) {
    throw new RangeError(
      'Requested geographic extent exceeds EPSG:4326 single-snapshot non-polar latitude bounds (±85°); refusing to truncate extent.'
    );
  }

  const maxAbsLatRad = (Math.max(Math.abs(rawSouth), Math.abs(rawNorth)) * Math.PI) / 180;
  const cosMaxLat = Math.cos(maxAbsLatRad);
  const sinRatio = cosMaxLat > 1e-6 ? Math.sin(angularRadiusRad) / cosMaxLat : 1;

  if (!Number.isFinite(sinRatio) || sinRatio >= 1) {
    throw new RangeError(
      'Requested high-latitude extent spans full meridian width and cannot be represented in a single unclipped EPSG:4326 snapshot.'
    );
  }

  const degSpanLng = (Math.asin(sinRatio) * 180) / Math.PI;
  const rawWest = lng - degSpanLng;
  const rawEast = lng + degSpanLng;

  if (rawWest < -180 || rawEast > 180) {
    throw new RangeError(
      'Requested geographic extent crosses the international date line (±180°) and cannot be represented as a single unclipped non-inverted EPSG:4326 snapshot BBOX.'
    );
  }

  return validateGeographicBoundingBox({
    west: rawWest,
    south: rawSouth,
    east: rawEast,
    north: rawNorth,
  });
}
