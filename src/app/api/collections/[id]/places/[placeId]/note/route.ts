import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { updatePlaceNote } from '@/lib/db-mutations';
import { getPlaceById } from '@/lib/db-queries';
import { NotFoundError } from '@/lib/db-utils';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';

const UpdateNoteSchema = z.object({
  note: z.string().max(1000).nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; placeId: string }> }
) {
  try {
    const user = await requireAuthForApi();
    const { id, placeId } = await params;
    const body = await request.json();
    const { note } = UpdateNoteSchema.parse(body);

    // The note update matches on both ids, so a foreign place would
    // otherwise fall through as a silent no-op.
    const place = await getPlaceById(placeId, user.id);
    if (!place) {
      return NextResponse.json(
        { status: 'error', message: 'Place not found' },
        { status: 404 }
      );
    }

    await updatePlaceNote(id, placeId, note, user.id);

    return NextResponse.json({
      status: 'success',
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { status: 'error', errors: error.errors },
        { status: 400 }
      );
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        { status: 'error', message: 'Collection not found' },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { status: 'error', message: 'Failed to update note' },
      { status: 500 }
    );
  }
}
