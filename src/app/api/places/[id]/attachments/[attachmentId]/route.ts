import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { attachments, places } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { del } from '@vercel/blob';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const user = await requireAuthForApi();
    const { id: placeId, attachmentId } = await params;

    // Get the attachment to find the file paths. Join through `places` so the
    // caller can only ever read/delete an attachment on a place they own.
    const [attachment] = await db
      .select({
        id: attachments.id,
        uri: attachments.uri,
        thumbnailUri: attachments.thumbnailUri,
      })
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

    if (!attachment) {
      return NextResponse.json(
        { error: 'Attachment not found' },
        { status: 404 }
      );
    }

    // Delete the database record
    await db.delete(attachments).where(eq(attachments.id, attachmentId));

    // Try to delete the stored blobs (don't fail if they no longer exist).
    // Legacy `/uploads/...` attachments are left on disk: that storage never
    // existed on Vercel and those files are deliberately not migrated.
    try {
      if (attachment.uri?.startsWith('https://')) {
        await del(attachment.uri);
      }
      if (attachment.thumbnailUri?.startsWith('https://') && attachment.thumbnailUri !== attachment.uri) {
        await del(attachment.thumbnailUri);
      }
    } catch {
      // Ignore blob deletion errors
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('Failed to delete attachment:', error);
    return NextResponse.json(
      { error: 'Failed to delete attachment' },
      { status: 500 }
    );
  }
}
