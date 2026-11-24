/**
 * Geographic Observation Adapter (PR B)
 * Maps scientifically verified atmospheric telemetry and metropolitan locations
 * to 3D Earth and 2D accessible map visualization coordinates.
 *
 * STRICT ZERO-FABRICATION CONTRACT:
 * - Unobserved or missing pollutant stations remain null / unavailable.
 * - Never invents synthetic AQI readings or synthetic sensor stations.
 */

import { PREDEFINED_INDIAN_CITIES, GeocodedLocation } from '@/services/telemetry-service';
import { WORLD_METROS, WorldCityItem } from '@/services/world-telemetry-service';
import { calculateComprehensiveCpcbNaqi } from '@/domain/cpcb-naqi';
import { AtmosphericMetrics, DataProvenance } from '@/domain/types';

export type AqiStandard = 'epa' | 'cpcb';

export type AqiCategorySeverity =
  | 'good'
  | 'moderate'
  | 'unhealthy-sensitive'
  | 'unhealthy'
  | 'very-unhealthy'
  | 'hazardous'
  | 'unavailable';

export interface GeographicObservationPoint {
  id: string;
  cityId?: string;
  name: string;
  admin1?: string;
  country: string;
  countryCode: string;
  region: string;
  latitude: number;
  longitude: number;
  elevationMeters?: number;
  aqi: number | null;
  cpcbAqi: number | null;
  usAqi: number | null;
  pm25: number | null;
  pm10: number | null;
  category: AqiCategorySeverity;
  categoryLabel: string;
  categoryColor: string;
  primaryPollutant: string;
  provenance: DataProvenance;
  source: string;
  timestamp: string;
  isOfficialGround: boolean;
  stationName?: string;
}

/**
 * 3D spherical coordinate converter: converts latitude and longitude into 3D Cartesian coordinates.
 * Uses standard cartographic orientation for Three.js spheres.
 */
export function latLongToVector3(
  latitude: number,
  longitude: number,
  radius: number
): { x: number; y: number; z: number } {
  const phi = (90 - latitude) * (Math.PI / 180);
  const theta = (longitude + 180) * (Math.PI / 180);

  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);

  return { x, y, z };
}

/**
 * Determines AQI category and color for CPCB NAQI standard.
 */
export function getCpcbCategory(aqi: number | null): {
  category: AqiCategorySeverity;
  label: string;
  color: string;
} {
  if (aqi === null || aqi === undefined || Number.isNaN(aqi)) {
    return { category: 'unavailable', label: 'Unavailable', color: '#64748B' };
  }
  if (aqi <= 50) return { category: 'good', label: 'Good', color: '#10B981' };
  if (aqi <= 100) return { category: 'moderate', label: 'Satisfactory', color: '#34D399' };
  if (aqi <= 200) return { category: 'unhealthy-sensitive', label: 'Moderate', color: '#F59E0B' };
  if (aqi <= 300) return { category: 'unhealthy', label: 'Poor', color: '#F97316' };
  if (aqi <= 400) return { category: 'very-unhealthy', label: 'Very Poor', color: '#EF4444' };
  return { category: 'hazardous', label: 'Severe', color: '#A855F7' };
}

/**
 * Determines AQI category and color for US EPA AQI standard.
 */
export function getEpaCategory(aqi: number | null): {
  category: AqiCategorySeverity;
  label: string;
  color: string;
} {
  if (aqi === null || aqi === undefined || Number.isNaN(aqi)) {
    return { category: 'unavailable', label: 'Unavailable', color: '#64748B' };
  }
  if (aqi <= 50) return { category: 'good', label: 'Good', color: '#10B981' };
  if (aqi <= 100) return { category: 'moderate', label: 'Moderate', color: '#F59E0B' };
  if (aqi <= 150) return { category: 'unhealthy-sensitive', label: 'Unhealthy for Sensitive Groups', color: '#FB923C' };
  if (aqi <= 200) return { category: 'unhealthy', label: 'Unhealthy', color: '#EF4444' };
  if (aqi <= 300) return { category: 'very-unhealthy', label: 'Very Unhealthy', color: '#A855F7' };
  return { category: 'hazardous', label: 'Hazardous', color: '#7E22CE' };
}

