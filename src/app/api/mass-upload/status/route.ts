import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { uploadSessions, sourcesToPlaces } from '@/db/schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { getProcessingStatusCounts } from '@/lib/db-queries';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthForApi();
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { status: 'error', message: 'sessionId query parameter required' },
        { status: 400 }
      );
    }

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

    // Get counts per processingStatus
    const counts = await getProcessingStatusCounts(sourceIds);

    // Count places created from these sources
    let placesCreated = 0;
    if (sourceIds.length > 0) {
      const placesResult = await db.select({
        count: sql<number>`count(DISTINCT ${sourcesToPlaces.placeId})`,
      })
      .from(sourcesToPlaces)
      .where(inArray(sourcesToPlaces.sourceId, sourceIds));
      placesCreated = Number(placesResult[0]?.count ?? 0);
    }

    return NextResponse.json({
      status: 'success',
      sessionId,
      counts: {
        uploaded: counts['uploaded'] || 0,
        queued: counts['queued'] || 0,
        extracting: counts['extracting'] || 0,
        enriching: counts['enriching'] || 0,
        completed: counts['completed'] || 0,
        failed: counts['failed'] || 0,
      },
      total: sourceIds.length,
      placesCreated,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('[Mass Upload Status] Error:', error);
    return NextResponse.json(
      { status: 'error', message: error instanceof Error ? error.message : 'Failed to get status', timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
