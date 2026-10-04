import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { attachments } from '@/db/schema';
import { forUser } from '@/lib/tenant-db';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { resolveGooglePhoto } from '@/lib/photo-sources/google-resolver';

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
          attribution: attachments.attribution,
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

    const preferredAuthorUri =
      a.attribution?.kind === 'google_places' ? a.attribution.authorAttributions[0]?.uri : undefined;
    const resolved = await resolveGooglePhoto(a.sourceId, width, preferredAuthorUri);
    if (!resolved) {
      return NextResponse.json({ error: 'Resolve failed' }, { status: 502 });
    }

    // Google expired the stored photo name and the resolver found a fresh one
    // for the same place: store it, so the next view does not pay for the
    // refresh again. Scoped to the caller like the lookup above, and guarded on
    // the old name so a concurrent change to the attachment is not clobbered.
    if (resolved.refreshed) {
      const fresh = resolved.refreshed;
      try {
        await forUser(user.id).updateVia(
          attachments,
          {
            sourceId: fresh.name,
            width: fresh.widthPx,
            height: fresh.heightPx,
            attribution: { kind: 'google_places', authorAttributions: fresh.authorAttributions },
          },
          and(eq(attachments.id, a.id), eq(attachments.sourceId, a.sourceId)),
        );
      } catch (error) {
        // The photo still renders; the next view simply refreshes again.
        console.error('[photos/resolve] could not store refreshed photo name:', error);
      }
    }

    const photoUri = resolved.photoUri;

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
