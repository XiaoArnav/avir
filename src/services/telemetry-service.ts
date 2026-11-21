import { AtmosphericMetrics } from '@/domain/types';
import { isThermalInversion, calculateAQIFromPM25, calculateCpcbNaqi } from '@/domain/air-math';
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
export async function searchCities(query: string): Promise<GeocodedLocation[]> {
  if (!query || query.trim().length < 2) return [];

  const cacheKey = `geo:${query.toLowerCase().trim()}`;
  const cached = telemetryCache.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`
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
  } catch (error) {
    console.warn('Geocoding search error, filtering predefined list:', error);
    return PREDEFINED_INDIAN_CITIES.filter(c =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      (c.admin1 && c.admin1.toLowerCase().includes(query.toLowerCase()))
    );
  }
}

/**
 * Fetches live atmospheric telemetry for specific geographic coordinates.
 * Connects to Open-Meteo Air Quality and Weather APIs with zero API keys required.
 */
export async function fetchLiveAtmosphericMetrics(
  latitude: number,
  longitude: number
): Promise<AtmosphericMetrics> {
  const cacheKey = `telemetry:${latitude.toFixed(2)},${longitude.toFixed(2)}`;
  const cached = telemetryCache.get(cacheKey);
  if (cached) return cached;

  try {
    const airQualityPromise = fetch(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&current=us_aqi,pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone&hourly=pm2_5,boundary_layer_height&timezone=auto`
    );

    const weatherPromise = fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m&timezone=auto`
    );

    const [aqResult, weatherResult] = await Promise.allSettled([airQualityPromise, weatherPromise]);

    let data: any = {};
    if (aqResult.status === 'fulfilled' && aqResult.value.ok) {
      data = await aqResult.value.json();
    } else {
      throw new Error('Air Quality API unavailable');
    }

    let weatherData: any = {};
    if (weatherResult.status === 'fulfilled' && weatherResult.value.ok) {
      try {
        weatherData = await weatherResult.value.json();
      } catch {
        // Weather data optional
      }
    }

    const current = data.current || {};
    const weatherCurrent = weatherData.current || {};
    const currentHour = new Date().getHours();

    // Extract current or latest boundary layer height from hourly forecast
    let blh = 180; // default winter baseline in meters
    if (data.hourly && Array.isArray(data.hourly.boundary_layer_height) && data.hourly.boundary_layer_height.length > currentHour) {
      const hourlyBlh = data.hourly.boundary_layer_height[currentHour];
      if (typeof hourlyBlh === 'number') blh = hourlyBlh;
    }

    const pm25 = typeof current.pm2_5 === 'number' ? Math.round(current.pm2_5 * 10) / 10 : 85;
    const pm10 = typeof current.pm10 === 'number' ? Math.round(current.pm10 * 10) / 10 : 120;
    const usAqi = typeof current.us_aqi === 'number' ? current.us_aqi : calculateAQIFromPM25(pm25);
    const cpcb = calculateCpcbNaqi(pm25, pm10);

    const metrics: AtmosphericMetrics = {
      timestamp: current.time || new Date().toISOString(),
      usAqi,
      cpcbAqi: cpcb.aqi,
      cpcbCategory: cpcb.category,
      isLive: true,
      sourceAttribution: 'Open-Meteo High-Resolution Ensemble (ECMWF & NOAA GFS)',
      pm25,
      pm10,
      co: current.carbon_monoxide,
      no2: current.nitrogen_dioxide,
      so2: current.sulphur_dioxide,
      o3: current.ozone,
      temperature: typeof weatherCurrent.temperature_2m === 'number' ? Math.round(weatherCurrent.temperature_2m * 10) / 10 : undefined,
      humidity: typeof weatherCurrent.relative_humidity_2m === 'number' ? Math.round(weatherCurrent.relative_humidity_2m) : undefined,
      windSpeed: typeof weatherCurrent.wind_speed_10m === 'number' ? Math.round(weatherCurrent.wind_speed_10m * 10) / 10 : undefined,
      windDirection: typeof weatherCurrent.wind_direction_10m === 'number' ? Math.round(weatherCurrent.wind_direction_10m) : undefined,
      boundaryLayerHeight: Math.round(blh),
      isThermalInversionActive: isThermalInversion(blh, currentHour),
    };

    // Cache telemetry for 10 minutes (atmospheric conditions update hourly)
    telemetryCache.set(cacheKey, metrics, 1000 * 60 * 10);
    return metrics;
  } catch (error) {
    console.warn('Live telemetry fetch failed, synthesizing local fallback:', error);
    // Return reliable, realistic fallback metrics based on typical regional winter levels
    const fallbackHour = new Date().getHours();
    const fallbackBlh = fallbackHour >= 12 && fallbackHour <= 16 ? 550 : 130;
    const fallbackPM25 = 165.0;
    const fallbackCpcb = calculateCpcbNaqi(fallbackPM25, 210.0);

    return {
      timestamp: new Date().toISOString(),
      usAqi: calculateAQIFromPM25(fallbackPM25),
      cpcbAqi: fallbackCpcb.aqi,
      cpcbCategory: fallbackCpcb.category,
      isLive: false,
      sourceAttribution: 'Offline Regional Benchmark (Simulated Station Fallback)',
      pm25: fallbackPM25,
      pm10: 210.0,
      temperature: 19.5,
      humidity: 76,
      windSpeed: 3.2,
      boundaryLayerHeight: fallbackBlh,
      isThermalInversionActive: isThermalInversion(fallbackBlh, fallbackHour),
    };
  }
}
