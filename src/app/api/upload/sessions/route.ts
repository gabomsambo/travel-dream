import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/db-utils';
import { db } from '@/db';
import { uploadSessions, sources } from '@/db/schema';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';
import { eq, and, desc, sql } from 'drizzle-orm';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { z } from 'zod';
import { del } from '@vercel/blob';

export const runtime = 'nodejs';

const CreateSessionSchema = z.object({
  fileCount: z.number().int().nonnegative().optional().default(0),
  metadata: z.record(z.unknown()).optional().default({}),
});

interface UpdateSessionRequest {
  status?: 'active' | 'completed' | 'cancelled';
  metadata?: Record<string, unknown>;
}

function metadataRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      return metadataRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function uploadedFileIds(value: unknown): string[] {
  const uploadedFiles = metadataRecord(value).uploadedFiles;
  return Array.isArray(uploadedFiles)
    ? uploadedFiles.filter((id): id is string => typeof id === 'string')
    : [];
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthForApi();
    const body = await request.json();
    const parsed = CreateSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { status: 'error', message: 'Invalid input', errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { fileCount, metadata } = parsed.data;
    const safeMetadata = { ...metadata };
    delete safeMetadata.uploadedFiles;

    const sessionId = `session_${crypto.randomUUID()}`;

    const newSession = await withErrorHandling(async () => {
      const sessionData = {
        id: sessionId,
        userId: user.id,
        startedAt: new Date().toISOString(),
        fileCount,
        completedCount: 0,
        failedCount: 0,
        status: 'active' as const,
        meta: {
          uploadedFiles: [],
          processingQueue: [],
          errors: [],
          ...safeMetadata
        }
      };

      await db.insert(uploadSessions).values(sessionData);
      return sessionData;
    }, 'createUploadSession');

    return NextResponse.json({
      status: 'success',
      session: newSession,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('Create session API error:', error);

    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to create session',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthForApi();
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const limit = parseInt(searchParams.get('limit') || '10');
    const status = searchParams.get('status');
    const hasUploads = searchParams.get('hasUploads') === 'true';
    const includeDetails = searchParams.get('details') === 'true';

    if (sessionId) {
      // Get specific session
      const session = await db.select()
        .from(uploadSessions)
        .where(eq(uploadSessions.id, sessionId))
        .get();

      if (!session) {
        return NextResponse.json(
          { status: 'error', message: 'Session not found' },
          { status: 404 }
        );
      }
      if (session.userId !== user.id) {
        return NextResponse.json(
          { status: 'error', message: 'Forbidden' },
          { status: 403 }
        );
      }

      let sessionDetails = { ...session };

      if (includeDetails) {
        // Safely parse session metadata
        let sessionMeta = {};
        try {
          if (typeof session.meta === 'string') {
            sessionMeta = JSON.parse(session.meta);
          } else {
            sessionMeta = session.meta || {};
          }
        } catch (parseError) {
          console.warn('Failed to parse session metadata:', parseError);
          sessionMeta = {};
        }

        // Get associated sources using compatible schema.
        // Owning the session is NOT owning the rows it names: this id list is
        // rebuilt from source metadata by mass-upload/register, so each source
        // is fetched scoped to the caller. A foreign id resolves to nothing
        // rather than returning that source's uri and ocrText.
        const uploadedFiles = uploadedFileIds(sessionMeta);
        if (uploadedFiles.length > 0) {
          try {
            const allSources = await Promise.all(
              uploadedFiles.map(async (id: string) => {
                try {
                  return await db.select().from(sourcesCurrentSchema).where(and(
                    eq(sourcesCurrentSchema.id, id),
                    eq(sourcesCurrentSchema.userId, user.id)
                  )).get();
                } catch (error) {
                  console.warn(`Failed to fetch source ${id}:`, error);
                  return null;
                }
              })
            );
            (sessionDetails as any).sources = allSources.filter(Boolean);
          } catch (error) {
            console.warn('Failed to fetch associated sources:', error);
            (sessionDetails as any).sources = [];
          }
        }
      }

      return NextResponse.json({
        status: 'success',
        session: sessionDetails,
        timestamp: new Date().toISOString(),
      });

    } else {
      // List recent sessions for this user only — the activity bell discovers
      // work from this list, so it must never include another tenant's rows.
      const listConditions = [eq(uploadSessions.userId, user.id)];
      if (status === 'active') listConditions.push(eq(uploadSessions.status, 'active'));
      if (hasUploads) {
        listConditions.push(sql`json_array_length(json_extract(${uploadSessions.meta}, '$.uploadedFiles')) > 0`);
      }
      const sessions = await db.select()
        .from(uploadSessions)
        .where(and(...listConditions))
        .orderBy(desc(uploadSessions.startedAt))
        .limit(limit);

      return NextResponse.json({
        status: 'success',
        sessions,
        count: sessions.length,
        timestamp: new Date().toISOString(),
      });
    }

  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('Get sessions API error:', error);

    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to get sessions',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuthForApi();
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { status: 'error', message: 'Session ID required' },
        { status: 400 }
      );
    }

    const body = await request.json() as UpdateSessionRequest;
    const { status, metadata } = body;

    const currentSession = await db.select()
      .from(uploadSessions)
      .where(eq(uploadSessions.id, sessionId))
      .get();

    if (!currentSession) {
      return NextResponse.json(
        { status: 'error', message: 'Session not found' },
        { status: 404 }
      );
    }
    if (currentSession.userId !== user.id) {
      return NextResponse.json(
        { status: 'error', message: 'Forbidden' },
        { status: 403 }
      );
    }

    const updatedSession = await withErrorHandling(async () => {

      const updateData: any = {};

      if (status) {
        updateData.status = status;
      }

      if (metadata) {
        const safeMetadata = { ...metadata };
        delete safeMetadata.uploadedFiles;
        updateData.meta = {
          ...metadataRecord(currentSession.meta),
          ...safeMetadata
        };
      }

      const [updated] = await db.update(uploadSessions)
        .set(updateData)
        .where(eq(uploadSessions.id, sessionId))
        .returning();

      return updated;
    }, 'updateUploadSession');

    return NextResponse.json({
      status: 'success',
      session: updatedSession,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('Update session API error:', error);

    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to update session',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAuthForApi();
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const cleanup = searchParams.get('cleanup') === 'true';

    if (!sessionId) {
      return NextResponse.json(
        { status: 'error', message: 'Session ID required' },
        { status: 400 }
      );
    }

    const result = await withErrorHandling(async () => {
      // Get session before deletion
      const session = await db.select()
        .from(uploadSessions)
        .where(eq(uploadSessions.id, sessionId))
        .get();

      if (!session) {
        throw new Error('Session not found');
      }

      if (session.userId !== user.id) {
        throw new Error('Session not found');
      }

      // Optional cleanup of associated files
      if (cleanup) {
        const uploadedFiles = uploadedFileIds(session.meta);
        if (uploadedFiles.length > 0) {
          // Get source records to clean up files
          const sourceRecords = await Promise.all(
            uploadedFiles.map(async (id) => {
              try {
                return await db.select().from(sourcesCurrentSchema).where(and(
                  eq(sourcesCurrentSchema.id, id),
                  eq(sourcesCurrentSchema.userId, user.id)
                )).get();
              } catch (error) {
                console.warn(`Failed to fetch source for cleanup ${id}:`, error);
                return null;
              }
            })
          );

          // Clean up the stored blob. Pre-Blob records whose files lived under
          // public/uploads are left alone: that storage never existed on Vercel,
          // and those local files are deliberately not migrated.
          for (const source of sourceRecords) {
            if (source) {
              try {
                const uploadInfo = (source.meta as any)?.uploadInfo;
                if (uploadInfo?.storageType === 'vercel-blob' && source.uri?.startsWith('https://')) {
                  await del(source.uri);
                }
              } catch (cleanupError) {
                console.warn(`Failed to cleanup files for source ${source.id}:`, cleanupError);
              }
            }
          }

          // Delete source records
          for (const source of sourceRecords) {
            if (!source) continue;
            try {
              await db.delete(sourcesCurrentSchema).where(and(
                eq(sourcesCurrentSchema.id, source.id),
                eq(sourcesCurrentSchema.userId, user.id)
              ));
            } catch (deleteError) {
              console.warn(`Failed to delete source ${source.id}:`, deleteError);
            }
          }
        }
      }

      // Delete session
      await db.delete(uploadSessions).where(eq(uploadSessions.id, sessionId));

      return { sessionId, cleaned: cleanup };
    }, 'deleteUploadSession');

    return NextResponse.json({
      status: 'success',
      result,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('Delete session API error:', error);

    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to delete session',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
