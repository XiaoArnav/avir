/**
 * Global Wind-Flow Service (Phase 3)
 *
 * Queries the Open-Meteo Forecast API (timezone=GMT, models=best_match, wind_speed_unit=kmh)
 * to retrieve 10-meter wind vectors synchronized to a single UTC instant.
 *
 * Scientific & Integrity Guarantees:
 * - Zero Fabrication: Missing, failed, or misaligned samples never receive default speeds/directions.
 * - Strict Coordinate Provenance: Never substitutes another city's probe as active-city wind.
 * - Single-Instant Synchronization: Matches global probes strictly on parsed UTC epoch timestamp.
 * - Honest Attribution: Uses Open-Meteo Forecast API (`best_match` blend) rather than guessing a specific NWP run.
 */

import {
  WindForecastResponse,
  WindForecastStatus,
  WindVectorPoint,
  calculateWindUV,
  getVentilationRating,
} from '@/domain/wind-types';

export interface GlobalWindProbe {
  name: string;
  lat: number;
  lng: number;
}

export const GLOBAL_WIND_PROBES: readonly GlobalWindProbe[] = [
  { name: 'New Delhi', lat: 28.6139, lng: 77.209 },
  { name: 'Bengaluru', lat: 12.9716, lng: 77.5946 },
  { name: 'Mumbai', lat: 19.076, lng: 72.8777 },
  { name: 'Kolkata', lat: 22.5726, lng: 88.3639 },
  { name: 'Chennai', lat: 13.0827, lng: 80.2707 },
  { name: 'Lahore', lat: 31.5204, lng: 74.3587 },
  { name: 'Dhaka', lat: 23.8103, lng: 90.4125 },
  { name: 'Beijing', lat: 39.9042, lng: 116.4074 },
  { name: 'Tokyo', lat: 35.6762, lng: 139.6503 },
  { name: 'Bangkok', lat: 13.7563, lng: 100.5018 },
  { name: 'Dubai', lat: 25.2048, lng: 55.2708 },
  { name: 'London', lat: 51.5074, lng: -0.1278 },
  { name: 'Berlin', lat: 52.52, lng: 13.405 },
  { name: 'New York', lat: 40.7128, lng: -74.006 },
  { name: 'Los Angeles', lat: 34.0522, lng: -118.2437 },
  { name: 'Sydney', lat: -33.8688, lng: 151.2093 },
  { name: 'Nairobi', lat: -1.2921, lng: 36.8219 },
  { name: 'São Paulo', lat: -23.5505, lng: -46.6333 },
];

interface CacheEntry {
  cachedAtMs: number;
  cachedAtUtc: string;
  data: WindForecastResponse;
}

const windCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_COORDINATE_SNAP_DEGREES = 1.0;

export function clearWindCache(): void {
  windCache.clear();
}

function normalizeLngDelta(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function coordinatesMatchProbe(
  resp: any,
  expectedLat: number,
  expectedLng: number
): { ok: boolean; lat: number; lng: number } {
  if (resp.latitude === undefined && resp.longitude === undefined) {
    return { ok: true, lat: expectedLat, lng: expectedLng };
  }
  if (
    typeof resp.latitude !== 'number' ||
    !Number.isFinite(resp.latitude) ||
    typeof resp.longitude !== 'number' ||
    !Number.isFinite(resp.longitude) ||
    resp.latitude < -90 ||
    resp.latitude > 90 ||
    resp.longitude < -180 ||
    resp.longitude > 180
  ) {
    return { ok: false, lat: expectedLat, lng: expectedLng };
  }

  const latDiff = Math.abs(resp.latitude - expectedLat);
  const lngDiff = normalizeLngDelta(resp.longitude, expectedLng);
  if (latDiff > MAX_COORDINATE_SNAP_DEGREES || lngDiff > MAX_COORDINATE_SNAP_DEGREES) {
    return { ok: false, lat: expectedLat, lng: expectedLng };
  }

  return { ok: true, lat: expectedLat, lng: expectedLng };
}

/**
 * Parses an Open-Meteo `hourly.time` entry to exact UTC epoch milliseconds,
 * honoring explicit offsets (`Z`, `+05:30`) or numeric `utc_offset_seconds`.
 */
export function parseOpenMeteoUtcEpoch(timeStr: unknown, utcOffsetSeconds: unknown = 0): number | null {
  if (typeof timeStr !== 'string' || timeStr.trim().length === 0) return null;
  const trimmed = timeStr.trim();

  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) {
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }

  const isoParts = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!isoParts) return null;

  const year = parseInt(isoParts[1], 10);
  const month = parseInt(isoParts[2], 10) - 1;
  const day = parseInt(isoParts[3], 10);
  const hour = parseInt(isoParts[4], 10);
  const minute = parseInt(isoParts[5], 10);
  const second = isoParts[6] ? parseInt(isoParts[6], 10) : 0;

  if (month < 0 || month > 11 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return null;
  }

  const offsetSec =
    typeof utcOffsetSeconds === 'number' && Number.isFinite(utcOffsetSeconds) ? utcOffsetSeconds : 0;
  return Date.UTC(year, month, day, hour, minute, second) - offsetSec * 1000;
}

