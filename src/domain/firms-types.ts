/**
 * NASA FIRMS Active-Fire & Thermal Anomaly Domain Types (Phase 4)
 *
 * Defines canonical data contracts, strict CSV parsing, and great-circle filtering for:
 * - NASA FIRMS satellite thermal anomaly detections (e.g. VIIRS NOAA-20 NRT)
 * - Fire Radiative Power (FRP, MW) and detection confidence (never fabricated when missing)
 * - Haversine great-circle proximity filtering
 * - Explicit scientific disclaimers distinguishing thermal anomalies from confirmed wildfires & smoke
 */

export interface FirmsHotspot {
  id: string;
  latitude: number;
  longitude: number;
  brightness: number | null; // Kelvin (bright_ti4 / brightness), null when unavailable
  scan: number | null; // km, null when unavailable
  track: number | null; // km, null when unavailable
  acqDate: string; // YYYY-MM-DD UTC
  acqTime: string; // HHMM UTC (4 digits)
  observedAtUtc: string; // ISO-8601 UTC observation timestamp
  satellite: string; // e.g. 'NOAA-20'
  instrument: 'VIIRS' | 'MODIS';
  confidence: string | null; // 'low' | 'nominal' | 'high' or numeric %, null when missing
  version: string | null;
  frp: number | null; // Fire Radiative Power in Megawatts (MW), null when unavailable
  daynight: 'D' | 'N' | null;
  distanceKm?: number;
  sourceDataset: string; // e.g. 'VIIRS_NOAA20_NRT'
  provider: 'NASA FIRMS / LANCE / EOSDIS';
}

export type FirmsStatus =
  | 'active'
  | 'no_detections'
  | 'unconfigured'
  | 'invalid_credentials'
  | 'quota_exceeded'
  | 'upstream_timeout'
  | 'malformed_csv'
  | 'upstream_error'
  | 'stale_cached';

export interface FirmsStatusResponse {
  configured: boolean;
  isAvailable: boolean;
  isCached: boolean;
  isStale: boolean;
  cachedAtUtc?: string | null;
  status: FirmsStatus;
  message: string;
  dataset: string;
  satellite: string;
  instrument: 'VIIRS' | 'MODIS';
  dayRange: number;
  hotspots: FirmsHotspot[];
  count: number;
  retrievedAt: string;
  latestObservationUtc?: string | null;
  disclaimer: string;
  uncertaintyNotes: string;
  regionalContext?: {
    centerLat: number;
    centerLng: number;
    radiusKm: number;
    countWithinRadius: number;
    nearestDistanceKm: number | null;
  } | null;
}

export interface FirmsCsvParseResult {
  isValidCsv: boolean;
  hotspots: FirmsHotspot[];
  rejectedRowCount: number;
  errorReason?: string;
}

export const FIRMS_SCIENTIFIC_DISCLAIMER =
  'NASA FIRMS thermal anomaly detections identify surface heat and potential active fires. Satellite thermal detections do not constitute verified wildfire incidents, and proximity alone does not prove smoke transport or ground-level air quality degradation without validated atmospheric dispersion modeling.';

const EARTH_MEAN_RADIUS_KM = 6371.0088;
const STRICT_NUMBER_REGEX = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

function parseStrictFiniteNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (!trimmed || !STRICT_NUMBER_REGEX.test(trimmed)) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

function splitCsvRow(line: string): string[] | null {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }

  if (inQuotes) return null;
  fields.push(current.trim());
  return fields;
}

