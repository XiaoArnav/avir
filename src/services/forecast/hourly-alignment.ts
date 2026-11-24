/**
 * Hourly Forecast Alignment & Diurnal Analysis Service
 * Joins Open-Meteo Air Quality and Weather hourly streams strictly by normalized UTC timestamps.
 * Eliminates array-index coupling, index-hour conflation, and hardcoded safe-window fallacies.
 */

import { HourlyAtmosphericPoint } from '@/domain/types';

export type { HourlyAtmosphericPoint };
import { normalizeTimeInTimezone, resolveCityTimezone } from '@/lib/time/city-timezone';
import { calculateAQIFromPM25 } from '@/domain/air-math';

export interface NormalizedForecastHour {
  /** Canonical UTC ISO instant (e.g. '2026-11-23T10:00:00.000Z') */
  validAtUtc: string;
  /** City local IANA timezone */
  timezone: string;
  /** Local clock hour (0-23) in the target city */
  localHour: number;
  /** Local formatted string (e.g. '15:30') */
  localDisplayTime: string;
  /** Local date string (e.g. 'Mon, 23 Nov') */
  localDisplayDate: string;

  /** Particulate concentrations in µg/m³ */
  pm25: number | null;
  pm10: number | null;

  /** Derived US AQI */
  usAqi: number | null;

  /** Planetary boundary layer height (m) */
  boundaryLayerHeight: number | null;

  /** Meteorological variables */
  temperature: number | null;
  humidity: number | null;
  windSpeed: number | null;
  windDirection: number | null;

  /** Source attributions */
  airQualitySource: string | null;
  weatherSource: string | null;

  /** Completeness of joined record */
  completeness: 'complete' | 'partial' | 'unavailable';

  /** Whether the valid time is in the future relative to evaluation time */
  isForecast: boolean;

  /** Scientific limitations and notices */
  limitations: string[];
}

export interface RawHourlyStream {
  time?: string[];
  pm2_5?: (number | null)[];
  pm10?: (number | null)[];
  us_aqi?: (number | null)[];
  boundary_layer_height?: (number | null)[];
  temperature_2m?: (number | null)[];
  relative_humidity_2m?: (number | null)[];
  wind_speed_10m?: (number | null)[];
  wind_direction_10m?: (number | null)[];
}

/**
 * Aligns and joins hourly air quality and weather streams by normalized UTC timestamp.
 */