function buildHourlyIndexByUtcEpoch(resp: any): {
  entriesByEpoch: Map<number, { speedKmh: number; directionDeg: number }>;
  orderedEpochs: number[];
} | null {
  const hourly = resp?.hourly;
  if (
    !hourly ||
    !Array.isArray(hourly.time) ||
    !Array.isArray(hourly.wind_speed_10m) ||
    !Array.isArray(hourly.wind_direction_10m)
  ) {
    return null;
  }

  // Reject inconsistent array lengths or unsupported wind speed units
  if (
    hourly.time.length === 0 ||
    hourly.wind_speed_10m.length !== hourly.time.length ||
    hourly.wind_direction_10m.length !== hourly.time.length
  ) {
    return null;
  }

  const speedUnit = resp?.hourly_units?.wind_speed_10m;
  if (speedUnit !== undefined && speedUnit !== 'km/h' && speedUnit !== 'kmh') {
    return null;
  }

  const dirUnit = resp?.hourly_units?.wind_direction_10m;
  if (dirUnit !== undefined && dirUnit !== '°' && dirUnit !== 'deg' && dirUnit !== 'degrees') {
    return null;
  }

  const offsetSec =
    typeof resp?.utc_offset_seconds === 'number' && Number.isFinite(resp.utc_offset_seconds)
      ? resp.utc_offset_seconds
      : 0;

  const entriesByEpoch = new Map<number, { speedKmh: number; directionDeg: number }>();
  const orderedEpochs: number[] = [];

  for (let i = 0; i < hourly.time.length; i++) {
    const epoch = parseOpenMeteoUtcEpoch(hourly.time[i], offsetSec);
    if (epoch === null) return null; // Reject corrupted timestamp series

    if (!orderedEpochs.includes(epoch)) {
      orderedEpochs.push(epoch);
    }

    const rawSpeed = hourly.wind_speed_10m[i];
    const rawDir = hourly.wind_direction_10m[i];

    // Strict check: null/undefined/NaN/negative values must never be converted via Number(null) -> 0
    if (
      typeof rawSpeed === 'number' &&
      Number.isFinite(rawSpeed) &&
      rawSpeed >= 0 &&
      typeof rawDir === 'number' &&
      Number.isFinite(rawDir) &&
      rawDir >= 0 &&
      rawDir <= 360
    ) {
      entriesByEpoch.set(epoch, { speedKmh: rawSpeed, directionDeg: rawDir });
    }
  }

  orderedEpochs.sort((a, b) => a - b);
  return { entriesByEpoch, orderedEpochs };
}

function selectTargetEpoch(
  candidateEpochs: number[],
  selectedHour: number,
  targetValidTimeUtc?: string
): number | null {
  if (candidateEpochs.length === 0) return null;

  if (targetValidTimeUtc) {
    const requestedEpoch = Date.parse(targetValidTimeUtc);
    if (Number.isNaN(requestedEpoch)) return null;
    return candidateEpochs.includes(requestedEpoch) ? requestedEpoch : null;
  }

  const matches = candidateEpochs.filter((ep) => new Date(ep).getUTCHours() === selectedHour);
  if (matches.length === 0) return null;
  return matches[0];
}

function buildUnavailableResponse(params: {
  status: WindForecastStatus;
  selectedHour: number;
  targetValidTimeUtc?: string;
  unavailableReason: string;
  modelName: string;
}): WindForecastResponse {
  return {
    status: params.status,
    isAvailable: false,
    isCached: false,
    isStale: false,
    cachedAtUtc: null,
    unavailableReason: params.unavailableReason,
    model: params.modelName,
    modelRunAvailable: false,
    initTimeUtc: null,
    validTimeUtc: params.targetValidTimeUtc ?? null,
    selectedHour: params.selectedHour,
    timeResolutionMode: params.targetValidTimeUtc ? 'utc_instant' : 'utc_hour',
    attribution: 'Atmospheric Forecast: Open-Meteo Forecast API (10m Surface Wind)',
    units: {
      speed: 'km/h',
      vector: 'm/s',
      direction: 'degrees',
      height: 'meters',
    },
    grid: [],
    cityWind: null,
    ventilationRating: 'unavailable',
    ventilationIndicatorScope: 'unavailable',
    ventilationDescription:
      'Surface wind measurement is unavailable; wind-based ventilation indicator cannot be determined.',
    uncertaintyDisclosure:
      'Upstream forecast telemetry could not be retrieved or validated. No fallback wind vectors were fabricated.',
  };
}

