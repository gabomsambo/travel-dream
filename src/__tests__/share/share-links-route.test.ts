/**
 * @jest-environment node
 *
 * POST /api/share/links — the iPhone Shortcut endpoint — against the real
 * handler and a real SQLite file: which tokens it accepts, whose Inbox the link
 * lands in, and that tokens are stored only as hashes. The fixture import must
 * stay first (see ../helpers/tenant-fixture).
 */
import {
  ALICE,
  BOB,
  apiRequest,
  assertLocalDatabase,
  readCell,
  resetTenantFixture,
  useUniqueUuids,
} from '../helpers/tenant-fixture';

jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server');
  return { ...actual, after: jest.fn((callback: () => Promise<void>) => { void callback(); }) };
});
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

import { checkRateLimit } from '@/lib/rate-limit';
import { dispatchProcessors } from '@/lib/mass-upload/dispatch';
import {
  createShareToken,
  hashShareToken,
  listShareTokens,
  revokeShareToken,
} from '@/lib/phone-share-tokens';

const ENDPOINT = 'https://tabi.test/api/share/links';
const POST_URL = 'https://www.instagram.com/p/C8abcDEFghi/';

function route() {
  return require('@/app/api/share/links/route') as { POST: (request: Request) => Promise<Response> };
}

/** The jest.setup.js Request shim keeps headers in a case-sensitive Map, so header names are lower-case. */
async function share(body: unknown, token?: string) {
  const headers: Record<string, string> = token === undefined ? {} : { authorization: `Bearer ${token}` };
  const response = await route().POST(apiRequest(ENDPOINT, 'POST', body, headers));
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

/** A request whose body is form-encoded instead of JSON, as an HTML form would send. */
async function shareForm(body: string, token: string) {
  const request = new (global as unknown as { Request: new (u: string, o: unknown) => Request }).Request(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', authorization: `Bearer ${token}` },
    body,
  });
  const response = await route().POST(request);
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function countSources(userId: string): Promise<number> {
  return Number(await readCell(`SELECT COUNT(*) FROM sources WHERE user_id = ? AND type = 'url'`, [userId]));
}

async function newToken(userId: string, name = 'iPhone'): Promise<{ id: string; raw: string }> {
  const created = await createShareToken(userId, name);
  if (!created.ok) throw new Error('could not create token');
  return { id: created.token.id, raw: created.raw };
}

describe('POST /api/share/links', () => {
  beforeAll(async () => {
    assertLocalDatabase();
    useUniqueUuids();
    await resetTenantFixture();
  });

  beforeEach(async () => {
    const { client } = require('@/db') as { client: { execute: (sql: string) => Promise<unknown> } };
    await client.execute('DELETE FROM share_tokens');
    await resetTenantFixture();
    jest.clearAllMocks();
    (checkRateLimit as jest.Mock).mockResolvedValue({ success: true, limit: 30, remaining: 29, reset: 0 });
  });

  it('saves the link into the token owner\'s Inbox and returns an Inbox deep link', async () => {
    const alice = await newToken(ALICE.id);
    const before = await countSources(ALICE.id);

    const res = await share({ url: POST_URL }, alice.raw);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'success', duplicate: false, message: 'Saved to your Travel Dream Inbox.' });
    const sourceId = String(res.body.sourceId);
    expect(res.body.inboxUrl).toBe(`https://tabi.test/inbox?link=${encodeURIComponent(sourceId)}#link-${sourceId}`);
    expect(await countSources(ALICE.id)).toBe(before + 1);
    expect(await readCell('SELECT user_id FROM sources WHERE id = ?', [sourceId])).toBe(ALICE.id);
    expect(await readCell('SELECT processing_status FROM sources WHERE id = ?', [sourceId])).toBe('queued');
    expect(dispatchProcessors).toHaveBeenCalledWith('link-save', 'grow');
  });

  it('records when the token was last used', async () => {
    const alice = await newToken(ALICE.id);
    expect(await readCell('SELECT last_used_at FROM share_tokens WHERE id = ?', [alice.id])).toBeNull();
    await share({ url: POST_URL }, alice.raw);
    expect(await readCell('SELECT last_used_at FROM share_tokens WHERE id = ?', [alice.id])).toEqual(expect.any(String));
  });

  it('answers a second share of the same post as a duplicate', async () => {
    const alice = await newToken(ALICE.id);
    const first = await share({ url: POST_URL }, alice.raw);
    const second = await share({ url: `${POST_URL}?igsh=tracking` }, alice.raw);
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ duplicate: true, sourceId: first.body.sourceId, message: 'Already in your Travel Dream Inbox.' });
  });

  it('finds the link inside shared text, the way Android and some apps send it', async () => {
    const alice = await newToken(ALICE.id);
    const res = await share({ text: `Look at this place! ${POST_URL} 🌴` }, alice.raw);
    expect(res.status).toBe(201);
    expect(await readCell('SELECT uri FROM sources WHERE id = ?', [String(res.body.sourceId)])).toBe(POST_URL);
  });

  it('lands a link sent with Bob\'s token in Bob\'s Inbox, never Alice\'s', async () => {
    await newToken(ALICE.id);
    const bob = await newToken(BOB.id);
    const aliceBefore = await countSources(ALICE.id);
    const bobBefore = await countSources(BOB.id);

    const res = await share({ url: POST_URL }, bob.raw);

    expect(res.status).toBe(201);
    expect(await readCell('SELECT user_id FROM sources WHERE id = ?', [String(res.body.sourceId)])).toBe(BOB.id);
    expect(await countSources(BOB.id)).toBe(bobBefore + 1);
    expect(await countSources(ALICE.id)).toBe(aliceBefore);
  });

  it.each([
    ['no Authorization header', undefined, 'missing'],
    ['an empty bearer value', '', 'missing'],
    ['a value that is not a share token', 'not-a-token', 'invalid'],
    ['a well-formed token nobody was issued', 'td_share_nobody_has_this_token_000000000000', 'invalid'],
  ])('refuses %s with 401 and saves nothing', async (_label, token, reason) => {
    await newToken(ALICE.id);
    const before = await countSources(ALICE.id);
    const res = await share({ url: POST_URL }, token);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ status: 'error', error: reason, message: expect.any(String) });
    expect(await countSources(ALICE.id)).toBe(before);
  });

  it('refuses a revoked token with 401 and says it was revoked', async () => {
    const alice = await newToken(ALICE.id);
    expect(await revokeShareToken(ALICE.id, alice.id)).toBe(true);
    const before = await countSources(ALICE.id);

    const res = await share({ url: POST_URL }, alice.raw);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'revoked' });
    expect(String(res.body.message)).toMatch(/revoked/);
    expect(await countSources(ALICE.id)).toBe(before);
  });

  it('refuses a token issued for another scope', async () => {
    const alice = await newToken(ALICE.id);
    const { client } = require('@/db') as { client: { execute: (q: { sql: string; args: unknown[] }) => Promise<unknown> } };
    await client.execute({ sql: `UPDATE share_tokens SET scope = 'everything' WHERE id = ?`, args: [alice.id] });
    const res = await share({ url: POST_URL }, alice.raw);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'invalid' });
  });

  it('does not let another user revoke a token', async () => {
    const alice = await newToken(ALICE.id);
    expect(await revokeShareToken(BOB.id, alice.id)).toBe(false);
    expect(await readCell('SELECT revoked_at FROM share_tokens WHERE id = ?', [alice.id])).toBeNull();
    expect((await share({ url: POST_URL }, alice.raw)).status).toBe(201);
  });

  it('stores only a hash of the token, and lists it without the secret', async () => {
    const alice = await newToken(ALICE.id, 'My iPhone');
    expect(await readCell('SELECT token_hash FROM share_tokens WHERE id = ?', [alice.id])).toBe(hashShareToken(alice.raw));
    const row = await readCell(
      `SELECT name || token_hash || token_prefix || scope FROM share_tokens WHERE id = ?`,
      [alice.id],
    );
    expect(String(row)).not.toContain(alice.raw);

    const listed = await listShareTokens(ALICE.id);
    expect(listed).toEqual([expect.objectContaining({ id: alice.id, name: 'My iPhone', scope: 'link-import' })]);
    expect(JSON.stringify(listed)).not.toContain(alice.raw);
    expect(JSON.stringify(listed)).not.toContain(hashShareToken(alice.raw));
    expect(await listShareTokens(BOB.id)).toEqual([]);
  });

  it('rejects a form-encoded body and saves nothing', async () => {
    const alice = await newToken(ALICE.id);
    const before = await countSources(ALICE.id);

    const res = await shareForm(`url=${encodeURIComponent(POST_URL)}`, alice.raw);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid-input' });
    expect(await countSources(ALICE.id)).toBe(before);
  });

  it('answers 400 when nothing shared contains a link', async () => {
    const alice = await newToken(ALICE.id);
    const res = await share({ text: 'no link here' }, alice.raw);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'no-link' });
  });

  it('answers 400 for a link that is not TikTok or Instagram', async () => {
    const alice = await newToken(ALICE.id);
    const res = await share({ url: 'https://www.youtube.com/watch?v=abc' }, alice.raw);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'unsupported' });
  });

  it('rate-limits per token owner', async () => {
    const alice = await newToken(ALICE.id);
    (checkRateLimit as jest.Mock).mockResolvedValue({ success: false, limit: 30, remaining: 0, reset: Date.now() + 30_000 });
    const before = await countSources(ALICE.id);

    const res = await share({ url: POST_URL }, alice.raw);

    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith(`user:${ALICE.id}`, 'share-link');
    expect(await countSources(ALICE.id)).toBe(before);
  });
});