export function alignHourlyForecasts(
  airQualityHourly?: RawHourlyStream | null,
  weatherHourly?: RawHourlyStream | null,
  options: {
    cityName?: string;
    timezone?: string;
    evaluationTime?: Date;
    maxHours?: number;
  } = {}
): NormalizedForecastHour[] {
  const cityTimezone = resolveCityTimezone(options.cityName, options.timezone);
  const now = options.evaluationTime || new Date();
  const maxHours = options.maxHours || 24;

  // Build intermediate map indexed by exact normalized UTC ISO string
  const hourMap = new Map<string, {
    utcIso: string;
    normTime: ReturnType<typeof normalizeTimeInTimezone>;
    pm25: number | null;
    pm10: number | null;
    usAqi: number | null;
    blh: number | null;
    temp: number | null;
    rh: number | null;
    wind: number | null;
    windDir: number | null;
    hasAq: boolean;
    hasWeather: boolean;
  }>();

  // 1. Process Air Quality stream
  if (airQualityHourly?.time && Array.isArray(airQualityHourly.time)) {
    const times = airQualityHourly.time;
    const pm25Arr = airQualityHourly.pm2_5 || [];
    const pm10Arr = airQualityHourly.pm10 || [];
    const aqiArr = airQualityHourly.us_aqi || [];

    for (let i = 0; i < times.length; i++) {
      const rawTime = times[i];
      if (!rawTime) continue;

      try {
        const norm = normalizeTimeInTimezone(rawTime, cityTimezone);
        const key = norm.utcIso;

        const rawPm25 = pm25Arr[i];
        const validPm25 = (typeof rawPm25 === 'number' && Number.isFinite(rawPm25) && rawPm25 >= 0)
          ? Math.round(rawPm25 * 10) / 10
          : null;

        const rawPm10 = pm10Arr[i];
        const validPm10 = (typeof rawPm10 === 'number' && Number.isFinite(rawPm10) && rawPm10 >= 0)
          ? Math.round(rawPm10 * 10) / 10
          : null;

        let validAqi: number | null = null;
        const rawAqi = aqiArr[i];
        if (typeof rawAqi === 'number' && Number.isFinite(rawAqi) && rawAqi >= 0) {
          validAqi = Math.round(rawAqi);
        } else if (validPm25 !== null) {
          validAqi = calculateAQIFromPM25(validPm25);
        }

        hourMap.set(key, {
          utcIso: key,
          normTime: norm,
          pm25: validPm25,
          pm10: validPm10,
          usAqi: validAqi,
          blh: null,
          temp: null,
          rh: null,
          wind: null,
          windDir: null,
          hasAq: true,
          hasWeather: false,
        });
      } catch {
        // Skip unparseable time entry
      }
    }
  }

  // 2. Process Weather stream and join by exact UTC timestamp
  if (weatherHourly?.time && Array.isArray(weatherHourly.time)) {
    const times = weatherHourly.time;
    const blhArr = weatherHourly.boundary_layer_height || [];
    const tempArr = weatherHourly.temperature_2m || [];
    const rhArr = weatherHourly.relative_humidity_2m || [];
    const windArr = weatherHourly.wind_speed_10m || [];
    const windDirArr = weatherHourly.wind_direction_10m || [];

    for (let i = 0; i < times.length; i++) {
      const rawTime = times[i];
      if (!rawTime) continue;

      try {
        const norm = normalizeTimeInTimezone(rawTime, cityTimezone);
        const key = norm.utcIso;

        const rawBlh = blhArr[i];
        const validBlh = (typeof rawBlh === 'number' && Number.isFinite(rawBlh) && rawBlh >= 0)
          ? Math.round(rawBlh)
          : null;

        const rawTemp = tempArr[i];
        const validTemp = (typeof rawTemp === 'number' && Number.isFinite(rawTemp))
          ? Math.round(rawTemp * 10) / 10
          : null;

        const rawRh = rhArr[i];
        const validRh = (typeof rawRh === 'number' && Number.isFinite(rawRh) && rawRh >= 0)
          ? Math.round(rawRh)
          : null;

        const rawWind = windArr[i];
        const validWind = (typeof rawWind === 'number' && Number.isFinite(rawWind) && rawWind >= 0)
          ? Math.round(rawWind * 10) / 10
          : null;

        const rawWindDir = windDirArr[i];
        const validWindDir = (typeof rawWindDir === 'number' && Number.isFinite(rawWindDir))
          ? Math.round(rawWindDir)
          : null;

        const existing = hourMap.get(key);
        if (existing) {
          existing.blh = validBlh;
          existing.temp = validTemp;
          existing.rh = validRh;
          existing.wind = validWind;
          existing.windDir = validWindDir;
          existing.hasWeather = true;
        } else {
          // Weather point with no matching air quality point
          hourMap.set(key, {
            utcIso: key,
            normTime: norm,
            pm25: null,
            pm10: null,
            usAqi: null,
            blh: validBlh,
            temp: validTemp,
            rh: validRh,
            wind: validWind,
            windDir: validWindDir,
            hasAq: false,
            hasWeather: true,
          });
        }
      } catch {
        // Skip unparseable weather time entry
      }
    }
  }

  // 3. Sort chronologically by UTC instant
  const sortedKeys = Array.from(hourMap.keys()).sort();

  // Filter to starting at or near current evaluation time (or earliest available) up to maxHours
  const result: NormalizedForecastHour[] = [];
  const nowEpoch = now.getTime();

  for (const key of sortedKeys) {
    const item = hourMap.get(key)!;
    const pointEpoch = item.normTime.epochMs;

    // We keep points starting from 2 hours in the past up to maxHours
    if (pointEpoch < nowEpoch - 2 * 3600 * 1000 && sortedKeys.length > maxHours) {
      continue;
    }

    const isForecast = pointEpoch > nowEpoch;
    const completeness = (item.hasAq && item.hasWeather)
      ? 'complete'
      : (item.hasAq || item.hasWeather)
      ? 'partial'
      : 'unavailable';

    const limitations: string[] = [];
    if (!item.hasAq) limitations.push('Air quality telemetry missing for this hour.');
    if (!item.hasWeather) limitations.push('Meteorological / boundary layer data missing for this hour.');
    if (item.pm25 === null && item.hasAq) limitations.push('PM2.5 concentration unavailable.');

    result.push({
      validAtUtc: item.utcIso,
      timezone: cityTimezone,
      localHour: item.normTime.hour,
      localDisplayTime: item.normTime.display24h,
      localDisplayDate: item.normTime.displayDate,
      pm25: item.pm25,
      pm10: item.pm10,
      usAqi: item.usAqi,
      boundaryLayerHeight: item.blh,
      temperature: item.temp,
      humidity: item.rh,
      windSpeed: item.wind,
      windDirection: item.windDir,
      airQualitySource: item.hasAq ? 'ECMWF CAMS Atmospheric Chemistry' : null,
      weatherSource: item.hasWeather ? 'NOAA GFS / Open-Meteo Weather Model' : null,
      completeness,
      isForecast,
      limitations,
    });

    if (result.length >= maxHours) break;
  }

  return result;
}

