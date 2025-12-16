import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/db-utils';
import { createAttachment } from '@/lib/db-mutations';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { db } from '@/db';
import { places } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export const runtime = 'nodejs';

interface BlobCompleteRequest {
  blobUrl: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  width?: number;
  height?: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthForApi();
    const { id: placeId } = await params;
    const body = await request.json() as BlobCompleteRequest;
    const { blobUrl, originalName, fileSize, mimeType, width, height } = body;

    if (!blobUrl || !placeId) {
      return NextResponse.json(
        { status: 'error', message: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Verify place ownership
    const place = await db.select()
      .from(places)
      .where(and(eq(places.id, placeId), eq(places.userId, user.id)))
      .get();

    if (!place) {
      return NextResponse.json(
        { status: 'error', message: 'Place not found or unauthorized' },
        { status: 404 }
      );
    }

    // Create attachment record with blob URL
    const attachment = await withErrorHandling(async () => {
      return await createAttachment({
        placeId,
        type: 'photo',
        uri: blobUrl, // Store the Vercel Blob URL directly
        filename: originalName,
        mimeType,
        fileSize,
        width,
        height,
        thumbnailUri: blobUrl, // Blob URLs work as thumbnails too (CDN will optimize)
      }, user.id);
    }, 'createAttachmentFromBlob');

    return NextResponse.json({
      status: 'success',
      attachment,
      url: blobUrl,
      thumbnailUrl: blobUrl,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('[Blob Attachment Complete] Error:', error);

    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to complete upload',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
