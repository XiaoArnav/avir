import { NextRequest, NextResponse } from 'next/server';
import { fetchWindForecast } from '@/services/environment/wind-service';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const latParam = searchParams.get('lat');
    const lngParam = searchParams.get('lng');
    const hourParam = searchParams.get('hour');

    const lat = latParam ? parseFloat(latParam) : 12.9716;
    const lng = lngParam ? parseFloat(lngParam) : 77.5946;
    const hour = hourParam ? parseInt(hourParam, 10) : 12;

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

    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      return NextResponse.json(
        { error: 'Invalid hour. Must be an integer between 0 and 23.' },
        { status: 400 }
      );
    }

    const windData = await fetchWindForecast({
      latitude: lat,
      longitude: lng,
      hour,
    });

    return NextResponse.json(windData, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800',
      },
    });
  } catch (err: any) {
    console.error('Wind API route error:', err);
    return NextResponse.json(
      { error: 'Internal server error while fetching atmospheric wind forecast' },
      { status: 500 }
    );
  }
}
