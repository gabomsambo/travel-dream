import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/db-utils';
import { getSourcesForLLMProcessing } from '@/lib/db-queries';
import { batchCreatePlacesFromExtractions } from '@/lib/db-mutations';
import { llmExtractionService } from '@/lib/llm-extraction-service';
import { uploadSessions, sources } from '@/db/schema';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';
import { db } from '@/db';
import { eq, inArray, and, or, isNull, sql } from 'drizzle-orm';
import type { ExtractionContext } from '@/types/llm-extraction';

export const runtime = 'nodejs';
export const maxDuration = 600; // 10 minutes for LLM processing

interface LLMProcessingRequest {
  sourceIds?: string[]; // Specific sources to process
  sessionId?: string; // Process all sources from upload session
  provider?: 'openai' | 'anthropic';
  context?: ExtractionContext;
  batchSize?: number;
}

interface LLMProcessingResult {
  sourceId: string;
  success: boolean;
  placesExtracted?: number;
  confidence?: number;
  cost?: number;
  processingTime?: number;
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: LLMProcessingRequest = await request.json();
    const {
      sourceIds,
      sessionId,
      provider = 'openai',
      context,
      batchSize = 10
    } = body;

    // Validate input - must provide either sourceIds or sessionId
    if (!sourceIds && !sessionId) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Either sourceIds or sessionId must be provided',
          results: []
        },
        { status: 400 }
      );
    }

    // Get sources to process
    let sourcesToProcess: any[] = [];
    if (sourceIds) {
      // Process specific sources by ID
      sourcesToProcess = await withErrorHandling(async () => {
        return await db.select()
          .from(sourcesCurrentSchema)
          .where(inArray(sourcesCurrentSchema.id, sourceIds));
      }, 'getSourcesByIds');
    } else if (sessionId) {
      // Process sources from upload session
      const session = await db.select()
        .from(uploadSessions)
        .where(eq(uploadSessions.id, sessionId))
        .limit(1);

      if (!session[0]) {
        return NextResponse.json(
          {
            status: 'error',
            message: 'Upload session not found',
            results: []
          },
          { status: 404 }
        );
      }

      const uploadedFiles = session[0].meta?.uploadedFiles || [];
      if (uploadedFiles.length === 0) {
        return NextResponse.json(
          {
            status: 'success',
            message: 'No files to process in session',
            results: [],
            summary: {
              total: 0,
              successful: 0,
              failed: 0,
              totalPlaces: 0,
              totalCost: 0
            }
          }
        );
      }

      sourcesToProcess = await withErrorHandling(async () => {
        return await db.select()
          .from(sourcesCurrentSchema)
          .where(inArray(sourcesCurrentSchema.id, uploadedFiles));
      }, 'getSourcesFromSession');
    }

    // Filter sources that need LLM processing
    const validSources = sourcesToProcess.filter(source => {
      // Must have OCR text
      if (!source.ocrText || source.ocrText.trim().length < 10) {
        return false;
      }

      // Skip if already processed (unless explicitly requested)
      if (source.llmProcessed && !sourceIds) {
        return false;
      }

      return true;
    });

    if (validSources.length === 0) {
      return NextResponse.json(
        {
          status: 'success',
          message: 'No sources require LLM processing',
          results: [],
          summary: {
            total: 0,
            successful: 0,
            failed: 0,
            totalPlaces: 0,
            totalCost: 0
          }
        }
      );
    }

    const results: LLMProcessingResult[] = [];

    // Configure LLM service
    await llmExtractionService.initialize();
    llmExtractionService.updateConfig({
      primaryProvider: provider,
      enableFallback: true,
      maxConcurrentExtractions: Math.min(batchSize, 5) // Respect rate limits
    });

    // Process sources in batches
    const CONCURRENT_LIMIT = Math.min(batchSize, 3); // Conservative for LLM APIs
    for (let i = 0; i < validSources.length; i += CONCURRENT_LIMIT) {
      const batch = validSources.slice(i, i + CONCURRENT_LIMIT);

      // Prepare batch for LLM processing
      const batchSources = batch.map(source => ({
        id: source.id,
        text: source.ocrText!,
        context: {
          ...context,
          sourceType: source.type as any,
          platform: source.meta?.platform || undefined,
          language: source.lang || 'en'
        }
      }));

      // Process batch with LLM service
      const batchResult = await llmExtractionService.batchExtract(batchSources, {
        maxConcurrent: CONCURRENT_LIMIT,
        onProgress: (progress) => {
          console.log(`LLM Processing: ${progress.completed}/${progress.total} (${progress.progress.toFixed(1)}%)`);
        }
      });

      // Store results in database
      if (batchResult.success && batchResult.results.length > 0) {
        const dbResults = await batchCreatePlacesFromExtractions(batchResult.results);

        // Collect processing results
        batchResult.results.forEach((result, index) => {
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
      }

      // Small delay between batches to respect rate limits
      if (i + CONCURRENT_LIMIT < validSources.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Calculate summary statistics
    const successfulResults = results.filter(r => r.success);
    const failedResults = results.filter(r => !r.success);
    const totalPlaces = successfulResults.reduce((sum, r) => sum + (r.placesExtracted || 0), 0);
    const totalCost = successfulResults.reduce((sum, r) => sum + (r.cost || 0), 0);

    // Update session status if processing from session
    if (sessionId) {
      await withErrorHandling(async () => {
        const session = await db.select()
          .from(uploadSessions)
          .where(eq(uploadSessions.id, sessionId))
          .limit(1);

        if (session[0]) {
          await db.update(uploadSessions)
            .set({
              meta: session[0].meta
            })
            .where(eq(uploadSessions.id, sessionId));
        }
      }, 'updateSessionLLMStatus');
    }

    return NextResponse.json({
      status: 'success',
      results,
      summary: {
        total: validSources.length,
        successful: successfulResults.length,
        failed: failedResults.length,
        totalPlaces,
        totalCost: Math.round(totalCost * 10000) / 10000, // Round to 4 decimal places
        avgProcessingTime: successfulResults.length > 0
          ? Math.round(successfulResults.reduce((sum, r) => sum + (r.processingTime || 0), 0) / successfulResults.length)
          : 0
      },
      provider,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('LLM processing API error:', error);

    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'LLM processing failed',
        results: [],
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get sources available for LLM processing
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const includeProcessed = searchParams.get('includeProcessed') === 'true';

    const sources = await getSourcesForLLMProcessing({
      limit,
      excludeProcessed: !includeProcessed,
      requireOcrText: true,
      prioritizeManual: true
    });

    const stats = await withErrorHandling(async () => {
      const [totalResult, pendingResult, processedResult] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(sourcesCurrentSchema),
        db.select({ count: sql<number>`count(*)` })
          .from(sourcesCurrentSchema)
          .where(and(
            sql`${sourcesCurrentSchema.ocrText} IS NOT NULL`,
            or(
              eq(sourcesCurrentSchema.llmProcessed, 0),
              isNull(sourcesCurrentSchema.llmProcessed)
            )
          )),
        db.select({ count: sql<number>`count(*)` })
          .from(sourcesCurrentSchema)
          .where(eq(sourcesCurrentSchema.llmProcessed, 1))
      ]);

      return {
        totalCount: totalResult[0]?.count || 0,
        pendingCount: pendingResult[0]?.count || 0,
        processedCount: processedResult[0]?.count || 0
      };
    }, 'getLLMQueueStats');

    return NextResponse.json({
      status: 'success',
      sources: sources.map(source => ({
        id: source.id,
        type: source.type,
        createdAt: source.createdAt,
        ocrTextLength: source.ocrText?.length || 0,
        lang: source.lang,
        llmProcessed: source.llmProcessed === 1,
        platform: source.meta?.platform
      })),
      stats: {
        available: sources.length,
        total: stats?.totalCount || 0,
        pending: stats?.pendingCount || 0,
        processed: stats?.processedCount || 0
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('LLM queue API error:', error);

    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to get LLM queue',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}