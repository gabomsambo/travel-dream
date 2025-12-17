import { NextRequest, NextResponse } from 'next/server';
import { ocrServiceServer } from '@/lib/ocr-service-server';
import { withErrorHandling } from '@/lib/db-utils';
import { db } from '@/db';
import { sources, uploadSessions } from '@/db/schema';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';
import { eq, and } from 'drizzle-orm';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { llmExtractionService } from '@/lib/llm-extraction-service';
import { batchCreatePlacesFromExtractions } from '@/lib/db-mutations';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for OCR processing

// Helper to add LLM errors to session for UI visibility
async function addSessionError(sessionId: string | undefined, fileId: string, error: string) {
  if (!sessionId) return;

  try {
    const session = await db.select()
      .from(uploadSessions)
      .where(eq(uploadSessions.id, sessionId))
      .get();

    if (session) {
      await db.update(uploadSessions)
        .set({
          meta: {
            uploadedFiles: session.meta?.uploadedFiles || [],
            processingQueue: session.meta?.processingQueue || [],
            errors: [
              ...(session.meta?.errors || []),
              { fileId, error }
            ]
          }
        })
        .where(eq(uploadSessions.id, sessionId));
    }
  } catch (err) {
    console.error('[OCR Process] Failed to add session error:', err);
  }
}

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
    const user = await requireAuthForApi();
    const body = await request.json() as OCRProcessRequest;
    const { sourceIds, sessionId } = body;

    console.log(`[OCR Process] Received request for ${sourceIds?.length || 0} sources:`, sourceIds);

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

    console.log(`[OCR Process] Fetched ${sourceRecords.length} source records (${sourceRecords.filter(r => r !== null).length} valid)`);
    console.log(`[OCR Process] Source IDs to process:`, sourceRecords.filter(r => r !== null).map(r => r!.id));

    // Process OCR for each source
    let processedCount = 0;
    for (const sourceRecord of sourceRecords) {
      processedCount++;
      console.log(`[OCR Process] Processing source ${processedCount}/${sourceRecords.length}: ${sourceRecord?.id || 'null'}`);

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

        // Get file path/URL
        const fileUri = sourceRecord.uri;
        if (!fileUri) {
          throw new Error('No file path found in source record');
        }

        // Check if this is a blob URL or local file
        const isBlob = fileUri.startsWith('http://') || fileUri.startsWith('https://');
        console.log(`[OCR Process] Reading file from ${isBlob ? 'blob' : 'local'}: ${fileUri}`);

        let fileBuffer: Buffer;

        try {
          if (isBlob) {
            // Fetch from Vercel Blob URL
            const response = await fetch(fileUri);
            if (!response.ok) {
              throw new Error(`Failed to fetch blob: ${response.status} ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            fileBuffer = Buffer.from(arrayBuffer);
          } else {
            // Read from local filesystem (fallback for local dev)
            const fs = await import('fs/promises');
            const fullPath = `./public${fileUri}`;
            fileBuffer = await fs.readFile(fullPath);
          }
          console.log(`[OCR Process] File read successfully, size: ${fileBuffer.length} bytes`);

          // Validate buffer
          const { OCRServiceServer } = await import('@/lib/ocr-service-server');
          const validation = OCRServiceServer.validateImageBuffer(fileBuffer);
          if (!validation.isValid) {
            throw new Error(validation.error || 'Invalid image buffer');
          }

          // Process with Gemini Vision or Tesseract OCR based on feature flag
          let ocrResult;
          const useGemini = process.env.GEMINI_VISION_ENABLED === 'true';

          if (useGemini) {
            try {
              const { geminiVisionService } = await import('@/lib/gemini-vision-service');
              ocrResult = await geminiVisionService.extractTextFromImage(fileBuffer, sourceRecord.id);
              console.log(`[Upload] Used Gemini vision for ${sourceRecord.id}`);
            } catch (geminiError) {
              console.error(`[Upload] Gemini failed for ${sourceRecord.id}:`, geminiError);

              if (process.env.GEMINI_FALLBACK_TO_TESSERACT === 'true') {
                console.log(`[Upload] Falling back to Tesseract for ${sourceRecord.id}`);
                ocrResult = await ocrServiceServer.processImageBuffer(fileBuffer, sourceRecord.id);
              } else {
                throw geminiError;
              }
            }
          } else {
            ocrResult = await ocrServiceServer.processImageBuffer(fileBuffer, sourceRecord.id);
          }

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

            // Fetch fresh source data for LLM status updates (sourceRecord.meta is stale after OCR update)
            const getFreshSourceMeta = async () => {
              try {
                const freshSource = await db.select()
                  .from(sourcesCurrentSchema)
                  .where(eq(sourcesCurrentSchema.id, sourceRecord.id))
                  .get();
                if (!freshSource) return {};
                if (typeof freshSource.meta === 'string') {
                  return JSON.parse(freshSource.meta);
                }
                return freshSource.meta || {};
              } catch {
                return {};
              }
            };

            // Call LLM service directly (avoids auth redirect issues with HTTP fetch)
            try {
              await llmExtractionService.initialize();
              llmExtractionService.updateConfig({
                primaryProvider: (process.env.LLM_PROVIDER as 'openai' | 'anthropic') || 'openai',
                enableFallback: true,
                maxConcurrentExtractions: 1
              });

              const batchResult = await llmExtractionService.batchExtract([{
                id: sourceRecord.id,
                text: ocrResult.text,
                context: {
                  sourceType: 'screenshot',
                  language: sourceRecord.lang || 'en'
                }
              }], { maxConcurrent: 1 });

              if (batchResult.success && batchResult.results.length > 0) {
                const dbResults = await batchCreatePlacesFromExtractions(batchResult.results, user.id);
                const placesCreated = dbResults.reduce((sum, r) => sum + (r.places?.length || 0), 0);

                // Update source with LLM success metadata (fetch fresh meta to preserve ocrStatus)
                const successMeta = await getFreshSourceMeta();
                await db.update(sourcesCurrentSchema)
                  .set({
                    meta: {
                      ...successMeta,
                      uploadInfo: { ...(successMeta as any).uploadInfo },
                      llmProcessing: {
                        processed: true,
                        model: process.env.LLM_PROVIDER || 'openai',
                        processedAt: new Date().toISOString(),
                        placesExtracted: placesCreated,
                        confidence: batchResult.results[0]?.metadata?.confidence_avg || 0
                      }
                    },
                    updatedAt: new Date().toISOString()
                  })
                  .where(eq(sourcesCurrentSchema.id, sourceRecord.id));

                console.log(`[OCR Process] LLM processing completed for ${sourceRecord.id}:`, {
                  placesExtracted: placesCreated,
                  successful: dbResults.filter(r => !r.error).length,
                  failed: dbResults.filter(r => r.error).length
                });
              } else {
                // Track LLM failure (no results returned)
                const errorMsg = 'No places found in text';
                const noResultsMeta = await getFreshSourceMeta();

                await db.update(sourcesCurrentSchema)
                  .set({
                    meta: {
                      ...noResultsMeta,
                      uploadInfo: { ...(noResultsMeta as any).uploadInfo },
                      llmProcessing: {
                        processed: false,
                        error: errorMsg,
                        processedAt: new Date().toISOString()
                      }
                    },
                    updatedAt: new Date().toISOString()
                  })
                  .where(eq(sourcesCurrentSchema.id, sourceRecord.id));

                await addSessionError(sessionId, sourceRecord.id, `LLM: ${errorMsg}`);
                console.warn(`[OCR Process] LLM extraction returned no results for ${sourceRecord.id}`);
              }
            } catch (err) {
              // Track LLM error with details
              const errorMsg = err instanceof Error ? err.message : 'Unknown LLM error';
              const errorMeta = await getFreshSourceMeta();

              await db.update(sourcesCurrentSchema)
                .set({
                  meta: {
                    ...errorMeta,
                    uploadInfo: { ...(errorMeta as any).uploadInfo },
                    llmProcessing: {
                      processed: false,
                      error: errorMsg,
                      processedAt: new Date().toISOString()
                    }
                  },
                  updatedAt: new Date().toISOString()
                })
                .where(eq(sourcesCurrentSchema.id, sourceRecord.id));

              await addSessionError(sessionId, sourceRecord.id, `LLM: ${errorMsg}`);
              console.error(`[OCR Process] LLM processing error for ${sourceRecord.id}:`, err);
            }
          } else {
            // Track skipped LLM (text too short)
            const skipReason = `Text too short (${ocrResult.text?.length || 0} chars)`;

            // Fetch fresh meta for skip status update (to preserve ocrStatus)
            const getSkipMeta = async () => {
              try {
                const freshSource = await db.select()
                  .from(sourcesCurrentSchema)
                  .where(eq(sourcesCurrentSchema.id, sourceRecord.id))
                  .get();
                if (!freshSource) return {};
                if (typeof freshSource.meta === 'string') {
                  return JSON.parse(freshSource.meta);
                }
                return freshSource.meta || {};
              } catch {
                return {};
              }
            };
            const skipMeta = await getSkipMeta();

            await db.update(sourcesCurrentSchema)
              .set({
                meta: {
                  ...skipMeta,
                  uploadInfo: { ...(skipMeta as any).uploadInfo },
                  llmProcessing: {
                    processed: false,
                    error: skipReason,
                    processedAt: new Date().toISOString()
                  }
                },
                updatedAt: new Date().toISOString()
              })
              .where(eq(sourcesCurrentSchema.id, sourceRecord.id));

            console.log(`[OCR Process] Skipping LLM - ${skipReason}`);
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
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
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
    const user = await requireAuthForApi();
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
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
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