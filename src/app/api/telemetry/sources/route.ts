import { NextRequest, NextResponse } from 'next/server';
import {
  fetchOpenAqProviderResult,
} from '@/services/providers/openaq-provider';
import {
  OPENAQ_MIN_RADIUS_KM,
  OPENAQ_DEFAULT_RADIUS_KM,
  OPENAQ_MAX_RADIUS_KM,
} from '@/config/environmental-sources';

/**
 * Strict floating point parser.
 * Rejects non-numeric suffixes (e.g. "25abc"), whitespace-separated tokens, NaN, and Infinity.
 */
function parseStrictFloat(val: string | null): number | null {
  if (!val) return null;
  const trimmed = val.trim();
  // Validates standard floating point string: optional minus, digits, optional decimal point with digits
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return null;
  }
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const latParam = searchParams.get('lat');
    const lonParam = searchParams.get('lon');
    const radiusParam = searchParams.get('radius');

    if (latParam === null || lonParam === null) {
      return NextResponse.json(
        { error: 'Missing required query parameters: "lat" and "lon" are required.' },
        { status: 400 }
      );
    }

    const lat = parseStrictFloat(latParam);
    const lon = parseStrictFloat(lonParam);

    // Strict boundary and numeric validation
    if (lat === null || lat < -90 || lat > 90) {
      return NextResponse.json(
        { error: 'Invalid latitude: must be a strict numeric value between -90 and 90.' },
        { status: 400 }
      );
    }

    if (lon === null || lon < -180 || lon > 180) {
      return NextResponse.json(
        { error: 'Invalid longitude: must be a strict numeric value between -180 and 180.' },
        { status: 400 }
      );
    }

    let radius = OPENAQ_DEFAULT_RADIUS_KM;
    if (radiusParam !== null) {
      const parsedRadius = parseStrictFloat(radiusParam);
      if (
        parsedRadius === null ||
        parsedRadius < OPENAQ_MIN_RADIUS_KM ||
        parsedRadius > OPENAQ_MAX_RADIUS_KM
      ) {
        return NextResponse.json(
          {
            error: `Invalid radius: must be a strict numeric value between ${OPENAQ_MIN_RADIUS_KM} and ${OPENAQ_MAX_RADIUS_KM} kilometers (OpenAQ API v3 maximum supported search radius is ${OPENAQ_MAX_RADIUS_KM} km).`,
          },
          { status: 400 }
        );
      }
      radius = parsedRadius;
    }

    // Call server-side OpenAQ provider
    const providerResult = await fetchOpenAqProviderResult({
      latitude: lat,
      longitude: lon,
      radiusKm: radius,
    });

    const response = NextResponse.json({
      provider: providerResult.provider,
      status: providerResult.status,
      sources: providerResult.sources,
      retrievedAt: providerResult.retrievedAt,
      count: providerResult.count,
      activeCount: providerResult.activeCount,
      activePm25Count: providerResult.activePm25Count,
      activePm10Count: providerResult.activePm10Count,
      availableStationCount: providerResult.availableStationCount,
      errorCode: providerResult.errorCode,
    });

    // Cache-Control headers: 5 min edge cache, 10 min stale-while-revalidate
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return response;
  } catch {
    // Sanitize 500 responses: never expose internal stack traces or secrets
    return NextResponse.json(
      { error: 'Internal server error while resolving environmental sources.' },
      { status: 500 }
    );
  }
}
