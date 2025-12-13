import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { updateCollectionTransportMode } from '@/lib/db-mutations';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';

const UpdateSettingsSchema = z.object({
  transportMode: z.enum(['drive', 'walk']),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthForApi();
    const { id } = await params;
    const body = await request.json();
    const { transportMode } = UpdateSettingsSchema.parse(body);

    const updated = await updateCollectionTransportMode(id, transportMode, user.id);

    return NextResponse.json({
      status: 'success',
      collection: updated,
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
      { status: 'error', message: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
