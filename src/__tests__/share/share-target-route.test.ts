/**
 * @jest-environment node
 *
 * GET /share-target — the PWA share target — against the real handler and a
 * real SQLite file. The fixture import must stay first.
 */
import { ALICE, BOB, assertLocalDatabase, readCell, resetTenantFixture, useUniqueUuids } from '../helpers/tenant-fixture';

// jest.setup.js replaces the global Response with a shim that drops a Headers
// object's entries, so NextResponse.redirect's Location would be lost. The route
// only ever answers with a redirect; this stand-in keeps status and Location.
jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server');
  return {
    ...actual,
    after: jest.fn((callback: () => Promise<void>) => { void callback(); }),
    NextResponse: {
      redirect: (url: URL | string, status = 307) => ({ status, headers: new Headers({ location: String(url) }) }),
    },
  };
});
jest.mock('@/lib/auth-helpers', () => ({ getCurrentUser: jest.fn() }));
jest.mock('@/lib/mass-upload/dispatch', () => ({
  dispatchProcessors: jest.fn().mockResolvedValue({ spawned: 0 }),
}));
jest.mock('@/lib/link-import/resolve-short-link', () => ({ resolveTikTokShortLink: jest.fn() }));
jest.mock('@/lib/link-import/details', () => ({
  enrichLinkDetails: jest.fn().mockResolvedValue({ details: {}, providers: [] }),
}));
jest.mock('@/lib/rate-limit', () => ({
  ...jest.requireActual('@/lib/rate-limit'),
  checkRateLimit: jest.fn(),
}));

import { getCurrentUser } from '@/lib/auth-helpers';
import { checkRateLimit } from '@/lib/rate-limit';

const POST_URL = 'https://www.instagram.com/p/C8abcDEFghi/';

function route() {
  return require('@/app/(app)/share-target/route') as { GET: (request: Request) => Promise<Response> };
}

/** A share-sheet launch: Chrome marks a navigation it started itself with `Sec-Fetch-Site: none`. */
async function open(query: Record<string, string>, secFetchSite: string | null = 'none') {
  const url = `https://tabi.test/share-target?${new URLSearchParams(query).toString()}`;
  const headers: Record<string, string> = secFetchSite === null ? {} : { 'sec-fetch-site': secFetchSite };
  const request = new (global as unknown as { Request: new (u: string, o: unknown) => Request }).Request(url, { headers });
  const response = await route().GET(request);
  const location = response.headers.get('location') ?? '';
  return { status: response.status, location: location ? new URL(location) : null };
}

async function aliceLinkCount(): Promise<number> {
  return Number(await readCell(`SELECT COUNT(*) FROM sources WHERE user_id = ? AND type = 'url'`, [ALICE.id]));
}

describe('GET /share-target', () => {
  beforeAll(async () => {
    assertLocalDatabase();
    useUniqueUuids();
  });

  beforeEach(async () => {
    await resetTenantFixture();
    jest.clearAllMocks();
    (getCurrentUser as jest.Mock).mockResolvedValue(ALICE);
    (checkRateLimit as jest.Mock).mockResolvedValue({ success: true, limit: 30, remaining: 29, reset: 0 });
  });

  it('saves the link Android puts in `text` and lands on it in the Inbox', async () => {
    const res = await open({ title: 'Cool cafe', text: `Cool cafe ${POST_URL}`, url: '' });

    expect(res.status).toBe(303);
    expect(res.location?.pathname).toBe('/inbox');
    expect(res.location?.searchParams.get('shared')).toBe('saved');
    const sourceId = res.location?.searchParams.get('link') ?? '';
    expect(res.location?.hash).toBe(`#link-${sourceId}`);
    expect(await readCell('SELECT user_id FROM sources WHERE id = ?', [sourceId])).toBe(ALICE.id);
    expect(await readCell('SELECT uri FROM sources WHERE id = ?', [sourceId])).toBe(POST_URL);
  });

  it('reads `url` when the browser fills it', async () => {
    const res = await open({ url: POST_URL });
    expect(res.location?.searchParams.get('shared')).toBe('saved');
  });

  it('says "already saved" for a post that is already in the Inbox', async () => {
    const first = await open({ url: POST_URL });
    const second = await open({ text: POST_URL }, 'same-origin');
    expect(second.location?.searchParams.get('shared')).toBe('duplicate');
    expect(second.location?.searchParams.get('link')).toBe(first.location?.searchParams.get('link'));
  });

  it('sends a signed-out visitor through login and back with the share intact', async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);
    const before = await aliceLinkCount();
    const res = await open({ text: `see ${POST_URL}` });
    expect(res.status).toBe(303);
    expect(res.location?.pathname).toBe('/login');
    expect(res.location?.searchParams.get('callbackUrl')).toBe(
      `/share-target?${new URLSearchParams({ text: `see ${POST_URL}` }).toString()}`,
    );
    expect(await aliceLinkCount()).toBe(before);
  });

  it.each([
    ['another site', 'cross-site'],
    ['a sibling subdomain', 'same-site'],
    ['a browser that sends no fetch metadata', null],
  ])('asks for a tap instead of saving when reached from %s', async (_label, site) => {
    const before = await aliceLinkCount();
    const res = await open({ url: POST_URL }, site);
    expect(res.status).toBe(303);
    expect(res.location?.pathname).toBe('/share-target/confirm');
    expect(res.location?.searchParams.get('url')).toBe(POST_URL);
    expect(await aliceLinkCount()).toBe(before);
  });

  it('saves into the signed-in user\'s own Inbox only', async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(BOB);
    const aliceBefore = await aliceLinkCount();
    const res = await open({ url: POST_URL });
    const sourceId = res.location?.searchParams.get('link') ?? '';
    expect(await readCell('SELECT user_id FROM sources WHERE id = ?', [sourceId])).toBe(BOB.id);
    expect(await aliceLinkCount()).toBe(aliceBefore);
  });

  it.each([
    ['nothing with a link was shared', { text: 'just words' }, 'missing'],
    ['the link is not TikTok or Instagram', { url: 'https://example.com/page' }, 'unsupported'],
  ])('lands on the Inbox with a notice when %s', async (_label, query, notice) => {
    const before = await aliceLinkCount();
    const res = await open(query);
    expect(res.location?.pathname).toBe('/inbox');
    expect(res.location?.searchParams.get('shared')).toBe(notice);
    expect(await aliceLinkCount()).toBe(before);
  });

  it('says to wait when the user is rate-limited', async () => {
    (checkRateLimit as jest.Mock).mockResolvedValue({ success: false, limit: 30, remaining: 0, reset: 0 });
    const before = await aliceLinkCount();
    const res = await open({ url: POST_URL });
    expect(res.location?.searchParams.get('shared')).toBe('busy');
    expect(checkRateLimit).toHaveBeenCalledWith(`user:${ALICE.id}`, 'share-link');
    expect(await aliceLinkCount()).toBe(before);
  });
});
