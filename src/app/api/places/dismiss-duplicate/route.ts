import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { dismissedDuplicates } from '@/db/schema';
import { eq, and, or } from 'drizzle-orm';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
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

    // Create bidirectional dismiss entries
    const inserts = pairs.flatMap(({ placeId1, placeId2 }) => [
      {
        placeId1,
        placeId2,
        reason: reason || null,
      },
      {
        placeId1: placeId2,
        placeId2: placeId1,
        reason: reason || null,
      },
    ]);

    // Insert all pairs (ignore duplicates via upsert pattern)
    await db.insert(dismissedDuplicates)
      .values(inserts)
      .onConflictDoNothing();

    return NextResponse.json({
      status: 'success',
      dismissed: pairs.length,
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

    // Delete both directions for each pair
    for (const { placeId1, placeId2 } of pairs) {
      await db.delete(dismissedDuplicates)
        .where(
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
        );
    }

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
    const dismissed = await db.select().from(dismissedDuplicates);

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
