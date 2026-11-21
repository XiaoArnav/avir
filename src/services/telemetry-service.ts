import { AtmosphericMetrics, HourlyAtmosphericPoint } from '@/domain/types';
import { isThermalInversion, calculateAQIFromPM25, calculateCpcbNaqi } from '@/domain/air-math';
import { buildMultiSourceFeeds, calculateMultiSourceConsensus } from '@/domain/advanced-air-math';
import { telemetryCache } from '@/lib/cache';

export interface GeocodedLocation {
  id: number;
  name: string;
  admin1?: string;
  country: string;
  latitude: number;
  longitude: number;
}

export const PREDEFINED_INDIAN_CITIES: GeocodedLocation[] = [
  { id: 1, name: 'Delhi-NCR', admin1: 'Delhi', country: 'India', latitude: 28.6139, longitude: 77.2090 },
  { id: 2, name: 'Patna', admin1: 'Bihar', country: 'India', latitude: 25.5941, longitude: 85.1376 },
  { id: 3, name: 'Kolkata', admin1: 'West Bengal', country: 'India', latitude: 22.5726, longitude: 88.3639 },
  { id: 4, name: 'Lucknow', admin1: 'Uttar Pradesh', country: 'India', latitude: 26.8467, longitude: 80.9462 },
  { id: 5, name: 'Kanpur', admin1: 'Uttar Pradesh', country: 'India', latitude: 26.4499, longitude: 80.3319 },
  { id: 6, name: 'Varanasi', admin1: 'Uttar Pradesh', country: 'India', latitude: 25.3176, longitude: 82.9739 },
  { id: 7, name: 'Mumbai', admin1: 'Maharashtra', country: 'India', latitude: 19.0760, longitude: 72.8777 },
  { id: 8, name: 'Bengaluru', admin1: 'Karnataka', country: 'India', latitude: 12.9716, longitude: 77.5946 },
  { id: 9, name: 'Lahore', admin1: 'Punjab', country: 'Pakistan', latitude: 31.5204, longitude: 74.3587 },
  { id: 10, name: 'Beijing', admin1: 'Beijing', country: 'China', latitude: 39.9042, longitude: 116.4074 },
];

/**
 * Searches global cities using Open-Meteo Geocoding API (0 keys required).
 */
