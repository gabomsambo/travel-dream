/** @jest-environment node */
import {
  ALICE,
  BOB,
  assertLocalDatabase,
  apiRequest,
  readCell,
  resetTenantFixture,
  useUniqueUuids,
} from '../helpers/tenant-fixture';

jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: jest.fn((error: unknown) => error instanceof Error && error.message === 'Unauthorized'),
}));
jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server');
  return {
    ...actual,
    after: jest.fn((callback: () => Promise<void>) => { void callback(); }),
  };
});
jest.mock('@/lib/mass-upload/dispatch', () => ({
  dispatchProcessors: jest.fn().mockResolvedValue({ spawned: 0 }),
}));
jest.mock('@/lib/link-import/resolve-short-link', () => ({
  resolveTikTokShortLink: jest.fn(),
}));
jest.mock('@/lib/link-import/details', () => ({
  enrichLinkDetails: jest.fn(),
}));

import { requireAuthForApi } from '@/lib/auth-helpers';
import { enrichLinkDetails } from '@/lib/link-import/details';
import { resolveTikTokShortLink } from '@/lib/link-import/resolve-short-link';

const CANONICAL_VIDEO = 'https://www.tiktok.com/@creator/video/7694185850497666335';

function route() {
  return require('@/app/api/inbox/links/route') as {
    POST: (request: Request) => Promise<Response>;
  };
}

async function save(url: string, caption?: string) {
  const body = caption === undefined ? { url } : { url, caption };
  return route().POST(apiRequest('http://travel.test/api/inbox/links', 'POST', body));
}

const databaseExec = (sql: string, args: unknown[] = []) => {
  const { client } = require('@/db') as {
    client: { execute: (query: { sql: string; args: unknown[] }) => Promise<unknown> };
  };
  return client.execute({ sql, args });
};

beforeAll(() => {
  assertLocalDatabase();
  useUniqueUuids();
});

beforeEach(async () => {
  await resetTenantFixture();
  (requireAuthForApi as jest.Mock).mockResolvedValue(ALICE);
  (enrichLinkDetails as jest.Mock).mockResolvedValue({
    details: { author: '@creator' },
    providers: [{ provider: 'url-derived', status: 'ok', details: { author: '@creator' }, fetchedAt: '2026-01-01T00:00:00.000Z' }],
  });
  (resolveTikTokShortLink as jest.Mock).mockImplementation(async (link) => ({
    link,
    resolution: { status: 'unresolved', error: 'fetch-failed' },
  }));
});

describe('POST /api/inbox/links', () => {
  it('requires authentication', async () => {
    (requireAuthForApi as jest.Mock).mockRejectedValue(new Error('Unauthorized'));
    const response = await save(CANONICAL_VIDEO);
    expect(response.status).toBe(401);
  });

  it('validates the request and refuses unsupported hosts', async () => {
    const invalidBody = await route().POST(apiRequest('http://travel.test/api/inbox/links', 'POST', { url: '' }));
    const unsupported = await save('https://example.com/travel');
    expect(invalidBody.status).toBe(400);
    expect(unsupported.status).toBe(400);
    expect(await readCell("SELECT count(*) FROM sources WHERE type = 'url'", [])).toBe(0);
  });

  it('stores a URL source with caption context in the existing queue', async () => {
    const response = await save(`${CANONICAL_VIDEO}?_r=1&utm_source=share`, 'Try the pastel de nata at Manteigaria in Lisbon');
    const body = await response.json() as { sourceId: string; url: string; meta: { link: { captionText: string; kind: string } }; duplicate: boolean };
    expect(response.status).toBe(201);
    expect(body.url).toBe(CANONICAL_VIDEO);
    expect(body.meta.link).toMatchObject({ kind: 'tiktok-video', captionText: 'Try the pastel de nata at Manteigaria in Lisbon' });
    expect(body.duplicate).toBe(false);
    expect(await readCell('SELECT type FROM sources WHERE id = ?', [body.sourceId])).toBe('url');
    expect(await readCell('SELECT processing_status FROM sources WHERE id = ?', [body.sourceId])).toBe('queued');
    expect(String(await readCell('SELECT ocr_text FROM sources WHERE id = ?', [body.sourceId]))).toContain('Manteigaria in Lisbon');
  });

  it('returns the existing source for the same canonical post despite tracking params', async () => {
    const first = await (await save(`${CANONICAL_VIDEO}?_r=1`)).json() as { sourceId: string };
    const secondResponse = await save(`${CANONICAL_VIDEO}?_t=other&utm_medium=share`);
    const second = await secondResponse.json() as { sourceId: string; duplicate: boolean };
    expect(secondResponse.status).toBe(200);
    expect(second).toMatchObject({ sourceId: first.sourceId, duplicate: true });
    expect(await readCell("SELECT count(*) FROM sources WHERE user_id = ? AND type = 'url'", [ALICE.id])).toBe(1);
  });

  it('keeps a short link when its resolution fails', async () => {
    const shortUrl = 'https://www.tiktok.com/t/ZPLaXhYUP/';
    const response = await save(shortUrl);
    const body = await response.json() as { sourceId: string; url: string; meta: { link: { resolution: { status: string }; kind: string } } };
    expect(resolveTikTokShortLink).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(201);
    expect(body.url).toBe(shortUrl);
    expect(body.meta.link).toMatchObject({ kind: 'tiktok-short', resolution: { status: 'unresolved' } });
  });

  it('does not deduplicate against another tenant source with the same URL', async () => {
    await databaseExec(
      `INSERT INTO sources (id,user_id,type,uri,ocr_text,processing_status,meta,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      ['src_bob_link', BOB.id, 'url', CANONICAL_VIDEO, 'Bob private context', 'completed', JSON.stringify({ platform: 'tiktok' }), new Date().toISOString(), new Date().toISOString()],
    );
    const response = await save(CANONICAL_VIDEO);
    const body = await response.json() as { sourceId: string; duplicate: boolean; meta: unknown };
    expect(response.status).toBe(201);
    expect(body.sourceId).not.toBe('src_bob_link');
    expect(body.duplicate).toBe(false);
    expect(JSON.stringify(body)).not.toContain('Bob private context');
    expect(await readCell("SELECT count(*) FROM sources WHERE uri = ?", [CANONICAL_VIDEO])).toBe(2);
  });
});
