import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPlaceWithRelations } from '@/lib/db-queries';
import { updatePlace } from '@/lib/db-mutations';
import { PLACE_KINDS } from '@/types/database';

const PlaceUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  kind: z.enum(PLACE_KINDS).optional(),
  description: z.string().max(1000).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  country: z.string().length(2).nullable().optional(),
  admin: z.string().max(100).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  tags: z.array(z.string()).optional(),
  vibes: z.array(z.string()).optional(),
  price_level: z.string().max(50).nullable().optional(),
  best_time: z.string().max(100).nullable().optional(),
  activities: z.array(z.string()).optional(),
  cuisine: z.array(z.string()).optional(),
  amenities: z.array(z.string()).optional(),
  notes: z.string().max(2000).nullable().optional(),
  ratingSelf: z.number().min(0).max(5).nullable().optional(),
  status: z.enum(['inbox', 'library', 'archived']).optional(),

  // Enhanced fields
  website: z.string().url().nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  email: z.string().email().nullable().optional(),
  hours: z.record(z.string()).nullable().optional(),
  visitStatus: z.enum(['not_visited', 'visited', 'planned']).optional(),
  priority: z.number().min(0).max(5).optional(),
  lastVisited: z.string().nullable().optional(),
  plannedVisit: z.string().nullable().optional(),
  recommendedBy: z.string().max(200).nullable().optional(),
  companions: z.array(z.string()).optional(),
  practicalInfo: z.string().max(1000).nullable().optional(),

  // Additional missing fields
  altNames: z.array(z.string()).optional(),
  coords: z.object({
    lat: z.number(),
    lon: z.number(),
  }).nullable().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const placeWithRelations = await getPlaceWithRelations(id);

    if (!placeWithRelations) {
      return NextResponse.json(
        { status: 'error', message: 'Place not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(placeWithRelations);
  } catch (error) {
    console.error('Error fetching place:', error);
    return NextResponse.json(
      { status: 'error', message: 'Failed to fetch place' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const validation = PlaceUpdateSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Invalid request data',
          errors: validation.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        },
        { status: 400 }
      );
    }

    const updated = await updatePlace(id, validation.data);

    return NextResponse.json({
      status: 'success',
      place: updated,
      message: 'Place updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating place:', error);

    if (error.message?.includes('not found')) {
      return NextResponse.json(
        { status: 'error', message: 'Place not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { status: 'error', message: 'Failed to update place' },
      { status: 500 }
    );
  }
}
