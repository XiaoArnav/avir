/**
 * NASA GIBS Satellite Imagery Service (Phase 6)
 *
 * Manages candidate date generation, official NASA GIBS DescribeDomains temporal parsing,
 * and before/after imagery comparison assembly without falsely equating global layer temporal
 * availability with verified regional swath coverage or verified acquisition dates.
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
const ISO_DATE_OR_DATETIME_REGEX =
  /^(\d{4}-\d{2}-\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

type ParsedStep =
  | { unit: 'D'; count: number }
  | { unit: 'W'; count: number }
  | { unit: 'M'; count: number }
  | { unit: 'Y'; count: number };

function parseStrictIsoDateToken(token: string): string | null {
  const match = token.trim().match(ISO_DATE_OR_DATETIME_REGEX);
  if (!match) return null;
  try {
    return validateImageryDate(match[1], { allowFuture: true });
  } catch {
    return null;
  }
}

function parseIsoDurationStep(stepRaw: string): ParsedStep | null {
  const trimmed = stepRaw.trim();
  const dayMatch = trimmed.match(/^P(\d+)D$/i);
  if (dayMatch) {
    const count = Number(dayMatch[1]);
    return count >= 1 ? { unit: 'D', count } : null;
  }

  const weekMatch = trimmed.match(/^P(\d+)W$/i);
  if (weekMatch) {
    const count = Number(weekMatch[1]);
    return count >= 1 ? { unit: 'W', count } : null;
  }

  const monthMatch = trimmed.match(/^P(\d+)M$/i);
  if (monthMatch) {
    const count = Number(monthMatch[1]);
    return count >= 1 ? { unit: 'M', count } : null;
  }

  const yearMatch = trimmed.match(/^P(\d+)Y$/i);
  if (yearMatch) {
    const count = Number(yearMatch[1]);
    return count >= 1 ? { unit: 'Y', count } : null;
  }

  const hourMatch = trimmed.match(/^PT(\d+)H$/i);
  if (hourMatch) {
    const hours = Number(hourMatch[1]);
    if (hours < 1) return null;
    if (hours <= 24) return { unit: 'D', count: 1 };
    return hours % 24 === 0 ? { unit: 'D', count: hours / 24 } : null;
  }

  const minuteMatch = trimmed.match(/^PT(\d+)M$/i);
  if (minuteMatch) {
    const mins = Number(minuteMatch[1]);
    return mins >= 1 ? { unit: 'D', count: 1 } : null;
  }

  return null;
}

function toUtcEpochDay(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

function doesTargetMatchSteppedRange(
  startDate: string,
  endDate: string,
  step: ParsedStep,
  targetDate: string
): boolean {
  if (targetDate < startDate || targetDate > endDate) {
    return false;
  }

  if (step.unit === 'D') {
    if (step.count === 1) return true;
    const diffDays = toUtcEpochDay(targetDate) - toUtcEpochDay(startDate);
    return diffDays >= 0 && diffDays % step.count === 0;
  }

  if (step.unit === 'W') {
    const diffDays = toUtcEpochDay(targetDate) - toUtcEpochDay(startDate);
    return diffDays >= 0 && diffDays % (step.count * 7) === 0;
  }

  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ty, tm, td] = targetDate.split('-').map(Number);

  if (step.unit === 'M') {
    const monthsDiff = (ty - sy) * 12 + (tm - sm);
    return monthsDiff >= 0 && monthsDiff % step.count === 0 && td === sd;
  }

  const yearsDiff = ty - sy;
  return yearsDiff >= 0 && yearsDiff % step.count === 0 && tm === sm && td === sd;
}

function extractXmlTagBodies(xmlText: string, tagName: string): string[] {
  const regex = new RegExp(
    `<(?:[A-Za-z_][\\w.-]*:)?${tagName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z_][\\w.-]*:)?${tagName}>`,
    'gi'
  );
  return Array.from(xmlText.matchAll(regex)).map((m) => m[1]);
}

/**
 * Parses NASA GIBS `DescribeDomains` / `WMTSCapabilities` ISO-8601 temporal domains,
 * supporting comma-separated multi-intervals inside `<Domain>`, namespaced XML elements,
 * single dates, and step intervals (`/P1D`, `/P8D`, `/P1M`, `/P1Y`, etc.).
 */
