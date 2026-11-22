import { NextRequest, NextResponse } from 'next/server';
import {
  fetchOpenAqSources,
  OPENAQ_MIN_RADIUS_KM,
  OPENAQ_MAX_RADIUS_KM,
} from '@/services/providers/openaq-provider';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const latParam = searchParams.get('lat');
    const lonParam = searchParams.get('lon');
    const radiusParam = searchParams.get('radius');

    if (!latParam || !lonParam) {
      return NextResponse.json(
        { error: 'Missing required query parameters: "lat" and "lon" are required.' },
        { status: 400 }
      );
    }

    const lat = parseFloat(latParam);
    const lon = parseFloat(lonParam);
    const radius = radiusParam ? parseFloat(radiusParam) : OPENAQ_MAX_RADIUS_KM;

    // Strict boundary and numeric validation
    if (isNaN(lat) || !Number.isFinite(lat) || lat < -90 || lat > 90) {
      return NextResponse.json(
        { error: 'Invalid latitude: must be a finite number between -90 and 90.' },
        { status: 400 }
      );
    }

    if (isNaN(lon) || !Number.isFinite(lon) || lon < -180 || lon > 180) {
      return NextResponse.json(
        { error: 'Invalid longitude: must be a finite number between -180 and 180.' },
        { status: 400 }
      );
    }

    if (
      isNaN(radius) ||
      !Number.isFinite(radius) ||
      radius < OPENAQ_MIN_RADIUS_KM ||
      radius > OPENAQ_MAX_RADIUS_KM
    ) {
      return NextResponse.json(
        {
          error: `Invalid radius: must be a finite number between ${OPENAQ_MIN_RADIUS_KM} and ${OPENAQ_MAX_RADIUS_KM} kilometers (OpenAQ API v3 maximum supported search radius is 25 km).`,
        },
        { status: 400 }
      );
    }

    // Call server-side OpenAQ provider
    const sources = await fetchOpenAqSources({
      latitude: lat,
      longitude: lon,
      radiusKm: radius,
    });

    const response = NextResponse.json({
      sources,
      retrievedAt: new Date().toISOString(),
      count: sources.length,
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
