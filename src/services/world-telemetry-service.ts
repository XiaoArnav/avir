import { AQICategory } from '@/domain/types';
import { getAQICategory, calculateAQIFromPM25 } from '@/domain/air-math';
import { telemetryCache } from '@/lib/cache';
import { GeocodedLocation, searchCities } from './telemetry-service';
import { classifyWorldRegion, getStableCityId, WorldRegion } from './world-geography';

export { classifyWorldRegion, getStableCityId };
export type { WorldRegion };

export type SeverityFilter = 'All' | 'hazardous' | 'unhealthy' | 'moderate' | 'clean';
export type SortOrder = 'most_polluted' | 'cleanest';

export type GlobalTelemetryStatus =
  | 'available'
  | 'stale'
  | 'unavailable'
  | 'invalid'
  | 'partial'
  | 'error';

export interface WorldMetroDef {
  id: number;
  cityId?: string;
  name: string;
  country: string;
  countryCode?: string;
  admin1?: string | null;
  region: WorldRegion;
  latitude: number;
  longitude: number;
}

export interface WorldCityItem extends WorldMetroDef {
  cityId?: string;
  usAqi: number | null;
  pm25: number | null;
  pm10?: number | null;
  category: AQICategory;

  // Provenance & Source Metadata
  sourceKind?: 'atmospheric_model';
  providerId?: string;
  modelDomain?: string | null;
  observedAt?: null; // Models are never physical ground observations
  modelValidAt?: string | null; // ISO timestamp of model forecast/analysis valid hour
  retrievedAt?: string; // ISO timestamp when Avir fetched data

  // Status & Scientific Comparability
  status?: GlobalTelemetryStatus;
  comparable?: boolean;
  incompatibilityReasons?: string[];
  cohortRank?: number | null;
  cohortSize?: number | null;

  // Backwards compatibility fields
  rank?: number | null;
  lastUpdated?: string | null;
  isLive?: boolean;
}

