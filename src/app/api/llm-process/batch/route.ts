import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/db-utils';
import { getSourcesForLLMProcessing } from '@/lib/db-queries';
import { batchCreatePlacesFromExtractions } from '@/lib/db-mutations';
import { llmExtractionService } from '@/lib/llm-extraction-service';
import { uploadSessions, sources } from '@/db/schema';
import { db } from '@/db';
import { eq, inArray, and, or, isNull, sql, desc } from 'drizzle-orm';
import type { ExtractionContext } from '@/types/llm-extraction';

export const runtime = 'nodejs';
export const maxDuration = 900; // 15 minutes for large batch processing

interface BatchProcessingRequest {
  provider?: 'openai' | 'anthropic';
  context?: ExtractionContext;
  batchSize?: number;
  maxConcurrent?: number;
  priorityMode?: 'manual_first' | 'recent_first' | 'fifo';
  sessionIds?: string[]; // Process specific sessions
  maxSources?: number; // Limit total sources to process
  dryRun?: boolean; // Preview what would be processed
}

interface BatchProcessingResult {
  batch_id: string;
  status: 'success' | 'partial' | 'failed';
  summary: {
    sources_processed: number;
    sources_successful: number;
    sources_failed: number;
    total_places_extracted: number;
    total_cost_usd: number;
    avg_processing_time_ms: number;
    processing_duration_ms: number;
  };
  sources: Array<{
    sourceId: string;
    success: boolean;
    placesExtracted: number;
    confidence?: number;
    cost?: number;
    processingTime?: number;
    error?: string;
  }>;
  errors: string[];
  timestamp: string;
}

