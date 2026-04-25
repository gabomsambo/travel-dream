import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { db } from '@/db';
import { places } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { getAdapter, ConfigError, RateLimitError } from '@/lib/photo-sources';

export const runtime = 'nodejs';

const QuerySchema = z.object({
  source: z.enum(['google_places', 'wikimedia', 'pexels']),
  q: z.string().min(1).max(200),
  placeId: z.string().min(1),
  page: z.coerce.number().int().min(1).default(1),
});

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthForApi();

    const sp = request.nextUrl.searchParams;
    const parsed = QuerySchema.parse({
      source: sp.get('source'),
      q: sp.get('q'),
      placeId: sp.get('placeId'),
      page: sp.get('page') ?? undefined,
    });

    let googlePlaceId: string | undefined;
    if (parsed.source === 'google_places') {
      const [place] = await db
        .select({ id: places.id, googlePlaceId: places.googlePlaceId })
        .from(places)
        .where(and(eq(places.id, parsed.placeId), eq(places.userId, user.id)))
        .limit(1);

      if (!place) {
        return NextResponse.json({ error: 'Place not found' }, { status: 404 });
      }
      if (!place.googlePlaceId) {
        return NextResponse.json(
          { error: "This place doesn't have a Google Places mapping" },
          { status: 400 },
        );
      }
      googlePlaceId = place.googlePlaceId;
    }

    const adapter = getAdapter(parsed.source);
    const result = await adapter.search({
      query: parsed.q,
      placeId: parsed.placeId,
      page: parsed.page,
      googlePlaceId,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid query', details: error.errors },
        { status: 400 },
      );
    }
    if (error instanceof ConfigError) {
      return NextResponse.json(
        { error: 'Source not configured', missingEnv: error.missingEnv },
        { status: 503 },
      );
    }
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'Upstream rate limit', retryAfter: error.retryAfterSec },
        {
          status: 429,
          headers: { 'Retry-After': String(error.retryAfterSec) },
        },
      );
    }
    console.error('[photos/search] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upstream error' },
      { status: 502 },
    );
  }
}
