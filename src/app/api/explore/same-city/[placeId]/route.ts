import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { places } from '@/db/schema';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { getExplorePlacesInCity } from '@/lib/explore/queries';
import { forUser } from '@/lib/tenant-db';

export const runtime = 'nodejs';

/** How many neighbours quick look shows under "Also in {city}". */
const NEIGHBOURS = 6;

const ParamsSchema = z.object({ placeId: z.string().min(1).max(128) });

/**
 * The caller's other saved places in one place's city, for quick look's "Also
 * in {city}". Explore pages ship only the places they render, so the sheet asks
 * for these when it opens. A place that is not the caller's answers 404, the
 * same as one that does not exist.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ placeId: string }> },
) {
  try {
    const user = await requireAuthForApi();
    const parsed = ParamsSchema.safeParse(await params);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid place id' }, { status: 400 });
    }
    const { placeId } = parsed.data;

    const [place] = await forUser(user.id)
      .selectFields(places, { id: places.id, city: places.city, country: places.country }, eq(places.id, placeId))
      .limit(1);
    if (!place) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (!place.city) {
      return NextResponse.json({ places: [] });
    }

    const neighbours = await getExplorePlacesInCity(user.id, place.city, place.country, place.id, NEIGHBOURS);
    return NextResponse.json({ places: neighbours });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('[API] Same-city lookup error:', error);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
}
