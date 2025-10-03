import { NextRequest, NextResponse } from 'next/server';
import { ocrServiceServer } from '@/lib/ocr-service-server';
import { withErrorHandling } from '@/lib/db-utils';
import { db } from '@/db';
import { sources, uploadSessions } from '@/db/schema';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';
import { eq, and } from 'drizzle-orm';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for OCR processing

interface OCRProcessRequest {
  sourceIds: string[];
  sessionId?: string;
}

interface OCRProcessResult {
  sourceId: string;
  success: boolean;
  ocrText?: string;
  confidence?: number;
  processingTime?: number;
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as OCRProcessRequest;
    const { sourceIds, sessionId } = body;

    if (!sourceIds || sourceIds.length === 0) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'No source IDs provided',
          results: []
        },
        { status: 400 }
      );
    }

    const results: OCRProcessResult[] = [];

    // Fetch source records with file paths using compatible schema
    const sourceRecords = await Promise.all(
      sourceIds.map(async (id) => {
        try {
          return await db.select().from(sourcesCurrentSchema).where(eq(sourcesCurrentSchema.id, id)).get();
        } catch (error) {
          console.warn(`Failed to fetch source ${id}:`, error);
          return null;
        }
      })
    );

    // Process OCR for each source
    for (const sourceRecord of sourceRecords) {
      if (!sourceRecord) {
        results.push({
          sourceId: 'unknown',
          success: false,
          error: 'Source record not found'
        });
        continue;
      }

      try {
        console.log(`[OCR Process] Starting OCR for source ${sourceRecord.id}`);

        // Update status to processing using compatible schema
        await withErrorHandling(async () => {
          // Safely parse metadata
          let currentMeta = {};
          try {
            if (typeof sourceRecord.meta === 'string') {
              currentMeta = JSON.parse(sourceRecord.meta);
            } else {
              currentMeta = sourceRecord.meta || {};
            }
          } catch (parseError) {
            console.warn('Failed to parse source metadata:', parseError);
            currentMeta = {};
          }

          await db.update(sourcesCurrentSchema)
            .set({
              meta: {
                ...currentMeta,
                uploadInfo: {
                  ...(currentMeta as any).uploadInfo,
                  ocrStatus: 'processing'
                }
              },
              updatedAt: new Date().toISOString()
            })
            .where(eq(sourcesCurrentSchema.id, sourceRecord.id));
        }, 'updateOCRProcessingStatus');

        // Get file path
        const filePath = sourceRecord.uri;
        if (!filePath) {
          throw new Error('No file path found in source record');
        }

        // Read file from public directory
        const fullPath = `./public${filePath}`;
        console.log(`[OCR Process] Reading file from ${fullPath}`);
        const fs = await import('fs/promises');

        try {
          const fileBuffer = await fs.readFile(fullPath);
          console.log(`[OCR Process] File read successfully, size: ${fileBuffer.length} bytes`);

          // Validate buffer
          const { OCRServiceServer } = await import('@/lib/ocr-service-server');
          const validation = OCRServiceServer.validateImageBuffer(fileBuffer);
          if (!validation.isValid) {
            throw new Error(validation.error || 'Invalid image buffer');
          }

          // Process with server OCR service
          const ocrResult = await ocrServiceServer.processImageBuffer(fileBuffer, sourceRecord.id);

          console.log(`[OCR Process] OCR completed for ${sourceRecord.id}, extracted ${ocrResult.text.length} chars`);

          // Update source with OCR results using compatible schema
          await withErrorHandling(async () => {
            // Safely parse current metadata
            let currentMeta = {};
            try {
              if (typeof sourceRecord.meta === 'string') {
                currentMeta = JSON.parse(sourceRecord.meta);
              } else {
                currentMeta = sourceRecord.meta || {};
              }
            } catch (parseError) {
              console.warn('Failed to parse source metadata for update:', parseError);
              currentMeta = {};
            }

            await db.update(sourcesCurrentSchema)
              .set({
                ocrText: ocrResult.text,
                meta: {
                  ...currentMeta,
                  uploadInfo: {
                    ...(currentMeta as any).uploadInfo,
                    ocrStatus: 'completed',
                    ocrConfidence: ocrResult.confidence
                  }
                },
                updatedAt: new Date().toISOString()
              })
              .where(eq(sourcesCurrentSchema.id, sourceRecord.id));

            console.log(`[OCR Process] Database updated for ${sourceRecord.id}`);
          }, 'updateOCRResults');

          // Auto-trigger LLM processing if OCR text is substantial
          if (ocrResult.text && ocrResult.text.trim().length > 20) {
            console.log(`[OCR Process] Triggering LLM processing for ${sourceRecord.id}`);

            // Construct URL from request headers (works in Docker/localhost)
            const protocol = request.headers.get('x-forwarded-proto') || 'http';
            const host = request.headers.get('host') || 'localhost:3000';
            const baseUrl = `${protocol}://${host}`;

            // Non-blocking async trigger - don't await
            fetch(`${baseUrl}/api/llm-process`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sourceIds: [sourceRecord.id],
                provider: process.env.LLM_PROVIDER || 'openai',
                context: {
                  sourceType: 'screenshot',
                  triggeredBy: 'auto-ocr-completion'
                }
              })
            }).catch(err => {
              // Non-blocking: log but don't fail OCR success
              console.warn(`[OCR Process] LLM trigger failed for ${sourceRecord.id}:`, err);
            });
          } else {
            console.log(`[OCR Process] Skipping LLM - text too short (${ocrResult.text?.length || 0} chars)`);
          }

          results.push({
            sourceId: sourceRecord.id,
            success: true,
            ocrText: ocrResult.text,
            confidence: ocrResult.confidence,
            processingTime: ocrResult.processingTime
          });

        } catch (fileError) {
          throw new Error(`Failed to read file: ${fileError}`);
        }

      } catch (error) {
        console.error(`[OCR Process] Failed for source ${sourceRecord.id}:`, error);

        // Update status to failed
        try {
          // Safely parse metadata for error update
          let currentMeta = {};
          try {
            if (typeof sourceRecord.meta === 'string') {
              currentMeta = JSON.parse(sourceRecord.meta);
            } else {
              currentMeta = sourceRecord.meta || {};
            }
          } catch (parseError) {
            console.warn('Failed to parse source metadata for error update:', parseError);
            currentMeta = {};
          }

          await db.update(sourcesCurrentSchema)
            .set({
              meta: {
                ...currentMeta,
                uploadInfo: {
                  ...(currentMeta as any).uploadInfo,
                  ocrStatus: 'failed',
                  ocrError: error instanceof Error ? error.message : 'OCR processing failed'
                }
              },
              updatedAt: new Date().toISOString()
            })
            .where(eq(sourcesCurrentSchema.id, sourceRecord.id));
        } catch (dbError) {
          console.error('[OCR Process] Failed to update error status in DB:', dbError);
        }

        results.push({
          sourceId: sourceRecord.id,
          success: false,
          error: error instanceof Error ? error.message : 'OCR processing failed'
        });
      }
    }

    // Update session if provided
    if (sessionId) {
      try {
        console.log(`[OCR Process] Updating session ${sessionId}`);
        const session = await db.select()
          .from(uploadSessions)
          .where(eq(uploadSessions.id, sessionId))
          .get();

        if (session) {
          const processedSources = results.filter(r => r.success).map(r => r.sourceId);
          const failedSources = results.filter(r => !r.success).map(r => r.sourceId);
          const currentQueue = session.meta?.processingQueue || [];
          const updatedQueue = currentQueue.filter(
            id => !processedSources.includes(id) && !failedSources.includes(id)
          );

          console.log(`[OCR Process] Session queue: ${currentQueue.length} -> ${updatedQueue.length}`);

          await db.update(uploadSessions)
            .set({
              meta: {
                uploadedFiles: session.meta?.uploadedFiles || [],
                processingQueue: updatedQueue,
                errors: session.meta?.errors || []
              }
            })
            .where(eq(uploadSessions.id, sessionId));
        }
      } catch (sessionError) {
        console.error('[OCR Process] Failed to update session:', sessionError);
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    console.log(`[OCR Process] Completed batch: ${successCount} successful, ${failedCount} failed`);

    return NextResponse.json({
      status: 'success',
      results,
      summary: {
        total: sourceIds.length,
        successful: successCount,
        failed: failedCount,
        averageConfidence: results
          .filter(r => r.success && r.confidence)
          .reduce((sum, r) => sum + (r.confidence || 0), 0) / successCount || 0
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('OCR processing API error:', error);

    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'OCR processing failed',
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
    const sourceId = searchParams.get('sourceId');

    if (!sourceId) {
      return NextResponse.json(
        { status: 'error', message: 'Source ID required' },
        { status: 400 }
      );
    }

    const source = await db.select()
      .from(sources)
      .where(eq(sources.id, sourceId))
      .get();

    if (!source) {
      return NextResponse.json(
        { status: 'error', message: 'Source not found' },
        { status: 404 }
      );
    }

    const uploadInfo = (source.meta as any)?.uploadInfo;
    const ocrStatus = uploadInfo?.ocrStatus || 'unknown';

    return NextResponse.json({
      status: 'success',
      sourceId: source.id,
      ocrStatus,
      ocrText: source.ocrText,
      confidence: uploadInfo?.ocrConfidence,
      hasText: !!source.ocrText,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('OCR status API error:', error);

    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to get OCR status',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}