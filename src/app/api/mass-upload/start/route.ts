import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { dispatchProcessors } from '@/lib/mass-upload/dispatch';
import { db } from '@/db';
import { uploadSessions } from '@/db/schema';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';
import { eq, and, inArray } from 'drizzle-orm';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';

export const runtime = 'nodejs';

const StartSchema = z.object({
  sessionId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthForApi();
    const body = await request.json();

    const parsed = StartSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { status: 'error', message: 'Invalid input', errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { sessionId } = parsed.data;

    // Fetch and verify session
    const session = await db.select()
      .from(uploadSessions)
      .where(eq(uploadSessions.id, sessionId))
      .get();

    if (!session) {
      return NextResponse.json({ status: 'error', message: 'Session not found' }, { status: 404 });
    }
    if (session.userId !== user.id) {
      return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });
    }

    const sourceIds = session.meta?.uploadedFiles || [];
    if (sourceIds.length === 0) {
      return NextResponse.json({ status: 'success', queued: 0, timestamp: new Date().toISOString() });
    }

    // Flip all 'uploaded' sources in this session to 'queued'
    const updated = await db.update(sourcesCurrentSchema)
      .set({
        processingStatus: 'queued',
        updatedAt: new Date().toISOString(),
      })
      .where(and(
        inArray(sourcesCurrentSchema.id, sourceIds),
        eq(sourcesCurrentSchema.processingStatus, 'uploaded')
      ))
      .returning();

    // Start processing now rather than on the next safety-net cron tick. Runs
    // after the response so the upload UI is never held up by it, and a failure
    // here only costs latency — the cron still picks the work up.
    if (updated.length > 0) {
      try {
        after(async () => {
          try {
            await dispatchProcessors('upload-start');
          } catch (err) {
            console.error('[Mass Upload Start] Failed to trigger processing:', err);
          }
        });
      } catch (err) {
        // No request scope to defer into — the cron still picks the work up.
        console.error('[Mass Upload Start] Could not schedule processing trigger:', err);
      }
    }

    return NextResponse.json({
      status: 'success',
      queued: updated.length,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('[Mass Upload Start] Error:', error);
    return NextResponse.json(
      { status: 'error', message: error instanceof Error ? error.message : 'Failed to start processing', timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
