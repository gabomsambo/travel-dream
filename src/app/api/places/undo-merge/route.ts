import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { undoMerge } from '@/lib/db-mutations';
import { ConflictError, NotFoundError } from '@/lib/db-utils';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { clearDuplicateScanCache } from '@/lib/duplicate-scan-cache';

export const runtime = 'nodejs';

const UndoMergeSchema = z.object({
  /** The kept place of the merge. Its newest merge is the one undone. */
  placeId: z.string().min(1),
  /** Optional: must name that newest merge, or the request is refused. */
  mergeLogId: z.string().min(1).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthForApi();
    const validation = UndoMergeSchema.safeParse(await request.json().catch(() => null));
    if (!validation.success) {
      return NextResponse.json({ status: 'error', message: 'Invalid request data' }, { status: 400 });
    }

    const { placeId, mergeLogId } = validation.data;
    const result = await undoMerge(placeId, user.id, mergeLogId);
    clearDuplicateScanCache();
    revalidateTag(`library-stats:${user.id}`);
    return NextResponse.json({ status: 'success', ...result });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json({ status: 'error', message: 'Merge not found' }, { status: 404 });
    }
    if (error instanceof ConflictError) {
      return NextResponse.json({ status: 'error', message: error.message }, { status: 409 });
    }
    console.error('[API] Undo merge error:', error);
    return NextResponse.json({ status: 'error', message: 'Undo failed' }, { status: 500 });
  }
}
