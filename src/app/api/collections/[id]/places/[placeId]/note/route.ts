import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { updatePlaceNote } from '@/lib/db-mutations';

const UpdateNoteSchema = z.object({
  note: z.string().max(1000).nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; placeId: string }> }
) {
  try {
    const { id, placeId } = await params;
    const body = await request.json();
    const { note } = UpdateNoteSchema.parse(body);

    await updatePlaceNote(id, placeId, note);

    return NextResponse.json({
      status: 'success',
    });
  } catch (error) {
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