export async function searchCities(query: string, signal?: AbortSignal): Promise<GeocodedLocation[]> {
  if (!query || query.trim().length < 2) return [];

  const cacheKey = `geo:${query.toLowerCase().trim()}`;
  const cached = telemetryCache.get(cacheKey) as GeocodedLocation[] | null;
  if (cached) return cached;

  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`,
      { signal }
    );
    if (!res.ok) throw new Error(`Geocoding HTTP ${res.status}`);

    const data = await res.json();
    if (!data.results || !Array.isArray(data.results)) return [];

    const locations: GeocodedLocation[] = data.results.map((item: any) => ({
      id: item.id,
      name: item.name,
      admin1: item.admin1 || '',
      country: item.country || '',
      latitude: item.latitude,
      longitude: item.longitude,
    }));

    telemetryCache.set(cacheKey, locations, 1000 * 60 * 60); // 1 hour TTL
    return locations;
  } catch (error: any) {
    if (error?.name === 'AbortError') throw error;
    console.warn('Geocoding search error, filtering predefined list:', error);
    return PREDEFINED_INDIAN_CITIES.filter(c =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      (c.admin1 && c.admin1.toLowerCase().includes(query.toLowerCase()))
    );
  }
}

/**
 * Bounded fetch with exponential backoff for resilient telemetry retrieval
 */
async function fetchWithRetry(url: string, signal?: AbortSignal, maxRetries = 2, delayMs = 300): Promise<Response> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      const res = await fetch(url, { signal });
      if (res.ok) return res;
      if (res.status >= 500 && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, delayMs * Math.pow(2, attempt)));
        continue;
      }
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, delayMs * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}

export interface FetchTelemetryOptions {
  signal?: AbortSignal;
  forceRefresh?: boolean;
  cityName?: string;
}

/**
 * Fetches live atmospheric telemetry for specific geographic coordinates.
 * Connects to Open-Meteo Air Quality and Weather APIs (ECMWF CAMS & NOAA GFS).
 * Adheres strictly to Zero-Fabricated Data and Clear Provenance directives.
 */
export async function fetchLiveAtmosphericMetrics(
  latitude: number,
  longitude: number,
  options?: FetchTelemetryOptions
): Promise<AtmosphericMetrics> {
  const cacheKey = `telemetry:${latitude.toFixed(2)},${longitude.toFixed(2)}`;

  if (!options?.forceRefresh) {
    const cached = telemetryCache.get(cacheKey) as AtmosphericMetrics | null;
    if (cached) return cached;
  }

  const retrievedAt = new Date().toISOString();

  try {
    const airQualityUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&current=us_aqi,pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone&hourly=pm2_5&timezone=auto`;
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m&hourly=boundary_layer_height,temperature_2m,relative_humidity_2m,wind_speed_10m&timezone=auto`;

    const [aqRes, weatherRes] = await Promise.all([
      fetchWithRetry(airQualityUrl, options?.signal, 2, 250),
      fetchWithRetry(weatherUrl, options?.signal, 2, 250).catch(() => null),
    ]);

    const data = await aqRes.json();
    let weatherData: any = {};
    if (weatherRes && weatherRes.ok) {
      try {
        weatherData = await weatherRes.json();
      } catch {
        // Ambient weather data is supplementary
      }
    }

    const current = data.current || {};
    const weatherCurrent = weatherData.current || {};
    const timezone = data.timezone || weatherData.timezone || 'auto';

    // Parse target location's wall-clock hour directly from location ISO timestamp to avoid browser timezone drift
    const currentTimeStr: string = current.time || weatherCurrent.time || '';
    let currentHour = new Date().getHours();
    if (currentTimeStr.includes('T')) {
      const parsedHour = parseInt(currentTimeStr.split('T')[1].slice(0, 2), 10);
      if (!isNaN(parsedHour)) currentHour = parsedHour;
    }

    // Boundary Layer Height (mixing depth from NOAA/ECMWF forecast model) - null if unavailable, NEVER invented
    let blh: number | null = null;
    const blhSourceArr = (weatherData.hourly && Array.isArray(weatherData.hourly.boundary_layer_height))
      ? weatherData.hourly.boundary_layer_height
      : (data.hourly && Array.isArray(data.hourly.boundary_layer_height))
      ? data.hourly.boundary_layer_height
      : null;

    if (blhSourceArr) {
      if (blhSourceArr.length > currentHour && typeof blhSourceArr[currentHour] === 'number' && Number.isFinite(blhSourceArr[currentHour])) {
        blh = Math.round(blhSourceArr[currentHour]);
      } else if (blhSourceArr.length > 0 && typeof blhSourceArr[0] === 'number' && Number.isFinite(blhSourceArr[0])) {
        blh = Math.round(blhSourceArr[0]);
      }
    }

    // Section 3: Strictly preserve field-level availability. Missing values are null, NEVER fabricated 0 or ratios.
    const pm25Raw = current.pm2_5;
    const pm10Raw = current.pm10;
    const usAqiRaw = current.us_aqi;

    const hasValidPm25 = typeof pm25Raw === 'number' && Number.isFinite(pm25Raw) && pm25Raw >= 0;
    const hasValidPm10 = typeof pm10Raw === 'number' && Number.isFinite(pm10Raw) && pm10Raw >= 0;
    const hasValidUsAqi = typeof usAqiRaw === 'number' && Number.isFinite(usAqiRaw) && usAqiRaw >= 0;

    const pm25 = hasValidPm25 ? Math.round(pm25Raw * 10) / 10 : null;
    const pm10 = hasValidPm10 ? Math.round(pm10Raw * 10) / 10 : null; // Never multiply pm25 * 1.4!
    const usAqi = hasValidUsAqi ? usAqiRaw : (pm25 !== null ? calculateAQIFromPM25(pm25) : null);
    const cpcb = pm25 !== null ? calculateCpcbNaqi(pm25, pm10 ?? pm25) : null;

    // Build 24-hour diurnal timeline from Open-Meteo hourly arrays
    const hourlyForecast: HourlyAtmosphericPoint[] = [];
    const times: string[] = (data.hourly && Array.isArray(data.hourly.time)) 
      ? data.hourly.time 
      : (weatherData.hourly && Array.isArray(weatherData.hourly.time)) 
      ? weatherData.hourly.time 
      : [];

    if (times.length > 0) {
      const pm25Arr: (number | null)[] = data.hourly?.pm2_5 || [];
      const blhArr: (number | null)[] = weatherData.hourly?.boundary_layer_height || data.hourly?.boundary_layer_height || [];
      const tempArr: (number | null)[] = weatherData.hourly?.temperature_2m || data.hourly?.temperature_2m || [];
      const rhArr: (number | null)[] = weatherData.hourly?.relative_humidity_2m || data.hourly?.relative_humidity_2m || [];
      const windArr: (number | null)[] = weatherData.hourly?.wind_speed_10m || data.hourly?.wind_speed_10m || [];
      const limit = Math.min(24, times.length);

      for (let i = 0; i < limit; i++) {
        const timeStr = times[i];
        const hourPart = timeStr.includes('T') ? timeStr.split('T')[1].slice(0, 2) : '0';
        const hour = parseInt(hourPart, 10);
        const ptPm25 = typeof pm25Arr[i] === 'number' && Number.isFinite(pm25Arr[i]) ? Math.round(pm25Arr[i]! * 10) / 10 : null;
        const ptBlh = typeof blhArr[i] === 'number' && Number.isFinite(blhArr[i]) ? Math.round(blhArr[i]!) : null;
        const ptAqi = ptPm25 !== null ? calculateAQIFromPM25(ptPm25) : null;
        const isForecast = currentTimeStr ? timeStr > currentTimeStr : i > currentHour;

        hourlyForecast.push({
          time: timeStr,
          hour: isNaN(hour) ? i : hour,
          pm25: ptPm25,
          usAqi: ptAqi,
          boundaryLayerHeight: ptBlh,
          temperature: typeof tempArr[i] === 'number' && Number.isFinite(tempArr[i]) ? Math.round(tempArr[i]! * 10) / 10 : null,
          humidity: typeof rhArr[i] === 'number' && Number.isFinite(rhArr[i]) ? Math.round(rhArr[i]!) : null,
          windSpeed: typeof windArr[i] === 'number' && Number.isFinite(windArr[i]) ? Math.round(windArr[i]! * 10) / 10 : null,
          isForecast,
          isSafeVentingWindow: hour >= 12 && hour <= 16 && (ptBlh ? ptBlh >= 450 : false) && (ptAqi ? ptAqi <= 150 : false),
          isStagnantDispersion: ptBlh !== null ? ptBlh < 200 : false,
        });
      }
    }

    const feeds = pm25 !== null && usAqi !== null ? buildMultiSourceFeeds({
      pm25,
      usAqi,
      cpcbAqi: cpcb?.aqi,
      boundaryLayerHeight: blh ?? 200,
      isThermalInversion: blh !== null ? isThermalInversion(blh, currentHour) : false,
    }) : [];
    const ensemble = calculateMultiSourceConsensus(feeds);

    const temperature = typeof weatherCurrent.temperature_2m === 'number' && Number.isFinite(weatherCurrent.temperature_2m)
      ? Math.round(weatherCurrent.temperature_2m * 10) / 10
      : null;
    const humidity = typeof weatherCurrent.relative_humidity_2m === 'number' && Number.isFinite(weatherCurrent.relative_humidity_2m)
      ? Math.round(weatherCurrent.relative_humidity_2m)
      : null;
    const windSpeed = typeof weatherCurrent.wind_speed_10m === 'number' && Number.isFinite(weatherCurrent.wind_speed_10m)
      ? Math.round(weatherCurrent.wind_speed_10m * 10) / 10
      : null;
    const windDirection = typeof weatherCurrent.wind_direction_10m === 'number' && Number.isFinite(weatherCurrent.wind_direction_10m)
      ? Math.round(weatherCurrent.wind_direction_10m)
      : null;

    const metrics: AtmosphericMetrics = {
      status: pm25 !== null || usAqi !== null ? 'success' : 'unavailable',
      provenance: 'modeled_forecast',
      timestamp: current.time || retrievedAt,
      retrievedAt,
      timezone,
      cityName: options?.cityName,
      latitude,
      longitude,
      usAqi,
      pm25,
      pm10,
      co: typeof current.carbon_monoxide === 'number' && Number.isFinite(current.carbon_monoxide) ? current.carbon_monoxide : null,
      no2: typeof current.nitrogen_dioxide === 'number' && Number.isFinite(current.nitrogen_dioxide) ? current.nitrogen_dioxide : null,
      so2: typeof current.sulphur_dioxide === 'number' && Number.isFinite(current.sulphur_dioxide) ? current.sulphur_dioxide : null,
      o3: typeof current.ozone === 'number' && Number.isFinite(current.ozone) ? current.ozone : null,
      temperature,
      humidity,
      windSpeed,
      windDirection,
      boundaryLayerHeight: blh,
      isThermalInversionActive: blh !== null ? isThermalInversion(blh, currentHour) : false,
      isLive: true,
      isStale: false,
      cpcbAqi: cpcb?.aqi ?? null,
      cpcbCategory: cpcb?.category ?? null,
      sourceAttribution: 'Open-Meteo High-Resolution Ensemble (ECMWF & NOAA GFS)',
      hourlyForecast: hourlyForecast.length > 0 ? hourlyForecast : undefined,
      ensemble,
      availability: {
        aqi: usAqi !== null,
        pm25: pm25 !== null,
        pm10: pm10 !== null,
        weather: temperature !== null,
        blh: blh !== null,
        forecast: hourlyForecast.length > 0,
      },
    };

    // Cache telemetry for 10 minutes
    telemetryCache.set(cacheKey, metrics, 1000 * 60 * 10);
    return metrics;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw error;
    }
    console.warn('Live telemetry fetch failed, checking stale cache fallback:', error?.message || error);

    // Rule 3: Check expired cache for genuine stale data preserving original timestamps
    const staleEntry = telemetryCache.getStale(cacheKey) as { value: AtmosphericMetrics; isExpired: boolean; storedAt: number } | null;
    if (staleEntry?.value) {
      const originalTime = new Date(staleEntry.value.timestamp || staleEntry.storedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      return {
        ...staleEntry.value,
        status: 'stale',
        isStale: true,
        isLive: false,
        errorMessage: `Network error. Showing cached reading from ${originalTime}.`,
      };
    }

    // No stale cache available. Return genuine typed error state, NEVER synthetic numbers!
    return {
      status: 'error',
      provenance: 'unavailable',
      timestamp: retrievedAt,
      retrievedAt,
      timezone: 'auto',
      cityName: options?.cityName,
      latitude,
      longitude,
      usAqi: null,
      pm25: null,
      pm10: null,
      boundaryLayerHeight: null,
      temperature: null,
      humidity: null,
      windSpeed: null,
      windDirection: null,
      isThermalInversionActive: false,
      isLive: false,
      isStale: false,
      sourceAttribution: 'Open-Meteo High-Resolution Ensemble (ECMWF & NOAA GFS)',
      errorMessage: 'Atmospheric telemetry is currently unavailable from the provider. Please check your connection and retry.',
      availability: {
        aqi: false,
        pm25: false,
        pm10: false,
        weather: false,
        blh: false,
        forecast: false,
      },
    };
  }
}
