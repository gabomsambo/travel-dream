import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
// TODO(tenant-db): migrate to `forUser(user.id)` from '@/lib/tenant-db'.
// Not migrated in the change that introduced the accessor: rebuilds
// `upload_sessions.meta.uploadedFiles` with a `json_extract` sweep over
// sources; the sweep needs the owner predicate as part of the same change.
// See AGENTS.md § Multi-Tenancy for the rule this exemption suspends.
// eslint-disable-next-line no-restricted-imports -- unmigrated; see the TODO above
import { db } from '@/db';
import { uploadSessions } from '@/db/schema';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';
import { eq, and, sql } from 'drizzle-orm';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { withTransaction, generateSourceId } from '@/lib/db-utils';
import { isAllowedBlobUrl, BLOB_URL_REJECTED_MESSAGE } from '@/lib/blob-url';
import { releaseBlobIfUnreferencedByAnyTenant } from '@/lib/shared-blob';

export const runtime = 'nodejs';

async function sessionStillOpen(
  tx: Pick<typeof db, 'update'>,
  sessionId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await tx
    .update(uploadSessions)
    .set({ fileCount: sql`${uploadSessions.fileCount}` })
    .where(and(eq(uploadSessions.id, sessionId), eq(uploadSessions.userId, userId)))
    .returning({ status: uploadSessions.status });
  return row != null && row.status !== 'cancelled';
}

async function rejectClosedSession(blobUrl: string) {
  await releaseBlobIfUnreferencedByAnyTenant(blobUrl, {}, '[Register]');
  return NextResponse.json(
    { status: 'error', message: 'Upload session was closed', timestamp: new Date().toISOString() },
    { status: 409 }
  );
}

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

    // Pin the caller-supplied URL to the blob store before it is fetched or stored
    if (!isAllowedBlobUrl(blobUrl)) {
      return NextResponse.json(
        { status: 'error', message: BLOB_URL_REJECTED_MESSAGE },
        { status: 400 }
      );
    }

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
    if (session.status === 'cancelled') {
      return rejectClosedSession(blobUrl);
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

      // Keep the skip as a first-class batch outcome. `uploadedFiles` contains
      // only sources actually registered to this session; pointing it at the
      // older source made later rebuilds silently erase the duplicate outcome.
      const closed = await withTransaction(async (tx) => {
        if (!(await sessionStillOpen(tx, sessionId, user.id))) return true;

        if (existingSessionId !== sessionId) {
          await tx.update(uploadSessions)
            .set({ completedCount: sql`${uploadSessions.completedCount} + 1` })
            .where(and(eq(uploadSessions.id, sessionId), eq(uploadSessions.userId, user.id)));
        }

        // Owner-scoped: a session id is client-supplied, and a source row
        // tagged with it may belong to someone else (a session row can be
        // deleted while its sources survive, and blob-complete will then let
        // another caller claim the same id). Without the userId predicate this
        // sweep pulls foreign sources into the caller's session, where the
        // cancel/start/status routes would act on them.
        const sessionSources = await tx.select({ id: sourcesCurrentSchema.id })
          .from(sourcesCurrentSchema)
          .where(and(
            eq(sourcesCurrentSchema.userId, user.id),
            sql`json_extract(${sourcesCurrentSchema.meta}, '$.uploadInfo.sessionId') = ${sessionId}`
          ));
        const [currentSession] = await tx.select({ meta: uploadSessions.meta })
          .from(uploadSessions)
          .where(and(eq(uploadSessions.id, sessionId), eq(uploadSessions.userId, user.id)))
          .limit(1);
        const currentMeta = currentSession?.meta;
        const allSourceIds = sessionSources.map((s: { id: string }) => s.id);

        await tx.update(uploadSessions)
          .set({
            meta: {
              ...(currentMeta ?? { uploadedFiles: [], errors: [] }),
              uploadedFiles: allSourceIds,
              errors: currentMeta?.errors ?? [],
              duplicates: [
                ...(currentMeta?.duplicates ?? []),
                { originalName, duplicateOf: existingSource.id },
              ],
            },
          })
          .where(and(eq(uploadSessions.id, sessionId), eq(uploadSessions.userId, user.id)));
        return false;
      });

      if (closed) {
        return rejectClosedSession(blobUrl);
      }

      await releaseBlobIfUnreferencedByAnyTenant(blobUrl, {}, '[Register]');

      return NextResponse.json({
        status: 'duplicate',
        sourceId: existingSource.id,
        blobUrl: existingSource.uri,
        message: existingSessionId === sessionId
          ? 'Image already uploaded in this session'
          : 'Image already exists from a previous upload',
        timestamp: new Date().toISOString(),
      });
    }

    // No duplicate — create source in a single transaction
    const sourceId = generateSourceId();
    const now = new Date().toISOString();

    const sourceData = await withTransaction(async (tx) => {
      if (!(await sessionStillOpen(tx, sessionId, user.id))) return null;

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

      // Step 4: Rebuild uploadedFiles from this caller's sources in the session.
      // Owner-scoped for the same reason as the duplicate branch above: the
      // session id alone does not establish who owns a source row.
      const sessionSources = await tx.select({ id: sourcesCurrentSchema.id })
        .from(sourcesCurrentSchema)
        .where(and(
          eq(sourcesCurrentSchema.userId, user.id),
          sql`json_extract(${sourcesCurrentSchema.meta}, '$.uploadInfo.sessionId') = ${sessionId}`
        ));

      const allSourceIds = sessionSources.map((s: { id: string }) => s.id);
      const [currentSession] = await tx.select({ meta: uploadSessions.meta })
        .from(uploadSessions)
        .where(and(eq(uploadSessions.id, sessionId), eq(uploadSessions.userId, user.id)))
        .limit(1);
      const currentMeta = currentSession?.meta;
      await tx.update(uploadSessions)
        .set({
          meta: {
            ...(currentMeta ?? { uploadedFiles: [], errors: [] }),
            uploadedFiles: allSourceIds,
            errors: currentMeta?.errors ?? [],
          },
        })
        .where(and(eq(uploadSessions.id, sessionId), eq(uploadSessions.userId, user.id)));

      return created;
    });

    if (!sourceData) {
      return rejectClosedSession(blobUrl);
    }

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
