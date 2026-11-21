import { AQICategory } from '@/domain/types';
import { getAQICategory } from '@/domain/air-math';
import { telemetryCache } from '@/lib/cache';
import { GeocodedLocation, searchCities } from './telemetry-service';

export type WorldRegion = 'All' | 'Asia' | 'Europe' | 'Americas' | 'Middle East & Africa' | 'Oceania';
export type SeverityFilter = 'All' | 'hazardous' | 'unhealthy' | 'moderate' | 'clean';
export type SortOrder = 'most_polluted' | 'cleanest';

export interface WorldMetroDef {
  id: number;
  name: string;
  country: string;
  region: 'Asia' | 'Europe' | 'Americas' | 'Middle East & Africa' | 'Oceania';
  latitude: number;
  longitude: number;
}

export interface WorldCityItem extends WorldMetroDef {
  usAqi: number;
  pm25: number;
  category: AQICategory;
  rank?: number;
  lastUpdated?: string;
  isLive?: boolean;
}

export const WORLD_METROS: WorldMetroDef[] = [
  // South Asia & East Asia
  { id: 101, name: 'Delhi-NCR', country: 'India', region: 'Asia', latitude: 28.6139, longitude: 77.2090 },
  { id: 102, name: 'Lahore', country: 'Pakistan', region: 'Asia', latitude: 31.5204, longitude: 74.3587 },
  { id: 103, name: 'Dhaka', country: 'Bangladesh', region: 'Asia', latitude: 23.8103, longitude: 90.4125 },
  { id: 104, name: 'Beijing', country: 'China', region: 'Asia', latitude: 39.9042, longitude: 116.4074 },
  { id: 105, name: 'Shanghai', country: 'China', region: 'Asia', latitude: 31.2304, longitude: 121.4737 },
  { id: 106, name: 'Mumbai', country: 'India', region: 'Asia', latitude: 19.0760, longitude: 72.8777 },
  { id: 107, name: 'Kolkata', country: 'India', region: 'Asia', latitude: 22.5726, longitude: 88.3639 },
  { id: 108, name: 'Bengaluru', country: 'India', region: 'Asia', latitude: 12.9716, longitude: 77.5946 },
  { id: 109, name: 'Kathmandu', country: 'Nepal', region: 'Asia', latitude: 27.7172, longitude: 85.3240 },
  { id: 110, name: 'Bangkok', country: 'Thailand', region: 'Asia', latitude: 13.7563, longitude: 100.5018 },
  { id: 111, name: 'Jakarta', country: 'Indonesia', region: 'Asia', latitude: -6.2088, longitude: 106.8456 },
  { id: 112, name: 'Hanoi', country: 'Vietnam', region: 'Asia', latitude: 21.0285, longitude: 105.8542 },
  { id: 113, name: 'Tokyo', country: 'Japan', region: 'Asia', latitude: 35.6762, longitude: 139.6503 },
  { id: 114, name: 'Seoul', country: 'South Korea', region: 'Asia', latitude: 37.5665, longitude: 126.9780 },
  { id: 115, name: 'Singapore', country: 'Singapore', region: 'Asia', latitude: 1.3521, longitude: 103.8198 },

  // Middle East & Africa
  { id: 116, name: 'Dubai', country: 'UAE', region: 'Middle East & Africa', latitude: 25.2048, longitude: 55.2708 },
  { id: 117, name: 'Riyadh', country: 'Saudi Arabia', region: 'Middle East & Africa', latitude: 24.7136, longitude: 46.6753 },
  { id: 118, name: 'Cairo', country: 'Egypt', region: 'Middle East & Africa', latitude: 30.0444, longitude: 31.2357 },
  { id: 119, name: 'Doha', country: 'Qatar', region: 'Middle East & Africa', latitude: 25.2854, longitude: 51.5310 },
  { id: 120, name: 'Kuwait City', country: 'Kuwait', region: 'Middle East & Africa', latitude: 29.3759, longitude: 47.9774 },
  { id: 121, name: 'Johannesburg', country: 'South Africa', region: 'Middle East & Africa', latitude: -26.2041, longitude: 28.0473 },

  // Europe
  { id: 122, name: 'London', country: 'United Kingdom', region: 'Europe', latitude: 51.5074, longitude: -0.1278 },
  { id: 123, name: 'Paris', country: 'France', region: 'Europe', latitude: 48.8566, longitude: 2.3522 },
  { id: 124, name: 'Berlin', country: 'Germany', region: 'Europe', latitude: 52.5200, longitude: 13.4050 },
  { id: 125, name: 'Warsaw', country: 'Poland', region: 'Europe', latitude: 52.2297, longitude: 21.0122 },
  { id: 126, name: 'Madrid', country: 'Spain', region: 'Europe', latitude: 40.4168, longitude: -3.7038 },
  { id: 127, name: 'Rome', country: 'Italy', region: 'Europe', latitude: 41.9028, longitude: 12.4964 },

  // Americas
  { id: 128, name: 'New York', country: 'USA', region: 'Americas', latitude: 40.7128, longitude: -74.0060 },
  { id: 129, name: 'Los Angeles', country: 'USA', region: 'Americas', latitude: 34.0522, longitude: -118.2437 },
  { id: 130, name: 'Mexico City', country: 'Mexico', region: 'Americas', latitude: 19.4326, longitude: -99.1332 },
  { id: 131, name: 'São Paulo', country: 'Brazil', region: 'Americas', latitude: -23.5505, longitude: -46.6333 },
  { id: 132, name: 'Toronto', country: 'Canada', region: 'Americas', latitude: 43.6532, longitude: -79.3832 },
  { id: 133, name: 'Santiago', country: 'Chile', region: 'Americas', latitude: -33.4489, longitude: -70.6693 },

  // Oceania
  { id: 134, name: 'Sydney', country: 'Australia', region: 'Oceania', latitude: -33.8688, longitude: 151.2093 },
  { id: 135, name: 'Melbourne', country: 'Australia', region: 'Oceania', latitude: -37.8136, longitude: 144.9631 },
];

