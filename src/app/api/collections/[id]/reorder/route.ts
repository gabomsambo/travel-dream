import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { reorderPlacesInCollection } from '@/lib/db-mutations';
import { getOwnedPlaceIds } from '@/lib/db-queries';
import { NotFoundError } from '@/lib/db-utils';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';

const ReorderPlacesSchema = z.object({
  placeIds: z.array(z.string())
    .min(1, 'At least one place ID is required')
    .max(500, 'Cannot reorder more than 500 places at once'),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthForApi();
    const { id: collectionId } = await params;
    const body = await request.json();
    const { placeIds } = ReorderPlacesSchema.parse(body);

    // Reordering only touches membership rows that exist, so a foreign id
    // would otherwise fall through as a silent no-op.
    const owned = await getOwnedPlaceIds(placeIds, user.id);
    if (owned.size !== new Set(placeIds).size) {
      return NextResponse.json(
        { status: 'error', message: 'Place not found' },
        { status: 404 }
      );
    }

    await reorderPlacesInCollection(collectionId, placeIds, user.id);

    return NextResponse.json({
      status: 'success',
      message: 'Places reordered successfully',
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
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        { status: 'error', message: 'Collection not found' },
        { status: 404 }
      );
    }

    console.error('Error reordering places:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to reorder places',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
