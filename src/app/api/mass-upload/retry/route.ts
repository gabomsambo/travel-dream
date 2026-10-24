import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';
import { dispatchProcessors } from '@/lib/mass-upload/dispatch';
import {
  metaWithRetryPrevious,
  metaWithoutRetryPrevious,
  retryPreviousOf,
  type SourceMeta,
  type SourceRetryPrevious,
} from '@/lib/mass-upload/retry-previous';
import { forUser } from '@/lib/tenant-db';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';

export const runtime = 'nodejs';

const RetrySchema = z.object({
  sourceIds: z.array(z.string().min(1)).min(1).max(500),
  /** True restores the failed or stalled row while the retry is still queued and unclaimed. */
  undo: z.boolean().optional().default(false),
});

type Tenant = ReturnType<typeof forUser>;

const ALREADY_STARTED = 'Processing already started.';

class RetryAlreadyStarted extends Error {
  constructor() {
    super(ALREADY_STARTED);
    this.name = 'RetryAlreadyStarted';
  }
}

function isAlreadyStarted(error: unknown): boolean {
  return error instanceof Error && (error.name === 'RetryAlreadyStarted' || error.message === ALREADY_STARTED);
}

/**
 * Put failed or stalled screenshots back on the upload queue, or undo that
 * while the row is still queued and unclaimed.
 *
 * The cached Gemini extraction on `meta.massUpload` is left in place, so the
 * next run reuses it instead of paying for the same read again. Counters reset
 * so a manual retry starts a fresh budget, and the previous failed or stalled
 * row is kept on `meta.retry.previous` until a worker claims it. Undo restores
 * that snapshot only while every owned row in the request is still queued and
 * unleased. If any of them has already been claimed, none are restored and the
 * answer is that processing already started. A stall (temporary outage) is
 * retryable here too; the Inbox
 * shows that state as "Still trying" and does not ask the user to press this.
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
    if (parsed.data.undo) return await undoRetry(tdb, sourceIds);
    return await requeue(tdb, sourceIds);
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

async function requeue(tdb: Tenant, sourceIds: string[]) {
  const now = new Date().toISOString();
  const queuedIds = await tdb.transaction(async (tx) => {
    const rows = await tx.selectFields(
      sourcesCurrentSchema,
      {
        id: sourcesCurrentSchema.id,
        meta: sourcesCurrentSchema.meta,
        processingStatus: sourcesCurrentSchema.processingStatus,
        processingAttempts: sourcesCurrentSchema.processingAttempts,
        processingInterruptions: sourcesCurrentSchema.processingInterruptions,
        processingError: sourcesCurrentSchema.processingError,
      },
      and(
        inArray(sourcesCurrentSchema.id, sourceIds),
        eq(sourcesCurrentSchema.type, 'screenshot'),
        inArray(sourcesCurrentSchema.processingStatus, ['failed', 'stalled'])
      )
    );
    const updated: string[] = [];
    for (const row of rows) {
      if (row.processingStatus !== 'failed' && row.processingStatus !== 'stalled') continue;
      const written = await tx.update(
        sourcesCurrentSchema,
        {
          processingStatus: 'queued',
          processingAttempts: 0,
          processingInterruptions: 0,
          processingError: null,
          processingLeaseId: null,
          processingStartedAt: null,
          nextAttemptAt: null,
          meta: metaWithRetryPrevious(row.meta, {
            processingStatus: row.processingStatus,
            processingAttempts: row.processingAttempts ?? 0,
            processingInterruptions: row.processingInterruptions ?? 0,
            processingError: row.processingError ?? null,
          }),
          updatedAt: now,
        },
        and(
          eq(sourcesCurrentSchema.id, row.id),
          inArray(sourcesCurrentSchema.processingStatus, ['failed', 'stalled'])
        )
      ).returning({ id: sourcesCurrentSchema.id });
      if (written.length > 0) updated.push(row.id);
    }
    return sourceIds.filter((id) => updated.includes(id));
  });

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
}

async function undoRetry(tdb: Tenant, sourceIds: string[]) {
  const now = new Date().toISOString();
  try {
    const restored = await tdb.transaction(async (tx) => {
      const rows = await tx.selectFields(
        sourcesCurrentSchema,
        {
          id: sourcesCurrentSchema.id,
          meta: sourcesCurrentSchema.meta,
          processingStatus: sourcesCurrentSchema.processingStatus,
          processingLeaseId: sourcesCurrentSchema.processingLeaseId,
        },
        and(
          inArray(sourcesCurrentSchema.id, sourceIds),
          eq(sourcesCurrentSchema.type, 'screenshot')
        )
      );
      const byId = new Map(rows.map((row) => [row.id, row]));
      const ready: Array<{ id: string; previous: SourceRetryPrevious; meta: SourceMeta }> = [];
      for (const id of sourceIds) {
        const row = byId.get(id);
        if (!row) continue;
        const previous = retryPreviousOf(row.meta);
        const cleared = metaWithoutRetryPrevious(row.meta);
        const waiting = row.processingStatus === 'queued' && row.processingLeaseId == null;
        if (!previous || !cleared || !waiting) throw new RetryAlreadyStarted();
        ready.push({ id, previous, meta: cleared });
      }
      if (ready.length === 0) return [];
      const restoredIds: string[] = [];
      for (const item of ready) {
        const written = await tx.update(
          sourcesCurrentSchema,
          {
            processingStatus: item.previous.processingStatus,
            processingAttempts: item.previous.processingAttempts,
            processingInterruptions: item.previous.processingInterruptions,
            processingError: item.previous.processingError,
            processingLeaseId: null,
            processingStartedAt: null,
            nextAttemptAt: null,
            meta: item.meta,
            updatedAt: now,
          },
          and(
            eq(sourcesCurrentSchema.id, item.id),
            eq(sourcesCurrentSchema.processingStatus, 'queued'),
            isNull(sourcesCurrentSchema.processingLeaseId)
          )
        ).returning({ id: sourcesCurrentSchema.id });
        if (written.length === 0) throw new RetryAlreadyStarted();
        restoredIds.push(item.id);
      }
      return restoredIds;
    });

    if (restored.length === 0) {
      return NextResponse.json(
        { status: 'error', message: 'Nothing to put back' },
        { status: 404 }
      );
    }
    return NextResponse.json({ status: 'success', sourceIds: restored });
  } catch (error) {
    if (isAlreadyStarted(error)) {
      return NextResponse.json(
        { status: 'error', message: ALREADY_STARTED },
        { status: 409 }
      );
    }
    throw error;
  }
}