/**
 * Transforms verified city registries and optional live atmospheric feeds into
 * unified GeographicObservationPoint items.
 */
export function buildGeographicObservations(options: {
  standard: AqiStandard;
  currentMetrics?: AtmosphericMetrics | null;
  currentLocation?: GeocodedLocation | null;
  worldCities?: WorldCityItem[] | null;
}): GeographicObservationPoint[] {
  const { standard, currentMetrics, currentLocation, worldCities } = options;
  const points: GeographicObservationPoint[] = [];
  const processedKeys = new Set<string>();

  // 1. If active city has live metrics, place it first with highest precedence
  if (currentLocation && currentMetrics) {
    const isSuccess = currentMetrics.status === 'success' || currentMetrics.status === 'stale';
    const pm25 = isSuccess ? currentMetrics.pm25 : null;
    const pm10 = isSuccess ? currentMetrics.pm10 : null;
    const usAqi = isSuccess ? currentMetrics.usAqi : null;

    let cpcbAqi: number | null = currentMetrics.cpcbAqi ?? null;
    if (cpcbAqi === null && (pm25 !== null || pm10 !== null)) {
      const pollutants: {
        pm25?: number | null;
        pm10?: number | null;
        no2?: number | null;
        so2?: number | null;
        co?: number | null;
        coUnit?: string;
        o3?: number | null;
      } = {
        pm25,
        pm10,
        no2: currentMetrics.no2 ?? null,
        so2: currentMetrics.so2 ?? null,
        co: currentMetrics.co ?? null,
        coUnit: 'ug/m3',
        o3: currentMetrics.o3 ?? null,
      };
      const cpcbRes = calculateComprehensiveCpcbNaqi(pollutants);
      if (cpcbRes.aqi !== null) {
        cpcbAqi = cpcbRes.aqi;
      }
    }

    // Determine accurate primary pollutant based on highest sub-index
    let primaryPollutant = 'PM2.5';
    if (currentMetrics.fields) {
      const entries = Object.entries(currentMetrics.fields).filter(
        ([, f]) => f && typeof f.subIndex === 'number' && Number.isFinite(f.subIndex)
      );
      if (entries.length > 0) {
        entries.sort((a, b) => (b[1].subIndex ?? 0) - (a[1].subIndex ?? 0));
        const topField = entries[0][0];
        primaryPollutant =
          topField === 'o3'
            ? 'Ozone'
            : topField === 'no2'
            ? 'NO2'
            : topField === 'so2'
            ? 'SO2'
            : topField === 'co'
            ? 'CO'
            : topField === 'pm10'
            ? 'PM10'
            : 'PM2.5';
      }
    }

    // Strict scientific separation: CPCB standard must NEVER fall back to EPA AQI
    const activeAqi = standard === 'cpcb' ? cpcbAqi : usAqi;
    const cat = standard === 'cpcb' ? getCpcbCategory(activeAqi) : getEpaCategory(activeAqi);

    const activePoint: GeographicObservationPoint = {
      id: `current-${currentLocation.id || currentLocation.name}`,
      name: currentLocation.name,
      admin1: currentLocation.admin1,
      country: currentLocation.country || 'India',
      countryCode: currentLocation.countryCode || 'IN',
      region: 'Asia',
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
      aqi: activeAqi,
      cpcbAqi,
      usAqi,
      pm25,
      pm10,
      category: cat.category,
      categoryLabel: cat.label,
      categoryColor: cat.color,
      primaryPollutant,
      provenance: currentMetrics.provenance,
      source: currentMetrics.isLive ? 'Live Atmospheric Feed' : 'Cached Observation',
      timestamp: currentMetrics.timestamp,
      isOfficialGround: false,
    };

    points.push(activePoint);
    processedKeys.add(`${currentLocation.name.toLowerCase()}-${currentLocation.countryCode?.toLowerCase() || 'in'}`);
  }

  // 2. Add World Metros with live observation if present in worldCities cohort
  const worldMap = new Map<string, WorldCityItem>();
  if (worldCities && Array.isArray(worldCities)) {
    for (const wc of worldCities) {
      worldMap.set(wc.name.toLowerCase(), wc);
    }
  }

  for (const metro of WORLD_METROS) {
    const cCode = metro.countryCode || 'UN';
    const key = `${metro.name.toLowerCase()}-${cCode.toLowerCase()}`;
    if (processedKeys.has(key)) continue;

    const liveData = worldMap.get(metro.name.toLowerCase());
    const usAqi = liveData ? liveData.usAqi : null;
    const pm25 = liveData ? liveData.pm25 : null;
    const pm10 = liveData && liveData.pm10 !== undefined ? liveData.pm10 : null;

    let cpcbAqi: number | null = null;
    if (pm25 !== null || pm10 !== null) {
      const pollutants: { pm25?: number; pm10?: number } = {};
      if (pm25 !== null) pollutants.pm25 = pm25;
      if (pm10 !== null) pollutants.pm10 = pm10;
      const cpcbRes = calculateComprehensiveCpcbNaqi(pollutants);
      if (cpcbRes.aqi !== null) {
        cpcbAqi = cpcbRes.aqi;
      }
    }

    // Strict scientific separation: CPCB standard must NEVER fall back to EPA AQI
    const activeAqi = standard === 'cpcb' ? cpcbAqi : usAqi;
    const cat = standard === 'cpcb' ? getCpcbCategory(activeAqi) : getEpaCategory(activeAqi);

    const isLiveFresh = liveData && liveData.status === 'available';

    points.push({
      id: `metro-${metro.id}`,
      cityId: metro.cityId,
      name: metro.name,
      country: metro.country,
      countryCode: cCode,
      region: metro.region,
      latitude: metro.latitude,
      longitude: metro.longitude,
      aqi: activeAqi,
      cpcbAqi,
      usAqi,
      pm25,
      pm10,
      category: cat.category,
      categoryLabel: cat.label,
      categoryColor: cat.color,
      primaryPollutant: 'PM2.5',
      provenance: liveData ? (isLiveFresh ? 'modeled_forecast' : 'unavailable') : 'unavailable',
      source: liveData ? 'Open-Meteo Global Air Quality' : 'Registry Only',
      timestamp: liveData?.modelValidAt || '',
      isOfficialGround: false,
    });

    processedKeys.add(key);
  }

  // 3. Add Predefined Indian Cities not yet added
  for (const indianCity of PREDEFINED_INDIAN_CITIES) {
    const key = `${indianCity.name.toLowerCase()}-${indianCity.countryCode?.toLowerCase() || 'in'}`;
    if (processedKeys.has(key)) continue;

    points.push({
      id: `in-${indianCity.id}`,
      name: indianCity.name,
      admin1: indianCity.admin1,
      country: indianCity.country,
      countryCode: indianCity.countryCode || 'IN',
      region: 'Asia',
      latitude: indianCity.latitude,
      longitude: indianCity.longitude,
      aqi: null,
      cpcbAqi: null,
      usAqi: null,
      pm25: null,
      pm10: null,
      category: 'unavailable',
      categoryLabel: 'Awaiting Observation',
      categoryColor: '#64748B',
      primaryPollutant: 'PM2.5',
      provenance: 'unavailable',
      source: 'National Clean Air Programme Registry',
      timestamp: '',
      isOfficialGround: false,
    });

    processedKeys.add(key);
  }

  return points;
}
