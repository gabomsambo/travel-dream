import { NextRequest, NextResponse } from 'next/server';
import { attachments } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { forUser } from '@/lib/tenant-db';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const user = await requireAuthForApi();
    const { id: placeId, attachmentId } = await params;

    const tdb = forUser(user.id);

    // Verify the attachment belongs to a place owned by the caller before any
    // write — otherwise this clears `isPrimary` across another user's place.
    const owned = await tdb
      .selectFieldsVia(
        attachments,
        { id: attachments.id },
        and(eq(attachments.id, attachmentId), eq(attachments.placeId, placeId))
      )
      .limit(1);

    if (owned.length === 0) {
      return NextResponse.json(
        { error: 'Attachment not found' },
        { status: 404 }
      );
    }

    // `tx` is scoped to the same caller, so both writes carry the ownership
    // predicate on their own rather than inheriting it from the check above.
    await tdb.transaction(async (tx) => {
      // Clear existing primary for this place
      await tx.updateVia(attachments, { isPrimary: 0 }, eq(attachments.placeId, placeId));

      // Set new primary
      await tx.updateVia(
        attachments,
        { isPrimary: 1 },
        and(eq(attachments.id, attachmentId), eq(attachments.placeId, placeId))
      );
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('Failed to set primary image:', error);
    return NextResponse.json(
      { error: 'Failed to set primary image' },
      { status: 500 }
    );
  }
}
