/**
 * NASA FIRMS Active-Fire & Thermal Anomaly Domain Types (Phase 4)
 * 
 * Defines canonical data contracts and parser utilities for:
 * - NASA FIRMS (VIIRS NOAA-20, NOAA-21, and MODIS Terra/Aqua)
 * - Fire Radiative Power (FRP, MW) and detection confidence
 * - Geographic proximity filtering and regional spatial context
 * - Strict scientific disclaimers regarding fire detection vs urban pollution causality
 */

export interface FirmsHotspot {
  id: string;
  latitude: number;
  longitude: number;
  brightness: number; // Kelvin
  scan: number;
  track: number;
  acqDate: string; // YYYY-MM-DD
  acqTime: string; // HHMM UTC
  satellite: string; // e.g. NOAA-20, NOAA-21, Terra, Aqua
  instrument: 'VIIRS' | 'MODIS';
  confidence: string; // 'low' | 'nominal' | 'high' or percentage
  frp: number | null; // Fire Radiative Power in Megawatts (MW)
  daynight: 'D' | 'N';
  provider: 'NASA FIRMS / LANCE / EOSDIS';
}

export type FirmsStatus = 'active' | 'unconfigured' | 'quota_exceeded' | 'upstream_error';

export interface FirmsStatusResponse {
  configured: boolean;
  status: FirmsStatus;
  message: string;
  hotspots: FirmsHotspot[];
  count: number;
  retrievedAt: string;
  disclaimer: string;
  regionalContext?: {
    centerLat: number;
    centerLng: number;
    radiusKm: number;
    countWithinRadius: number;
    nearestDistanceKm: number | null;
  } | null;
}

export const FIRMS_SCIENTIFIC_DISCLAIMER =
  'NASA FIRMS thermal anomaly detections identify surface heat and potential active fires. Satellite thermal detections do not constitute verified wildfire incidents, and proximity alone does not prove smoke transport or ground-level air quality degradation without validated atmospheric dispersion modeling.';

/**
 * Parses standard NASA FIRMS CSV stream (VIIRS or MODIS format).
 */
export function parseFirmsCsv(
  csvText: string,
  satelliteName: string = 'NOAA-20',
  instrument: 'VIIRS' | 'MODIS' = 'VIIRS'
): FirmsHotspot[] {
  if (!csvText || typeof csvText !== 'string') return [];

  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const latIdx = header.indexOf('latitude');
  const lngIdx = header.indexOf('longitude');
  const brightIdx = header.indexOf('bright_ti4') !== -1 ? header.indexOf('bright_ti4') : header.indexOf('brightness');
  const scanIdx = header.indexOf('scan');
  const trackIdx = header.indexOf('track');
  const dateIdx = header.indexOf('acq_date');
  const timeIdx = header.indexOf('acq_time');
  const satIdx = header.indexOf('satellite');
  const confIdx = header.indexOf('confidence');
  const frpIdx = header.indexOf('frp');
  const dnIdx = header.indexOf('daynight');

  if (latIdx === -1 || lngIdx === -1) return [];

  const hotspots: FirmsHotspot[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    if (cols.length < header.length) continue;

    const lat = parseFloat(cols[latIdx]);
    const lng = parseFloat(cols[lngIdx]);

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      continue;
    }

    const brightness = brightIdx !== -1 ? parseFloat(cols[brightIdx]) : 300;
    const scan = scanIdx !== -1 ? parseFloat(cols[scanIdx]) : 1.0;
    const track = trackIdx !== -1 ? parseFloat(cols[trackIdx]) : 1.0;
    const acqDate = dateIdx !== -1 ? cols[dateIdx] : '';
    const acqTime = timeIdx !== -1 ? cols[timeIdx] : '';
    const satellite = satIdx !== -1 && cols[satIdx] ? cols[satIdx] : satelliteName;
    const confidence = confIdx !== -1 ? cols[confIdx] : 'nominal';
    const frp = frpIdx !== -1 && cols[frpIdx] ? parseFloat(cols[frpIdx]) : null;
    const daynight = dnIdx !== -1 && cols[dnIdx] === 'N' ? 'N' : 'D';

    hotspots.push({
      id: `firms-${satellite}-${acqDate}-${acqTime}-${i}`,
      latitude: lat,
      longitude: lng,
      brightness: Number.isFinite(brightness) ? brightness : 300,
      scan: Number.isFinite(scan) ? scan : 1.0,
      track: Number.isFinite(track) ? track : 1.0,
      acqDate,
      acqTime,
      satellite,
      instrument,
      confidence,
      frp: Number.isFinite(frp) ? frp : null,
      daynight,
      provider: 'NASA FIRMS / LANCE / EOSDIS',
    });
  }

  return hotspots;
}

/**
 * Filters hotspots within a specified radial distance (km) of coordinates.
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
  const DEG_TO_KM = 111.195;
  let nearestDist = Infinity;
  const filtered: FirmsHotspot[] = [];

  for (const h of hotspots) {
    const dLat = (h.latitude - lat) * DEG_TO_KM;
    const dLng = (h.longitude - lng) * DEG_TO_KM * Math.cos((lat * Math.PI) / 180);
    const dist = Math.hypot(dLat, dLng);

    if (dist <= radiusKm) {
      filtered.push(h);
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
