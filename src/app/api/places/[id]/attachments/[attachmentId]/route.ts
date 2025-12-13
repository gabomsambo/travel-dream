import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { attachments } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { unlink } from 'fs/promises';
import path from 'path';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const user = await requireAuthForApi();
    const { id: placeId, attachmentId } = await params;

    // Get the attachment to find the file paths
    const [attachment] = await db
      .select()
      .from(attachments)
      .where(
        and(
          eq(attachments.id, attachmentId),
          eq(attachments.placeId, placeId)
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

    // Try to delete the files (don't fail if files don't exist)
    try {
      if (attachment.uri && attachment.uri.startsWith('/uploads/')) {
        const filePath = path.join(process.cwd(), 'public', attachment.uri);
        await unlink(filePath).catch(() => {});
      }
      if (attachment.thumbnailUri && attachment.thumbnailUri.startsWith('/uploads/')) {
        const thumbPath = path.join(process.cwd(), 'public', attachment.thumbnailUri);
        await unlink(thumbPath).catch(() => {});
      }
    } catch {
      // Ignore file deletion errors
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
