import { NextRequest, NextResponse } from 'next/server';
import { updateCollection } from '@/lib/db-mutations';
import { getCollectionById } from '@/lib/db-queries';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { isAllowedBlobUrl, BLOB_URL_REJECTED_MESSAGE } from '@/lib/blob-url';
import { releaseOwnedCoverBlob } from '@/lib/cover-blob';

export const runtime = 'nodejs';

interface CoverBlobCompleteRequest {
  blobUrl: string;
}

/**
 * Persists a collection cover that the client uploaded straight to Vercel Blob
 * via `/api/blob/upload`. Mirrors `/api/upload/blob-complete` and
 * `/api/places/[id]/attachments/blob-complete`: the client sends the resulting
 * blob URL, and this route pins it to the blob store before storing it.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthForApi();
    const { id: collectionId } = await params;
    const { blobUrl } = (await request.json()) as CoverBlobCompleteRequest;

    if (!blobUrl) {
      return NextResponse.json(
        { status: 'error', message: 'Missing blobUrl' },
        { status: 400 }
      );
    }

    // Pin the caller-supplied URL to the blob store before it is stored.
    if (!isAllowedBlobUrl(blobUrl)) {
      return NextResponse.json(
        { status: 'error', message: BLOB_URL_REJECTED_MESSAGE },
        { status: 400 }
      );
    }

    const collection = await getCollectionById(collectionId, user.id);
    if (!collection) {
      return NextResponse.json(
        { status: 'error', message: 'Collection not found' },
        { status: 404 }
      );
    }

    const previousCoverUrl = collection.coverImageUrl;

    await updateCollection(collectionId, { coverImageUrl: blobUrl }, user.id);

    if (previousCoverUrl !== blobUrl) {
      await releaseOwnedCoverBlob(previousCoverUrl, collectionId, '[Cover Blob Complete]');
    }

    return NextResponse.json({
      status: 'success',
      coverImageUrl: blobUrl,
      message: 'Cover image uploaded successfully',
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('[Cover Blob Complete] Error:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Upload failed',
      },
      { status: 500 }
    );
  }
}
