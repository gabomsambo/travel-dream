import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';
import { forUser } from '@/lib/tenant-db';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';

export const runtime = 'nodejs';

const DismissSchema = z.object({
  sourceIds: z.array(z.string().min(1)).min(1).max(500),
  /** False puts a dismissed screenshot back on the Inbox (the Undo toast). */
  dismissed: z.boolean().optional().default(true),
});

type SourceMeta = NonNullable<(typeof sourcesCurrentSchema.$inferSelect)['meta']>;

function withDismissedAt(meta: SourceMeta | null, dismissedAt: string | null): SourceMeta {
  const next: SourceMeta = { ...(meta ?? {}) };
  const inbox = { ...(next.inbox ?? {}) };
  if (dismissedAt) inbox.dismissedAt = dismissedAt;
  else delete inbox.dismissedAt;
  if (Object.keys(inbox).length === 0) delete next.inbox;
  else next.inbox = inbox;
  return next;
}

function dismissedAtOf(meta: SourceMeta | null): string | null {
  const at = meta?.inbox?.dismissedAt;
  return typeof at === 'string' && at.length > 0 ? at : null;
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
      const rows = await tx.selectFields(
        sourcesCurrentSchema,
        { id: sourcesCurrentSchema.id, meta: sourcesCurrentSchema.meta },
        and(
          inArray(sourcesCurrentSchema.id, sourceIds),
          eq(sourcesCurrentSchema.type, 'screenshot')
        )
      );
      const byId = new Map(rows.map((row) => [row.id, row]));
      const updated: string[] = [];
      for (const id of sourceIds) {
        const row = byId.get(id);
        if (!row) continue;
        const already = dismissedAtOf(row.meta);
        if (!dismissed && !already) continue;
        await tx.update(
          sourcesCurrentSchema,
          {
            meta: withDismissedAt(row.meta, dismissed ? now : null),
            updatedAt: now,
          },
          eq(sourcesCurrentSchema.id, id)
        );
        updated.push(id);
      }
      return updated;
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
