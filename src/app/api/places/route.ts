import { NextRequest, NextResponse } from 'next/server';
import { searchPlaces } from '@/lib/db-queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const searchQuery = searchParams.get('search') || undefined;
    const status = searchParams.get('status') || undefined;
    const city = searchParams.get('city') || undefined;
    const country = searchParams.get('country') || undefined;
    const kind = searchParams.get('kind') || undefined;
    const tags = searchParams.get('tags')?.split(',').filter(Boolean) || undefined;
    const vibes = searchParams.get('vibes')?.split(',').filter(Boolean) || undefined;
    const minRating = searchParams.get('minRating')
      ? Number(searchParams.get('minRating'))
      : undefined;
    const hasCoords = searchParams.get('hasCoords') === 'true' ? true : undefined;
    const limit = searchParams.get('limit')
      ? Number(searchParams.get('limit'))
      : undefined;

    const places = await searchPlaces({
      text: searchQuery,
      status,
      city,
      country,
      kind,
      tags,
      vibes,
      minRating,
      hasCoords,
      limit,
    });

    return NextResponse.json({
      places,
      count: places.length,
    });
  } catch (error) {
    console.error('Error fetching places:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch places',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
