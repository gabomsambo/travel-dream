import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { saveSocialLink, UNSUPPORTED_LINK_MESSAGE } from '@/lib/link-import/save-link';

export const runtime = 'nodejs';
// Page reads can make one 8s retry after reserving the shared 10s request slot.
export const maxDuration = 60;

const SaveLinkSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  caption: z.string().max(8_000).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthForApi();
    const parsedBody = SaveLinkSchema.safeParse(await request.json().catch(() => null));
    if (!parsedBody.success) {
      return NextResponse.json(
        { status: 'error', message: 'Invalid input', errors: parsedBody.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const saved = await saveSocialLink(user.id, parsedBody.data);
    if (!saved.ok) {
      return NextResponse.json({ status: 'error', message: UNSUPPORTED_LINK_MESSAGE }, { status: 400 });
    }
    const { source, duplicate } = saved;
    return NextResponse.json(
      { status: 'success', sourceId: source.id, url: source.uri, meta: source.meta, duplicate },
      { status: duplicate ? 200 : 201 },
    );
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('[Inbox Links] Error:', error);
    return NextResponse.json(
      { status: 'error', message: 'Could not save this link. Please try again.' },
      { status: 500 },
    );
  }
}
