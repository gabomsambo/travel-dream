import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { uploadSessions } from '@/db/schema';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';
import { eq, and, inArray, sql } from 'drizzle-orm';
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
      return NextResponse.json({ status: 'success', cancelled: 0, alreadyProcessing: 0 });
    }

    // Cancel only 'queued' and 'uploaded' sources (safe to cancel)
    const cancelled = await db.update(sourcesCurrentSchema)
      .set({
        processingStatus: 'cancelled',
        updatedAt: new Date().toISOString(),
      })
      .where(and(
        inArray(sourcesCurrentSchema.id, sourceIds),
        sql`${sourcesCurrentSchema.processingStatus} IN ('queued', 'uploaded')`
      ))
      .returning();

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
    await db.update(uploadSessions)
      .set({ status: 'cancelled' })
      .where(eq(uploadSessions.id, sessionId));

    // Count sources currently in-flight (can't cancel these)
    const inFlight = await db.select({ count: sql<number>`count(*)` })
      .from(sourcesCurrentSchema)
      .where(and(
        inArray(sourcesCurrentSchema.id, sourceIds),
        sql`${sourcesCurrentSchema.processingStatus} IN ('extracting', 'enriching')`
      ));

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
