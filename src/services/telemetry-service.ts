import {
  AtmosphericMetrics,
  HourlyAtmosphericPoint,
  DataProvenance,
  TelemetryFieldMetadata,
  AtmosphericFieldMeasurements,
  TelemetryLocationMetadata,
  TelemetryCacheMetadata,
  TelemetryStatus,
  EnvironmentalSourceRecord,
  SourceComparison,
  AqiEvidence,
} from '@/domain/types';
import { isThermalInversion, calculateAQIFromPM25, calculateCpcbNaqi } from '@/domain/air-math';
import { calculateComprehensiveCpcbNaqi } from '@/domain/cpcb-naqi';
import { buildMultiSourceFeeds, calculateMultiSourceConsensus } from '@/domain/advanced-air-math';
import { getNearestGroundStation, discoverGroundStationSources } from './ground-station-service';
import { createOpenMeteoModelRecord, compareEnvironmentalSources, deduplicateEnvironmentalSources } from '@/domain/source-comparison';
import { OPENAQ_DEFAULT_RADIUS_KM } from '@/config/environmental-sources';
import { telemetryCache } from '@/lib/cache';
import { lookupBoundaryLayerHeight, alignHourlyForecasts, toHourlyAtmosphericPoints } from '@/services/forecast/hourly-alignment';
import { resolveCityTimezone } from '@/lib/time/city-timezone';

export interface GeocodedLocation {
  id: number;
  name: string;
  admin1?: string;
  country: string;
  countryCode?: string;
  latitude: number;
  longitude: number;
}

export const PREDEFINED_INDIAN_CITIES: GeocodedLocation[] = [
  { id: 1, name: 'Delhi-NCR', admin1: 'Delhi', country: 'India', countryCode: 'IN', latitude: 28.6139, longitude: 77.2090 },
  { id: 2, name: 'Patna', admin1: 'Bihar', country: 'India', countryCode: 'IN', latitude: 25.5941, longitude: 85.1376 },
  { id: 3, name: 'Kolkata', admin1: 'West Bengal', country: 'India', countryCode: 'IN', latitude: 22.5726, longitude: 88.3639 },
  { id: 4, name: 'Lucknow', admin1: 'Uttar Pradesh', country: 'India', countryCode: 'IN', latitude: 26.8467, longitude: 80.9462 },
  { id: 5, name: 'Kanpur', admin1: 'Uttar Pradesh', country: 'India', countryCode: 'IN', latitude: 26.4499, longitude: 80.3319 },
  { id: 6, name: 'Varanasi', admin1: 'Uttar Pradesh', country: 'India', countryCode: 'IN', latitude: 25.3176, longitude: 82.9739 },
  { id: 7, name: 'Mumbai', admin1: 'Maharashtra', country: 'India', countryCode: 'IN', latitude: 19.0760, longitude: 72.8777 },
  { id: 8, name: 'Bengaluru', admin1: 'Karnataka', country: 'India', countryCode: 'IN', latitude: 12.9716, longitude: 77.5946 },
  { id: 9, name: 'Lahore', admin1: 'Punjab', country: 'Pakistan', countryCode: 'PK', latitude: 31.5204, longitude: 74.3587 },
  { id: 10, name: 'Beijing', admin1: 'Beijing', country: 'China', countryCode: 'CN', latitude: 39.9042, longitude: 116.4074 },
];

/**
 * Searches global cities using Open-Meteo Geocoding API (0 keys required).
 */
export async function searchCities(query: string, signal?: AbortSignal): Promise<GeocodedLocation[]> {
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted', 'AbortError');
  }
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
      countryCode: item.country_code ? String(item.country_code).toUpperCase() : undefined,
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
 * Coordinate validator enforcing geographic bounds:
 * Latitude must be within [-90, 90] and Longitude within [-180, 180].
 */
