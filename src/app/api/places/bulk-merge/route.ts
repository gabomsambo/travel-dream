import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { bulkMergePlaces } from '@/lib/db-mutations';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BulkMergeSchema = z.object({
  clusters: z.array(z.object({
    targetId: z.string().min(1),
    sourceIds: z.array(z.string().min(1)).min(1),
    confidence: z.number().min(0).max(1),
    // Optional picks for single-value fields both places already have.
    // The value is a place id in this cluster; unknown fields are ignored later.
    fieldOverrides: z.record(z.string(), z.string().min(1)).optional(),
  })).min(1).max(50)
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthForApi();
    const body = await request.json();

    const validation = BulkMergeSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Invalid request data',
          errors: validation.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          })),
        },
        { status: 400 }
      );
    }

    const { clusters } = validation.data;

    const result = await bulkMergePlaces(clusters, user.id);
    const reportedResults = result.results.map(
      ({ notFound: _notFound, ...entry }: { notFound?: boolean }) => entry
    );
    const everyClusterMissing =
      result.success === 0 &&
      result.failed > 0 &&
      result.results.every((entry: { notFound?: boolean }) => entry.notFound === true);

    // Library stats count places with status library. Absorbed rows are
    // archived, and an Inbox survivor becomes Library when it absorbs a
    // Library place, so the cached totals are not a simple decrement.
    if (result.success > 0) {
      revalidateTag(`library-stats:${user.id}`);
    }

    if (everyClusterMissing) {
      return NextResponse.json({
        status: 'error',
        message: 'Place not found',
        success: result.success,
        failed: result.failed,
        results: reportedResults,
        timestamp: new Date().toISOString(),
      }, { status: 404 });
    }

    return NextResponse.json({
      status: 'success',
      success: result.success,
      failed: result.failed,
      results: reportedResults,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('[API] Bulk merge error:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Bulk merge failed',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
