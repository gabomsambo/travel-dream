import { NextRequest, NextResponse } from 'next/server';
import { processQueue } from '@/lib/mass-upload/queue-processor';
import { dispatchProcessors } from '@/lib/mass-upload/dispatch';

export const runtime = 'nodejs';
// Keep in sync with MASS_UPLOAD_MAX_DURATION_SECONDS and vercel.json —
// src/__tests__/mass-upload/queue-config.test.ts fails if they drift.
export const maxDuration = 300;

/**
 * Safety net for the mass-upload queue.
 *
 * Processing is event-triggered when an upload starts (see
 * `/api/mass-upload/start`), so this cron exists to make sure nothing can be
 * stranded when a trigger is missed or a worker dies: it reclaims expired
 * leases, tops the worker pool back up, and drains the queue itself.
 *
 * It runs on a slow schedule (see vercel.json) because it is a backstop, not
 * the primary path.
 */
export async function GET(request: NextRequest) {
  // ── Auth: Verify Vercel Cron secret ────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[MassUpload Cron] CRON_SECRET environment variable is not configured');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Observability: warn if Gemini env config looks wrong ───────────────
  if (process.env.GEMINI_VISION_ENABLED !== 'true') {
    console.warn('[MassUpload Cron] GEMINI_VISION_ENABLED is not set to "true" — check environment configuration');
  }

  try {
    // Add workers for whatever is waiting, then take a share of the work in
    // this invocation too, so the queue drains even if fan-out is unavailable.
    const dispatch = await dispatchProcessors('safety-net-cron', 'grow');
    const result = await processQueue();

    return NextResponse.json({
      // Legacy field names kept so existing clients keep working.
      processed: result.completed,
      failed: result.failed,
      remaining: result.remaining,
      placesCreated: result.placesCreated,
      // Reliability detail: interruptions are NOT failures.
      interrupted: result.interrupted,
      stalled: result.stalled,
      reclaimed: result.reclaimed,
      leaseLost: result.leaseLost,
      claimed: result.claimed,
      stoppedBecause: result.stoppedBecause,
      elapsedMs: result.elapsedMs,
      dispatch,
    });
  } catch (error) {
    console.error('[MassUpload Cron] Fatal error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Cron failed' },
      { status: 500 }
    );
  }
}
