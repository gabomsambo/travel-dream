import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { uploadSessions } from '@/db/schema';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';
import { eq, sql } from 'drizzle-orm';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { createSource } from '@/lib/db-mutations';
import { withErrorHandling } from '@/lib/db-utils';

export const runtime = 'nodejs';

const RegisterSchema = z.object({
  sessionId: z.string().min(1),
  blobUrl: z.string().url(),
  originalName: z.string().min(1),
  fileSize: z.number().int().positive(),
  mimeType: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthForApi();
    const body = await request.json();

    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { status: 'error', message: 'Invalid input', errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { sessionId, blobUrl, originalName, fileSize, mimeType } = parsed.data;

    // Verify session exists and belongs to user
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

    // Create source record (uses sourcesCurrentSchema internally)
    const sourceData = await createSource({
      type: 'screenshot',
      uri: blobUrl,
      hash: { sha1: `blob_${crypto.randomUUID()}` },
      ocrText: null,
      lang: 'en',
      meta: {
        uploadInfo: {
          sessionId,
          originalName,
          fileSize,
          mimeType,
          storedPath: blobUrl,
          storageType: 'vercel-blob',
          ocrStatus: 'pending',
          uploadedAt: new Date().toISOString(),
        }
      }
    }, user.id);

    // Set processingStatus to 'uploaded' (createSource doesn't set this)
    await db.update(sourcesCurrentSchema)
      .set({ processingStatus: 'uploaded', updatedAt: new Date().toISOString() })
      .where(eq(sourcesCurrentSchema.id, sourceData.id));

    // Update session: increment count, then rebuild uploadedFiles from sources table
    // This is race-safe because the source record is already committed above
    await withErrorHandling(async () => {
      await db.update(uploadSessions)
        .set({ completedCount: sql`${uploadSessions.completedCount} + 1` })
        .where(eq(uploadSessions.id, sessionId));

      // Query ALL sources for this session directly from the DB (race-safe)
      const sessionSources = await db.select({ id: sourcesCurrentSchema.id })
        .from(sourcesCurrentSchema)
        .where(
          sql`json_extract(${sourcesCurrentSchema.meta}, '$.uploadInfo.sessionId') = ${sessionId}`
        );

      const allSourceIds = sessionSources.map(s => s.id);

      await db.update(uploadSessions)
        .set({
          meta: {
            uploadedFiles: allSourceIds,
            processingQueue: allSourceIds,
            errors: []
          }
        })
        .where(eq(uploadSessions.id, sessionId));
    }, 'updateSessionAfterRegister');

    return NextResponse.json({
      status: 'success',
      sourceId: sourceData.id,
      blobUrl,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('[Mass Upload Register] Error:', error);
    return NextResponse.json(
      { status: 'error', message: error instanceof Error ? error.message : 'Failed to register upload', timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
