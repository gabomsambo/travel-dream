import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { attachments } from '@/db/schema';
import { forUser } from '@/lib/tenant-db';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { resolveGooglePhotoUri } from '@/lib/photo-sources/google-resolver';

export const runtime = 'nodejs';

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ attachmentId: string }> },
) {
  try {
    const user = await requireAuthForApi();
    const { attachmentId } = await ctx.params;

    const wParam = request.nextUrl.searchParams.get('w');
    const wParsed = wParam ? parseInt(wParam, 10) : 1200;
    const width = clamp(Number.isFinite(wParsed) ? wParsed : 1200, 1, 4800);

    // `attachments` has no user_id — it is owned through its place, which is
    // what `selectFieldsVia` scopes on.
    const rows = await forUser(user.id)
      .selectFieldsVia(
        attachments,
        {
          id: attachments.id,
          source: attachments.source,
          sourceId: attachments.sourceId,
        },
        eq(attachments.id, attachmentId)
      )
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const a = rows[0];
    if (a.source !== 'google_places' || !a.sourceId) {
      return NextResponse.json(
        { error: 'Resolver only supports google_places' },
        { status: 400 },
      );
    }

    const photoUri = await resolveGooglePhotoUri(a.sourceId, width);
    if (!photoUri) {
      return NextResponse.json({ error: 'Resolve failed' }, { status: 502 });
    }

    return new NextResponse(null, {
      status: 302,
      headers: {
        Location: photoUri,
        'Cache-Control': 'private, max-age=2700',
      },
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('[photos/resolve] error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
