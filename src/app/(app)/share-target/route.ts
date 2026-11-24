import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-helpers';
import { saveSocialLink } from '@/lib/link-import/save-link';
import { extractSharedUrl, inboxLinkHref, type ShareNotice } from '@/lib/link-import/shared-url';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';

/**
 * The PWA share target (`share_target` in `src/app/manifest.ts`): Android and
 * desktop Chrome open `/share-target?title=…&text=…&url=…` when someone shares
 * to the installed app. Android usually leaves `url` empty and puts the link in
 * `text`, so the first TikTok or Instagram URL in any of the three is saved.
 *
 * Signed out, middleware sends the visitor through /login and back here with
 * the query intact. Signed in, the link is saved through the same code as the
 * Inbox's Save-a-link form and the browser lands on that link in the Inbox.
 *
 * A GET that writes is what the share-target spec asks for, so it is guarded
 * against being triggered from another site: the link is saved straight away
 * only for a navigation the browser itself started (`Sec-Fetch-Site: none`,
 * which is what a share-sheet launch sends) or one from this site. Anything
 * else — a link on another page, a redirect chain through a sign-in provider,
 * a browser that sends no fetch metadata — gets a one-tap confirm page instead.
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

function go(request: NextRequest, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, request.url), 303);
}

function inboxWith(notice: ShareNotice): string {
  return `/inbox?shared=${notice}`;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const user = await getCurrentUser();
  if (!user) {
    const login = new URL('/login', request.url);
    login.searchParams.set('callbackUrl', `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(login, 303);
  }

  const sharedUrl = extractSharedUrl({
    url: params.get('url'),
    text: params.get('text'),
    title: params.get('title'),
  });
  if (!sharedUrl) return go(request, inboxWith('missing'));

  const site = request.headers.get('sec-fetch-site');
  if (site !== 'none' && site !== 'same-origin') {
    return go(request, `/share-target/confirm?${new URLSearchParams({ url: sharedUrl }).toString()}`);
  }

  try {
    const limit = await checkRateLimit(getClientIdentifier(request, user.id), 'share-link');
    if (!limit.success) return go(request, inboxWith('busy'));

    const saved = await saveSocialLink(user.id, { url: sharedUrl });
    if (!saved.ok) return go(request, inboxWith('unsupported'));
    return go(request, inboxLinkHref(saved.source.id, saved.duplicate ? 'duplicate' : 'saved'));
  } catch (error) {
    console.error('[Share Target] Error:', error);
    return go(request, inboxWith('failed'));
  }
}
