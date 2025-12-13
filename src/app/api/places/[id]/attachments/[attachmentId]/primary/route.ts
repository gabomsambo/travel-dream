import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { attachments } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const user = await requireAuthForApi();
    const { id: placeId, attachmentId } = await params;

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
