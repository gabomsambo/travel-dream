import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { attachments, places } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const user = await requireAuthForApi();
    const { id: placeId, attachmentId } = await params;

    // Verify the attachment belongs to a place owned by the caller before any
    // write — otherwise this clears `isPrimary` across another user's place.
    const owned = await db
      .select({ id: attachments.id })
      .from(attachments)
      .innerJoin(places, eq(attachments.placeId, places.id))
      .where(
        and(
          eq(attachments.id, attachmentId),
          eq(attachments.placeId, placeId),
          eq(places.userId, user.id)
        )
      )
      .limit(1);

    if (owned.length === 0) {
      return NextResponse.json(
        { error: 'Attachment not found' },
        { status: 404 }
      );
    }

    await db.transaction(async (tx) => {
      // Clear existing primary for this place
      await tx.update(attachments)
        .set({ isPrimary: 0 })
        .where(eq(attachments.placeId, placeId));

      // Set new primary
      await tx.update(attachments)
        .set({ isPrimary: 1 })
        .where(
          and(
            eq(attachments.id, attachmentId),
            eq(attachments.placeId, placeId)
          )
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
