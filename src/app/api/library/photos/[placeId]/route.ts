import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { places } from '@/db/schema';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { getPlacePhotos } from '@/lib/explore/queries';
import { forUser } from '@/lib/tenant-db';

export const runtime = 'nodejs';

const ParamsSchema = z.object({ placeId: z.string().min(1).max(128) });

/**
 * A place's photos, primary first, for quick look. The Library's index carries
 * only each place's first photo; the sheet asks for the rest when it opens. A
 * place that is not the caller's answers 404, the same as one that does not
 * exist.
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

    const [place] = await forUser(user.id).selectFields(places, { id: places.id }, eq(places.id, placeId)).limit(1);
    if (!place) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ photos: await getPlacePhotos(user.id, place.id) });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('[API] Library photos error:', error);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
}
