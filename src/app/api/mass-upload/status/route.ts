import { NextRequest, NextResponse } from 'next/server';
import { uploadSessions, sourcesToPlaces } from '@/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';
import { forUser } from '@/lib/tenant-db';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { getProcessingStatusCounts } from '@/lib/db-queries';

export const runtime = 'nodejs';

function toUserFriendlyError(rawError: string): string {
  if (/503|overloaded|high demand/i.test(rawError)) return 'AI service was unavailable after multiple attempts';
  if (/429|rate.?limit|quota/i.test(rawError)) return 'Rate limit exceeded after multiple attempts';
  if (/400|invalid|INVALID_ARGUMENT/i.test(rawError)) return 'Could not process this image';
  if (/fetch failed|network|ECONNRESET|ENOTFOUND/i.test(rawError)) return 'Network error during processing';
  if (/not found|404/i.test(rawError)) return 'Image file not found';
  if (/timed out|timeout/i.test(rawError)) return 'Processing timed out after multiple attempts';
  return 'Processing failed after multiple attempts';
}

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

    const tdb = forUser(user.id);

    const found = await tdb.findOwned(uploadSessions, eq(uploadSessions.id, sessionId));
    if (found.status === 'not-found') {
      return NextResponse.json({ status: 'error', message: 'Session not found' }, { status: 404 });
    }
    if (found.status === 'forbidden') {
      return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });
    }

    // Owning the session is NOT owning the rows it names. `meta.uploadedFiles`
    // is rebuilt from source metadata by mass-upload/register, so it is not an
    // authorization boundary. The list is narrowed to the sources the caller
    // owns, and every query below independently re-scopes to the caller too.
    const metadataSourceIds = found.row.meta?.uploadedFiles || [];
    const ownedSources = metadataSourceIds.length > 0
      ? await tdb.selectFields(
          sourcesCurrentSchema,
          { id: sourcesCurrentSchema.id },
          inArray(sourcesCurrentSchema.id, metadataSourceIds)
        )
      : [];
    const sourceIds = ownedSources.map(source => source.id);

    // Get counts per processingStatus
    const counts = await getProcessingStatusCounts(sourceIds, user.id);

    // Count places created from these sources
    let placesCreated = 0;
    if (sourceIds.length > 0) {
      // sources_to_places has no user_id — `selectFieldsVia` scopes it through
      // the sources the caller owns.
      const placesResult = await tdb.selectFieldsVia(
        sourcesToPlaces,
        { count: sql<number>`count(DISTINCT ${sourcesToPlaces.placeId})` },
        inArray(sourcesToPlaces.sourceId, sourceIds)
      );
      placesCreated = Number(placesResult[0]?.count ?? 0);
    }

    // Fetch per-source error messages for failed sources
    let failedErrors: Array<{ sourceId: string; error: string }> = [];
    if (sourceIds.length > 0) {
      const failedSources = await tdb.selectFields(
        sourcesCurrentSchema,
        {
          id: sourcesCurrentSchema.id,
          processingError: sourcesCurrentSchema.processingError,
        },
        and(
          inArray(sourcesCurrentSchema.id, sourceIds),
          eq(sourcesCurrentSchema.processingStatus, 'failed')
        )
      );
      failedErrors = failedSources
        .filter(s => s.processingError)
        .map(s => ({ sourceId: s.id, error: toUserFriendlyError(s.processingError!) }));
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
        // Repeatedly interrupted, never a verdict on the image — retryable.
        stalled: counts['stalled'] || 0,
        cancelled: counts['cancelled'] || 0,
      },
      total: sourceIds.length,
      placesCreated,
      failedErrors,
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