export const WORLD_METROS: WorldMetroDef[] = [
  // South Asia & East Asia
  { id: 101, cityId: 'c-101', name: 'Delhi-NCR', country: 'India', countryCode: 'IN', region: 'Asia', latitude: 28.6139, longitude: 77.2090 },
  { id: 102, cityId: 'c-102', name: 'Lahore', country: 'Pakistan', countryCode: 'PK', region: 'Asia', latitude: 31.5204, longitude: 74.3587 },
  { id: 103, cityId: 'c-103', name: 'Dhaka', country: 'Bangladesh', countryCode: 'BD', region: 'Asia', latitude: 23.8103, longitude: 90.4125 },
  { id: 104, cityId: 'c-104', name: 'Beijing', country: 'China', countryCode: 'CN', region: 'Asia', latitude: 39.9042, longitude: 116.4074 },
  { id: 105, cityId: 'c-105', name: 'Shanghai', country: 'China', countryCode: 'CN', region: 'Asia', latitude: 31.2304, longitude: 121.4737 },
  { id: 106, cityId: 'c-106', name: 'Mumbai', country: 'India', countryCode: 'IN', region: 'Asia', latitude: 19.0760, longitude: 72.8777 },
  { id: 107, cityId: 'c-107', name: 'Kolkata', country: 'India', countryCode: 'IN', region: 'Asia', latitude: 22.5726, longitude: 88.3639 },
  { id: 108, cityId: 'c-108', name: 'Bengaluru', country: 'India', countryCode: 'IN', region: 'Asia', latitude: 12.9716, longitude: 77.5946 },
  { id: 109, cityId: 'c-109', name: 'Kathmandu', country: 'Nepal', countryCode: 'NP', region: 'Asia', latitude: 27.7172, longitude: 85.3240 },
  { id: 110, cityId: 'c-110', name: 'Bangkok', country: 'Thailand', countryCode: 'TH', region: 'Asia', latitude: 13.7563, longitude: 100.5018 },
  { id: 111, cityId: 'c-111', name: 'Jakarta', country: 'Indonesia', countryCode: 'ID', region: 'Asia', latitude: -6.2088, longitude: 106.8456 },
  { id: 112, cityId: 'c-112', name: 'Hanoi', country: 'Vietnam', countryCode: 'VN', region: 'Asia', latitude: 21.0285, longitude: 105.8542 },
  { id: 113, cityId: 'c-113', name: 'Tokyo', country: 'Japan', countryCode: 'JP', region: 'Asia', latitude: 35.6762, longitude: 139.6503 },
  { id: 114, cityId: 'c-114', name: 'Seoul', country: 'South Korea', countryCode: 'KR', region: 'Asia', latitude: 37.5665, longitude: 126.9780 },
  { id: 115, cityId: 'c-115', name: 'Singapore', country: 'Singapore', countryCode: 'SG', region: 'Asia', latitude: 1.3521, longitude: 103.8198 },

  // Middle East & Africa
  { id: 116, cityId: 'c-116', name: 'Dubai', country: 'UAE', countryCode: 'AE', region: 'Middle East & Africa', latitude: 25.2048, longitude: 55.2708 },
  { id: 117, cityId: 'c-117', name: 'Riyadh', country: 'Saudi Arabia', countryCode: 'SA', region: 'Middle East & Africa', latitude: 24.7136, longitude: 46.6753 },
  { id: 118, cityId: 'c-118', name: 'Cairo', country: 'Egypt', countryCode: 'EG', region: 'Middle East & Africa', latitude: 30.0444, longitude: 31.2357 },
  { id: 119, cityId: 'c-119', name: 'Doha', country: 'Qatar', countryCode: 'QA', region: 'Middle East & Africa', latitude: 25.2854, longitude: 51.5310 },
  { id: 120, cityId: 'c-120', name: 'Kuwait City', country: 'Kuwait', countryCode: 'KW', region: 'Middle East & Africa', latitude: 29.3759, longitude: 47.9774 },
  { id: 121, cityId: 'c-121', name: 'Johannesburg', country: 'South Africa', countryCode: 'ZA', region: 'Middle East & Africa', latitude: -26.2041, longitude: 28.0473 },

  // Europe
  { id: 122, cityId: 'c-122', name: 'London', country: 'United Kingdom', countryCode: 'GB', region: 'Europe', latitude: 51.5074, longitude: -0.1278 },
  { id: 123, cityId: 'c-123', name: 'Paris', country: 'France', countryCode: 'FR', region: 'Europe', latitude: 48.8566, longitude: 2.3522 },
  { id: 124, cityId: 'c-124', name: 'Berlin', country: 'Germany', countryCode: 'DE', region: 'Europe', latitude: 52.5200, longitude: 13.4050 },
  { id: 125, cityId: 'c-125', name: 'Warsaw', country: 'Poland', countryCode: 'PL', region: 'Europe', latitude: 52.2297, longitude: 21.0122 },
  { id: 126, cityId: 'c-126', name: 'Madrid', country: 'Spain', countryCode: 'ES', region: 'Europe', latitude: 40.4168, longitude: -3.7038 },
  { id: 127, cityId: 'c-127', name: 'Rome', country: 'Italy', countryCode: 'IT', region: 'Europe', latitude: 41.9028, longitude: 12.4964 },

  // Americas
  { id: 128, cityId: 'c-128', name: 'New York', country: 'USA', countryCode: 'US', region: 'Americas', latitude: 40.7128, longitude: -74.0060 },
  { id: 129, cityId: 'c-129', name: 'Los Angeles', country: 'USA', countryCode: 'US', region: 'Americas', latitude: 34.0522, longitude: -118.2437 },
  { id: 130, cityId: 'c-130', name: 'Mexico City', country: 'Mexico', countryCode: 'MX', region: 'Americas', latitude: 19.4326, longitude: -99.1332 },
  { id: 131, cityId: 'c-131', name: 'São Paulo', country: 'Brazil', countryCode: 'BR', region: 'Americas', latitude: -23.5505, longitude: -46.6333 },
  { id: 132, cityId: 'c-132', name: 'Toronto', country: 'Canada', countryCode: 'CA', region: 'Americas', latitude: 43.6532, longitude: -79.3832 },
  { id: 133, cityId: 'c-133', name: 'Santiago', country: 'Chile', countryCode: 'CL', region: 'Americas', latitude: -33.4489, longitude: -70.6693 },

  // Oceania
  { id: 134, cityId: 'c-134', name: 'Sydney', country: 'Australia', countryCode: 'AU', region: 'Oceania', latitude: -33.8688, longitude: 151.2093 },
  { id: 135, cityId: 'c-135', name: 'Melbourne', country: 'Australia', countryCode: 'AU', region: 'Oceania', latitude: -37.8136, longitude: 144.9631 },
];

