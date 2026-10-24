import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { uploadSessions } from '@/db/schema';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';
import { eq, and, sql } from 'drizzle-orm';
import { forUser } from '@/lib/tenant-db';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { releaseBlobsIfUnreferenced } from '@/lib/shared-blob';

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

    const found = await tdb.findOwned(uploadSessions, sessionId);
    if (found.status === 'not-found') {
      return NextResponse.json({ status: 'error', message: 'Session not found' }, { status: 404 });
    }
    if (found.status === 'forbidden') {
      return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });
    }

    const { cancelled, alreadyProcessing } = await tdb.transaction(async (tx) => {
      await tx.update(
        uploadSessions,
        { status: 'cancelled' },
        eq(uploadSessions.id, sessionId)
      );

      const forSession = sql`json_extract(${sourcesCurrentSchema.meta}, '$.uploadInfo.sessionId') = ${sessionId}`;
      const cancelledRows = await tx.update(
        sourcesCurrentSchema,
        {
          processingStatus: 'cancelled',
          updatedAt: new Date().toISOString(),
        },
        and(
          forSession,
          sql`${sourcesCurrentSchema.processingStatus} IN ('queued', 'uploaded', 'stalled')`
        )
      ).returning();

      const inFlight = await tx.selectFields(
        sourcesCurrentSchema,
        { count: sql<number>`count(*)` },
        and(
          forSession,
          sql`${sourcesCurrentSchema.processingStatus} IN ('extracting', 'enriching')`
        )
      );

      return {
        cancelled: cancelledRows,
        alreadyProcessing: Number(inFlight[0]?.count ?? 0),
      };
    });

    const blobUrls = cancelled
      .map(s => s.uri)
      .filter((uri): uri is string => !!uri && uri.startsWith('https://'));
    if (blobUrls.length > 0) {
      try {
        await releaseBlobsIfUnreferenced(
          user.id,
          blobUrls,
          { excludeSourceIds: cancelled.map((s) => s.id) },
          '[MassUpload Cancel]'
        );
      } catch (e) {
        console.warn(`[MassUpload Cancel] Failed to delete ${blobUrls.length} blobs:`, e);
      }
    }

    return NextResponse.json({
      status: 'success',
      cancelled: cancelled.length,
      alreadyProcessing,
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
