import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  authenticateShareToken,
  bearerToken,
  SHARE_TOKEN_SCOPE_LINK_IMPORT,
} from '@/lib/phone-share-tokens';
import { saveSocialLink, UNSUPPORTED_LINK_MESSAGE } from '@/lib/link-import/save-link';
import { extractSharedUrl, inboxLinkHref } from '@/lib/link-import/shared-url';
import { checkRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/rate-limit';

/**
 * Save a shared link with a personal share token instead of a session — what
 * the iPhone Shortcut calls from the share sheet:
 *
 *   POST /api/share/links
 *   Authorization: Bearer td_share_…
 *   { "url": "https://vt.tiktok.com/…" }
 *
 * `text` and `title` are accepted too; the first TikTok or Instagram URL in
 * `url`, `text` or `title` is saved. The answer always carries a `message` a
 * Shortcut can show as-is, and on success an absolute `inboxUrl`.
 *
 * Middleware rate-limits this path per IP and lets it through without a
 * session; the handler limits again per token owner once it knows who that is.
 */

export const runtime = 'nodejs';
// Same budget as POST /api/inbox/links: saving may read the TikTok page once.
export const maxDuration = 60;

const field = z.string().max(8_000).optional().nullable();
const ShareLinkSchema = z.object({
  url: field,
  text: field,
  title: field,
  caption: z.string().max(8_000).optional(),
});

function reply(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function readBody(request: NextRequest): Promise<unknown> {
  const type = request.headers.get('content-type') ?? '';
  if (type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data')) {
    const form = await request.formData().catch(() => null);
    if (!form) return null;
    const value = (key: string) => {
      const v = form.get(key);
      return typeof v === 'string' ? v : undefined;
    };
    return { url: value('url'), text: value('text'), title: value('title'), caption: value('caption') };
  }
  return request.json().catch(() => null);
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateShareToken(bearerToken(request), SHARE_TOKEN_SCOPE_LINK_IMPORT);
    if (!auth.ok) {
      const message = auth.reason === 'revoked'
        ? 'This share token was revoked. Create a new one in Travel Dream settings and paste it into the Shortcut.'
        : auth.reason === 'missing'
          ? 'Add your Travel Dream share token to the Shortcut as "Authorization: Bearer <token>".'
          : 'This share token is not valid. Copy it again from Travel Dream settings.';
      return reply(401, { status: 'error', error: auth.reason, message });
    }

    const limit = await checkRateLimit(getClientIdentifier(request, auth.userId), 'share-link');
    if (!limit.success) return rateLimitResponse(limit);

    const parsed = ShareLinkSchema.safeParse(await readBody(request));
    if (!parsed.success) {
      return reply(400, { status: 'error', error: 'invalid-input', message: 'Send the shared link as JSON: { "url": "…" }.' });
    }

    const sharedUrl = extractSharedUrl(parsed.data);
    if (!sharedUrl) {
      return reply(400, { status: 'error', error: 'no-link', message: 'No link was shared. Share a TikTok or Instagram post.' });
    }

    const saved = await saveSocialLink(auth.userId, { url: sharedUrl, caption: parsed.data.caption });
    if (!saved.ok) {
      return reply(400, { status: 'error', error: 'unsupported', message: UNSUPPORTED_LINK_MESSAGE });
    }

    const { source, duplicate } = saved;
    const inboxUrl = new URL(inboxLinkHref(source.id), request.url).toString();
    return reply(duplicate ? 200 : 201, {
      status: 'success',
      sourceId: source.id,
      duplicate,
      inboxUrl,
      message: duplicate
        ? 'Already in your Travel Dream Inbox.'
        : 'Saved to your Travel Dream Inbox.',
    });
  } catch (error) {
    console.error('[Share Links] Error:', error);
    return reply(500, { status: 'error', error: 'server', message: 'Could not save this link. Please try again.' });
  }
}
