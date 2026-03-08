import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { db } from '@/db';
import { uploadSessions } from '@/db/schema';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';
import { eq, and, sql } from 'drizzle-orm';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { withTransaction, generateSourceId } from '@/lib/db-utils';
import { del } from '@vercel/blob';

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

    // Compute real SHA-1 content hash from blob
    let sha1Hash: string;
    try {
      const blobResponse = await fetch(blobUrl);
      if (!blobResponse.ok) {
        return NextResponse.json(
          { status: 'error', message: `Failed to fetch blob for hashing: ${blobResponse.status}` },
          { status: 502 }
        );
      }
      const blobBuffer = Buffer.from(await blobResponse.arrayBuffer());
      sha1Hash = crypto.createHash('sha1').update(blobBuffer).digest('hex');
    } catch (hashError) {
      console.error('[Register] Hash computation failed:', hashError);
      // Fallback: use random hash (don't block upload on hash failure)
      sha1Hash = `fallback_${crypto.randomUUID()}`;
    }

    // Duplicate detection: check if a source with the same hash exists for this user
    const existingSource = await db.select({
      id: sourcesCurrentSchema.id,
      uri: sourcesCurrentSchema.uri,
      meta: sourcesCurrentSchema.meta,
      processingStatus: sourcesCurrentSchema.processingStatus,
    }).from(sourcesCurrentSchema)
      .where(and(
        eq(sourcesCurrentSchema.userId, user.id),
        sql`json_extract(${sourcesCurrentSchema.hash}, '$.sha1') = ${sha1Hash}`
      ))
      .limit(1)
      .get();

    if (existingSource) {
      const existingSessionId = (existingSource.meta as Record<string, unknown> & { uploadInfo?: { sessionId?: string } })?.uploadInfo?.sessionId;

      if (existingSessionId === sessionId) {
        // Same session — pure duplicate, return existing
        return NextResponse.json({
          status: 'duplicate',
          sourceId: existingSource.id,
          blobUrl: existingSource.uri,
          message: 'Image already uploaded in this session',
          timestamp: new Date().toISOString(),
        });
      }

      // Different session — add existing source to current session's tracking (transactional)
      await withTransaction(async (tx) => {
        await tx.update(uploadSessions)
          .set({ completedCount: sql`${uploadSessions.completedCount} + 1` })
          .where(eq(uploadSessions.id, sessionId));

        const sessionSources = await tx.select({ id: sourcesCurrentSchema.id })
          .from(sourcesCurrentSchema)
          .where(sql`json_extract(${sourcesCurrentSchema.meta}, '$.uploadInfo.sessionId') = ${sessionId}`);
        const allSourceIds = [...sessionSources.map((s: { id: string }) => s.id), existingSource.id];

        await tx.update(uploadSessions)
          .set({ meta: { uploadedFiles: allSourceIds, processingQueue: allSourceIds, errors: [] } })
          .where(eq(uploadSessions.id, sessionId));
      });

      // Delete the duplicate blob that was just uploaded (after tx commits)
      try {
        await del(blobUrl);
      } catch (e) {
        console.warn('[Register] Failed to delete duplicate blob:', e);
      }

      return NextResponse.json({
        status: 'duplicate',
        sourceId: existingSource.id,
        blobUrl: existingSource.uri,
        message: 'Image already exists from a previous upload',
        timestamp: new Date().toISOString(),
      });
    }

    // No duplicate — create source in a single transaction
    const sourceId = generateSourceId();
    const now = new Date().toISOString();

    const sourceData = await withTransaction(async (tx) => {
      // Step 1: Create source record
      const [created] = await tx.insert(sourcesCurrentSchema).values({
        id: sourceId,
        type: 'screenshot',
        uri: blobUrl,
        hash: { sha1: sha1Hash },
        ocrText: null,
        lang: 'en',
        meta: {
          uploadInfo: {
            sessionId,
            originalName,
            fileSize,
            mimeType,
            storedPath: blobUrl,
            storageType: 'vercel-blob' as const,
            ocrStatus: 'pending',
            uploadedAt: now,
          }
        },
        userId: user.id,
        createdAt: now,
        updatedAt: now,
      }).returning();

      // Step 2: Set processing status to 'uploaded'
      await tx.update(sourcesCurrentSchema)
        .set({ processingStatus: 'uploaded', updatedAt: now })
        .where(eq(sourcesCurrentSchema.id, created.id));

      // Step 3: Atomically increment session count
      await tx.update(uploadSessions)
        .set({ completedCount: sql`${uploadSessions.completedCount} + 1` })
        .where(eq(uploadSessions.id, sessionId));

      // Step 4: Rebuild uploadedFiles from all session sources
      const sessionSources = await tx.select({ id: sourcesCurrentSchema.id })
        .from(sourcesCurrentSchema)
        .where(sql`json_extract(${sourcesCurrentSchema.meta}, '$.uploadInfo.sessionId') = ${sessionId}`);

      const allSourceIds = sessionSources.map((s: { id: string }) => s.id);
      await tx.update(uploadSessions)
        .set({ meta: { uploadedFiles: allSourceIds, processingQueue: allSourceIds, errors: [] } })
        .where(eq(uploadSessions.id, sessionId));

      return created;
    });

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
