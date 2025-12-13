import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCollectionWithPlaces } from '@/lib/db-queries';
import { updateCollection, deleteCollection } from '@/lib/db-mutations';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';

const UpdateCollectionSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Name must be less than 200 characters').optional(),
  description: z.string().max(1000, 'Description must be less than 1000 characters').nullable().optional(),
  filters: z.object({
    city: z.string().optional(),
    country: z.string().optional(),
    tags: z.array(z.string()).optional(),
    kinds: z.array(z.string()).optional(),
    vibes: z.array(z.string()).optional(),
    status: z.string().optional(),
    minRating: z.number().optional(),
    hasCoords: z.boolean().optional(),
  }).nullable().optional(),
  coverImageUrl: z.string().nullable().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthForApi();
    const { id } = await params;
    const collection = await getCollectionWithPlaces(id, user.id);

    if (!collection) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Collection not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: 'success',
      collection,
      message: 'Collection retrieved successfully',
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('Error fetching collection:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to fetch collection',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthForApi();
    const { id } = await params;
    const body = await request.json();
    const validatedData = UpdateCollectionSchema.parse(body);

    const updatedCollection = await updateCollection(id, validatedData, user.id);

    if (!updatedCollection) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Collection not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: 'success',
      collection: updatedCollection,
      message: 'Collection updated successfully',
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Validation failed',
          errors: error.errors,
        },
        { status: 400 }
      );
    }

    console.error('Error updating collection:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to update collection',
        error: error instanceof Error ? error.message : 'Unknown error',
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
    const user = await requireAuthForApi();
    const { id } = await params;

    await deleteCollection(id, user.id);

    return NextResponse.json({
      status: 'success',
      message: 'Collection deleted successfully',
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('Error deleting collection:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to delete collection',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