function parseVerifiedAcqUtc(acqDateRaw: string, acqTimeRaw: string): {
  acqDate: string;
  acqTime: string;
  observedAtUtc: string;
} | null {
  const dateStr = acqDateRaw.trim();
  const timeStr = acqTimeRaw.trim();

  const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) return null;

  const year = parseInt(dateMatch[1], 10);
  const month = parseInt(dateMatch[2], 10);
  const day = parseInt(dateMatch[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  if (!/^\d{1,4}$/.test(timeStr)) return null;
  const paddedTime = timeStr.padStart(4, '0');
  const hour = parseInt(paddedTime.slice(0, 2), 10);
  const minute = parseInt(paddedTime.slice(2, 4), 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  const epoch = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const verifiedDate = new Date(epoch);
  // Reject calendar rollovers such as 2026-02-30
  if (
    verifiedDate.getUTCFullYear() !== year ||
    verifiedDate.getUTCMonth() !== month - 1 ||
    verifiedDate.getUTCDate() !== day
  ) {
    return null;
  }

  return {
    acqDate: dateStr,
    acqTime: paddedTime,
    observedAtUtc: verifiedDate.toISOString(),
  };
}

function normalizeSatelliteCode(rawSat: string | undefined, fallbackSatellite: string): string {
  const trimmed = rawSat?.trim() ?? '';
  if (!trimmed) return fallbackSatellite;

  const upper = trimmed.toUpperCase();
  if (upper === '2' || upper === 'N20' || upper === 'NOAA-20' || upper === 'J1') return 'NOAA-20';
  if (upper === '1' || upper === 'N21' || upper === 'NOAA-21' || upper === 'J2') return 'NOAA-21';
  if (upper === 'N' || upper === 'NPP' || upper === 'SUOMI-NPP' || upper === 'SNPP') return 'Suomi-NPP';
  if (upper === 'T' || upper === 'TERRA') return 'Terra';
  if (upper === 'A' || upper === 'AQUA') return 'Aqua';
  return trimmed;
}

function normalizeConfidence(rawConf: string | undefined): string | null {
  const trimmed = rawConf?.trim() ?? '';
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (lower === 'l' || lower === 'low') return 'low';
  if (lower === 'n' || lower === 'nominal') return 'nominal';
  if (lower === 'h' || lower === 'high') return 'high';

  const numeric = parseStrictFiniteNumber(trimmed);
  if (numeric !== null && numeric >= 0 && numeric <= 100) {
    return String(numeric);
  }
  return null;
}

function normalizeInstrument(rawInstr: string | undefined, fallback: 'VIIRS' | 'MODIS'): 'VIIRS' | 'MODIS' {
  const upper = rawInstr?.trim().toUpperCase();
  if (upper === 'MODIS') return 'MODIS';
  if (upper === 'VIIRS') return 'VIIRS';
  return fallback;
}

/**
 * Parses a NASA FIRMS Area API CSV response with strict header validation,
 * zero-fabrication optional field handling, and explicit distinction between
 * empty valid CSV streams and malformed/error responses.
 */
export function parseFirmsCsvDetailed(
  csvText: string,
  satelliteName: string = 'NOAA-20',
  instrument: 'VIIRS' | 'MODIS' = 'VIIRS',
  sourceDataset: string = 'VIIRS_NOAA20_NRT'
): FirmsCsvParseResult {
  if (!csvText || typeof csvText !== 'string') {
    return {
      isValidCsv: false,
      hotspots: [],
      rejectedRowCount: 0,
      errorReason: 'Empty or non-string FIRMS CSV payload.',
    };
  }

  const trimmedPayload = csvText.trim();
  if (trimmedPayload.length === 0) {
    return {
      isValidCsv: false,
      hotspots: [],
      rejectedRowCount: 0,
      errorReason: 'Blank FIRMS response body.',
    };
  }

  if (trimmedPayload.startsWith('<') || trimmedPayload.startsWith('{')) {
    return {
      isValidCsv: false,
      hotspots: [],
      rejectedRowCount: 0,
      errorReason: 'Unexpected non-CSV upstream payload.',
    };
  }

  const lines = trimmedPayload
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return {
      isValidCsv: false,
      hotspots: [],
      rejectedRowCount: 0,
      errorReason: 'CSV payload missing header row.',
    };
  }

  const headerCols = splitCsvRow(lines[0]);
  if (!headerCols || headerCols.length < 4) {
    return {
      isValidCsv: false,
      hotspots: [],
      rejectedRowCount: 0,
      errorReason: 'Malformed CSV header row.',
    };
  }

  const header = headerCols.map((h) => h.toLowerCase());
  const latIdx = header.indexOf('latitude');
  const lngIdx = header.indexOf('longitude');
  const brightIdx =
    header.indexOf('bright_ti4') !== -1
      ? header.indexOf('bright_ti4')
      : header.indexOf('brightness');
  const scanIdx = header.indexOf('scan');
  const trackIdx = header.indexOf('track');
  const dateIdx = header.indexOf('acq_date');
  const timeIdx = header.indexOf('acq_time');
  const satIdx = header.indexOf('satellite');
  const instrIdx = header.indexOf('instrument');
  const confIdx = header.indexOf('confidence');
  const verIdx = header.indexOf('version');
  const frpIdx = header.indexOf('frp');
  const dnIdx = header.indexOf('daynight');

  if (latIdx === -1 || lngIdx === -1 || dateIdx === -1 || timeIdx === -1) {
    return {
      isValidCsv: false,
      hotspots: [],
      rejectedRowCount: 0,
      errorReason: 'CSV header missing required columns (latitude, longitude, acq_date, acq_time).',
    };
  }

  // Valid CSV header with 0 detections
  if (lines.length === 1) {
    return {
      isValidCsv: true,
      hotspots: [],
      rejectedRowCount: 0,
    };
  }

  const hotspots: FirmsHotspot[] = [];
  let rejectedRowCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvRow(lines[i]);
    if (!cols || cols.length !== header.length) {
      rejectedRowCount++;
      continue;
    }

    const lat = parseStrictFiniteNumber(cols[latIdx]);
    const lng = parseStrictFiniteNumber(cols[lngIdx]);
    if (
      lat === null ||
      lng === null ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      rejectedRowCount++;
      continue;
    }

    const verifiedAcq = parseVerifiedAcqUtc(cols[dateIdx], cols[timeIdx]);
    if (!verifiedAcq) {
      rejectedRowCount++;
      continue;
    }

    // Optional physical measurements: null when missing or out of valid physical range (NEVER defaulted)
    const rawBrightness = brightIdx !== -1 ? parseStrictFiniteNumber(cols[brightIdx]) : null;
    const brightness =
      rawBrightness !== null && rawBrightness > 0 && rawBrightness <= 1000 ? rawBrightness : null;

    const rawScan = scanIdx !== -1 ? parseStrictFiniteNumber(cols[scanIdx]) : null;
    const scan = rawScan !== null && rawScan > 0 && rawScan <= 20 ? rawScan : null;

    const rawTrack = trackIdx !== -1 ? parseStrictFiniteNumber(cols[trackIdx]) : null;
    const track = rawTrack !== null && rawTrack > 0 && rawTrack <= 20 ? rawTrack : null;

    const rawFrp = frpIdx !== -1 ? parseStrictFiniteNumber(cols[frpIdx]) : null;
    const frp = rawFrp !== null && rawFrp >= 0 && rawFrp <= 50000 ? rawFrp : null;

    const satellite = normalizeSatelliteCode(
      satIdx !== -1 ? cols[satIdx] : undefined,
      satelliteName
    );
    const resolvedInstrument = normalizeInstrument(
      instrIdx !== -1 ? cols[instrIdx] : undefined,
      instrument
    );
    const confidence = confIdx !== -1 ? normalizeConfidence(cols[confIdx]) : null;
    const version = verIdx !== -1 && cols[verIdx] ? cols[verIdx] : null;
    const dnRaw = dnIdx !== -1 ? cols[dnIdx].toUpperCase() : '';
    const daynight: 'D' | 'N' | null = dnRaw === 'D' || dnRaw === 'N' ? dnRaw : null;

    hotspots.push({
      id: `firms-${satellite}-${verifiedAcq.acqDate}-${verifiedAcq.acqTime}-${lat.toFixed(4)}_${lng.toFixed(4)}`,
      latitude: lat,
      longitude: lng,
      brightness,
      scan,
      track,
      acqDate: verifiedAcq.acqDate,
      acqTime: verifiedAcq.acqTime,
      observedAtUtc: verifiedAcq.observedAtUtc,
      satellite,
      instrument: resolvedInstrument,
      confidence,
      version,
      frp,
      daynight,
      sourceDataset,
      provider: 'NASA FIRMS / LANCE / EOSDIS',
    });
  }

  // Every data row in the stream was malformed -> malformed CSV, never report valid zero detections
  const totalDataRows = lines.length - 1;
  if (totalDataRows > 0 && hotspots.length === 0 && rejectedRowCount === totalDataRows) {
    return {
      isValidCsv: false,
      hotspots: [],
      rejectedRowCount,
      errorReason: 'All FIRMS CSV rows failed coordinate, timestamp, or column validation.',
    };
  }

  return {
    isValidCsv: true,
    hotspots,
    rejectedRowCount,
  };
}

