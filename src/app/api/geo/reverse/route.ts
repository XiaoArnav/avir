import { NextRequest, NextResponse } from 'next/server';
import { PREDEFINED_INDIAN_CITIES } from '@/services/telemetry-service';
import { WORLD_METROS } from '@/services/world-telemetry-service';

interface CachedReverseGeo {
  timestamp: number;
  data: {
    id: number;
    name: string;
    admin1?: string;
    country: string;
    countryCode: string;
    latitude: number;
    longitude: number;
    source: string;
  };
}

const WORLD_METRO_COUNTRY_CODES: Record<string, string> = {
  tokyo: 'JP',
  london: 'GB',
  'new york': 'US',
  newyork: 'US',
  sydney: 'AU',
  paris: 'FR',
  berlin: 'DE',
  beijing: 'CN',
  singapore: 'SG',
  dubai: 'AE',
  bangkok: 'TH',
};

// In-memory cache for reverse geocoding with 24-hour TTL (preserves privacy and respects rate limits)
const reverseGeoCache = new Map<string, CachedReverseGeo>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function parseStrictFloat(val: string | null): number | null {
  if (!val) return null;
  const trimmed = val.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return null;
  }
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

// Haversine distance in kilometers
function getHaversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const latParam = searchParams.get('lat');
    const lonParam = searchParams.get('lon');

    if (latParam === null || lonParam === null) {
      return NextResponse.json(
        { error: 'Parameters "lat" and "lon" are required.', code: 'MISSING_COORDINATES' },
        { status: 400 }
      );
    }

    const latRaw = parseStrictFloat(latParam);
    const lonRaw = parseStrictFloat(lonParam);

    if (latRaw === null || latRaw < -90 || latRaw > 90) {
      return NextResponse.json(
        { error: 'Invalid latitude: must be between -90 and 90.', code: 'INVALID_LATITUDE' },
        { status: 400 }
      );
    }

    if (lonRaw === null || lonRaw < -180 || lonRaw > 180) {
      return NextResponse.json(
        { error: 'Invalid longitude: must be between -180 and 180.', code: 'INVALID_LONGITUDE' },
        { status: 400 }
      );
    }

    // Privacy-conscious coordinate resolution (~110m precision, hides house-level coordinates)
    const lat = Number(latRaw.toFixed(3));
    const lon = Number(lonRaw.toFixed(3));
    const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;

    const cached = reverseGeoCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json(cached.data, {
        headers: { 'Cache-Control': 'private, no-cache, no-store, must-revalidate' },
      });
    }

    // Deterministic ID derived from stable coordinates
    const latHash = Math.abs(Math.round(lat * 1000));
    const lonHash = Math.abs(Math.round(lon * 1000));
    const deterministicId = latHash * 10000 + (lonHash % 10000);

    let cityName = '';
    let admin1: string | undefined = undefined;
    let country = 'Unknown';
    let countryCode = '';
    let resolvedSource = 'nominatim';

    // Attempt upstream reverse geocoding via OpenStreetMap Nominatim with strict timeout
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const upstreamRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'AvirEnvironmentalPlatform/1.0 (https://github.com/XiaoArnav/avir)',
            'Accept': 'application/json',
          },
          signal: controller.signal,
        }
      );
      clearTimeout(timeoutId);

      if (upstreamRes.ok) {
        const json = await upstreamRes.json();
        const addr = json?.address;
        if (addr) {
          cityName =
            addr.city ||
            addr.town ||
            addr.municipality ||
            addr.village ||
            addr.county ||
            addr.state_district ||
            json.name ||
            '';
          admin1 = addr.state || addr.region;
          country = addr.country || country;
          countryCode = (addr.country_code || 'in').toUpperCase();
        }
      }
    } catch {
      // Upstream failed or timed out; will fall back to local spatial index
    }

    // Fallback: If Nominatim didn't return a city name, find nearest predefined metro (< 60 km)
    if (!cityName) {
      let nearestDist = 60; // Max search radius in km
      let nearestName = '';
      let nearestAdmin1: string | undefined = undefined;
      let nearestCountry = country;
      let nearestCountryCode = countryCode;

      // Check predefined Indian cities first
      for (const city of PREDEFINED_INDIAN_CITIES) {
        const d = getHaversineDistanceKm(lat, lon, city.latitude, city.longitude);
        if (d < nearestDist) {
          nearestDist = d;
          nearestName = city.name;
          nearestAdmin1 = city.admin1;
          nearestCountry = city.country;
          nearestCountryCode = city.countryCode || 'IN';
        }
      }

      // Check world metros if no Indian city within radius
      if (!nearestName) {
        for (const metro of WORLD_METROS) {
          const d = getHaversineDistanceKm(lat, lon, metro.latitude, metro.longitude);
          if (d < nearestDist) {
            nearestDist = d;
            nearestName = metro.name;
            nearestCountry = metro.country;
            nearestCountryCode = WORLD_METRO_COUNTRY_CODES[metro.name.toLowerCase()] || 'UN';
          }
        }
      }

      if (nearestName) {
        cityName = `Approx. near ${nearestName}`;
        admin1 = nearestAdmin1;
        country = nearestCountry;
        countryCode = nearestCountryCode;
        resolvedSource = 'spatial_index';
      } else {
        const latStr = lat >= 0 ? `${lat.toFixed(2)}°N` : `${Math.abs(lat).toFixed(2)}°S`;
        const lonStr = lon >= 0 ? `${lon.toFixed(2)}°E` : `${Math.abs(lon).toFixed(2)}°W`;
        cityName = `Near ${latStr}, ${lonStr}`;
        country = 'Unspecified Region';
        countryCode = 'UN';
        resolvedSource = 'coordinates_fallback';
      }
    }

    const payload = {
      id: deterministicId,
      name: cityName,
      admin1,
      country,
      countryCode,
      latitude: lat,
      longitude: lon,
      source: resolvedSource,
    };

    // Cache valid payload
    reverseGeoCache.set(cacheKey, {
      timestamp: Date.now(),
      data: payload,
    });

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'private, no-cache, no-store, must-revalidate' },
    });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error while resolving coordinates.', code: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
