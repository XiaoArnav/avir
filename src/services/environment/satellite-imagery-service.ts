/**
 * NASA GIBS Satellite Imagery Service (Phase 6)
 *
 * Manages candidate date generation, official NASA GIBS metadata verification,
 * and before/after imagery comparison assembly without fabricating satellite availability.
 */

import {
  GeographicBoundingBox,
  ImageryAvailabilityState,
  ImageryDateEntry,
  ImageryProductId,
  SatelliteComparisonPair,
  SatelliteImageSlot,
  SATELLITE_IMAGERY_DISCLAIMER,
  buildGibsSnapshotUrl,
  getBoundingBoxForCoordinates,
  resolveImageryProduct,
  validateGeographicBoundingBox,
  validateImageryDate,
} from '@/domain/imagery-types';

const GIBS_DOMAIN_TIMEOUT_MS = 6000;

/**
 * Parses NASA GIBS WMTS `Domains` / `WMTSCapabilities` ISO-8601 time `<Value>` intervals
 * (`YYYY-MM-DD/YYYY-MM-DD/P1D` or `YYYY-MM-DD`) and checks whether `targetDate` lies inside them.
 */
export function parseGibsXmlTimeMatch(xmlText: string, targetDate: string): 'matched' | 'not_present' | 'unparseable' {
  if (!xmlText || typeof xmlText !== 'string') return 'unparseable';
  if (!xmlText.includes('<')) return 'unparseable';

  const valueMatches = Array.from(xmlText.matchAll(/<Value>\s*([^<]+?)\s*<\/Value>/gi)).map((m) =>
    m[1].trim()
  );
  const domainMatches = Array.from(xmlText.matchAll(/<Domain>\s*([^<]+?)\s*<\/Domain>/gi)).map((m) =>
    m[1].trim()
  );
  const allTokens = [...valueMatches, ...domainMatches];

  if (allTokens.length === 0) {
    // Explicit empty GIBS domain response with valid Domain wrapper means zero temporal entries for extent
    if (/<Domains\b|<SpaceTimeConstraint\b/i.test(xmlText)) {
      return 'not_present';
    }
    return 'unparseable';
  }

  for (const token of allTokens) {
    if (token.includes('/')) {
      const parts = token.split('/');
      const start = parts[0]?.slice(0, 10);
      const end = parts[1]?.slice(0, 10);
      if (
        start &&
        end &&
        /^\d{4}-\d{2}-\d{2}$/.test(start) &&
        /^\d{4}-\d{2}-\d{2}$/.test(end) &&
        targetDate >= start &&
        targetDate <= end
      ) {
        return 'matched';
      }
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(token.slice(0, 10))) {
      if (token.slice(0, 10) === targetDate) {
        return 'matched';
      }
    }
  }

  return 'not_present';
}

/**
 * Generates recent candidate UTC calendar dates in descending order.
 * Generated calendar dates NEVER claim verified imagery availability (`availability: 'unverified'`).
 */
export function getAvailableImageryDates(
  maxDaysBack: number = 30,
  options: { product?: ImageryProductId | string; referenceNow?: Date } = {}
): ImageryDateEntry[] {
  if (!Number.isInteger(maxDaysBack) || maxDaysBack < 1 || maxDaysBack > 365) {
    throw new RangeError(`Invalid maxDaysBack (${String(maxDaysBack)}). Expected integer 1..365.`);
  }

  const productDef = resolveImageryProduct(options.product ?? 'VIIRS');
  const refNow = options.referenceNow ?? new Date();
  const baseUtcMidnight = Date.UTC(
    refNow.getUTCFullYear(),
    refNow.getUTCMonth(),
    refNow.getUTCDate()
  );

  const entries: ImageryDateEntry[] = [];
  for (let i = 1; i <= maxDaysBack; i++) {
    const d = new Date(baseUtcMidnight - i * 86_400_000);
    const iso = d.toISOString().slice(0, 10);
    const isBeforeStart = iso < productDef.temporalCoverageStart;

    entries.push({
      date: iso,
      availability: isBeforeStart ? 'unavailable' : 'unverified',
      productId: productDef.id,
      verifiedObservationDate: null,
      source: 'calendar_candidate',
      note: isBeforeStart
        ? `Date precedes NASA GIBS operational start (${productDef.temporalCoverageStart}) for ${productDef.gibsLayer}.`
        : 'Calendar candidate date only; NASA GIBS spatial/swath availability for this location is unverified.',
    });
  }

  return entries;
}

