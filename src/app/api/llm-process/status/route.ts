import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/db-utils';
import { getLLMProcessingStats } from '@/lib/db-queries';
import { llmExtractionService } from '@/lib/llm-extraction-service';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for streaming

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const stream = searchParams.get('stream') === 'true';
  const sessionId = searchParams.get('sessionId');

  if (stream) {
    // Server-Sent Events streaming response
    return new Response(
      new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();

          const sendEvent = (event: string, data: any) => {
            const formatted = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(encoder.encode(formatted));
          };

          const sendError = (error: string) => {
            sendEvent('error', { error, timestamp: new Date().toISOString() });
          };

          const sendStatus = async () => {
            try {
              // Get overall LLM processing statistics
              const stats = await getLLMProcessingStats();

              // Get current service status
              const serviceStats = await llmExtractionService.getServiceStats();

              // Get processing queue status
              const queueStatuses = llmExtractionService.getAllProcessingStatuses();
              const activeProcessing = queueStatuses.filter(s => s.status === 'processing');
              const pendingProcessing = queueStatuses.filter(s => s.status === 'pending');
              const completedProcessing = queueStatuses.filter(s => s.status === 'completed');
              const failedProcessing = queueStatuses.filter(s => s.status === 'failed');

              const statusData = {
                timestamp: new Date().toISOString(),
                service: {
                  initialized: serviceStats.initialized,
                  health: serviceStats.health,
                  config: serviceStats.config
                },
                queue: {
                  active: activeProcessing.length,
                  pending: pendingProcessing.length,
                  completed: completedProcessing.length,
                  failed: failedProcessing.length,
                  total: queueStatuses.length
                },
                processing: {
                  current_items: activeProcessing.map(item => ({
                    sourceId: item.sourceId,
                    progress: item.progress,
                    provider: item.provider,
                    startTime: item.startTime,
                    placesExtracted: item.placesExtracted
                  })),
                  recent_completions: completedProcessing
                    .slice(-5)
                    .map(item => ({
                      sourceId: item.sourceId,
                      placesExtracted: item.placesExtracted,
                      endTime: item.endTime,
                      provider: item.provider
                    }))
                },
                statistics: stats
              };

              sendEvent('status', statusData);

              // If specific session requested, include session-specific data
              if (sessionId) {
                const sessionSources = queueStatuses.filter(s =>
                  s.sourceId.includes(sessionId) ||
                  activeProcessing.some(a => a.sourceId === s.sourceId)
                );

                if (sessionSources.length > 0) {
                  const sessionProgress = {
                    sessionId,
                    total: sessionSources.length,
                    completed: sessionSources.filter(s => s.status === 'completed').length,
                    failed: sessionSources.filter(s => s.status === 'failed').length,
                    processing: sessionSources.filter(s => s.status === 'processing').length,
                    overall_progress: sessionSources.length > 0
                      ? (sessionSources.filter(s => ['completed', 'failed'].includes(s.status)).length / sessionSources.length) * 100
                      : 0
                  };

                  sendEvent('session_progress', sessionProgress);
                }
              }

            } catch (error) {
              console.error('Status streaming error:', error);
              sendError(error instanceof Error ? error.message : 'Status update failed');
            }
          };

          // Send initial status
          await sendStatus();

          // Set up periodic updates every 2 seconds
          const interval = setInterval(async () => {
            await sendStatus();
          }, 2000);

          // Clean up on client disconnect
          request.signal.addEventListener('abort', () => {
            clearInterval(interval);
            controller.close();
          });

          // Auto-close after 5 minutes to prevent long-running connections
          setTimeout(() => {
            clearInterval(interval);
            sendEvent('close', { reason: 'timeout', timestamp: new Date().toISOString() });
            controller.close();
          }, 300000);
        }
      }),
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Cache-Control'
        }
      }
    );
  }

  // Non-streaming response for single status check
  try {
    const stats = await withErrorHandling(async () => {
      return await getLLMProcessingStats();
    }, 'getLLMProcessingStats');

    const serviceStats = await withErrorHandling(async () => {
      return await llmExtractionService.getServiceStats();
    }, 'getServiceStats');

    const queueStatuses = llmExtractionService.getAllProcessingStatuses();

    // Calculate queue metrics
    const queueMetrics = {
      active: queueStatuses.filter(s => s.status === 'processing').length,
      pending: queueStatuses.filter(s => s.status === 'pending').length,
      completed: queueStatuses.filter(s => s.status === 'completed').length,
      failed: queueStatuses.filter(s => s.status === 'failed').length,
      total: queueStatuses.length
    };

    // Get currently processing items with details
    const activeProcessing = queueStatuses
      .filter(s => s.status === 'processing')
      .map(item => ({
        sourceId: item.sourceId,
        progress: item.progress,
        provider: item.provider,
        startTime: item.startTime,
        estimatedTimeRemaining: item.startTime
          ? Math.max(0, (Date.now() - item.startTime) * (100 - item.progress) / Math.max(item.progress, 1))
          : undefined,
        placesExtracted: item.placesExtracted
      }));

    // Get recent completions
    const recentCompletions = queueStatuses
      .filter(s => s.status === 'completed' && s.endTime)
      .sort((a, b) => (b.endTime || 0) - (a.endTime || 0))
      .slice(0, 10)
      .map(item => ({
        sourceId: item.sourceId,
        placesExtracted: item.placesExtracted,
        endTime: item.endTime,
        provider: item.provider,
        processingTime: item.startTime && item.endTime
          ? item.endTime - item.startTime
          : undefined
      }));

    // Session-specific status if requested
    let sessionStatus = undefined;
    if (sessionId) {
      const sessionSources = queueStatuses.filter(s =>
        s.sourceId.includes(sessionId)
      );

      if (sessionSources.length > 0) {
        sessionStatus = {
          sessionId,
          total: sessionSources.length,
          completed: sessionSources.filter(s => s.status === 'completed').length,
          failed: sessionSources.filter(s => s.status === 'failed').length,
          processing: sessionSources.filter(s => s.status === 'processing').length,
          pending: sessionSources.filter(s => s.status === 'pending').length,
          overall_progress: sessionSources.length > 0
            ? (sessionSources.filter(s => ['completed', 'failed'].includes(s.status)).length / sessionSources.length) * 100
            : 0,
          estimated_completion: sessionSources.filter(s => s.status === 'processing').length > 0
            ? Math.max(...sessionSources.filter(s => s.status === 'processing' && s.startTime)
                .map(s => (s.startTime || 0) + ((Date.now() - (s.startTime || 0)) * (100 - s.progress) / Math.max(s.progress, 1))))
            : undefined
        };
      }
    }

    return NextResponse.json({
      status: 'success',
      timestamp: new Date().toISOString(),
      service: {
        initialized: serviceStats?.initialized || false,
        health: serviceStats?.health || {},
        config: serviceStats?.config || {},
        providers: serviceStats?.providers || {}
      },
      queue: queueMetrics,
      processing: {
        active_count: activeProcessing.length,
        current_items: activeProcessing,
        recent_completions: recentCompletions,
        avg_processing_time: recentCompletions.length > 0
          ? Math.round(recentCompletions.reduce((sum, item) => sum + (item.processingTime || 0), 0) / recentCompletions.length)
          : 0
      },
      statistics: stats,
      session: sessionStatus
    });

  } catch (error) {
    console.error('LLM status API error:', error);

    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to get LLM status',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// OPTIONS handler for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Cache-Control',
    },
  });
}