import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';
import { forUser } from '@/lib/tenant-db';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';

export const runtime = 'nodejs';

const DismissSchema = z.object({
  sourceIds: z.array(z.string().min(1)).min(1).max(500),
  /** False puts a dismissed screenshot back on the Inbox (the Undo toast). */
  dismissed: z.boolean().optional().default(true),
});

/** Patch `$.inbox.dismissedAt` on the row as it is at commit time. */
function metaSettingDismissedAt(dismissedAt: string) {
  return sql`json_set(COALESCE(${sourcesCurrentSchema.meta}, '{}'), '$.inbox.dismissedAt', ${dismissedAt})`;
}

/** Drop `$.inbox.dismissedAt`, and drop `$.inbox` when that leaves it empty. */
function metaClearingDismissedAt() {
  const meta = sourcesCurrentSchema.meta;
  const strip = () => sql`json_remove(${meta}, '$.inbox.dismissedAt')`;
  return sql`CASE
    WHEN json_extract(${meta}, '$.inbox.dismissedAt') IS NULL THEN ${meta}
    WHEN json_extract(${strip()}, '$.inbox') = '{}'
    THEN json_remove(${strip()}, '$.inbox')
    ELSE ${strip()}
  END`;
}

/**
 * Hide a screenshot from the Inbox, or put it back.
 *
 * Writes `meta.inbox.dismissedAt` only. The file, the blob URL, and every
 * place made from the screenshot stay where they are — the Inbox dismisses,
 * it does not delete.
 *
 * Ids the caller does not own are skipped. The list is not an authorization
 * boundary — the read and the update are scoped to the caller on their own.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthForApi();
    const parsed = DismissSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { status: 'error', message: 'Invalid input', errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const sourceIds = Array.from(new Set(parsed.data.sourceIds));
    const dismissed = parsed.data.dismissed;
    const tdb = forUser(user.id);
    const now = new Date().toISOString();

    const changed = await tdb.transaction(async (tx) => {
      const written = await tx.update(
        sourcesCurrentSchema,
        {
          meta: dismissed ? metaSettingDismissedAt(now) : metaClearingDismissedAt(),
          updatedAt: now,
        },
        and(
          inArray(sourcesCurrentSchema.id, sourceIds),
          eq(sourcesCurrentSchema.type, 'screenshot'),
          dismissed
            ? sql`json_extract(${sourcesCurrentSchema.meta}, '$.inbox.dismissedAt') IS NULL`
            : sql`json_extract(${sourcesCurrentSchema.meta}, '$.inbox.dismissedAt') IS NOT NULL`
        )
      ).returning({ id: sourcesCurrentSchema.id });
      const updated = new Set(written.map((row) => row.id));
      return sourceIds.filter((id) => updated.has(id));
    });

    if (changed.length === 0) {
      return NextResponse.json(
        { status: 'error', message: dismissed ? 'Nothing to dismiss' : 'Nothing to put back' },
        { status: 404 }
      );
    }

    return NextResponse.json({ status: 'success', sourceIds: changed, dismissed });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('[Inbox Dismiss] Error:', error);
    return NextResponse.json(
      { status: 'error', message: 'Failed to dismiss' },
      { status: 500 }
    );
  }
}