export function parseGibsXmlTimeMatch(
  xmlText: string,
  targetDate: string
): 'matched' | 'not_present' | 'unparseable' {
  if (!xmlText || typeof xmlText !== 'string' || !xmlText.includes('<')) {
    return 'unparseable';
  }

  try {
    validateImageryDate(targetDate, { allowFuture: true });
  } catch {
    return 'unparseable';
  }

  const dimensionDomains = extractXmlTagBodies(xmlText, 'DimensionDomain');
  const rawDomainTokens: string[] = [];
  let hasExplicitEmptyTimeDomain = false;

  if (dimensionDomains.length > 0) {
    let foundTimeBlock = false;
    for (const block of dimensionDomains) {
      const identifiers = extractXmlTagBodies(block, 'Identifier').map((id) =>
        id.trim().toLowerCase()
      );
      if (!identifiers.includes('time')) {
        continue;
      }
      foundTimeBlock = true;
      const blockDomains = extractXmlTagBodies(block, 'Domain');
      const blockValues = extractXmlTagBodies(block, 'Value');
      const sizeBodies = extractXmlTagBodies(block, 'Size').map((s) => s.trim());

      const extracted = [...blockDomains, ...blockValues];
      if (extracted.every((item) => item.trim() === '') && (sizeBodies.includes('0') || blockDomains.length > 0)) {
        hasExplicitEmptyTimeDomain = true;
      }
      rawDomainTokens.push(...extracted);
    }

    if (!foundTimeBlock) {
      return 'unparseable';
    }
  } else {
    rawDomainTokens.push(
      ...extractXmlTagBodies(xmlText, 'Domain'),
      ...extractXmlTagBodies(xmlText, 'Value')
    );
  }

  const intervalTokens = rawDomainTokens
    .flatMap((chunk) => chunk.split(','))
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  if (intervalTokens.length === 0) {
    if (
      hasExplicitEmptyTimeDomain ||
      /<(?:[A-Za-z_][\w.-]*:)?SpaceTimeConstraint\b/i.test(xmlText)
    ) {
      return 'not_present';
    }
    return 'unparseable';
  }

  let validEntryCount = 0;
  let malformedEntryCount = 0;

  for (const token of intervalTokens) {
    if (token.includes('/')) {
      const parts = token.split('/');
      if (parts.length < 2 || parts.length > 3) {
        malformedEntryCount += 1;
        continue;
      }
      const start = parseStrictIsoDateToken(parts[0]);
      const end = parseStrictIsoDateToken(parts[1]);
      const step = parts.length === 3 ? parseIsoDurationStep(parts[2]) : ({ unit: 'D', count: 1 } as ParsedStep);

      if (!start || !end || !step || start > end) {
        malformedEntryCount += 1;
        continue;
      }

      validEntryCount += 1;
      if (doesTargetMatchSteppedRange(start, end, step, targetDate)) {
        return 'matched';
      }
    } else {
      const singleDate = parseStrictIsoDateToken(token);
      if (!singleDate) {
        malformedEntryCount += 1;
        continue;
      }
      validEntryCount += 1;
      if (singleDate === targetDate) {
        return 'matched';
      }
    }
  }

  if (malformedEntryCount > 0 || validEntryCount === 0) {
    return 'unparseable';
  }

  return 'not_present';
}

/**
 * Generates recent candidate UTC calendar dates in descending order.
 * Generated calendar dates NEVER claim verified imagery availability.
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
      globalDateListed: false,
      regionalCoverageVerified: false,
      productId: productDef.id,
      verifiedObservationDate: null,
      source: 'calendar_candidate',
      note: isBeforeStart
        ? `Date precedes NASA GIBS operational start (${productDef.temporalCoverageStart}) for ${productDef.gibsLayer}.`
        : 'Calendar candidate date only; global metadata and local swath coverage remain unverified.',
    });
  }

  return entries;
}

/**
 * Checks official NASA GIBS WMTS DescribeDomains metadata for GLOBAL layer temporal availability.
 *
 * IMPORTANT: NASA GIBS documents that DescribeDomains BBOX has no effect on returned temporal domains.
 * Therefore a match yields `availability: 'global_date_listed'` with `regionalCoverageVerified: false`
 * and `verifiedObservationDate: null` — never claiming local/city satellite acquisition verification.
 */
