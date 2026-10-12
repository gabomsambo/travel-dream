import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { deleteSavedView, updateSavedView } from '@/lib/library/store';
import { SavedViewName, SavedViewQuery } from '@/lib/library/view-schema';

const PatchSchema = z
  .object({ name: SavedViewName.optional(), query: SavedViewQuery.optional() })
  .refine((v) => v.name !== undefined || v.query !== undefined, 'Nothing to change');

/** Rename a saved view, or point it at the page's current query. Someone else's view is a 404. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthForApi();
    const { id } = await params;
    const patch = PatchSchema.parse(await request.json());
    const view = await updateSavedView(user.id, id, patch);
    if (!view) return NextResponse.json({ status: 'error', message: 'Saved view not found' }, { status: 404 });
    return NextResponse.json({ status: 'success', view });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ status: 'error', message: error.errors[0]?.message ?? 'Invalid request' }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ status: 'error', message: 'Invalid request' }, { status: 400 });
    }
    console.error('Error updating a saved view:', error);
    return NextResponse.json({ status: 'error', message: 'Failed to update the view' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthForApi();
    const { id } = await params;
    if (!(await deleteSavedView(user.id, id))) {
      return NextResponse.json({ status: 'error', message: 'Saved view not found' }, { status: 404 });
    }
    return NextResponse.json({ status: 'success' });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('Error deleting a saved view:', error);
    return NextResponse.json({ status: 'error', message: 'Failed to delete the view' }, { status: 500 });
  }
}
