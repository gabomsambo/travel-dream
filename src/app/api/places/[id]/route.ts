import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPlaceWithRelations } from '@/lib/db-queries';
import { updatePlace, deletePlace } from '@/lib/db-mutations';
import { PLACE_KINDS } from '@/types/database';

const emptyStringToNull = (maxLength?: number) => z.preprocess(
  (val) => val === '' ? null : val,
  maxLength
    ? z.string().max(maxLength).nullable().optional()
    : z.string().nullable().optional()
);

const urlOrEmpty = z.preprocess(
  (val) => val === '' ? null : val,
  z.string().max(500).nullable().optional()
);

const emailOrEmpty = z.preprocess(
  (val) => val === '' ? null : val,
  z.string().max(200).nullable().optional()
);

const PlaceUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  kind: z.enum(PLACE_KINDS).optional(),
  description: emptyStringToNull(1000),
  city: emptyStringToNull(100),
  country: emptyStringToNull(100),
  admin: emptyStringToNull(100),
  address: emptyStringToNull(500),
  tags: z.array(z.string()).optional(),
  vibes: z.array(z.string()).optional(),
  price_level: emptyStringToNull(50),
  best_time: emptyStringToNull(100),
  activities: z.array(z.string()).optional(),
  cuisine: z.array(z.string()).optional(),
  amenities: z.array(z.string()).optional(),
  notes: emptyStringToNull(2000),
  ratingSelf: z.number().min(0).max(5).nullable().optional(),
  status: z.enum(['inbox', 'library', 'archived']).optional(),

  // Enhanced fields
  website: urlOrEmpty,
  phone: emptyStringToNull(50),
  email: emailOrEmpty,
  hours: z.record(z.string()).nullable().optional(),
  visitStatus: z.enum(['not_visited', 'visited', 'planned']).optional(),
  priority: z.number().min(0).max(5).optional(),
  lastVisited: emptyStringToNull(),
  plannedVisit: emptyStringToNull(),
  recommendedBy: emptyStringToNull(200),
  companions: z.array(z.string()).optional(),
  practicalInfo: emptyStringToNull(1000),

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
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      cause: error.cause,
    });

    if (error.message?.includes('not found')) {
      return NextResponse.json(
        { status: 'error', message: 'Place not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to update place',
        debug: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deletePlace(id);

    return NextResponse.json({
      status: 'success',
      message: 'Place deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting place:', error);

    if (error.message?.includes('not found')) {
      return NextResponse.json(
        { status: 'error', message: 'Place not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to delete place',
        debug: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}