export function isValidCoordinate(latitude: number, longitude: number): boolean {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/**
 * Validates a pollutant reading from external providers.
 * Enforces zero-fabrication: null is retained as unavailable, negative numbers or non-finite
 * numbers are rejected, and 0 is preserved as a valid physical concentration.
 */
export function validatePollutantValue(
  val: unknown,
  fieldName: string,
  unit: string,
  options?: {
    min?: number;
    max?: number;
    provider?: string;
    classification?: DataProvenance;
  }
): TelemetryFieldMetadata<number> {
  const min = options?.min ?? 0;
  const max = options?.max ?? 2000;
  const provider = options?.provider ?? 'Open-Meteo Air Quality (ECMWF CAMS)';
  const classification = options?.classification ?? 'modeled_forecast';

  if (val === null || val === undefined) {
    return {
      value: null,
      unit,
      provider,
      classification: 'unavailable',
      status: 'unavailable',
    };
  }

  if (typeof val !== 'number' || !Number.isFinite(val)) {
    return {
      value: null,
      unit,
      provider,
      classification: 'unavailable',
      status: 'rejected',
      rejectionReason: `Non-finite or non-numeric value for ${fieldName}: ${String(val)}`,
    };
  }

  if (val < min) {
    return {
      value: null,
      unit,
      provider,
      classification: 'unavailable',
      status: 'rejected',
      rejectionReason: `Physically impossible negative concentration for ${fieldName}: ${val}`,
    };
  }

  if (val > max) {
    return {
      value: null,
      unit,
      provider,
      classification: 'unavailable',
      status: 'rejected',
      rejectionReason: `Value exceeds physical atmospheric upper bound (${max} ${unit}) for ${fieldName}: ${val}`,
    };
  }

  return {
    value: Math.round(val * 10) / 10,
    unit,
    provider,
    classification,
    status: 'valid',
  };
}

/**
 * Validates meteorological readings (temperature, humidity, wind, boundary layer height).
 */
export function validateWeatherValue(
  val: unknown,
  fieldName: string,
  unit: string,
  min: number,
  max: number,
  provider = 'Open-Meteo Weather (NOAA GFS)'
): TelemetryFieldMetadata<number> {
  if (val === null || val === undefined) {
    return {
      value: null,
      unit,
      provider,
      classification: 'unavailable',
      status: 'unavailable',
    };
  }

  if (typeof val !== 'number' || !Number.isFinite(val)) {
    return {
      value: null,
      unit,
      provider,
      classification: 'unavailable',
      status: 'rejected',
      rejectionReason: `Non-finite weather value for ${fieldName}: ${String(val)}`,
    };
  }

  if (val < min || val > max) {
    return {
      value: null,
      unit,
      provider,
      classification: 'unavailable',
      status: 'rejected',
      rejectionReason: `Weather value out of physical bounds [${min}, ${max}] for ${fieldName}: ${val}`,
    };
  }

  return {
    value: Math.round(val * 10) / 10,
    unit,
    provider,
    classification: 'modeled_forecast',
    status: 'valid',
  };
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

      if (res.status === 429) {
        const error = new Error('HTTP 429: Rate limit exceeded');
        (error as any).status = 429;
        throw error;
      }

      if (res.status >= 500 && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, delayMs * Math.pow(2, attempt)));
        continue;
      }
      const error = new Error(`HTTP ${res.status}: ${res.statusText}`);
      (error as any).status = res.status;
      throw error;
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
      if (err?.status === 429) throw err;
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
  // Runtime validation of coordinates
  if (!isValidCoordinate(latitude, longitude)) {
    const retrievedAt = new Date().toISOString();
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
      freshness: 'unavailable',
      errorType: 'validation',
      sourceAttribution: 'Open-Meteo Air Quality (ECMWF CAMS) & Weather (NOAA GFS)',
      errorMessage: `Invalid coordinates provided (latitude: ${latitude}, longitude: ${longitude}). Latitude must be between -90 and 90, and longitude between -180 and 180.`,
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

  const cacheKey = `telemetry:${latitude.toFixed(2)},${longitude.toFixed(2)}`;

  if (!options?.forceRefresh) {
    const cached = telemetryCache.get(cacheKey) as AtmosphericMetrics | null;
    if (cached) {
      return {
        ...cached,
        freshness: 'fresh',
        cacheMetadata: {
          isCached: true,
          isStale: false,
          originalTimestamp: cached.timestamp,
          cachedAt: cached.retrievedAt,
          ttlMs: 1000 * 60 * 10,
        },
      };
    }
  }

  const retrievedAt = new Date().toISOString();

  try {
    const airQualityUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&current=us_aqi,pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone&hourly=pm2_5&timezone=auto`;
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m&hourly=boundary_layer_height,temperature_2m,relative_humidity_2m,wind_speed_10m&timezone=auto`;

    const [aqRes, weatherRes] = await Promise.all([
      fetchWithRetry(airQualityUrl, options?.signal, 2, 250),
      fetchWithRetry(weatherUrl, options?.signal, 2, 250).catch(() => null),
    ]);

    let data: any;
    try {
      data = await aqRes.json();
    } catch {
      const err = new Error('Malformed JSON received from Open-Meteo Air Quality API');
      err.name = 'ValidationError';
      throw err;
    }

    if (!data || typeof data !== 'object' || data.error) {
      const reason = data?.reason || 'Invalid response structure from Open-Meteo Air Quality API';
      const err = new Error(reason);
      err.name = 'ValidationError';
      throw err;
    }

    let weatherData: any = {};
    if (weatherRes && weatherRes.ok) {
      try {
        const wJson = await weatherRes.json();
        if (wJson && typeof wJson === 'object' && !wJson.error) {
          weatherData = wJson;
        }
      } catch {
        // Ambient weather data is supplementary
      }
    }

    const current = (data.current && typeof data.current === 'object') ? data.current : {};
    const weatherCurrent = (weatherData.current && typeof weatherData.current === 'object') ? weatherData.current : {};
    const rawTz = typeof data.timezone === 'string' && data.timezone
      ? data.timezone
      : (typeof weatherData.timezone === 'string' && weatherData.timezone ? weatherData.timezone : null);
    const timezone = resolveCityTimezone(options?.cityName, rawTz);

    // Parse target location's wall-clock hour directly from location ISO timestamp to avoid browser timezone drift
    const currentTimeStr: string = current.time || weatherCurrent.time || '';
    let currentHour = new Date().getHours();
    if (currentTimeStr.includes('T')) {
      const parsedHour = parseInt(currentTimeStr.split('T')[1].slice(0, 2), 10);
      if (!isNaN(parsedHour)) currentHour = parsedHour;
    }

    // Boundary Layer Height: match the record corresponding to the current target instant
    // Null if unavailable or outside 60-minute window, NEVER arbitrarily defaulted to array index [0]
    const blhLookup = lookupBoundaryLayerHeight(
      currentTimeStr || new Date(),
      weatherData.hourly || data.hourly,
      timezone
    );
    const blhRaw: unknown = blhLookup.blh;

    const blhField = validateWeatherValue(
      blhRaw,
      'boundaryLayerHeight',
      'm',
      0,
      10000,
      'Open-Meteo Weather (NOAA GFS)'
    );
    const blh = blhField.value !== null ? Math.round(blhField.value) : null;

    // Field-level validations: 0 is clean air (valid), null is unavailable, negative/non-finite is rejected
    const pm25Field = validatePollutantValue(current.pm2_5, 'pm25', 'µg/m³', {
      min: 0,
      max: 2000,
      provider: 'Open-Meteo Air Quality (ECMWF CAMS)',
      classification: 'modeled_forecast',
    });
    const pm25 = pm25Field.value;

    const pm10Field = validatePollutantValue(current.pm10, 'pm10', 'µg/m³', {
      min: 0,
      max: 3000,
      provider: 'Open-Meteo Air Quality (ECMWF CAMS)',
      classification: 'modeled_forecast',
    });
    const pm10 = pm10Field.value;

    // US AQI: if provided, validate directly; otherwise derive cleanly from valid PM2.5 using EPA breakpoints
    let usAqiField: TelemetryFieldMetadata<number>;
    let aqiEvidence: AqiEvidence;
    if (current.us_aqi !== undefined && current.us_aqi !== null) {
      usAqiField = validatePollutantValue(current.us_aqi, 'usAqi', 'AQI', {
        min: 0,
        max: 1000,
        provider: 'Open-Meteo Air Quality (ECMWF CAMS)',
        classification: 'modeled_forecast',
      });
      aqiEvidence = {
        indexValue: usAqiField.value,
        standard: 'US_EPA',
        method: 'provider_reported',
        classification: 'modeled_forecast',
        sourceProvider: 'Open-Meteo Air Quality (ECMWF CAMS)',
        pollutantCount: 6,
        averagingVerified: false,
        isOfficialPublished: false,
        missingRequirements: [],
        standardVersion: 'EPA 2024 PM NAAQS (40 CFR Part 58 App G, May 2024)',
        notes: 'Provider-reported modeled US AQI from multi-pollutant chemistry model.',
      };
    } else if (pm25 !== null) {
      const derivedAqi = calculateAQIFromPM25(pm25);
      usAqiField = {
        value: derivedAqi,
        unit: 'AQI',
        provider: 'Avir Derived (EPA Breakpoints)',
        classification: 'derived_calculation',
        status: derivedAqi !== null ? 'valid' : 'unavailable',
      };
      aqiEvidence = {
        indexValue: derivedAqi,
        standard: 'US_EPA',
        method: 'epa_pm25_24h_subindex',
        classification: 'derived_calculation',
        sourceProvider: 'Avir Derived (EPA Breakpoints)',
        pollutantCount: 1,
        averagingVerified: false,
        isOfficialPublished: false,
        missingRequirements: ['Multi-pollutant inputs unavailable; derived from single-species PM2.5.'],
        standardVersion: 'EPA 2024 PM NAAQS (40 CFR Part 58 App G, May 2024)',
        notes: 'Derived from PM2.5 concentration using EPA 2024 revised piecewise breakpoints.',
      };
    } else {
      usAqiField = {
        value: null,
        unit: 'AQI',
        provider: 'Open-Meteo Air Quality (ECMWF CAMS)',
        classification: 'unavailable',
        status: 'unavailable',
      };
      aqiEvidence = {
        indexValue: null,
        standard: 'US_EPA',
        method: 'unavailable',
        classification: 'unavailable',
        sourceProvider: 'Open-Meteo Air Quality (ECMWF CAMS)',
        pollutantCount: 0,
        averagingVerified: false,
        isOfficialPublished: false,
        missingRequirements: ['Neither provider AQI nor PM2.5 concentration is available.'],
        standardVersion: 'EPA 2024 PM NAAQS (40 CFR Part 58 App G, May 2024)',
        notes: 'AQI unavailable due to missing atmospheric telemetry.',
      };
    }
    const usAqi = usAqiField.value;

    // Calculate CPCB NAQI honestly: pass pm10 directly without artificial fallback to pm25
    const cpcb = pm25 !== null ? calculateCpcbNaqi(pm25, pm10) : null;

    // Supplementary chemical pollutants
    const coField = validatePollutantValue(current.carbon_monoxide, 'co', 'µg/m³', { min: 0, max: 100000 });
    const no2Field = validatePollutantValue(current.nitrogen_dioxide, 'no2', 'µg/m³', { min: 0, max: 2000 });
    const so2Field = validatePollutantValue(current.sulphur_dioxide, 'so2', 'µg/m³', { min: 0, max: 2000 });
    const o3Field = validatePollutantValue(current.ozone, 'o3', 'µg/m³', { min: 0, max: 2000 });

    // Weather metrics
    const tempField = validateWeatherValue(weatherCurrent.temperature_2m, 'temperature', '°C', -90, 60);
    const humidityField = validateWeatherValue(weatherCurrent.relative_humidity_2m, 'humidity', '%', 0, 100);
    const windSpeedField = validateWeatherValue(weatherCurrent.wind_speed_10m, 'windSpeed', 'km/h', 0, 400);
    const windDirectionField = validateWeatherValue(weatherCurrent.wind_direction_10m, 'windDirection', '°', 0, 360);

    const temperature = tempField.value;
    const humidity = humidityField.value !== null ? Math.round(humidityField.value) : null;
    const windSpeed = windSpeedField.value;
    const windDirection = windDirectionField.value !== null ? Math.round(windDirectionField.value) : null;

    const fields: AtmosphericFieldMeasurements = {
      pm25: pm25Field,
      pm10: pm10Field,
      usAqi: usAqiField,
      boundaryLayerHeight: blhField,
      co: coField,
      no2: no2Field,
      so2: so2Field,
      o3: o3Field,
      temperature: tempField,
      humidity: humidityField,
      windSpeed: windSpeedField,
      windDirection: windDirectionField,
    };

    // Determine honest telemetry status
    const hasCoreAq = pm25Field.status === 'valid' || usAqiField.status === 'valid';
    const isComplete = hasCoreAq && pm10Field.status === 'valid' && blhField.status === 'valid' && tempField.status === 'valid';
    let status: TelemetryStatus = 'unavailable';
    if (isComplete) {
      status = 'success';
    } else if (hasCoreAq) {
      status = 'partial';
    }

    // Build 24-hour diurnal timeline from timestamp-aligned Open-Meteo hourly streams
    const alignedHours = alignHourlyForecasts(data.hourly, weatherData.hourly, {
      cityName: options?.cityName,
      timezone,
      evaluationTime: new Date(),
      maxHours: 24,
    });
    const hourlyForecast: HourlyAtmosphericPoint[] = toHourlyAtmosphericPoints(alignedHours);

    // Query physical ground monitoring station (CPCB / Sensor.Community)
    let groundStation = null;
    let groundModelDelta = null;
    let groundSources: EnvironmentalSourceRecord[] = [];
    try {
      const groundMatch = await getNearestGroundStation(
        latitude,
        longitude,
        humidityField.value, // Genuine measured relative humidity; never invent 50%
        { signal: options?.signal, modelPm25: pm25 }
      );
      groundStation = groundMatch.station;
      groundModelDelta = groundMatch.delta;
      groundSources = await discoverGroundStationSources(
        latitude,
        longitude,
        humidityField.value,
        { signal: options?.signal }
      );
    } catch {
      // Ground monitor query is non-blocking
    }

    // Query OpenAQ provider asynchronously (Server dynamic import or Client API route)
    let openAqSources: EnvironmentalSourceRecord[] = [];
    try {
      if (typeof window === 'undefined') {
        const { fetchOpenAqSources } = await import('./providers/openaq-provider');
        openAqSources = await fetchOpenAqSources({
          latitude,
          longitude,
          radiusKm: OPENAQ_DEFAULT_RADIUS_KM,
          signal: options?.signal,
        });
      } else {
        const res = await fetch(
          `/api/telemetry/sources?lat=${latitude}&lon=${longitude}&radius=${OPENAQ_DEFAULT_RADIUS_KM}`,
          {
            signal: options?.signal,
          }
        );
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json?.sources)) {
            openAqSources = json.sources;
          }
        }
      }
    } catch {
      // OpenAQ query is non-blocking and isolated
    }

    // Query official CPCB/CAAQMS provider asynchronously (Server dynamic import or Client API route)
    let cpcbSources: EnvironmentalSourceRecord[] = [];
    try {
      if (typeof window === 'undefined') {
        const { fetchCpcbProviderResult } = await import('./providers/cpcb-provider');
        const cpcbResult = await fetchCpcbProviderResult({
          latitude,
          longitude,
          radiusKm: 35,
          city: options?.cityName,
          signal: options?.signal,
        });
        if (cpcbResult && Array.isArray(cpcbResult.sources)) {
          cpcbSources = cpcbResult.sources;
        }
      } else {
        const cityQuery = options?.cityName ? `&city=${encodeURIComponent(options.cityName)}` : '';
        const res = await fetch(
          `/api/telemetry/cpcb?lat=${latitude}&lon=${longitude}&radius=35${cityQuery}`,
          { signal: options?.signal }
        );
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json?.sources)) {
            cpcbSources = json.sources;
          }
        }
      }
    } catch {
      // CPCB query is non-blocking and isolated
    }

    // Comprehensive CPCB NAQI calculation with explicit units & data sufficiency rules
    const cpcbResult = calculateComprehensiveCpcbNaqi({
      pm25,
      pm10,
      no2: no2Field.value,
      so2: so2Field.value,
      co: coField.value,
      coUnit: 'ug/m3',
      o3: o3Field.value,
      is24HourAveraged: false, // Model snapshot, not statutory 24-hr regulatory average
    });

    const feeds = pm25 !== null && usAqi !== null ? buildMultiSourceFeeds({
      pm25,
      usAqi,
      cpcbAqi: cpcbResult.aqi ?? cpcb?.aqi,
      boundaryLayerHeight: blh,
      isThermalInversion: isThermalInversion(blh, currentHour),
      groundStation,
    }) : [];
    const ensemble = calculateMultiSourceConsensus(feeds);

    // Assemble canonical multi-source records & evaluate comparison
    const modelRecord = createOpenMeteoModelRecord({
      pm25,
      pm10,
      timestamp: current.time || retrievedAt,
      latitude,
      longitude,
      cityName: options?.cityName,
      retrievedAt,
    });

    const allEnvironmentalSources = deduplicateEnvironmentalSources([
      modelRecord,
      ...cpcbSources,
      ...groundSources,
      ...openAqSources,
    ]);

    const sourceComparison = compareEnvironmentalSources(allEnvironmentalSources, 'pm25');

    const location: TelemetryLocationMetadata = {
      latitude,
      longitude,
      cityName: options?.cityName,
      timezone,
    };

    const cacheMetadata: TelemetryCacheMetadata = {
      isCached: false,
      isStale: false,
      originalTimestamp: current.time || retrievedAt,
      cachedAt: retrievedAt,
      ttlMs: 1000 * 60 * 10,
    };

    const metrics: AtmosphericMetrics = {
      status,
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
      co: coField.value,
      no2: no2Field.value,
      so2: so2Field.value,
      o3: o3Field.value,
      temperature,
      humidity,
      windSpeed,
      windDirection,
      boundaryLayerHeight: blh,
      isThermalInversionActive: blh !== null ? isThermalInversion(blh, currentHour) : false,
      isLive: true,
      isStale: false,
      freshness: 'fresh',
      fields,
      location,
      cacheMetadata,
      groundStation,
      groundModelDelta,
      cpcbAqi: cpcbResult.aqi ?? (cpcb?.aqi ?? null),
      cpcbCategory: cpcbResult.category ?? (cpcb?.category === 'Unavailable' ? null : cpcb?.category ?? null),
      cpcbStatus: cpcbResult.classification,
      aqiEvidence,
      cpcbEvidence: cpcbResult.evidence,
      sourceAttribution: 'Open-Meteo Air Quality (ECMWF CAMS) & Weather (NOAA GFS)',
      hourlyForecast: hourlyForecast.length > 0 ? hourlyForecast : undefined,
      ensemble,
      environmentalSources: allEnvironmentalSources,
      sourceComparison,
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

    let errorType: 'network' | 'timeout' | 'rate_limit' | 'validation' | 'unknown' = 'unknown';
    let errorMessage = 'Atmospheric telemetry is currently unavailable from the provider. Please check your connection and retry.';

    if (error?.status === 429 || error?.message?.includes('429') || error?.message?.toLowerCase().includes('rate limit')) {
      errorType = 'rate_limit';
      errorMessage = 'Provider rate limit encountered. Telemetry is temporarily unavailable.';
    } else if (error?.name === 'TimeoutError' || error?.message?.toLowerCase().includes('timeout') || error?.message?.includes('504')) {
      errorType = 'timeout';
      errorMessage = 'Atmospheric telemetry provider timed out. Telemetry is temporarily unavailable.';
    } else if (error?.name === 'TypeError' || error?.message?.toLowerCase().includes('fetch') || error?.message?.toLowerCase().includes('network')) {
      errorType = 'network';
      errorMessage = 'Network connection failure while contacting atmospheric telemetry providers. Telemetry is temporarily unavailable.';
    } else if (error?.name === 'SyntaxError' || error?.name === 'ValidationError' || error?.message?.toLowerCase().includes('json')) {
      errorType = 'validation';
      errorMessage = 'Malformed or invalid telemetry response received from provider. Telemetry is temporarily unavailable.';
    }

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
        freshness: 'stale',
        errorType,
        cacheMetadata: {
          isCached: true,
          isStale: true,
          originalTimestamp: staleEntry.value.timestamp,
          cachedAt: new Date(staleEntry.storedAt).toISOString(),
          ttlMs: 1000 * 60 * 10,
        },
        errorMessage: `Network error. ${errorMessage} Showing cached reading from ${originalTime}.`,
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
      freshness: 'unavailable',
      errorType,
      sourceAttribution: 'Open-Meteo Air Quality (ECMWF CAMS) & Weather (NOAA GFS)',
      errorMessage,
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
