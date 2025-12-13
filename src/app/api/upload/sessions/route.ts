import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/db-utils';
import { db } from '@/db';
import { uploadSessions, sources } from '@/db/schema';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';

export const runtime = 'nodejs';

interface CreateSessionRequest {
  fileCount?: number;
  metadata?: Record<string, any>;
}

interface UpdateSessionRequest {
  status?: 'active' | 'completed' | 'cancelled';
  metadata?: Record<string, any>;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthForApi();
    const body = await request.json() as CreateSessionRequest;
    const { fileCount = 0, metadata = {} } = body;

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
          ...metadata
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

        // Get associated sources using compatible schema
        const uploadedFiles = (sessionMeta as any)?.uploadedFiles || [];
        if (uploadedFiles.length > 0) {
          try {
            const allSources = await Promise.all(
              uploadedFiles.map(async (id: string) => {
                try {
                  return await db.select().from(sourcesCurrentSchema).where(eq(sourcesCurrentSchema.id, id)).get();
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
      // List recent sessions
      const sessions = await db.select()
        .from(uploadSessions)
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

    const updatedSession = await withErrorHandling(async () => {
      // Get current session
      const currentSession = await db.select()
        .from(uploadSessions)
        .where(eq(uploadSessions.id, sessionId))
        .get();

      if (!currentSession) {
        throw new Error('Session not found');
      }

      const updateData: any = {};

      if (status) {
        updateData.status = status;
      }

      if (metadata) {
        updateData.meta = {
          ...currentSession.meta,
          ...metadata
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

      // Optional cleanup of associated files
      if (cleanup) {
        const uploadedFiles = session.meta?.uploadedFiles || [];
        if (uploadedFiles.length > 0) {
          // Get source records to clean up files
          const sourceRecords = await Promise.all(
            uploadedFiles.map(async (id) => {
              try {
                return await db.select().from(sourcesCurrentSchema).where(eq(sourcesCurrentSchema.id, id)).get();
              } catch (error) {
                console.warn(`Failed to fetch source for cleanup ${id}:`, error);
                return null;
              }
            })
          );

          // Clean up files (import dynamically to avoid issues)
          const { fileStorageService } = await import('@/lib/file-storage');

          for (const source of sourceRecords) {
            if (source) {
              try {
                const uploadInfo = (source.meta as any)?.uploadInfo;
                if (uploadInfo) {
                  await fileStorageService.deleteFile(
                    uploadInfo.storedPath,
                    uploadInfo.thumbnailPath
                  );
                }
              } catch (cleanupError) {
                console.warn(`Failed to cleanup files for source ${source.id}:`, cleanupError);
              }
            }
          }

          // Delete source records
          for (const fileId of uploadedFiles) {
            try {
              await db.delete(sourcesCurrentSchema).where(eq(sourcesCurrentSchema.id, fileId));
            } catch (deleteError) {
              console.warn(`Failed to delete source ${fileId}:`, deleteError);
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