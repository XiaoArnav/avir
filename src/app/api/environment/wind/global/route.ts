import { NextRequest, NextResponse } from 'next/server';
import { fetchGlobalWindSnapshot } from '@/services/environment/global-wind-service';
import type { GlobalWindModelId, GlobalWindOverlayKind } from '@/domain/wind-types';

const VALID_MODELS = new Set<GlobalWindModelId>(['gfs', 'ifs']);
const VALID_OVERLAYS = new Set<GlobalWindOverlayKind>([
  'none',
  'speed',
  'temperature',
  'pressure',
]);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const modelParam = (searchParams.get('model') || 'gfs').toLowerCase() as GlobalWindModelId;
    const overlayParam = (
      searchParams.get('overlay') || 'none'
    ).toLowerCase() as GlobalWindOverlayKind;
    const validTimeParam = searchParams.get('validTimeUtc');

    if (!VALID_MODELS.has(modelParam)) {
      return NextResponse.json(
        { error: 'Unknown wind forecast model. Supported models: gfs, ifs.' },
        { status: 400 }
      );
    }

    if (!VALID_OVERLAYS.has(overlayParam)) {
      return NextResponse.json(
        { error: 'Unknown wind overlay. Supported values: none, speed, temperature, pressure.' },
        { status: 400 }
      );
    }

    let validatedUtcIso: string | undefined;
    if (validTimeParam !== null) {
      const trimmed = validTimeParam.trim();
      const parsedEpoch = Date.parse(trimmed);
      if (
        trimmed.length === 0 ||
        !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed) ||
        Number.isNaN(parsedEpoch)
      ) {
        return NextResponse.json(
          { error: 'Invalid validTimeUtc. Must be a valid ISO-8601 UTC timestamp.' },
          { status: 400 }
        );
      }
      validatedUtcIso = new Date(parsedEpoch).toISOString();
    }

    const snapshot = await fetchGlobalWindSnapshot({
      model: modelParam,
      overlay: overlayParam,
      targetValidTimeUtc: validatedUtcIso,
      signal: req.signal,
    });

    const manifest = snapshot.manifest;
    const cacheControl =
      manifest.status === 'available' || manifest.status === 'partial'
        ? 'public, s-maxage=900, stale-while-revalidate=1800'
        : manifest.status === 'stale_cached'
          ? 'public, max-age=60, must-revalidate'
          : 'no-store';

    return NextResponse.json(manifest, {
      status: 200,
      headers: {
        'Cache-Control': cacheControl,
      },
    });
  } catch (err) {
    console.error(
      'Global wind manifest route error:',
      err instanceof Error ? err.message : 'Unexpected error'
    );
    return NextResponse.json(
      { error: 'Internal server error while preparing global atmospheric wind manifest.' },
      { status: 500 }
    );
  }
}