export async function POST(request: NextRequest) {
  const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();

  try {
    const body: BatchProcessingRequest = await request.json();
    const {
      provider = 'openai',
      context,
      batchSize = 50,
      maxConcurrent = 3,
      priorityMode = 'manual_first',
      sessionIds,
      maxSources = 100,
      dryRun = false
    } = body;

    console.log(`[${batchId}] Starting batch LLM processing with ${batchSize} batch size`);

    // Get sources to process based on priority mode
    let sourcesToProcess = [];

    if (sessionIds && sessionIds.length > 0) {
      // Process specific sessions
      sourcesToProcess = await withErrorHandling(async () => {
        const sessions = await db.select()
          .from(uploadSessions)
          .where(inArray(uploadSessions.id, sessionIds));

        const allUploadedFiles = sessions.flatMap(session =>
          session.meta?.uploadedFiles || []
        );

        if (allUploadedFiles.length === 0) {
          return [];
        }

        return await db.select()
          .from(sources)
          .where(inArray(sources.id, allUploadedFiles));
      }, 'getSourcesFromSessions');
    } else {
      // Get sources based on priority mode
      const queryOptions = {
        limit: maxSources,
        excludeProcessed: true,
        requireOcrText: true,
        prioritizeManual: priorityMode === 'manual_first'
      };

      sourcesToProcess = await getSourcesForLLMProcessing(queryOptions);

      // Apply additional sorting for priority modes
      if (priorityMode === 'recent_first') {
        sourcesToProcess.sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      } else if (priorityMode === 'fifo') {
        sourcesToProcess.sort((a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      }
      // 'manual_first' is already handled by the query
    }

    // Filter sources that are valid for processing
    const validSources = sourcesToProcess.filter(source => {
      // Must have OCR text
      if (!source.ocrText || source.ocrText.trim().length < 10) {
        return false;
      }

      // Note: We don't check llmProcessed here as it's not in current schema
      // Sources can be reprocessed if needed
      return true;
    });

    if (validSources.length === 0) {
      return NextResponse.json({
        batch_id: batchId,
        status: 'success' as const,
        message: 'No sources require LLM processing',
        summary: {
          sources_processed: 0,
          sources_successful: 0,
          sources_failed: 0,
          total_places_extracted: 0,
          total_cost_usd: 0,
          avg_processing_time_ms: 0,
          processing_duration_ms: Date.now() - startTime
        },
        sources: [],
        errors: [],
        timestamp: new Date().toISOString()
      });
    }

    // Limit to batch size
    const sourcesToProcessLimited = validSources.slice(0, batchSize);

    if (dryRun) {
      // Return preview without processing
      return NextResponse.json({
        batch_id: batchId,
        status: 'success' as const,
        message: 'Dry run - preview of sources to be processed',
        preview: {
          total_sources: sourcesToProcessLimited.length,
          sources: sourcesToProcessLimited.map(source => ({
            id: source.id,
            type: source.type,
            createdAt: source.createdAt,
            ocrTextLength: source.ocrText?.length || 0,
            lang: source.lang,
            platform: source.meta?.platform
          })),
          estimated_cost: sourcesToProcessLimited.length * 0.01, // Rough estimate
          priority_order: priorityMode
        },
        timestamp: new Date().toISOString()
      });
    }

    console.log(`[${batchId}] Processing ${sourcesToProcessLimited.length} sources with ${priorityMode} priority`);

    // Initialize LLM service
    await llmExtractionService.initialize();
    llmExtractionService.updateConfig({
      primaryProvider: provider,
      enableFallback: true,
      maxConcurrentExtractions: maxConcurrent
    });

    const results: Array<{
      sourceId: string;
      success: boolean;
      placesExtracted: number;
      confidence?: number;
      cost?: number;
      processingTime?: number;
      error?: string;
    }> = [];

    const errors: string[] = [];

    // Process sources in chunks to manage memory and API limits
    const CHUNK_SIZE = Math.min(maxConcurrent, 5);
    for (let i = 0; i < sourcesToProcessLimited.length; i += CHUNK_SIZE) {
      const chunk = sourcesToProcessLimited.slice(i, i + CHUNK_SIZE);

      console.log(`[${batchId}] Processing chunk ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(sourcesToProcessLimited.length / CHUNK_SIZE)}`);

      // Prepare chunk for LLM processing
      const chunkSources = chunk.map(source => ({
        id: source.id,
        text: source.ocrText!,
        context: {
          ...context,
          sourceType: source.type as any,
          platform: source.meta?.platform || undefined,
          language: source.lang || 'en'
        }
      }));

      try {
        // Process chunk with LLM service
        const chunkResult = await llmExtractionService.batchExtract(chunkSources, {
          maxConcurrent: CHUNK_SIZE,
          onProgress: (progress) => {
            console.log(`[${batchId}] Chunk progress: ${progress.completed}/${progress.total} (${progress.progress.toFixed(1)}%)`);
          }
        });

        // Store results in database
        if (chunkResult.success && chunkResult.results.length > 0) {
          const dbResults = await batchCreatePlacesFromExtractions(chunkResult.results);

          // Collect processing results
          chunkResult.results.forEach((result, index) => {
            const dbResult = dbResults[index];
            results.push({
              sourceId: result.sourceId,
              success: result.success,
              placesExtracted: result.places.length,
              confidence: result.places.length > 0
                ? result.places.reduce((sum, p) => sum + p.confidence, 0) / result.places.length
                : 0,
              cost: result.metadata.cost_usd,
              processingTime: result.metadata.processing_time_ms,
              error: result.error || dbResult?.error
            });
          });
        } else {
          // Handle chunk failure
          chunk.forEach(source => {
            results.push({
              sourceId: source.id,
              success: false,
              placesExtracted: 0,
              error: chunkResult.errors?.[0] || 'Chunk processing failed'
            });
          });
          errors.push(`Chunk ${Math.floor(i / CHUNK_SIZE) + 1} failed: ${chunkResult.errors?.join(', ') || 'Unknown error'}`);
        }

      } catch (chunkError) {
        console.error(`[${batchId}] Chunk error:`, chunkError);

        // Mark all sources in chunk as failed
        chunk.forEach(source => {
          results.push({
            sourceId: source.id,
            success: false,
            placesExtracted: 0,
            error: chunkError instanceof Error ? chunkError.message : 'Chunk processing error'
          });
        });
        errors.push(`Chunk ${Math.floor(i / CHUNK_SIZE) + 1} error: ${chunkError instanceof Error ? chunkError.message : 'Unknown error'}`);
      }

      // Delay between chunks to respect rate limits
      if (i + CHUNK_SIZE < sourcesToProcessLimited.length) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    // Calculate summary statistics
    const successfulResults = results.filter(r => r.success);
    const failedResults = results.filter(r => !r.success);
    const totalPlaces = successfulResults.reduce((sum, r) => sum + r.placesExtracted, 0);
    const totalCost = successfulResults.reduce((sum, r) => sum + (r.cost || 0), 0);
    const avgProcessingTime = successfulResults.length > 0
      ? Math.round(successfulResults.reduce((sum, r) => sum + (r.processingTime || 0), 0) / successfulResults.length)
      : 0;

    const processingDuration = Date.now() - startTime;

    console.log(`[${batchId}] Completed: ${successfulResults.length}/${sourcesToProcessLimited.length} sources, ${totalPlaces} places, $${totalCost.toFixed(4)}`);

    // Determine overall status
    let status: 'success' | 'partial' | 'failed';
    if (failedResults.length === 0) {
      status = 'success';
    } else if (successfulResults.length > 0) {
      status = 'partial';
    } else {
      status = 'failed';
    }

    const batchResult: BatchProcessingResult = {
      batch_id: batchId,
      status,
      summary: {
        sources_processed: sourcesToProcessLimited.length,
        sources_successful: successfulResults.length,
        sources_failed: failedResults.length,
        total_places_extracted: totalPlaces,
        total_cost_usd: Math.round(totalCost * 10000) / 10000,
        avg_processing_time_ms: avgProcessingTime,
        processing_duration_ms: processingDuration
      },
      sources: results,
      errors,
      timestamp: new Date().toISOString()
    };

    return NextResponse.json(batchResult);

  } catch (error) {
    console.error(`[${batchId}] Batch processing error:`, error);

    return NextResponse.json(
      {
        batch_id: batchId,
        status: 'failed' as const,
        message: error instanceof Error ? error.message : 'Batch processing failed',
        summary: {
          sources_processed: 0,
          sources_successful: 0,
          sources_failed: 0,
          total_places_extracted: 0,
          total_cost_usd: 0,
          avg_processing_time_ms: 0,
          processing_duration_ms: Date.now() - startTime
        },
        sources: [],
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get batch processing queue status and available sources
    const { searchParams } = new URL(request.url);
    const priorityMode = searchParams.get('priorityMode') || 'manual_first';
    const limit = parseInt(searchParams.get('limit') || '100');

    const sources = await getSourcesForLLMProcessing({
      limit,
      requireOcrText: true,
      prioritizeManual: priorityMode === 'manual_first'
    });

    // Apply sorting based on priority mode
    let sortedSources = [...sources];
    if (priorityMode === 'recent_first') {
      sortedSources.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } else if (priorityMode === 'fifo') {
      sortedSources.sort((a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    }

    // Get session information for sources
    const sessionSources = await withErrorHandling(async () => {
      const sessions = await db.select()
        .from(uploadSessions)
        .orderBy(desc(uploadSessions.startedAt))
        .limit(10);

      return sessions.map(session => ({
        sessionId: session.id,
        startedAt: session.startedAt,
        fileCount: session.fileCount,
        status: session.status,
        uploadedFiles: session.meta?.uploadedFiles?.length || 0,
        errors: session.meta?.errors?.length || 0
      }));
    }, 'getRecentSessions');

    return NextResponse.json({
      status: 'success',
      queue: {
        available_sources: sortedSources.length,
        priority_mode: priorityMode,
        sources: sortedSources.slice(0, 20).map(source => ({
          id: source.id,
          type: source.type,
          createdAt: source.createdAt,
          ocrTextLength: source.ocrText?.length || 0,
          lang: source.lang,
          platform: source.meta?.platform
        }))
      },
      recent_sessions: sessionSources,
      estimated_cost: sortedSources.length * 0.01, // Rough estimate
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Batch queue API error:', error);

    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to get batch queue',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}