/**
 * Backwards-compatible helper returning validated FIRMS detections or `[]`.
 */
export function parseFirmsCsv(
  csvText: string,
  satelliteName: string = 'NOAA-20',
  instrument: 'VIIRS' | 'MODIS' = 'VIIRS',
  sourceDataset: string = 'VIIRS_NOAA20_NRT'
): FirmsHotspot[] {
  return parseFirmsCsvDetailed(csvText, satelliteName, instrument, sourceDataset).hotspots;
}

/**
 * Computes exact spherical great-circle distance (km) via the Haversine formula,
 * accurate across high latitudes and international date line crossings.
 */
export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lng1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lng2) ||
    lat1 < -90 ||
    lat1 > 90 ||
    lat2 < -90 ||
    lat2 > 90 ||
    lng1 < -180 ||
    lng1 > 180 ||
    lng2 < -180 ||
    lng2 > 180
  ) {
    throw new RangeError('Invalid coordinates provided to haversineDistanceKm.');
  }

  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  // Normalize delta longitude across [-180, 180]
  let dLngDeg = (lng2 - lng1) % 360;
  if (dLngDeg > 180) dLngDeg -= 360;
  if (dLngDeg < -180) dLngDeg += 360;
  const dLng = dLngDeg * toRad;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) *
      Math.cos(lat2 * toRad) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const clampedA = Math.min(1, Math.max(0, a));
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));
  return EARTH_MEAN_RADIUS_KM * c;
}

