import { NextRequest, NextResponse } from 'next/server';
import {
  fetchCpcbProviderResult,
  CPCB_DEFAULT_SEARCH_RADIUS_KM,
  CPCB_MAX_SEARCH_RADIUS_KM,
} from '@/services/providers/cpcb-provider';

/**
 * Strict floating point parser.
 * Rejects non-numeric suffixes (e.g. "25abc"), whitespace-separated tokens, NaN, and Infinity.
 */
function parseStrictFloat(val: string | null): number | null {
  if (!val) return null;
  const trimmed = val.trim();
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
    const cityParam = searchParams.get('city');
    const stateParam = searchParams.get('state');

    let lat: number | undefined = undefined;
    let lon: number | undefined = undefined;

    if (latParam !== null || lonParam !== null) {
      if (latParam === null || lonParam === null) {
        return NextResponse.json(
          { error: 'Both "lat" and "lon" query parameters must be provided together.' },
          { status: 400 }
        );
      }

      const parsedLat = parseStrictFloat(latParam);
      const parsedLon = parseStrictFloat(lonParam);

      if (parsedLat === null || parsedLat < -90 || parsedLat > 90) {
        return NextResponse.json(
          { error: 'Invalid latitude: must be a strict numeric value between -90 and 90.' },
          { status: 400 }
        );
      }

      if (parsedLon === null || parsedLon < -180 || parsedLon > 180) {
        return NextResponse.json(
          { error: 'Invalid longitude: must be a strict numeric value between -180 and 180.' },
          { status: 400 }
        );
      }

      lat = parsedLat;
      lon = parsedLon;
    }

    let radius = CPCB_DEFAULT_SEARCH_RADIUS_KM;
    if (radiusParam !== null) {
      const parsedRadius = parseStrictFloat(radiusParam);
      if (
        parsedRadius === null ||
        parsedRadius < 1 ||
        parsedRadius > CPCB_MAX_SEARCH_RADIUS_KM
      ) {
        return NextResponse.json(
          {
            error: `Invalid radius: must be a strict numeric value between 1 and ${CPCB_MAX_SEARCH_RADIUS_KM} kilometers.`,
          },
          { status: 400 }
        );
      }
      radius = parsedRadius;
    }

    // Call server-side CPCB provider adapter
    const providerResult = await fetchCpcbProviderResult({
      latitude: lat,
      longitude: lon,
      radiusKm: radius,
      city: cityParam ? cityParam.trim() : undefined,
      state: stateParam ? stateParam.trim() : undefined,
    });

    const response = NextResponse.json({
      provider: providerResult.providerId,
      status: providerResult.status,
      sources: providerResult.sources,
      retrievedAt: providerResult.retrievedAt,
      observedThrough: providerResult.observedThrough,
      count: providerResult.sources.length,
      activeStationCount: providerResult.activeStationCount,
      activePm25Count: providerResult.activePm25Count,
      activePm10Count: providerResult.activePm10Count,
      availableStationCount: providerResult.availableStationCount,
      errorCode: providerResult.errorCode || null,
      errorMessage: providerResult.errorMessage || null,
    });

    // Cache-Control headers: 5 min edge cache, 10 min stale-while-revalidate
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return response;
  } catch {
    // Sanitized error response: never expose secrets or stack traces
    return NextResponse.json(
      {
        provider: 'cpcb',
        status: 'unavailable',
        sources: [],
        retrievedAt: new Date().toISOString(),
        observedThrough: null,
        count: 0,
        activeStationCount: 0,
        activePm25Count: 0,
        activePm10Count: 0,
        availableStationCount: 0,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: 'An internal error occurred while processing CPCB telemetry.',
      },
      { status: 500 }
    );
  }
}