export async function verifyImageryAvailability(params: {
  product: ImageryProductId | string;
  date: string;
  bbox?: GeographicBoundingBox;
  fetchImpl?: typeof fetch;
  referenceNow?: Date;
}): Promise<ImageryDateEntry> {
  const { product, date, bbox, fetchImpl = fetch, referenceNow } = params;
  const prod = resolveImageryProduct(product);
  const validDate = validateImageryDate(date, { referenceNow });
  if (bbox !== undefined) {
    validateGeographicBoundingBox(bbox);
  }

  if (validDate < prod.temporalCoverageStart) {
    return {
      date: validDate,
      availability: 'unavailable',
      globalDateListed: false,
      regionalCoverageVerified: false,
      productId: prod.id,
      verifiedObservationDate: null,
      source: 'nasa_gibs_capabilities',
      note: `Requested date ${validDate} precedes ${prod.gibsLayer} GIBS operational coverage start (${prod.temporalCoverageStart}).`,
    };
  }

  // Official NASA GIBS OGC WMTS KVP DescribeDomains endpoint (BBOX has no effect in GIBS global domains).
  const domainsUrl = `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/wmts.cgi?SERVICE=WMTS&REQUEST=DescribeDomains&TileMatrixSet=${encodeURIComponent(prod.gibsTileMatrixSet)}&Layer=${encodeURIComponent(prod.gibsLayer)}`;

  try {
    const res = await fetchImpl(domainsUrl, {
      signal: AbortSignal.timeout(GIBS_DOMAIN_TIMEOUT_MS),
    });

    if (!res.ok) {
      // Check explicitly whether an HTTP 404 body contains a valid parsed empty temporal domain before assuming unavailable
      if (res.status === 404 && typeof res.text === 'function') {
        const bodyText = await res.text().catch(() => '');
        if (parseGibsXmlTimeMatch(bodyText, validDate) === 'not_present') {
          return {
            date: validDate,
            availability: 'unavailable',
            globalDateListed: false,
            regionalCoverageVerified: false,
            productId: prod.id,
            verifiedObservationDate: null,
            source: 'nasa_gibs_describe_domains',
            note: `NASA GIBS DescribeDomains confirmed no global temporal entry for ${prod.gibsLayer} on ${validDate}.`,
          };
        }
      }

      return {
        date: validDate,
        availability: 'unverified',
        globalDateListed: false,
        regionalCoverageVerified: false,
        productId: prod.id,
        verifiedObservationDate: null,
        source: 'nasa_gibs_describe_domains',
        note: `NASA GIBS DescribeDomains returned HTTP ${res.status}; availability for ${validDate} remains unverified.`,
      };
    }

    const xmlText = await res.text();
    const matchStatus = parseGibsXmlTimeMatch(xmlText, validDate);

    if (matchStatus === 'matched') {
      return {
        date: validDate,
        availability: 'global_date_listed',
        globalDateListed: true,
        regionalCoverageVerified: false,
        productId: prod.id,
        verifiedObservationDate: null,
        source: 'nasa_gibs_describe_domains',
        note: `Global layer date ${validDate} is listed in NASA GIBS DescribeDomains for ${prod.gibsLayer}. Local swath coverage, cloud cover, and city acquisition time are unverified.`,
      };
    }

    if (matchStatus === 'not_present') {
      return {
        date: validDate,
        availability: 'unavailable',
        globalDateListed: false,
        regionalCoverageVerified: false,
        productId: prod.id,
        verifiedObservationDate: null,
        source: 'nasa_gibs_describe_domains',
        note: `Requested date ${validDate} is absent from NASA GIBS DescribeDomains global temporal intervals for ${prod.gibsLayer}.`,
      };
    }

    return {
      date: validDate,
      availability: 'unverified',
      globalDateListed: false,
      regionalCoverageVerified: false,
      productId: prod.id,
      verifiedObservationDate: null,
      source: 'nasa_gibs_describe_domains',
      note: 'NASA GIBS DescribeDomains XML could not be reliably parsed; availability remains unverified.',
    };
  } catch {
    return {
      date: validDate,
      availability: 'unverified',
      globalDateListed: false,
      regionalCoverageVerified: false,
      productId: prod.id,
      verifiedObservationDate: null,
      source: 'nasa_gibs_describe_domains',
      note: `Unable to reach NASA GIBS DescribeDomains metadata; availability for ${validDate} remains unverified.`,
    };
  }
}