/**
 * Validates coordinate inputs for batch requests.
 */
function isValidCoord(lat: number, lon: number): boolean {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    !isNaN(lat) &&
    !isNaN(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

/**
 * Builds a comma-separated Open-Meteo multi-coordinate URL for batch retrieval.
 * Preserves high coordinate precision and pins to CAMS global atmospheric model for comparability.
 */
export function buildBatchCoordinatesUrl(
  cities: WorldMetroDef[],
  options?: { domain?: string }
): string {
  const validCities = cities.filter((c) => isValidCoord(c.latitude, c.longitude));
  if (validCities.length === 0) return '';

  // Preserve 4-decimal precision (approx ~11m resolution) without truncating to 2 decimals
  const lats = validCities.map((c) => (Math.round(c.latitude * 10000) / 10000).toString()).join(',');
  const lons = validCities.map((c) => (Math.round(c.longitude * 10000) / 10000).toString()).join(',');
  const domainParam = options?.domain ? `&domains=${encodeURIComponent(options.domain)}` : '&domains=cams_global';

  return `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lons}&current=us_aqi,pm2_5,pm10${domainParam}`;
}

/**
 * Checks whether a response coordinate is mismatched or swapped with another city.
 */
function checkCoordinateMismatch(
  city: WorldMetroDef,
  raw: any,
  allCities: WorldMetroDef[]
): { isMismatch: boolean; reason?: string } {
  if (typeof raw.latitude !== 'number' || typeof raw.longitude !== 'number') {
    return { isMismatch: false };
  }

  const distToCity = Math.sqrt(
    Math.pow(raw.latitude - city.latitude, 2) + Math.pow(raw.longitude - city.longitude, 2)
  );

  // Normal grid tolerance: within 2.0 degrees (~200km) is accepted as model grid point
  if (distToCity <= 2.0) {
    return { isMismatch: false };
  }

  // Check if this response item is close to another city in the requested batch (order swap)
  for (const other of allCities) {
    if (other !== city) {
      const distToOther = Math.sqrt(
        Math.pow(raw.latitude - other.latitude, 2) + Math.pow(raw.longitude - other.longitude, 2)
      );
      if (distToOther < 2.0) {
        return {
          isMismatch: true,
          reason: `Coordinate association mismatch: received coordinates (${raw.latitude}, ${raw.longitude}) match ${other.name} instead of ${city.name}`,
        };
      }
    }
  }

  // If distance is extremely large (> 15 degrees) in a full multi-city batch
  if (distToCity > 15.0 && allCities.length > 5) {
    return {
      isMismatch: true,
      reason: `Coordinate distance (${distToCity.toFixed(1)}°) exceeds model grid tolerance`,
    };
  }

  return { isMismatch: false };
}

/**
 * Parses batch Open-Meteo response array and correlates with requested world cities.
 * Strictly verifies schema, coordinate proximity, and preserves valid zero clean-air values.
 */
export function parseBatchTelemetryResponse(
  cities: WorldMetroDef[],
  responseData: any[],
  options?: { retrievedAt?: string; domain?: string }
): WorldCityItem[] {
  if (!Array.isArray(responseData)) return [];

  const retrievedAt = options?.retrievedAt || new Date().toISOString();
  const domain = options?.domain || 'cams_global';

  return cities.map((city, idx) => {
    const cityId = city.cityId || getStableCityId(city);
    const raw = responseData[idx];

    // If city has invalid requested coordinates or response item is missing
    if (!isValidCoord(city.latitude, city.longitude)) {
      return {
        ...city,
        cityId,
        usAqi: null,
        pm25: null,
        pm10: null,
        category: 'Unavailable' as AQICategory,
        sourceKind: 'atmospheric_model',
        providerId: 'open_meteo_cams',
        modelDomain: domain,
        observedAt: null,
        modelValidAt: null,
        retrievedAt,
        status: 'invalid' as GlobalTelemetryStatus,
        comparable: false,
        incompatibilityReasons: ['Requested geographic coordinates are invalid or out of bounds'],
        cohortRank: null,
        cohortSize: null,
        rank: null,
        lastUpdated: null,
        isLive: false,
      };
    }

    if (!raw || typeof raw !== 'object' || raw.error) {
      return {
        ...city,
        cityId,
        usAqi: null,
        pm25: null,
        pm10: null,
        category: 'Unavailable' as AQICategory,
        sourceKind: 'atmospheric_model',
        providerId: 'open_meteo_cams',
        modelDomain: domain,
        observedAt: null,
        modelValidAt: null,
        retrievedAt,
        status: 'unavailable' as GlobalTelemetryStatus,
        comparable: false,
        incompatibilityReasons: ['No telemetry returned from atmospheric model provider'],
        cohortRank: null,
        cohortSize: null,
        rank: null,
        lastUpdated: null,
        isLive: false,
      };
    }

    // Coordinate Association Verification
    const coordCheck = checkCoordinateMismatch(city, raw, cities);
    if (coordCheck.isMismatch) {
      return {
        ...city,
        cityId,
        usAqi: null,
        pm25: null,
        pm10: null,
        category: 'Unavailable' as AQICategory,
        sourceKind: 'atmospheric_model',
        providerId: 'open_meteo_cams',
        modelDomain: domain,
        observedAt: null,
        modelValidAt: null,
        retrievedAt,
        status: 'unavailable' as GlobalTelemetryStatus,
        comparable: false,
        incompatibilityReasons: [coordCheck.reason || 'Coordinate association mismatch'],
        cohortRank: null,
        cohortSize: null,
        rank: null,
        lastUpdated: null,
        isLive: false,
      };
    }

    const current = raw.current || {};
    const incompatibilities: string[] = [];

    // Numerical validation for pollutants: reject negative, non-finite, or absurd values
    const hasRawUsAqi = typeof current.us_aqi === 'number' && Number.isFinite(current.us_aqi) && current.us_aqi >= 0 && current.us_aqi <= 1000;
    const hasRawPm25 = typeof current.pm2_5 === 'number' && Number.isFinite(current.pm2_5) && current.pm2_5 >= 0 && current.pm2_5 <= 2000;
    const hasRawPm10 = typeof current.pm10 === 'number' && Number.isFinite(current.pm10) && current.pm10 >= 0 && current.pm10 <= 3000;

    const pm25 = hasRawPm25 ? Math.round(current.pm2_5 * 10) / 10 : null;
    const pm10 = hasRawPm10 ? Math.round(current.pm10 * 10) / 10 : null;

    // Distinguish between provider reported US AQI vs derived fallback
    let usAqi: number | null = null;
    let isDerivedAqi = false;

    if (hasRawUsAqi) {
      usAqi = Math.round(current.us_aqi);
    } else if (pm25 !== null) {
      usAqi = calculateAQIFromPM25(pm25);
      isDerivedAqi = true;
      incompatibilities.push('US AQI is derived from single-species PM2.5 calculation, not provider-reported multi-pollutant AQI');
    }

    const modelValidAt: string | null = typeof current.time === 'string' && current.time.length > 0
      ? current.time
      : null;

    if (!modelValidAt) {
      incompatibilities.push('Missing model-valid observation timestamp');
    }

    const category = getAQICategory(usAqi);

    let status: GlobalTelemetryStatus = 'available';
    if (usAqi === null && pm25 === null) {
      status = 'unavailable';
    } else if (usAqi === null || pm25 === null || isDerivedAqi) {
      status = 'partial';
    }

    return {
      ...city,
      cityId,
      usAqi,
      pm25,
      pm10,
      category,
      sourceKind: 'atmospheric_model',
      providerId: 'open_meteo_cams',
      modelDomain: domain,
      observedAt: null,
      modelValidAt,
      retrievedAt,
      status,
      comparable: incompatibilities.length === 0 && usAqi !== null,
      incompatibilityReasons: incompatibilities,
      cohortRank: null,
      cohortSize: null,
      rank: null,
      lastUpdated: modelValidAt,
      isLive: usAqi !== null || pm25 !== null,
    };
  });
}

/**
 * Computes scientific competition ranks among eligible comparable cities in the cohort.
 * Ineligible cities (missing data, derived AQI, missing timestamp) remain unranked.
 */
export function computeComparableCohortRanks(cities: WorldCityItem[]): WorldCityItem[] {
  // Determine dominant model-valid timestamp among cities with valid timestamps
  const timestampCounts = new Map<string, number>();
  for (const c of cities) {
    if (c.modelValidAt) {
      timestampCounts.set(c.modelValidAt, (timestampCounts.get(c.modelValidAt) || 0) + 1);
    }
  }

  let dominantTimestamp: string | null = null;
  let maxCount = 0;
  for (const [ts, count] of timestampCounts.entries()) {
    if (count > maxCount) {
      maxCount = count;
      dominantTimestamp = ts;
    }
  }

  // Identify eligible cohort members
  const eligibleIndices: number[] = [];
  const updatedCities = cities.map((city, idx) => {
    const reasons = [...(city.incompatibilityReasons || [])];

    // Must have numeric US AQI
    if (city.usAqi === null) {
      if (!reasons.includes('Missing authentic US AQI')) reasons.push('Missing authentic US AQI');
    }

    // Must have valid model timestamp matching dominant cohort window
    if (!city.modelValidAt) {
      if (!reasons.includes('Missing model valid timestamp')) reasons.push('Missing model valid timestamp');
    } else if (dominantTimestamp && city.modelValidAt !== dominantTimestamp) {
      // Check if within 1 hour
      const diffMs = Math.abs(new Date(city.modelValidAt).getTime() - new Date(dominantTimestamp).getTime());
      if (isNaN(diffMs) || diffMs > 3600000) {
        reasons.push(`Model valid time (${city.modelValidAt}) diverges from dominant cohort time (${dominantTimestamp})`);
      }
    }

    // Stale status excludes from current live ranking
    if (city.status === 'stale') {
      reasons.push('Measurement is cached from an expired forecast run');
    }

    const isComparable = reasons.length === 0 && city.usAqi !== null && city.status !== 'stale';
    if (isComparable) {
      eligibleIndices.push(idx);
    }

    return {
      ...city,
      comparable: isComparable,
      incompatibilityReasons: reasons,
    };
  });

  const cohortSize = eligibleIndices.length;

  if (cohortSize === 0) {
    return updatedCities.map((c) => ({
      ...c,
      cohortRank: null,
      cohortSize: 0,
      rank: null,
    }));
  }

  // Extract and sort eligible cities by US AQI descending, with deterministic tiebreakers
  const eligibleItems = eligibleIndices.map((idx) => ({ city: updatedCities[idx], originalIndex: idx }));
  eligibleItems.sort((a, b) => {
    const diff = (b.city.usAqi as number) - (a.city.usAqi as number);
    if (diff !== 0) return diff;
    // Stable tie-breaker: sort alphabetically by city name or ID
    return a.city.name.localeCompare(b.city.name);
  });

  // Assign standard competition rank: 1, 2, 2, 4...
  let currentRank = 1;
  for (let i = 0; i < eligibleItems.length; i++) {
    if (i > 0 && eligibleItems[i].city.usAqi === eligibleItems[i - 1].city.usAqi) {
      eligibleItems[i].city.cohortRank = eligibleItems[i - 1].city.cohortRank;
    } else {
      eligibleItems[i].city.cohortRank = currentRank;
    }
    eligibleItems[i].city.cohortSize = cohortSize;
    eligibleItems[i].city.rank = eligibleItems[i].city.cohortRank;
    currentRank++;
  }

  // Merge back into original city order
  for (const item of eligibleItems) {
    updatedCities[item.originalIndex] = item.city;
  }

  return updatedCities;
}

/**
 * Fetches live atmospheric telemetry for all curated world metros in a batched Open-Meteo query.
 * Implements bounded chunking, cache freshness vs staleness, and error isolation.
 */
export async function fetchAllWorldCities(
  signal?: AbortSignal,
  options?: { forceRefresh?: boolean; domain?: string }
): Promise<WorldCityItem[]> {
  const domain = options?.domain || 'cams_global';
  const cacheKey = `world:v6:${domain}:tracked`;

  if (!options?.forceRefresh) {
    const cached = telemetryCache.get(cacheKey) as WorldCityItem[] | null;
    if (cached && cached.length > 0) return cached;
  }

  const retrievedAt = new Date().toISOString();

  try {
    const url = buildBatchCoordinatesUrl(WORLD_METROS, { domain });
    if (!url) return [];

    // Timeout AbortController wrapping network request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const onAbort = () => controller.abort();
    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
    }

    if (!res.ok) throw new Error(`Open-Meteo batch HTTP ${res.status}`);

    const rawList = await res.json();
    const dataList = Array.isArray(rawList) ? rawList : [rawList];
    const parsed = parseBatchTelemetryResponse(WORLD_METROS, dataList, { retrievedAt, domain });

    // Compute scientific cohort ranking
    const result = computeComparableCohortRanks(parsed);

    telemetryCache.set(cacheKey, result, 1000 * 60 * 10); // 10 minutes TTL
    return result;
  } catch (err: any) {
    if (err?.name === 'AbortError' && signal?.aborted) throw err;
    console.warn('World telemetry batch fetch failed, checking stale cache fallback:', err?.message || err);

    // Return stale cache if available, marking status stale and unranked
    const stale = telemetryCache.getStale(cacheKey) as { value: WorldCityItem[]; isExpired: boolean; storedAt: number } | null;
    if (stale?.value && stale.value.length > 0) {
      return stale.value.map((c) => ({
        ...c,
        status: 'stale' as GlobalTelemetryStatus,
        isLive: false,
        comparable: false,
        incompatibilityReasons: ['Stale cached reading: live provider network unavailable'],
        cohortRank: null,
        rank: null,
      }));
    }

    // No stale data available: return empty array rather than fabricated rankings
    return [];
  }
}

/**
 * Filters and sorts world cities according to query, region, severity, and sort order.
 * Cities with null AQI are never misclassified as clean and are placed at the end of ranked lists.
 * Preserves the canonical cohort rank so filtering doesn't fabricate false #1 positions.
 */
export function filterAndSortWorldCities(
  cities: WorldCityItem[],
  query: string,
  region: WorldRegion,
  severity: SeverityFilter,
  sortOrder: SortOrder
): WorldCityItem[] {
  let result = [...cities];

  // 1. Text Search Filter (name, country, countryCode, or admin1)
  if (query && query.trim().length > 0) {
    const q = query.toLowerCase().trim();
    result = result.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.country.toLowerCase().includes(q) ||
        (c.countryCode && c.countryCode.toLowerCase().includes(q)) ||
        (c.admin1 && c.admin1.toLowerCase().includes(q))
    );
  }

  // 2. Region Filter
  if (region !== 'All') {
    result = result.filter((c) => c.region === region);
  }

  // 3. Severity Filter: EPA-standard boundaries (null values never match numeric severity)
  if (severity !== 'All') {
    switch (severity) {
      case 'hazardous':
        // EPA Hazardous & Very Unhealthy (> 200)
        result = result.filter((c) => typeof c.usAqi === 'number' && c.usAqi > 200);
        break;
      case 'unhealthy':
        // EPA Unhealthy for Sensitive Groups & Unhealthy (101 - 200)
        result = result.filter((c) => typeof c.usAqi === 'number' && c.usAqi > 100 && c.usAqi <= 200);
        break;
      case 'moderate':
        // EPA Moderate (51 - 100)
        result = result.filter((c) => typeof c.usAqi === 'number' && c.usAqi > 50 && c.usAqi <= 100);
        break;
      case 'clean':
        // EPA Good (0 - 50)
        result = result.filter((c) => typeof c.usAqi === 'number' && c.usAqi <= 50);
        break;
    }
  }

  // 4. Sort Order (null values always sort to the end)
  result.sort((a, b) => {
    if (a.usAqi === null && b.usAqi === null) return a.name.localeCompare(b.name);
    if (a.usAqi === null) return 1;
    if (b.usAqi === null) return -1;
    if (sortOrder === 'most_polluted') {
      const diff = b.usAqi - a.usAqi;
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    } else {
      const diff = a.usAqi - b.usAqi;
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    }
  });

  return result;
}

