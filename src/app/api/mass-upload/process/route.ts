import { NextRequest, NextResponse, after } from 'next/server';
import { processQueue } from '@/lib/mass-upload/queue-processor';
import { dispatchProcessors } from '@/lib/mass-upload/dispatch';
import { MASS_UPLOAD_MAX_DURATION_SECONDS } from '@/lib/mass-upload/queue-config';

export const runtime = 'nodejs';
// Keep in sync with MASS_UPLOAD_MAX_DURATION_SECONDS and vercel.json —
// src/__tests__/mass-upload/queue-config.test.ts fails if they drift.
export const maxDuration = 300;

/**
 * Worker endpoint for the mass-upload queue.
 *
 * Triggered as soon as an upload starts (so processing does not wait for a cron
 * tick) and topped up by the safety-net cron. Server-to-server only: it is
 * authenticated with CRON_SECRET, never with a user session.
 *
 * By default it answers 202 immediately and drains the queue in `after()`, so
 * the caller is not held for the whole run. `{"wait": true}` runs inline and
 * returns the full result, which is what the tests and dev tooling use.
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[MassUpload Process] CRON_SECRET is not configured');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { wait?: boolean; reason?: string; maxItems?: number } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // Body is optional.
  }

  const run = async () => {
    const result = await processQueue({ maxItems: body.maxItems });
    // Hand the baton on: a run that ends with work left keeps the pool alive
    // instead of waiting for the next safety-net tick.
    if (result.remaining > 0) {
      await dispatchProcessors('worker-chain');
    }
    return result;
  };

  if (body.wait) {
    const result = await run();
    return NextResponse.json({ status: 'success', ...result });
  }

  after(async () => {
    try {
      await run();
    } catch (error) {
      console.error('[MassUpload Process] Run failed:', error);
    }
  });

  return NextResponse.json(
    { status: 'accepted', reason: body.reason ?? 'unspecified', maxDurationSeconds: MASS_UPLOAD_MAX_DURATION_SECONDS },
    { status: 202 }
  );
}