/**
 * Accurately finds the Boundary Layer Height matching an exact target instant.
 * Returns null if no record within 60 minutes exists (NEVER uses array index fallback!).
 */
export function lookupBoundaryLayerHeight(
  targetInstant: Date | string | number,
  weatherHourly?: RawHourlyStream | null,
  timezone: string = 'UTC',
  maxDeltaMinutes: number = 60
): { blh: number | null; matchedValidAt: string | null; deltaMinutes: number | null } {
  if (!weatherHourly?.boundary_layer_height || !Array.isArray(weatherHourly.boundary_layer_height)) {
    return { blh: null, matchedValidAt: null, deltaMinutes: null };
  }

  const blhArr = weatherHourly.boundary_layer_height;

  // If time array is absent, we strictly NEVER guess or fallback to index [0]
  if (!weatherHourly.time || !Array.isArray(weatherHourly.time) || weatherHourly.time.length === 0) {
    return { blh: null, matchedValidAt: null, deltaMinutes: null };
  }

  let targetEpoch: number;
  try {
    const targetNorm = normalizeTimeInTimezone(targetInstant, timezone);
    targetEpoch = targetNorm.epochMs;
  } catch {
    return { blh: null, matchedValidAt: null, deltaMinutes: null };
  }

  let closestBlh: number | null = null;
  let closestValidAt: string | null = null;
  let minDiffMs = Infinity;

  const times = weatherHourly.time;

  for (let i = 0; i < times.length; i++) {
    const rawTime = times[i];
    if (!rawTime) continue;

    try {
      const norm = normalizeTimeInTimezone(rawTime, timezone);
      const diffMs = Math.abs(norm.epochMs - targetEpoch);

      if (diffMs < minDiffMs) {
        minDiffMs = diffMs;
        const val = blhArr[i];
        closestBlh = (typeof val === 'number' && Number.isFinite(val) && val >= 0) ? Math.round(val) : null;
        closestValidAt = norm.utcIso;
      }
    } catch {
      // Continue
    }
  }

  const deltaMinutes = minDiffMs !== Infinity ? Math.round(minDiffMs / (60 * 1000)) : null;

  if (deltaMinutes !== null && deltaMinutes <= maxDeltaMinutes && closestBlh !== null) {
    return { blh: closestBlh, matchedValidAt: closestValidAt, deltaMinutes };
  }

  return { blh: null, matchedValidAt: null, deltaMinutes };
}