/**
 * Searches global cities dynamically via Open-Meteo Geocoding, and fetches their live AQI.
 * Never fabricates synthetic AQI 75 / PM2.5 22 fallbacks on network or parsing failure.
 */
export async function searchAndFetchGlobalCity(
  query: string,
  signal?: AbortSignal
): Promise<WorldCityItem[]> {
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted', 'AbortError');
  }
  const geoResults = await searchCities(query, signal);
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted', 'AbortError');
  }
  if (!geoResults || geoResults.length === 0) return [];

  // Convert geocoded locations to WorldMetroDef
  const targets: WorldMetroDef[] = geoResults.slice(0, 5).map((loc) => ({
    id: loc.id,
    cityId: `geo-${loc.id}`,
    name: loc.name,
    country: loc.country,
    admin1: loc.admin1,
    region: classifyWorldRegion(loc.country),
    latitude: loc.latitude,
    longitude: loc.longitude,
  }));

  try {
    const url = buildBatchCoordinatesUrl(targets);
    if (!url) return [];

    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Geocoded AQI fetch error: HTTP ${res.status}`);

    const raw = await res.json();
    const dataList = Array.isArray(raw) ? raw : [raw];
    const parsed = parseBatchTelemetryResponse(targets, dataList);
    return computeComparableCohortRanks(parsed);
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
    console.warn('Could not fetch telemetry for search result:', err);
    // Zero fabrication: Return authentic geographic location with unavailable atmospheric measurements
    return targets.map((t) => ({
      ...t,
      cityId: t.cityId || `geo-${t.id}`,
      usAqi: null,
      pm25: null,
      pm10: null,
      category: 'Unavailable' as AQICategory,
      sourceKind: 'atmospheric_model',
      providerId: 'open_meteo_cams',
      modelDomain: 'cams_global',
      observedAt: null,
      modelValidAt: null,
      retrievedAt: new Date().toISOString(),
      status: 'unavailable' as GlobalTelemetryStatus,
      comparable: false,
      incompatibilityReasons: ['Network or provider lookup failure during geocoded retrieval'],
      cohortRank: null,
      cohortSize: null,
      rank: null,
      lastUpdated: null,
      isLive: false,
    }));
  }
}