/**
 * Builds a comma-separated Open-Meteo multi-coordinate URL for batch retrieval.
 */
export function buildBatchCoordinatesUrl(cities: WorldMetroDef[]): string {
  const lats = cities.map((c) => c.latitude.toFixed(2)).join(',');
  const lons = cities.map((c) => c.longitude.toFixed(2)).join(',');
  return `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lons}&current=us_aqi,pm2_5`;
}

/**
 * Parses batch Open-Meteo response array and correlates with original world metros.
 */
export function parseBatchTelemetryResponse(
  cities: WorldMetroDef[],
  responseData: any[]
): WorldCityItem[] {
  if (!Array.isArray(responseData)) return [];

  return cities.map((city, idx) => {
    const raw = responseData[idx] || {};
    const current = raw.current || {};
    const hasUsAqi = typeof current.us_aqi === 'number';
    const hasPm25 = typeof current.pm2_5 === 'number';

    const usAqi = hasUsAqi ? current.us_aqi : (hasPm25 ? Math.round(current.pm2_5 * 2.1) : 0);
    const pm25 = hasPm25 ? Math.round(current.pm2_5 * 10) / 10 : 0;
    const category = getAQICategory(usAqi);

    return {
      ...city,
      usAqi,
      pm25,
      category,
      isLive: hasUsAqi || hasPm25,
      lastUpdated: current.time || new Date().toISOString(),
    };
  });
}

/**
 * Fetches live atmospheric telemetry for all curated world metros in a single Open-Meteo batch call.
 * Uses 10-minute caching to eliminate unnecessary network requests.
 * Uses stale cache during outages and strictly eliminates synthetic ranking mocks.
 */
