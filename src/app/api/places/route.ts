import { NextRequest, NextResponse } from 'next/server';
import { searchPlaces } from '@/lib/db-queries';
import { createPlace } from '@/lib/db-mutations';
import { z } from 'zod';
import { PLACE_KINDS, PLACE_STATUSES } from '@/types/database';

export const dynamic = 'force-dynamic';

const CreatePlaceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  kind: z.enum(PLACE_KINDS),
  status: z.enum(PLACE_STATUSES).default('library'),
  description: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  admin: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  googlePlaceId: z.string().nullable().optional(),
  coords: z.object({
    lat: z.number(),
    lon: z.number()
  }).nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  vibes: z.array(z.string()).nullable().optional(),
  activities: z.array(z.string()).nullable().optional(),
  cuisine: z.array(z.string()).nullable().optional(),
  amenities: z.array(z.string()).nullable().optional(),
  website: z.string().url().nullable().optional().or(z.literal('')).or(z.null()),
  phone: z.string().nullable().optional(),
  hours: z.string().nullable().optional(),
  price_level: z.string().nullable().optional(),
  best_time: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  confidence: z.number().default(1.0),
});

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = CreatePlaceSchema.parse(body);

    const placeData = {
      name: validated.name,
      kind: validated.kind,
      status: validated.status,
      description: validated.description || null,
      city: validated.city || null,
      country: validated.country || null,
      admin: validated.admin || null,
      address: validated.address || null,
      googlePlaceId: validated.googlePlaceId || null,
      coords: validated.coords || null,
      tags: validated.tags || null,
      vibes: validated.vibes || null,
      activities: validated.activities || null,
      cuisine: validated.cuisine || null,
      amenities: validated.amenities || null,
      website: validated.website || null,
      phone: validated.phone || null,
      price_level: validated.price_level || null,
      best_time: validated.best_time || null,
      notes: validated.notes || null,
      confidence: validated.confidence,
    };

    const place = await createPlace(placeData);

    return NextResponse.json(place, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Failed to create place:', error);
    return NextResponse.json(
      { error: 'Failed to create place' },
      { status: 500 }
    );
  }
}