/**
 * Converts NormalizedForecastHour items to backward-compatible HourlyAtmosphericPoint.
 */
export function toHourlyAtmosphericPoints(
  normalizedHours: NormalizedForecastHour[]
): HourlyAtmosphericPoint[] {
  return normalizedHours.map((h) => ({
    time: h.validAtUtc,
    hour: h.localHour,
    pm25: h.pm25,
    pm10: h.pm10,
    usAqi: h.usAqi,
    boundaryLayerHeight: h.boundaryLayerHeight,
    temperature: h.temperature,
    relativeHumidity: h.humidity,
    windSpeed: h.windSpeed,
    isForecast: h.isForecast,
    // Note: isSafeVentingWindow is dynamically derived relative to forecast distribution, not hardcoded
    isSafeVentingWindow: false,
    sourceAttribution: h.airQualitySource || h.weatherSource || 'Atmospheric Numerical Model',
    validAtUtc: h.validAtUtc,
    timezone: h.timezone,
    localDisplayTime: h.localDisplayTime,
    localDisplayDate: h.localDisplayDate,
    completeness: h.completeness,
  }));
}

/**
 * Performs scientifically defensible relative diurnal air quality analysis.
 * Replaces hardcoded 12-4 PM midday assumptions with actual forecast-derived ranking.
 */
