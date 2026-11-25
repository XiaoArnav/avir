import { NextRequest, NextResponse } from 'next/server';
import { fetchGlobalWindBinaryByCycle } from '@/services/environment/global-wind-service';
import type { GlobalWindModelId, GlobalWindOverlayKind } from '@/domain/wind-types';

const VALID_MODELS = new Set<GlobalWindModelId>(['gfs', 'ifs']);
const VALID_OVERLAYS = new Set<GlobalWindOverlayKind>(['none', 'temperature', 'pressure']);
const STRICT_DATE_RE = /^\d{8}$/;
const VALID_CYCLE_HOURS = new Set([0, 6, 12, 18]);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const model = (searchParams.get('model') || 'gfs').toLowerCase() as GlobalWindModelId;
    const overlay = (searchParams.get('overlay') || 'none').toLowerCase() as GlobalWindOverlayKind;
    const date = searchParams.get('date') || '';
    const hourRaw = searchParams.get('hour');
    const stepRaw = searchParams.get('step');

    if (!VALID_MODELS.has(model)) {
      return NextResponse.json({ error: 'Invalid wind model.' }, { status: 400 });
    }
    if (!VALID_OVERLAYS.has(overlay)) {
      return NextResponse.json({ error: 'Invalid wind grid overlay.' }, { status: 400 });
    }
    if (!STRICT_DATE_RE.test(date)) {
      return NextResponse.json({ error: 'Invalid forecast cycle date.' }, { status: 400 });
    }
    const hour = hourRaw !== null && /^\d{1,2}$/.test(hourRaw) ? Number(hourRaw) : Number.NaN;
    if (!VALID_CYCLE_HOURS.has(hour)) {
      return NextResponse.json({ error: 'Invalid synoptic cycle hour (expected 0, 6, 12, 18).' }, { status: 400 });
    }
    const step = stepRaw !== null && /^\d{1,3}$/.test(stepRaw) ? Number(stepRaw) : Number.NaN;
    if (!Number.isInteger(step) || step < 0 || step > 384) {
      return NextResponse.json({ error: 'Invalid forecast step hour.' }, { status: 400 });
    }

    const { bytes, manifest } = await fetchGlobalWindBinaryByCycle({
      model,
      overlay,
      date,
      hour,
      forecastHour: step,
      signal: req.signal,
    });

    const arrayBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
        'X-Wind-Model': manifest.model,
        'X-Wind-Grid-Width': String(manifest.grid.width),
        'X-Wind-Grid-Height': String(manifest.grid.height),
        'X-Wind-Valid-Time': manifest.validTimeUtc ?? '',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected grid error';
    const isNotFound = message.startsWith('HTTP_404');
    return NextResponse.json(
      { error: isNotFound ? 'Requested wind cycle grid not found upstream.' : 'Failed to extract global wind binary grid.' },
      { status: isNotFound ? 404 : 502 }
    );
  }
}
