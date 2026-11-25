import { NextRequest, NextResponse } from 'next/server';
import { fetchFirmsHotspots } from '@/services/environment/firms-service';
import { SlidingWindowRateLimiter, extractClientIp } from '@/lib/security/rate-limiter';

const STRICT_FLOAT_REGEX = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

// Dedicated quota-protection rate limiter for server-side FIRMS_MAP_KEY
const firmsApiRateLimiter = new SlidingWindowRateLimiter(30, 60_000);

function parseStrictFiniteFloat(raw: string | null): number | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (!STRICT_FLOAT_REGEX.test(trimmed)) return NaN;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : NaN;
}

export async function GET(req: NextRequest) {
  try {
    const clientIp = extractClientIp(req);
    const rateLimit = firmsApiRateLimiter.check(clientIp);
    if (!rateLimit.allowed) {
      const retryAfterSec = Math.max(1, Math.ceil(rateLimit.resetMs / 1000));
      return NextResponse.json(
        {
          error: 'Rate limit exceeded. Too many requests to active-fire telemetry.',
          code: 'RATE_LIMITED',
          retryAfterSeconds: retryAfterSec,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfterSec),
            'X-RateLimit-Limit': String(rateLimit.limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(retryAfterSec),
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    const { searchParams } = new URL(req.url);
    const latParam = searchParams.get('lat');
    const lngParam = searchParams.get('lng');
    const radiusParam = searchParams.get('radiusKm');

    if (latParam === null || lngParam === null || latParam.trim() === '' || lngParam.trim() === '') {
      return NextResponse.json(
        {
          error: 'Missing required geographic coordinates: both lat and lng parameters are required.',
          code: 'MISSING_COORDINATES',
        },
        { status: 400 }
      );
    }

    const lat = parseStrictFiniteFloat(latParam);
    if (lat === null || !Number.isFinite(lat) || lat < -90 || lat > 90) {
      return NextResponse.json(
        { error: 'Invalid latitude. Must be a strict finite number between -90 and 90.' },
        { status: 400 }
      );
    }

    const lng = parseStrictFiniteFloat(lngParam);
    if (lng === null || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      return NextResponse.json(
        { error: 'Invalid longitude. Must be a strict finite number between -180 and 180.' },
        { status: 400 }
      );
    }

    const parsedRadius = parseStrictFiniteFloat(radiusParam);
    const radiusKm = parsedRadius !== null ? parsedRadius : 500;
    if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 1000) {
      return NextResponse.json(
        { error: 'Invalid radiusKm. Must be a strict finite number between 1 and 1000.' },
        { status: 400 }
      );
    }

    const firmsResponse = await fetchFirmsHotspots({
      latitude: lat,
      longitude: lng,
      radiusKm,
    });

    const cacheControl =
      firmsResponse.status === 'active' || firmsResponse.status === 'no_detections'
        ? 'public, s-maxage=900, stale-while-revalidate=1800'
        : firmsResponse.status === 'stale_cached'
          ? 'public, max-age=60, must-revalidate'
          : 'no-store';

    return NextResponse.json(firmsResponse, {
      status: 200,
      headers: {
        'Cache-Control': cacheControl,
      },
    });
  } catch (err) {
    console.error('Fires API route error:', err instanceof Error ? err.message : 'Unexpected error');
    return NextResponse.json(
      { error: 'Internal server error while retrieving NASA FIRMS active fire telemetry' },
      { status: 500 }
    );
  }
}
