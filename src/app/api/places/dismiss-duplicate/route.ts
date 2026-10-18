import { NextRequest, NextResponse } from 'next/server';
// TODO(tenant-db): migrate to `forUser(user.id)` from '@/lib/tenant-db'.
// Not migrated in the change that introduced the accessor:
// insert/delete/select over `dismissed_duplicates`; straightforward, and the
// accessor already covers every shape it uses.
// See AGENTS.md § Multi-Tenancy for the rule this exemption suspends.
// eslint-disable-next-line no-restricted-imports -- unmigrated; see the TODO above
import { db } from '@/db';
import { dismissedDuplicates } from '@/db/schema';
import { eq, and, or } from 'drizzle-orm';
import { getOwnedPlaceIds } from '@/lib/db-queries';
import { insertFreshDismissPairs } from '@/lib/db-mutations';
import { withTransaction } from '@/lib/db-utils';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { clearDuplicateScanCache } from '@/lib/duplicate-scan-cache';
import { z } from 'zod';

export const runtime = 'nodejs';

const DismissPairSchema = z.object({
  placeId1: z.string().min(1),
  placeId2: z.string().min(1),
});

const DismissRequestSchema = z.object({
  pairs: z.array(DismissPairSchema).min(1).max(100),
  reason: z.string().optional(),
});

const UndismissRequestSchema = z.object({
  pairs: z.array(DismissPairSchema).min(1).max(100),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthForApi();
    const body = await request.json();
    const validation = DismissRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Invalid request body',
          errors: validation.error.errors,
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    const { pairs, reason } = validation.data;

    // The pair is stored on the caller's own row, so a foreign place id
    // would otherwise be recorded without ever failing.
    const namedPlaceIds = pairs.flatMap(({ placeId1, placeId2 }) => [placeId1, placeId2]);
    const ownedPlaceIds = await getOwnedPlaceIds(namedPlaceIds, user.id);
    if (ownedPlaceIds.size !== new Set(namedPlaceIds).size) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'One or more places were not found',
          timestamp: new Date().toISOString(),
        },
        { status: 404 }
      );
    }

    const recorded = await withTransaction((tx) => insertFreshDismissPairs(tx, user.id, pairs, reason));

    // The scan caches clusters after filtering dismissals, so a dismiss has to
    // drop that cache or the next load serves the group that was just dismissed.
    clearDuplicateScanCache();

    return NextResponse.json({
      status: 'success',
      dismissed: pairs.length,
      inserted: recorded.pairs,
      message: `Dismissed ${pairs.length} duplicate pair(s)`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('Dismiss duplicate API error:', error);

    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to dismiss duplicates',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAuthForApi();
    const body = await request.json();
    const validation = UndismissRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Invalid request body',
          errors: validation.error.errors,
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    const { pairs } = validation.data;

    // Delete both directions for each pair (scoped to current user)
    let undismissed = 0;
    for (const { placeId1, placeId2 } of pairs) {
      const deleted = await db.delete(dismissedDuplicates)
        .where(
          and(
            eq(dismissedDuplicates.userId, user.id),
            or(
              and(
                eq(dismissedDuplicates.placeId1, placeId1),
                eq(dismissedDuplicates.placeId2, placeId2)
              ),
              and(
                eq(dismissedDuplicates.placeId1, placeId2),
                eq(dismissedDuplicates.placeId2, placeId1)
              )
            )
          )
        )
        .returning();
      undismissed += deleted.length;
    }

    // A pair naming a foreign place matches no row of the caller's.
    if (undismissed === 0) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Dismissed pair not found',
          timestamp: new Date().toISOString(),
        },
        { status: 404 }
      );
    }

    clearDuplicateScanCache();

    return NextResponse.json({
      status: 'success',
      undismissed: pairs.length,
      message: `Undismissed ${pairs.length} duplicate pair(s)`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('Undismiss duplicate API error:', error);

    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to undismiss duplicates',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const user = await requireAuthForApi();
    const dismissed = await db.select().from(dismissedDuplicates)
      .where(eq(dismissedDuplicates.userId, user.id));

    return NextResponse.json({
      status: 'success',
      dismissed: dismissed.map(d => ({
        placeId1: d.placeId1,
        placeId2: d.placeId2,
        reason: d.reason,
        dismissedAt: d.dismissedAt,
      })),
      count: dismissed.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('Get dismissed duplicates API error:', error);

    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to get dismissed duplicates',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