export function analyzeDiurnalRelativeWindows(
  hours: NormalizedForecastHour[] | HourlyAtmosphericPoint[]
): {
  lowestSmogWindow: {
    startDisplayTime: string;
    endDisplayTime: string;
    avgPm25: number | null;
    avgAqi: number | null;
    avgBlh: number | null;
    description: string;
    recommendation: string;
  };
  highestSmogWindow: {
    startDisplayTime: string;
    endDisplayTime: string;
    avgPm25: number | null;
    avgAqi: number | null;
    avgBlh: number | null;
    description: string;
    warning: string;
  };
  hasValidData: boolean;
} {
  type PointType = NormalizedForecastHour | HourlyAtmosphericPoint;
  const windowSize = 3;
  const validSlices: PointType[][] = [];

  // Filter out any points without valid PM2.5, preserving chronological order
  const validPoints: PointType[] = hours
    .filter((h) => typeof h.pm25 === 'number' && Number.isFinite(h.pm25) && h.pm25 >= 0)
    .sort((a, b) => {
      const tA = a.validAtUtc ? new Date(a.validAtUtc).getTime() : 0;
      const tB = b.validAtUtc ? new Date(b.validAtUtc).getTime() : 0;
      return tA - tB;
    });

  // Find all strictly consecutive 3-hour slices (temporal adjacency, NOT array adjacency)
  for (let i = 0; i <= validPoints.length - windowSize; i++) {
    const candidate = validPoints.slice(i, i + windowSize);
    let isStrictlyConsecutive = true;

    for (let k = 0; k < candidate.length - 1; k++) {
      const p1 = candidate[k];
      const p2 = candidate[k + 1];

      let deltaMs: number | null = null;
      if (p1.validAtUtc && p2.validAtUtc) {
        const t1 = new Date(p1.validAtUtc).getTime();
        const t2 = new Date(p2.validAtUtc).getTime();
        deltaMs = t2 - t1;
      } else {
        const h1 = (p1 as any).localHour ?? (p1 as any).hour;
        const h2 = (p2 as any).localHour ?? (p2 as any).hour;
        if (typeof h1 === 'number' && typeof h2 === 'number') {
          const hourDiff = (h2 - h1 + 24) % 24;
          if (hourDiff === 1) deltaMs = 3600000;
        }
      }

      // Must be adjacent hours (3600000 ms +/- 60000 ms tolerance)
      if (deltaMs === null || Math.abs(deltaMs - 3600000) > 60000) {
        isStrictlyConsecutive = false;
        break;
      }
    }

    if (isStrictlyConsecutive) {
      validSlices.push(candidate);
    }
  }

  if (validSlices.length === 0) {
    return {
      lowestSmogWindow: {
        startDisplayTime: '--:--',
        endDisplayTime: '--:--',
        avgPm25: null,
        avgAqi: null,
        avgBlh: null,
        description: 'Forecast data unavailable',
        recommendation: 'Sufficient contiguous hourly forecast data unavailable (requires at least 3 consecutive hourly intervals).',
      },
      highestSmogWindow: {
        startDisplayTime: '--:--',
        endDisplayTime: '--:--',
        avgPm25: null,
        avgAqi: null,
        avgBlh: null,
        description: 'Forecast data unavailable',
        warning: 'Hourly atmospheric dispersion modeling is currently unavailable.',
      },
      hasValidData: false,
    };
  }

  // Find best and worst consecutive slices
  let bestSlice = validSlices[0];
  let lowestAvgPm25 = Infinity;

  let worstSlice = validSlices[0];
  let highestAvgPm25 = -Infinity;

  for (const slice of validSlices) {
    const sumPm25 = slice.reduce((s, pt) => s + (pt.pm25 || 0), 0);
    const avg = sumPm25 / slice.length;

    if (avg < lowestAvgPm25) {
      lowestAvgPm25 = avg;
      bestSlice = slice;
    }
    if (avg > highestAvgPm25) {
      highestAvgPm25 = avg;
      worstSlice = slice;
    }
  }

  const getSliceAverages = (slice: typeof validPoints) => {
    const avgPm25 = Math.round((slice.reduce((s, p) => s + (p.pm25 || 0), 0) / slice.length) * 10) / 10;
    const aqiVals = slice.map((p) => p.usAqi).filter((v): v is number => typeof v === 'number');
    const avgAqi = aqiVals.length ? Math.round(aqiVals.reduce((s, v) => s + v, 0) / aqiVals.length) : null;
    const blhVals = slice.map((p) => p.boundaryLayerHeight).filter((v): v is number => typeof v === 'number');
    const avgBlh = blhVals.length ? Math.round(blhVals.reduce((s, v) => s + v, 0) / blhVals.length) : null;
    return { avgPm25, avgAqi, avgBlh };
  };

  const bestStats = getSliceAverages(bestSlice);
  const worstStats = getSliceAverages(worstSlice);

  const formatWindowTimes = (slice: typeof validPoints) => {
    const first = slice[0];
    const last = slice[slice.length - 1];
    const firstHour = (first as any).localHour ?? (first as any).hour ?? 0;
    const lastHour = (last as any).localHour ?? (last as any).hour ?? 0;
    const startStr = (first as any).localDisplayTime || `${String(firstHour).padStart(2, '0')}:00`;
    const endStr = (last as any).localDisplayTime || `${String(lastHour).padStart(2, '0')}:00`;
    return { startStr, endStr };
  };

  const bestTimes = formatWindowTimes(bestSlice);
  const worstTimes = formatWindowTimes(worstSlice);

  return {
    lowestSmogWindow: {
      startDisplayTime: bestTimes.startStr,
      endDisplayTime: bestTimes.endStr,
      avgPm25: bestStats.avgPm25,
      avgAqi: bestStats.avgAqi,
      avgBlh: bestStats.avgBlh,
      description: `Relatively lower modeled PM2.5 period (~${bestStats.avgPm25} µg/m³)`,
      recommendation: `Model predicts relative diurnal dispersion drop. Notice: Outdoor air quality may still exceed health standards; not guaranteed safe air.`,
    },
    highestSmogWindow: {
      startDisplayTime: worstTimes.startStr,
      endDisplayTime: worstTimes.endStr,
      avgPm25: worstStats.avgPm25,
      avgAqi: worstStats.avgAqi,
      avgBlh: worstStats.avgBlh,
      description: `Peak modeled smog concentration (~${worstStats.avgPm25} µg/m³)`,
      warning: `Atmospheric stagnation and boundary layer contraction trap particulate mass near the ground. Avoid high-cardio outdoor exertion.`,
    },
    hasValidData: true,
  };
}
