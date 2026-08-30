import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { uploadSessions } from '@/db/schema';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { forUser } from '@/lib/tenant-db';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { del } from '@vercel/blob';

export const runtime = 'nodejs';

const CancelSchema = z.object({
  sessionId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthForApi();
    const body = await request.json();

    const parsed = CancelSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { status: 'error', message: 'Invalid input', errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { sessionId } = parsed.data;
    const tdb = forUser(user.id);

    const found = await tdb.findOwned(uploadSessions, eq(uploadSessions.id, sessionId));
    if (found.status === 'not-found') {
      return NextResponse.json({ status: 'error', message: 'Session not found' }, { status: 404 });
    }
    if (found.status === 'forbidden') {
      return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });
    }

    // Owning the session is not owning the rows it names: `meta.uploadedFiles`
    // is rebuilt from source metadata by mass-upload/register, so it is input to
    // filter, not an authorization boundary. Every query below goes through the
    // tenant accessor, which re-scopes to the caller on its own.
    const sourceIds = found.row.meta?.uploadedFiles || [];
    if (sourceIds.length === 0) {
      return NextResponse.json({ status: 'success', cancelled: 0, alreadyProcessing: 0 });
    }

    // Cancel only sources that are not in flight — 'stalled' ones are parked
    // waiting for a retry, so they are safe to cancel too.
    const cancelled = await tdb.update(
      sourcesCurrentSchema,
      {
        processingStatus: 'cancelled',
        updatedAt: new Date().toISOString(),
      },
      and(
        inArray(sourcesCurrentSchema.id, sourceIds),
        sql`${sourcesCurrentSchema.processingStatus} IN ('queued', 'uploaded', 'stalled')`
      )
    ).returning();

    // Clean up blobs for cancelled sources (best-effort)
    const blobUrls = cancelled
      .map(s => s.uri)
      .filter((uri): uri is string => !!uri && uri.startsWith('https://'));
    if (blobUrls.length > 0) {
      try {
        await del(blobUrls);
      } catch (e) {
        console.warn(`[MassUpload Cancel] Failed to delete ${blobUrls.length} blobs:`, e);
      }
    }

    // Mark session as cancelled
    await tdb.update(uploadSessions, { status: 'cancelled' }, eq(uploadSessions.id, sessionId));

    // Count sources currently in-flight (can't cancel these)
    const inFlight = await tdb.selectFields(
      sourcesCurrentSchema,
      { count: sql<number>`count(*)` },
      and(
        inArray(sourcesCurrentSchema.id, sourceIds),
        sql`${sourcesCurrentSchema.processingStatus} IN ('extracting', 'enriching')`
      )
    );

    return NextResponse.json({
      status: 'success',
      cancelled: cancelled.length,
      alreadyProcessing: inFlight[0]?.count ?? 0,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { status: 'error', message: 'Invalid request', details: error.errors },
        { status: 400 }
      );
    }
    console.error('[MassUpload Cancel] Error:', error);
    return NextResponse.json(
      { status: 'error', message: error instanceof Error ? error.message : 'Cancel failed' },
      { status: 500 }
    );
  }
}