export async function fetchWindForecast(params: {
  latitude: number;
  longitude: number;
  hour?: number; // 0-23 UTC hour
  targetValidTimeUtc?: string; // Optional explicit ISO-8601 UTC forecast instant
  model?: 'best_match';
  bypassCache?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<WindForecastResponse> {
  const {
    latitude,
    longitude,
    hour = new Date().getUTCHours(),
    targetValidTimeUtc,
    model = 'best_match',
    bypassCache = false,
    fetchImpl = fetch,
  } = params;

  if (
    typeof latitude !== 'number' ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof longitude !== 'number' ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new RangeError('Invalid geographic coordinates for wind forecast.');
  }

  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new RangeError('Invalid forecast UTC hour. Must be an integer between 0 and 23.');
  }

  if (targetValidTimeUtc !== undefined) {
    const parsedTarget = Date.parse(targetValidTimeUtc);
    if (Number.isNaN(parsedTarget)) {
      throw new RangeError('Invalid targetValidTimeUtc timestamp.');
    }
  }

  const utcDateKey = targetValidTimeUtc
    ? new Date(targetValidTimeUtc).toISOString().slice(0, 13)
    : `${new Date().toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}`;
  const cacheKey = `${latitude.toFixed(4)}_${longitude.toFixed(4)}_${utcDateKey}_${model}_kmh`;
  const modelLabel = `Open-Meteo Forecast API (${model} 10m wind)`;

  const cached = !bypassCache ? windCache.get(cacheKey) : undefined;
  const nowMs = Date.now();
  if (cached && nowMs - cached.cachedAtMs < CACHE_TTL_MS) {
    return {
      ...cached.data,
      isCached: true,
      isStale: false,
      cachedAtUtc: cached.cachedAtUtc,
    };
  }

  const targetProbe: GlobalWindProbe = { name: 'Active City', lat: latitude, lng: longitude };
  const allProbes = [targetProbe, ...GLOBAL_WIND_PROBES];
  const lats = allProbes.map((p) => p.lat.toFixed(4)).join(',');
  const lngs = allProbes.map((p) => p.lng.toFixed(4)).join(',');

  // Open-Meteo Forecast API with GMT alignment, explicit km/h unit, and 2-day window to span UTC midnight cleanly
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&hourly=wind_speed_10m,wind_direction_10m&models=${model}&wind_speed_unit=kmh&forecast_days=2&timezone=GMT`;

  let failureStatus: WindForecastStatus = 'temporarily_unavailable';
  let failureReason = 'Upstream wind forecast service is temporarily unavailable.';

  try {
    const res = await fetchImpl(url, {
      signal: AbortSignal.timeout(6000),
    });

    if (res.status === 429) {
      failureStatus = 'rate_limited';
      failureReason = 'Upstream Open-Meteo API rate limit reached (HTTP 429).';
      throw new Error(failureReason);
    }

    if (!res.ok) {
      failureStatus = 'temporarily_unavailable';
      failureReason = `Upstream Open-Meteo API returned HTTP ${res.status}.`;
      throw new Error(failureReason);
    }

    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      failureStatus = 'invalid_upstream_response';
      failureReason = 'Upstream Open-Meteo API returned malformed JSON.';
      throw new Error(failureReason);
    }

    if (!payload || (typeof payload !== 'object' && !Array.isArray(payload))) {
      failureStatus = 'invalid_upstream_response';
      failureReason = 'Upstream Open-Meteo API returned an unexpected payload format.';
      throw new Error(failureReason);
    }

    const responses: any[] = Array.isArray(payload) ? payload : [payload];
    if (responses.length === 0 || responses.length > allProbes.length) {
      failureStatus = 'invalid_upstream_response';
      failureReason = 'Upstream multi-location response count did not match requested locations.';
      throw new Error(failureReason);
    }

    const indexedSeries = responses.map((resp, idx) => {
      const probe = allProbes[idx];
      if (!probe || !resp || typeof resp !== 'object') return null;
      const coordCheck = coordinatesMatchProbe(resp, probe.lat, probe.lng);
      if (!coordCheck.ok) return null;
      const parsedSeries = buildHourlyIndexByUtcEpoch(resp);
      if (!parsedSeries) return null;
      return {
        probe,
        resp,
        ...parsedSeries,
      };
    });

    // Determine single shared target UTC epoch from active city if valid, else first valid reference series
    const referenceSeries = indexedSeries.find((s) => s !== null);
    if (!referenceSeries) {
      failureStatus = 'invalid_upstream_response';
      failureReason = 'No valid hourly wind time series returned by upstream provider.';
      throw new Error(failureReason);
    }

    const targetEpoch = selectTargetEpoch(
      referenceSeries.orderedEpochs,
      hour,
      targetValidTimeUtc
    );
    if (targetEpoch === null) {
      failureStatus = 'invalid_upstream_response';
      failureReason = 'Requested forecast UTC instant is absent from upstream hourly time series.';
      throw new Error(failureReason);
    }

    const resolvedValidTimeUtc = new Date(targetEpoch).toISOString();
    const rawInit =
      typeof referenceSeries.resp?.model_run_at === 'string' &&
      !Number.isNaN(Date.parse(referenceSeries.resp.model_run_at))
        ? new Date(referenceSeries.resp.model_run_at).toISOString()
        : null;

    let cityWind: WindVectorPoint | null = null;
    const grid: WindVectorPoint[] = [];

    for (let idx = 0; idx < allProbes.length; idx++) {
      const series = indexedSeries[idx];
      if (!series) continue;

      const sample = series.entriesByEpoch.get(targetEpoch);
      if (!sample) continue;

      const { u, v, speedMs } = calculateWindUV(sample.speedKmh, sample.directionDeg);
      const vectorPoint: WindVectorPoint = {
        latitude: series.probe.lat,
        longitude: series.probe.lng,
        u,
        v,
        speedKmh: sample.speedKmh,
        speedMs,
        directionDeg: sample.directionDeg,
        heightM: 10,
        label: series.probe.name,
        role: idx === 0 ? 'active_target' : 'reference_probe',
        validTimeUtc: resolvedValidTimeUtc,
        sourceModel: modelLabel,
      };

      if (idx === 0) {
        cityWind = vectorPoint;
      } else {
        grid.push(vectorPoint);
      }
    }

    // Active city sample unavailable and no reference probes valid -> unavailable
    if (!cityWind && grid.length === 0) {
      failureStatus = 'invalid_upstream_response';
      failureReason = 'No validated wind observations matched the target UTC instant.';
      throw new Error(failureReason);
    }

    const { rating, scope, description } = getVentilationRating(
      cityWind ? cityWind.speedKmh : null
    );

    const isComplete =
      cityWind !== null && responses.length === allProbes.length && grid.length === GLOBAL_WIND_PROBES.length;
    const status: WindForecastStatus = isComplete ? 'available' : 'partial';

    const result: WindForecastResponse = {
      status,
      isAvailable: cityWind !== null,
      isCached: false,
      isStale: false,
      cachedAtUtc: null,
      unavailableReason:
        cityWind === null
          ? 'Active city wind measurement was unavailable or failed coordinate/time validation; reference probes remain isolated.'
          : null,
      model: modelLabel,
      modelRunAvailable: rawInit !== null,
      initTimeUtc: rawInit,
      validTimeUtc: resolvedValidTimeUtc,
      selectedHour: hour,
      timeResolutionMode: targetValidTimeUtc ? 'utc_instant' : 'utc_hour',
      attribution: 'Atmospheric Forecast: Open-Meteo Forecast API (10m Surface Wind)',
      units: {
        speed: 'km/h',
        vector: 'm/s',
        direction: 'degrees',
        height: 'meters',
      },
      grid,
      cityWind,
      ventilationRating: rating,
      ventilationIndicatorScope: scope,
      ventilationDescription: description,
      uncertaintyDisclosure:
        'Open-Meteo best_match selects or blends gridded NWP models per region; grid-cell surface winds reflect regional synoptic flow rather than hyper-local street-canyon gusts. Model initialization time is not exposed by the forecast endpoint.',
    };

    // Only cache when active city wind is genuinely available
    if (cityWind !== null) {
      const cachedAtUtc = new Date().toISOString();
      windCache.set(cacheKey, {
        cachedAtMs: Date.now(),
        cachedAtUtc,
        data: result,
      });
    }

    return result;
  } catch (err: any) {
    if (err?.name === 'AbortError' || err?.name === 'TimeoutError') {
      failureStatus = 'upstream_timeout';
      failureReason = 'Upstream Open-Meteo API request timed out.';
    }

    // Return genuine stale cached data ONLY if exact key (location, UTC hour/time, model) exists
    const staleEntry = !bypassCache ? windCache.get(cacheKey) : undefined;
    if (staleEntry) {
      return {
        ...staleEntry.data,
        status: 'stale_cached',
        isAvailable: staleEntry.data.cityWind !== null,
        isCached: true,
        isStale: true,
        cachedAtUtc: staleEntry.cachedAtUtc,
        unavailableReason: `${failureReason} Serving stale cached forecast from ${staleEntry.cachedAtUtc}.`,
      };
    }

    return buildUnavailableResponse({
      status: failureStatus,
      selectedHour: hour,
      targetValidTimeUtc,
      unavailableReason: failureReason,
      modelName: modelLabel,
    });
  }
}
