import { NextRequest, NextResponse } from 'next/server';
import { fetchFirmsHotspots } from '@/services/environment/firms-service';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const latParam = searchParams.get('lat');
    const lngParam = searchParams.get('lng');
    const radiusParam = searchParams.get('radiusKm');

    const lat = latParam ? parseFloat(latParam) : 12.9716;
    const lng = lngParam ? parseFloat(lngParam) : 77.5946;
    const radiusKm = radiusParam ? parseFloat(radiusParam) : 500;

    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      return NextResponse.json(
        { error: 'Invalid latitude. Must be a finite number between -90 and 90.' },
        { status: 400 }
      );
    }

    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      return NextResponse.json(
        { error: 'Invalid longitude. Must be a finite number between -180 and 180.' },
        { status: 400 }
      );
    }

    if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 1000) {
      return NextResponse.json(
        { error: 'Invalid radiusKm. Must be a finite number between 1 and 1000.' },
        { status: 400 }
      );
    }

    const firmsResponse = await fetchFirmsHotspots({
      latitude: lat,
      longitude: lng,
      radiusKm,
    });

    return NextResponse.json(firmsResponse, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800',
      },
    });
  } catch (err: any) {
    console.error('Fires API route error:', err);
    return NextResponse.json(
      { error: 'Internal server error while retrieving NASA FIRMS active fire telemetry' },
      { status: 500 }
    );
  }
}
