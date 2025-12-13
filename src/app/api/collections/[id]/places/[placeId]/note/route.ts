import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { updatePlaceNote } from '@/lib/db-mutations';
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
    return NextResponse.json(
      { status: 'error', message: 'Failed to update note' },
      { status: 500 }
    );
  }
}