/**
 * Verifies satellite imagery availability against official NASA GIBS WMTS Domain metadata
 * for a given product, UTC date, and bounding box. Never fabricates verified availability on network failure.
 */
export async function verifyImageryAvailability(params: {
  product: ImageryProductId | string;
  date: string;
  bbox: GeographicBoundingBox;
  fetchImpl?: typeof fetch;
  referenceNow?: Date;
}): Promise<ImageryDateEntry> {
  const { product, date, bbox, fetchImpl = fetch, referenceNow } = params;
  const prod = resolveImageryProduct(product);
  const validDate = validateImageryDate(date, { referenceNow });
  const validBbox = validateGeographicBoundingBox(bbox);

  if (validDate < prod.temporalCoverageStart) {
    return {
      date: validDate,
      availability: 'unavailable',
      productId: prod.id,
      verifiedObservationDate: null,
      source: 'nasa_gibs_capabilities',
      note: `Requested date ${validDate} precedes ${prod.gibsLayer} GIBS coverage start (${prod.temporalCoverageStart}).`,
    };
  }

  const bboxParam = `${validBbox.south.toFixed(4)},${validBbox.west.toFixed(4)},${validBbox.north.toFixed(4)},${validBbox.east.toFixed(4)}`;
  const domainsUrl = `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/1.0.0/${encodeURIComponent(prod.gibsLayer)}/default/${encodeURIComponent(prod.gibsTileMatrixSet)}/${bboxParam}/all.xml`;

  try {
    const res = await fetchImpl(domainsUrl, {
      signal: AbortSignal.timeout(GIBS_DOMAIN_TIMEOUT_MS),
    });

    if (res.status === 404) {
      return {
        date: validDate,
        availability: 'unavailable',
        productId: prod.id,
        verifiedObservationDate: null,
        source: 'nasa_gibs_wmts_domains',
        note: `NASA GIBS domain metadata reported no data coverage for ${prod.gibsLayer} on ${validDate}.`,
      };
    }

    if (!res.ok) {
      return {
        date: validDate,
        availability: 'unverified',
        productId: prod.id,
        verifiedObservationDate: null,
        source: 'nasa_gibs_wmts_domains',
        note: `NASA GIBS metadata verification unavailable (HTTP ${res.status}); imagery coverage for ${validDate} remains unverified.`,
      };
    }

    const xmlText = await res.text();
    const matchStatus = parseGibsXmlTimeMatch(xmlText, validDate);

    if (matchStatus === 'matched') {
      return {
        date: validDate,
        availability: 'verified_available',
        productId: prod.id,
        verifiedObservationDate: validDate,
        source: 'nasa_gibs_wmts_domains',
        note: `Confirmed in NASA GIBS WMTS domain metadata for ${prod.gibsLayer} on ${validDate}. Cloud cover may still obscure the surface.`,
      };
    }

    if (matchStatus === 'not_present') {
      return {
        date: validDate,
        availability: 'unavailable',
        productId: prod.id,
        verifiedObservationDate: null,
        source: 'nasa_gibs_wmts_domains',
        note: `No NASA GIBS temporal coverage found for ${prod.gibsLayer} in this region on ${validDate}.`,
      };
    }

    return {
      date: validDate,
      availability: 'unverified',
      productId: prod.id,
      verifiedObservationDate: null,
      source: 'nasa_gibs_wmts_domains',
      note: 'NASA GIBS domain metadata could not be reliably parsed; coverage remains unverified.',
    };
  } catch {
    return {
      date: validDate,
      availability: 'unverified',
      productId: prod.id,
      verifiedObservationDate: null,
      source: 'nasa_gibs_wmts_domains',
      note: `Unable to reach NASA GIBS domain metadata; availability for ${validDate} is unverified.`,
    };
  }
}