export async function fetchAllWorldCities(signal?: AbortSignal): Promise<WorldCityItem[]> {
  const cacheKey = 'world:cities:batch';
  const cached = telemetryCache.get(cacheKey) as WorldCityItem[] | null;
  if (cached && cached.length > 0) return cached;

  try {
    const url = buildBatchCoordinatesUrl(WORLD_METROS);
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Open-Meteo batch HTTP ${res.status}`);

    const rawList = await res.json();
    const dataList = Array.isArray(rawList) ? rawList : [rawList];
    const parsed = parseBatchTelemetryResponse(WORLD_METROS, dataList);

    // Filter out cities with invalid/0 readings if batch had missing elements
    const valid = parsed.filter(c => c.usAqi > 0 || c.pm25 > 0);
    const citiesToRank = valid.length > 0 ? valid : parsed;

    // Sort by default most polluted first and assign rank
    const sorted = filterAndSortWorldCities(citiesToRank, '', 'All', 'All', 'most_polluted');
    const ranked = sorted.map((c, i) => ({ ...c, rank: i + 1 }));

    telemetryCache.set(cacheKey, ranked, 1000 * 60 * 10); // 10 minutes TTL
    return ranked;
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
    console.warn('World telemetry batch fetch failed, checking stale cache fallback:', err?.message || err);

    // Rule 3: Return stale cache if available with isLive: false
    const stale = telemetryCache.getStale(cacheKey) as { value: WorldCityItem[]; isExpired: boolean; storedAt: number } | null;
    if (stale?.value && stale.value.length > 0) {
      return stale.value.map(c => ({
        ...c,
        isLive: false,
      }));
    }

    // No stale data available: return empty array rather than fabricated rankings
    return [];
  }
}

/**
 * Filters and sorts world cities according to query, region, severity, and sort order.
 */
export function filterAndSortWorldCities(
  cities: WorldCityItem[],
  query: string,
  region: WorldRegion,
  severity: SeverityFilter,
  sortOrder: SortOrder
): WorldCityItem[] {
  let result = [...cities];

  // 1. Text Search Filter (name or country)
  if (query && query.trim().length > 0) {
    const q = query.toLowerCase().trim();
    result = result.filter(
      (c) => c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q)
    );
  }

  // 2. Region Filter
  if (region !== 'All') {
    result = result.filter((c) => c.region === region);
  }

  // 3. Severity Filter
  if (severity !== 'All') {
    switch (severity) {
      case 'hazardous':
        result = result.filter((c) => c.usAqi >= 300);
        break;
      case 'unhealthy':
        result = result.filter((c) => c.usAqi >= 150 && c.usAqi < 300);
        break;
      case 'moderate':
        result = result.filter((c) => c.usAqi >= 50 && c.usAqi < 150);
        break;
      case 'clean':
        result = result.filter((c) => c.usAqi < 50);
        break;
    }
  }

  // 4. Sort Order
  result.sort((a, b) => {
    if (sortOrder === 'most_polluted') {
      return b.usAqi - a.usAqi;
    } else {
      return a.usAqi - b.usAqi;
    }
  });

  return result;
}

/**
 * Searches global cities dynamically via Open-Meteo Geocoding, and fetches their live AQI.
 */
export async function searchAndFetchGlobalCity(
  query: string
): Promise<WorldCityItem[]> {
  const geoResults = await searchCities(query);
  if (!geoResults || geoResults.length === 0) return [];

  // Convert geocoded locations to WorldMetroDef
  const targets: WorldMetroDef[] = geoResults.slice(0, 5).map((loc) => ({
    id: loc.id,
    name: loc.name,
    country: loc.country,
    region: 'Asia', // fallback
    latitude: loc.latitude,
    longitude: loc.longitude,
  }));

  try {
    const url = buildBatchCoordinatesUrl(targets);
    const res = await fetch(url);
    if (!res.ok) throw new Error('Geocoded AQI fetch error');
    const raw = await res.json();
    const dataList = Array.isArray(raw) ? raw : [raw];
    return parseBatchTelemetryResponse(targets, dataList);
  } catch (err) {
    console.warn('Could not fetch telemetry for search result:', err);
    return targets.map((t) => ({
      ...t,
      usAqi: 75,
      pm25: 22,
      category: 'Moderate',
      isLive: false,
    }));
  }
}