/**
 * Probes NASA Worldview Snapshots (WVS) for real per-bounding-box pixel presence
 * (`Data-Present` and `Acquisition-Time` CORS-exposed response headers, adapted from
 * bilawalsidhu/gods-eye-view). Never assumes data presence from HTTP 200 alone.
 */
export async function probeWvsRegionalCoverage(params: {
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

  const probeUrl = buildGibsSnapshotUrl({
    product: prod.id,
    date: validDate,
    bbox: validBbox,
    width: 256,
    height: 256,
    referenceNow,
  });

  try {
    const res = await fetchImpl(probeUrl, {
      signal: AbortSignal.timeout(8000),
    });

    const dataPresentRaw = res.headers?.get?.('Data-Present')?.trim().toLowerCase() ?? '';
    const acquisitionTimeRaw = res.headers?.get?.('Acquisition-Time')?.trim() ?? '';

    if (typeof res.body?.cancel === 'function') {
      await res.body.cancel().catch(() => {});
    }

    if (!res.ok) {
      return {
        date: validDate,
        availability: 'unverified',
        globalDateListed: false,
        regionalCoverageVerified: false,
        productId: prod.id,
        verifiedObservationDate: null,
        source: 'nasa_gibs_capabilities',
        note: `NASA WVS snapshot probe returned HTTP ${res.status}; regional pixel coverage remains unverified.`,
      };
    }

    if (dataPresentRaw === 'false') {
      return {
        date: validDate,
        availability: 'unavailable',
        globalDateListed: false,
        regionalCoverageVerified: false,
        productId: prod.id,
        verifiedObservationDate: null,
        source: 'nasa_gibs_capabilities',
        note: `NASA WVS reported Data-Present: false for this bounding box on ${validDate} (outside swath or empty pass).`,
      };
    }

    if (dataPresentRaw === 'true') {
      const parsedAcquisition = parseStrictIsoDateToken(acquisitionTimeRaw);
      const verifiedDate =
        parsedAcquisition && parsedAcquisition >= prod.temporalCoverageStart
          ? parsedAcquisition
          : null;

      return {
        date: validDate,
        availability: 'verified_regional',
        globalDateListed: true,
        regionalCoverageVerified: true,
        productId: prod.id,
        verifiedObservationDate: verifiedDate,
        source: 'nasa_gibs_capabilities',
        note: verifiedDate
          ? `NASA WVS confirmed Data-Present: true for this bounding box (Acquisition-Time: ${verifiedDate}). Cloud cover not excluded.`
          : `NASA WVS confirmed Data-Present: true for this bounding box on ${validDate}. Cloud cover not excluded.`,
      };
    }

    return {
      date: validDate,
      availability: 'unverified',
      globalDateListed: false,
      regionalCoverageVerified: false,
      productId: prod.id,
      verifiedObservationDate: null,
      source: 'nasa_gibs_capabilities',
      note: `NASA WVS omitted Data-Present header for ${validDate}; regional swath coverage remains unverified.`,
    };
  } catch {
    return {
      date: validDate,
      availability: 'unverified',
      globalDateListed: false,
      regionalCoverageVerified: false,
      productId: prod.id,
      verifiedObservationDate: null,
      source: 'nasa_gibs_capabilities',
      note: `Unable to probe NASA WVS pixel headers for ${validDate}; regional coverage remains unverified.`,
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

  // Actual acquisition date is NEVER inferred from candidate generation or global DescribeDomains metadata
  const resolvedVerifiedDate =
    availability === 'verified_regional' && verifiedAcquisitionDate
      ? validateImageryDate(verifiedAcquisitionDate, { referenceNow })
      : null;

  const availabilityNote =
    availabilityNoteOverride ??
    (isBeforeOperationalStart
      ? `Requested date ${validDate} precedes ${prod.gibsLayer} operational start (${prod.temporalCoverageStart}).`
      : availability === 'verified_regional'
        ? `Regional coverage verified for requested date ${validDate}.`
        : availability === 'global_date_listed'
          ? `Global layer date ${validDate} is listed by NASA GIBS; regional swath coverage and acquisition date over this city remain unverified.`
          : availability === 'unavailable'
            ? `Satellite imagery unavailable for ${validDate}.`
            : `Requested snapshot URL constructed for ${validDate}; imagery availability over this city is unverified.`);

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