function buildValidatedImageSlot(params: {
  date: string;
  productId: ImageryProductId | string;
  bbox: GeographicBoundingBox;
  availabilityOverride?: ImageryAvailabilityState;
  availabilityNoteOverride?: string;
  verifiedAcquisitionDate?: string | null;
  referenceNow?: Date;
}): SatelliteImageSlot {
  const {
    date,
    productId,
    bbox,
    availabilityOverride,
    availabilityNoteOverride,
    verifiedAcquisitionDate = null,
    referenceNow,
  } = params;

  const prod = resolveImageryProduct(productId);
  const validDate = validateImageryDate(date, { referenceNow });

  const isBeforeOperationalStart = validDate < prod.temporalCoverageStart;
  const availability: ImageryAvailabilityState = isBeforeOperationalStart
    ? 'unavailable'
    : availabilityOverride ?? 'unverified';

  const imageUrl =
    availability === 'unavailable'
      ? null
      : buildGibsSnapshotUrl({
          product: prod.id,
          date: validDate,
          bbox,
          referenceNow,
        });

  const resolvedVerifiedDate =
    availability === 'verified_available'
      ? verifiedAcquisitionDate ?? validDate
      : null;

  const availabilityNote =
    availabilityNoteOverride ??
    (isBeforeOperationalStart
      ? `Requested date ${validDate} precedes ${prod.gibsLayer} start date (${prod.temporalCoverageStart}).`
      : availability === 'verified_available'
        ? `Confirmed by NASA GIBS metadata for ${validDate}.`
        : availability === 'unavailable'
          ? `Satellite imagery unavailable for ${validDate}.`
          : `Requested snapshot URL constructed for ${validDate}; regional GIBS availability unverified.`);

  return {
    date: validDate,
    verifiedAcquisitionDate: resolvedVerifiedDate,
    availability,
    availabilityNote,
    productId: prod.id,
    productName: prod.name,
    measurementType: prod.measurementType,
    sensor: prod.sensor,
    resolutionM: prod.resolutionM,
    resolutionDescription: prod.resolutionDescription,
    coverageExtent: bbox,
    imageUrl,
    attribution: prod.attribution,
  };
}

export function buildSatelliteComparison(params: {
  city: string;
  latitude: number;
  longitude: number;
  dateA: string; // YYYY-MM-DD UTC
  dateB: string; // YYYY-MM-DD UTC
  productA?: ImageryProductId | string;
  productB?: ImageryProductId | string;
  radiusKm?: number;
  availabilityA?: ImageryAvailabilityState;
  availabilityB?: ImageryAvailabilityState;
  verifiedDateA?: string | null;
  verifiedDateB?: string | null;
  referenceNow?: Date;
}): SatelliteComparisonPair {
  const {
    city,
    latitude,
    longitude,
    dateA,
    dateB,
    productA = 'VIIRS',
    productB = 'VIIRS',
    radiusKm = 80,
    availabilityA,
    availabilityB,
    verifiedDateA,
    verifiedDateB,
    referenceNow,
  } = params;

  const trimmedCity = typeof city === 'string' ? city.trim() : '';
  if (!trimmedCity) {
    throw new RangeError('City name is required for satellite imagery comparison.');
  }

  const bbox = getBoundingBoxForCoordinates(latitude, longitude, radiusKm);

  const slotA = buildValidatedImageSlot({
    date: dateA,
    productId: productA,
    bbox,
    availabilityOverride: availabilityA,
    verifiedAcquisitionDate: verifiedDateA,
    referenceNow,
  });

  const slotB = buildValidatedImageSlot({
    date: dateB,
    productId: productB,
    bbox,
    availabilityOverride: availabilityB,
    verifiedAcquisitionDate: verifiedDateB,
    referenceNow,
  });

  return {
    city: trimmedCity,
    coordinates: { lat: latitude, lng: longitude },
    coverageExtent: bbox,
    crs: 'EPSG:4326',
    slotA,
    slotB,
    disclaimer: SATELLITE_IMAGERY_DISCLAIMER,
  };
}
