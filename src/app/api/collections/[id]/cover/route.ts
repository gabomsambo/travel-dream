import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { updateCollection } from '@/lib/db-mutations';
import { getCollectionById } from '@/lib/db-queries';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { isOwnedCoverBlobUrl } from '@/lib/image-upload';

export const runtime = 'nodejs';

/**
 * Uploading a cover is not handled here: the client uploads straight to Vercel
 * Blob via `/api/blob/upload` and then calls `./blob-complete` to persist the
 * URL. This route only clears an existing cover.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthForApi();
    const { id: collectionId } = await params;

    const collection = await getCollectionById(collectionId, user.id);
    if (!collection) {
      return NextResponse.json(
        { status: 'error', message: 'Collection not found' },
        { status: 404 }
      );
    }

    const previousCoverUrl = collection.coverImageUrl;

    await updateCollection(collectionId, { coverImageUrl: null }, user.id);

    // Only delete blobs uploaded as this collection's own cover. Covers set from
    // an existing place photo point at that attachment's blob, which must not be
    // destroyed by clearing the cover.
    if (isOwnedCoverBlobUrl(previousCoverUrl, collectionId)) {
      try {
        await del(previousCoverUrl!);
      } catch (cleanupError) {
        console.warn('[Cover Delete] Failed to delete cover blob:', cleanupError);
      }
    }

    return NextResponse.json({
      status: 'success',
      message: 'Cover image removed successfully',
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('Cover delete error:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Delete failed',
      },
      { status: 500 }
    );
  }
}
