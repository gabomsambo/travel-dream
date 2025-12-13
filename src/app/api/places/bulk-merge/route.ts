import { NextRequest, NextResponse } from 'next/server';
import { bulkMergePlaces } from '@/lib/db-mutations';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BulkMergeSchema = z.object({
  clusters: z.array(z.object({
    targetId: z.string().min(1),
    sourceIds: z.array(z.string().min(1)).min(1),
    confidence: z.number().min(0).max(1)
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

    return NextResponse.json({
      status: 'success',
      success: result.success,
      failed: result.failed,
      results: result.results,
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
