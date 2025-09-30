import { NextRequest, NextResponse } from 'next/server';
import { fileStorageService } from '@/lib/file-storage';
import { withErrorHandling, generateSourceId } from '@/lib/db-utils';
import { createSource } from '@/lib/db-mutations';
import { uploadSessions, sources } from '@/db/schema';
import { db } from '@/db';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for large uploads

interface UploadResult {
  sourceId: string;
  originalName: string;
  success: boolean;
  path?: string;
  thumbnailPath?: string;
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const sessionId = formData.get('sessionId') as string;

    if (!files || files.length === 0) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'No files provided',
          results: []
        },
        { status: 400 }
      );
    }

    if (!sessionId) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Session ID required',
          results: []
        },
        { status: 400 }
      );
    }

    // Validate session exists or create it
    let session = await db.select().from(uploadSessions).where(eq(uploadSessions.id, sessionId)).get();

    if (!session) {
      // Create new session
      session = {
        id: sessionId,
        startedAt: new Date().toISOString(),
        fileCount: files.length,
        completedCount: 0,
        failedCount: 0,
        status: 'active' as const,
        meta: {
          uploadedFiles: [],
          processingQueue: [],
          errors: []
        }
      };

      await db.insert(uploadSessions).values(session);
    }

    const results: UploadResult[] = [];

    // Process files with concurrent limit
    const CONCURRENT_LIMIT = 5;
    for (let i = 0; i < files.length; i += CONCURRENT_LIMIT) {
      const batch = files.slice(i, i + CONCURRENT_LIMIT);

      const batchResults = await Promise.allSettled(
        batch.map(async (file): Promise<UploadResult> => {
          const sourceId = generateSourceId();

          try {
            // Validate file
            const validation = fileStorageService.validateFile(file);
            if (!validation.isValid) {
              throw new Error(validation.error);
            }

            // Store file and generate thumbnail
            const processedResult = await fileStorageService.storeFile(file, sourceId);

            // Create source record in database
            const sourceData = await withErrorHandling(async () => {
              return await createSource({
                type: 'screenshot',
                uri: processedResult.originalPath,
                hash: {
                  sha1: `temp_${sourceId}` // Will be updated with actual hash later
                },
                ocrText: null, // Will be filled by OCR processing
                lang: 'en',
                meta: {
                  uploadInfo: {
                    sessionId,
                    originalName: file.name,
                    fileSize: processedResult.fileSize,
                    dimensions: processedResult.dimensions,
                    mimeType: processedResult.mimeType,
                    storedPath: processedResult.originalPath,
                    thumbnailPath: processedResult.thumbnailPath,
                    ocrStatus: 'pending',
                    uploadedAt: new Date().toISOString(),
                  }
                }
              });
            }, 'uploadCreateSource');

            return {
              sourceId: sourceData.id,
              originalName: file.name,
              success: true,
              path: processedResult.originalPath,
              thumbnailPath: processedResult.thumbnailPath,
            };

          } catch (error) {
            // Clean up on error
            try {
              await fileStorageService.deleteFile(`/uploads/screenshots/${sourceId}.jpg`);
            } catch {}

            return {
              sourceId,
              originalName: file.name,
              success: false,
              error: error instanceof Error ? error.message : 'Upload failed',
            };
          }
        })
      );

      // Collect batch results
      batchResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            sourceId: 'unknown',
            originalName: 'unknown',
            success: false,
            error: result.reason?.message || 'Unknown error',
          });
        }
      });
    }

    // Update session with results
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;
    const uploadedFiles = results.filter(r => r.success).map(r => r.sourceId);
    const errors = results.filter(r => !r.success).map(r => ({
      fileId: r.sourceId,
      error: r.error || 'Unknown error'
    }));

    await withErrorHandling(async () => {
      await db.update(uploadSessions)
        .set({
          completedCount: session.completedCount + successCount,
          failedCount: session.failedCount + failedCount,
          status: (session.completedCount + successCount + session.failedCount + failedCount >= session.fileCount)
            ? 'completed' as const
            : 'active' as const,
          meta: {
            uploadedFiles: [...(session.meta?.uploadedFiles || []), ...uploadedFiles],
            processingQueue: [...(session.meta?.processingQueue || []), ...uploadedFiles],
            errors: [...(session.meta?.errors || []), ...errors]
          }
        })
        .where(eq(uploadSessions.id, sessionId));
    }, 'updateUploadSession');

    return NextResponse.json({
      status: 'success',
      sessionId,
      results,
      summary: {
        total: files.length,
        successful: successCount,
        failed: failedCount,
        processingQueue: uploadedFiles.length
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Upload API error:', error);

    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Upload failed',
        results: [],
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { status: 'error', message: 'Session ID required' },
        { status: 400 }
      );
    }

    const session = await db.select()
      .from(uploadSessions)
      .where(eq(uploadSessions.id, sessionId))
      .get();

    if (!session) {
      return NextResponse.json(
        { status: 'error', message: 'Session not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: 'success',
      session,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Upload status API error:', error);

    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to get upload status',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}