import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';
import { dispatchProcessors } from '@/lib/mass-upload/dispatch';
import { forUser } from '@/lib/tenant-db';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';

export const runtime = 'nodejs';

const RetrySchema = z.object({
  sourceIds: z.array(z.string().min(1)).min(1).max(500),
});

/**
 * Put failed or stalled screenshots back on the upload queue.
 *
 * The cached Gemini extraction on `meta.massUpload` is left in place, so the
 * next run reuses it instead of paying for the same read again. Counters reset
 * so a manual retry starts a fresh budget. A stall (temporary outage) is
 * retryable here too; the Inbox shows that state as "Still trying" and does
 * not ask the user to press this.
 *
 * Ids the caller does not own are skipped. The list is not an authorization
 * boundary — the update is scoped to the caller on its own.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthForApi();
    const parsed = RetrySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { status: 'error', message: 'Invalid input', errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const sourceIds = Array.from(new Set(parsed.data.sourceIds));
    const tdb = forUser(user.id);
    const updated = await tdb.update(
      sourcesCurrentSchema,
      {
        processingStatus: 'queued',
        processingAttempts: 0,
        processingInterruptions: 0,
        processingError: null,
        processingLeaseId: null,
        processingStartedAt: null,
        nextAttemptAt: null,
        updatedAt: new Date().toISOString(),
      },
      and(
        inArray(sourcesCurrentSchema.id, sourceIds),
        eq(sourcesCurrentSchema.type, 'screenshot'),
        inArray(sourcesCurrentSchema.processingStatus, ['failed', 'stalled'])
      )
    ).returning({ id: sourcesCurrentSchema.id });

    const requeued = new Set(updated.map((row) => row.id));
    const queuedIds = sourceIds.filter((id) => requeued.has(id));
    if (queuedIds.length === 0) {
      return NextResponse.json(
        { status: 'error', message: 'Nothing to try again' },
        { status: 404 }
      );
    }

    // Same trigger as Start: the cron still picks the work up if this cannot run.
    try {
      after(async () => {
        try {
          await dispatchProcessors('inbox-retry', 'grow');
        } catch (err) {
          console.error('[Mass Upload Retry] Failed to trigger processing:', err);
        }
      });
    } catch (err) {
      console.error('[Mass Upload Retry] Could not schedule processing trigger:', err);
    }

    return NextResponse.json({ status: 'success', sourceIds: queuedIds });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('[Mass Upload Retry] Error:', error);
    return NextResponse.json(
      { status: 'error', message: 'Failed to try again' },
      { status: 500 }
    );
  }
}