/**
 * Filters validated FIRMS hotspots within a specified great-circle radius (km).
 */
export function filterHotspotsNearCoordinates(
  hotspots: FirmsHotspot[],
  lat: number,
  lng: number,
  radiusKm: number = 500
): {
  filtered: FirmsHotspot[];
  count: number;
  nearestKm: number | null;
} {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180 ||
    !Number.isFinite(radiusKm) ||
    radiusKm <= 0
  ) {
    throw new RangeError('Invalid query coordinates or radiusKm in filterHotspotsNearCoordinates.');
  }

  let nearestDist = Infinity;
  const filtered: FirmsHotspot[] = [];

  for (const h of hotspots) {
    if (
      !Number.isFinite(h.latitude) ||
      !Number.isFinite(h.longitude) ||
      h.latitude < -90 ||
      h.latitude > 90 ||
      h.longitude < -180 ||
      h.longitude > 180
    ) {
      continue;
    }

    const dist = haversineDistanceKm(lat, lng, h.latitude, h.longitude);
    if (dist <= radiusKm + 1e-6) {
      const roundedDist = Math.round(dist * 10) / 10;
      filtered.push({ ...h, distanceKm: roundedDist });
      if (dist < nearestDist) {
        nearestDist = dist;
      }
    }
  }

  return {
    filtered,
    count: filtered.length,
    nearestKm: Number.isFinite(nearestDist) ? Math.round(nearestDist * 10) / 10 : null,
  };
}
