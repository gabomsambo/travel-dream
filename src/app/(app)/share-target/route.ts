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
 * the query intact. After signing in the link is not saved yet: the confirm
 * page asks for one tap, because the same-origin return from /login looks
 * exactly like a link on a page someone else controls. Signed in, that button
 * POSTs here and the browser lands on the link in the Inbox.
 *
 * A GET that writes is what the share-target spec asks for, so it saves
 * straight away only for a navigation the browser itself started
 * (`Sec-Fetch-Site: none`, which is what a share-sheet launch sends). Every
 * other GET — same-origin (including the return from /login), same-site,
 * cross-site, or one with no fetch metadata — gets the confirm page instead.
 * The confirm page's POST saves only when it is signed in and same-origin.
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

function go(request: NextRequest, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, request.url), 303);
}

function loginWith(request: NextRequest): NextResponse {
  const login = new URL('/login', request.url);
  login.searchParams.set('callbackUrl', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(login, 303);
}

function inboxWith(notice: ShareNotice): string {
  return `/inbox?shared=${notice}`;
}

function confirmWith(url: string): string {
  return `/share-target/confirm?${new URLSearchParams({ url }).toString()}`;
}

function isSameOrigin(request: NextRequest): boolean {
  if (request.headers.get('sec-fetch-site') === 'same-origin') return true;
  const origin = request.headers.get('origin');
  return origin !== null && origin === request.nextUrl.origin;
}

function formValue(form: FormData, key: string): string | undefined {
  const value = form.get(key);
  return typeof value === 'string' ? value : undefined;
}

async function saveAndGo(request: NextRequest, userId: string, sharedUrl: string): Promise<NextResponse> {
  try {
    const limit = await checkRateLimit(getClientIdentifier(request, userId), 'share-link');
    if (!limit.success) return go(request, inboxWith('busy'));

    const saved = await saveSocialLink(userId, { url: sharedUrl });
    if (!saved.ok) return go(request, inboxWith('unsupported'));
    return go(request, inboxLinkHref(saved.source.id, saved.duplicate ? 'duplicate' : 'saved'));
  } catch (error) {
    console.error('[Share Target] Error:', error);
    return go(request, inboxWith('failed'));
  }
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const user = await getCurrentUser();
  if (!user) return loginWith(request);

  const sharedUrl = extractSharedUrl({
    url: params.get('url'),
    text: params.get('text'),
    title: params.get('title'),
  });
  if (!sharedUrl) return go(request, inboxWith('missing'));

  if (request.headers.get('sec-fetch-site') !== 'none') return go(request, confirmWith(sharedUrl));

  return saveAndGo(request, user.id, sharedUrl);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return loginWith(request);
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'cross-origin' }, { status: 403 });

  const form = await request.formData().catch(() => null);
  const sharedUrl = form
    ? extractSharedUrl({
        url: formValue(form, 'url'),
        text: formValue(form, 'text'),
        title: formValue(form, 'title'),
      })
    : null;
  if (!sharedUrl) return go(request, inboxWith('missing'));

  return saveAndGo(request, user.id, sharedUrl);
}
