import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, generateSourceId } from '@/lib/db-utils';
import { createSource } from '@/lib/db-mutations';
import { uploadSessions } from '@/db/schema';
import { db } from '@/db';
import { eq } from 'drizzle-orm';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';

export const runtime = 'nodejs';

interface BlobCompleteRequest {
  sessionId: string;
  blobUrl: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthForApi();
    const body = await request.json() as BlobCompleteRequest;
    const { sessionId, blobUrl, originalName, fileSize, mimeType } = body;

    if (!blobUrl || !sessionId) {
      return NextResponse.json(
        { status: 'error', message: 'Missing required fields' },
        { status: 400 }
      );
    }

    const sourceId = generateSourceId();

    // Validate/create session
    let session = await db.select()
      .from(uploadSessions)
      .where(eq(uploadSessions.id, sessionId))
      .get();

    if (!session) {
      const newSession = {
        id: sessionId,
        userId: user.id,
        startedAt: new Date().toISOString(),
        fileCount: 1,
        completedCount: 0,
        failedCount: 0,
        status: 'active' as const,
        meta: {
          uploadedFiles: [],
          processingQueue: [],
          errors: []
        }
      };

      await db.insert(uploadSessions).values(newSession);
      session = newSession;
    }

    // Create source record with blob URL
    const sourceData = await withErrorHandling(async () => {
      return await createSource({
        type: 'screenshot',
        uri: blobUrl, // Store the Vercel Blob URL directly
        hash: {
          sha1: `blob_${sourceId}` // Will be computed if needed later
        },
        ocrText: null,
        lang: 'en',
        meta: {
          uploadInfo: {
            sessionId,
            originalName,
            fileSize,
            mimeType,
            storedPath: blobUrl,
            storageType: 'vercel-blob', // Mark as blob storage
            ocrStatus: 'pending',
            uploadedAt: new Date().toISOString(),
          }
        }
      }, user.id);
    }, 'createSourceFromBlob');

    // Update session
    await withErrorHandling(async () => {
      await db.update(uploadSessions)
        .set({
          completedCount: (session?.completedCount || 0) + 1,
          meta: {
            uploadedFiles: [...(session?.meta?.uploadedFiles || []), sourceData.id],
            processingQueue: [...(session?.meta?.processingQueue || []), sourceData.id],
            errors: session?.meta?.errors || []
          }
        })
        .where(eq(uploadSessions.id, sessionId));
    }, 'updateSessionAfterBlob');

    return NextResponse.json({
      status: 'success',
      sourceId: sourceData.id,
      blobUrl,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('[Blob Complete] Error:', error);

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
