import { NextRequest, NextResponse } from 'next/server';
import { attachments } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { forUser } from '@/lib/tenant-db';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { releaseBlobIfUnreferenced } from '@/lib/shared-blob';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const user = await requireAuthForApi();
    const { id: placeId, attachmentId } = await params;

    const tdb = forUser(user.id);

    // Get the attachment to find the file paths. `attachments` has no user_id;
    // `selectFieldsVia` scopes it through `places`, so the caller can only ever
    // read an attachment on a place they own.
    const [attachment] = await tdb
      .selectFieldsVia(
        attachments,
        {
          id: attachments.id,
          uri: attachments.uri,
          thumbnailUri: attachments.thumbnailUri,
        },
        and(eq(attachments.id, attachmentId), eq(attachments.placeId, placeId))
      )
      .limit(1);

    if (!attachment) {
      return NextResponse.json(
        { error: 'Attachment not found' },
        { status: 404 }
      );
    }

    // Delete the database record. Scoped again rather than relying on the check
    // above: ownership of the row read is not, on its own, authorization for the
    // row written.
    await tdb.deleteVia(attachments, eq(attachments.id, attachmentId));

    // Legacy `/uploads/...` paths are not blob objects and are left alone.
    const exclusions = { excludeAttachmentIds: [attachmentId] };
    try {
      await releaseBlobIfUnreferenced(user.id, attachment.uri, exclusions, '[DELETE attachment]');
      if (attachment.thumbnailUri && attachment.thumbnailUri !== attachment.uri) {
        await releaseBlobIfUnreferenced(
          user.id,
          attachment.thumbnailUri,
          exclusions,
          '[DELETE attachment]'
        );
      }
    } catch (cleanupError) {
      console.warn('[DELETE attachment] Failed to release blobs:', cleanupError);
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
