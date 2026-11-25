import { NextRequest, NextResponse } from 'next/server';
import { fetchWindForecast } from '@/services/environment/wind-service';

const STRICT_FLOAT_REGEX = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
const STRICT_INT_REGEX = /^\d{1,2}$/;

function parseStrictFiniteFloat(raw: string | null): number | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (!STRICT_FLOAT_REGEX.test(trimmed)) return NaN;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function parseStrictInt(raw: string | null): number | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (!STRICT_INT_REGEX.test(trimmed)) return NaN;
  return Number(trimmed);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const latParam = searchParams.get('lat');
    const lngParam = searchParams.get('lng');
    const hourParam = searchParams.get('hour');
    const validTimeParam = searchParams.get('validTimeUtc');

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

    const parsedHour = parseStrictInt(hourParam);
    if (parsedHour !== null && (!Number.isInteger(parsedHour) || parsedHour < 0 || parsedHour > 23)) {
      return NextResponse.json(
        { error: 'Invalid hour. Must be a strict integer UTC hour between 0 and 23.' },
        { status: 400 }
      );
    }

    let validatedUtcIso: string | undefined = undefined;
    if (validTimeParam !== null) {
      const trimmedTime = validTimeParam.trim();
      const parsedEpoch = Date.parse(trimmedTime);
      if (
        trimmedTime.length === 0 ||
        !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmedTime) ||
        Number.isNaN(parsedEpoch)
      ) {
        return NextResponse.json(
          { error: 'Invalid validTimeUtc. Must be a valid ISO-8601 UTC timestamp.' },
          { status: 400 }
        );
      }
      validatedUtcIso = new Date(parsedEpoch).toISOString();
    }

    const resolvedHour =
      parsedHour !== null
        ? parsedHour
        : validatedUtcIso
          ? new Date(validatedUtcIso).getUTCHours()
          : new Date().getUTCHours();

    const windData = await fetchWindForecast({
      latitude: lat,
      longitude: lng,
      hour: resolvedHour,
      targetValidTimeUtc: validatedUtcIso,
    });

    const cacheControl =
      windData.status === 'available' || windData.status === 'partial'
        ? 'public, s-maxage=900, stale-while-revalidate=1800'
        : windData.status === 'stale_cached'
          ? 'public, max-age=60, must-revalidate'
          : 'no-store';

    return NextResponse.json(windData, {
      status: 200,
      headers: {
        'Cache-Control': cacheControl,
      },
    });
  } catch (err) {
    console.error('Wind API route error:', err instanceof Error ? err.message : 'Unexpected error');
    return NextResponse.json(
      { error: 'Internal server error while fetching atmospheric wind forecast' },
      { status: 500 }
    );
  }
}
