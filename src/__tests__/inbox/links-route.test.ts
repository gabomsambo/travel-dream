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
import { dispatchProcessors } from '@/lib/mass-upload/dispatch';
import { parseSocialLink } from '@/lib/link-import/url';

const CANONICAL_VIDEO = 'https://www.tiktok.com/@creator/video/7694185850497666335';
const SHORT_URL = 'https://www.tiktok.com/t/ZPLaXhYUP/';
const OTHER_SHORT_URL = 'https://www.tiktok.com/t/ZPotherShare/';

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

async function jsonMeta(sourceId: string) {
  return JSON.parse(String(await readCell('SELECT meta FROM sources WHERE id = ?', [sourceId]))) as {
    link: {
      postId?: string;
      canonicalUrl: string;
      originalUrl?: string;
      aliasUrls?: string[];
      captionText?: string;
      kind: string;
      resolution: { status: string };
    };
    massUpload?: { extraction?: unknown };
  };
}

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
  (dispatchProcessors as jest.Mock).mockClear();
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

  it('merges a new caption onto a completed duplicate and requeues extraction', async () => {
    const first = await (await save(CANONICAL_VIDEO)).json() as { sourceId: string };
    await databaseExec(
      `UPDATE sources SET processing_status = ?, meta = ? WHERE id = ?`,
      [
        'completed',
        JSON.stringify({
          platform: 'tiktok',
          link: {
            originalUrl: CANONICAL_VIDEO,
            canonicalUrl: CANONICAL_VIDEO,
            platform: 'tiktok',
            kind: 'tiktok-video',
            postId: '7694185850497666335',
            needsResolution: false,
            resolution: { status: 'not-needed' },
            providers: [],
          },
          massUpload: { extraction: { places: [] }, extractedAt: '2026-01-01T00:00:00.000Z' },
        }),
        first.sourceId,
      ],
    );

    const secondResponse = await save(CANONICAL_VIDEO, 'Try Manteigaria in Lisbon');
    const second = await secondResponse.json() as { sourceId: string; duplicate: boolean };
    expect(secondResponse.status).toBe(200);
    expect(second).toMatchObject({ sourceId: first.sourceId, duplicate: true });
    expect(await readCell('SELECT processing_status FROM sources WHERE id = ?', [first.sourceId])).toBe('queued');
    expect(String(await readCell('SELECT ocr_text FROM sources WHERE id = ?', [first.sourceId]))).toContain('Manteigaria in Lisbon');
    const meta = await jsonMeta(first.sourceId);
    expect(meta.link.captionText).toBe('Try Manteigaria in Lisbon');
    expect(meta.massUpload?.extraction).toBeUndefined();
    expect(dispatchProcessors).toHaveBeenCalled();
  });

  it('requeues a failed duplicate on repaste even without a new caption', async () => {
    const first = await (await save(CANONICAL_VIDEO, 'old caption')).json() as { sourceId: string };
    await databaseExec(
      `UPDATE sources SET processing_status = ?, processing_error = ? WHERE id = ?`,
      ['failed', 'gemini boom', first.sourceId],
    );

    const secondResponse = await save(CANONICAL_VIDEO);
    const second = await secondResponse.json() as { sourceId: string; duplicate: boolean };
    expect(second).toMatchObject({ sourceId: first.sourceId, duplicate: true });
    expect(await readCell('SELECT processing_status FROM sources WHERE id = ?', [first.sourceId])).toBe('queued');
    expect(await readCell('SELECT processing_error FROM sources WHERE id = ?', [first.sourceId])).toBeNull();
    expect(String(await readCell('SELECT ocr_text FROM sources WHERE id = ?', [first.sourceId]))).toContain('old caption');
  });

  it('dedupes a resolved short share against an existing canonical postId', async () => {
    const first = await (await save(CANONICAL_VIDEO)).json() as { sourceId: string };
    const resolved = parseSocialLink(CANONICAL_VIDEO);
    expect(resolved.supported).toBe(true);
    if (!resolved.supported) return;

    (resolveTikTokShortLink as jest.Mock).mockResolvedValueOnce({
      link: { ...resolved.link, originalUrl: OTHER_SHORT_URL },
      resolution: { status: 'resolved' },
    });

    const secondResponse = await save(OTHER_SHORT_URL, 'Same post via share short');
    const second = await secondResponse.json() as { sourceId: string; duplicate: boolean };
    expect(secondResponse.status).toBe(200);
    expect(second).toMatchObject({ sourceId: first.sourceId, duplicate: true });
    expect(await readCell("SELECT count(*) FROM sources WHERE user_id = ? AND type = 'url'", [ALICE.id])).toBe(1);
    const meta = await jsonMeta(first.sourceId);
    expect(meta.link.postId).toBe('7694185850497666335');
    expect(meta.link.captionText).toBe('Same post via share short');
    expect(meta.link.aliasUrls).toEqual(expect.arrayContaining([OTHER_SHORT_URL]));
  });

  it('dedupes an unresolved short after a canonical-first save that later saw the same short', async () => {
    const first = await (await save(CANONICAL_VIDEO)).json() as { sourceId: string };
    const resolved = parseSocialLink(CANONICAL_VIDEO);
    expect(resolved.supported).toBe(true);
    if (!resolved.supported) return;

    (resolveTikTokShortLink as jest.Mock).mockResolvedValueOnce({
      link: { ...resolved.link, originalUrl: SHORT_URL },
      resolution: { status: 'resolved' },
    });
    const secondResponse = await save(SHORT_URL);
    expect(secondResponse.status).toBe(200);
    expect((await secondResponse.json() as { sourceId: string }).sourceId).toBe(first.sourceId);
    expect((await jsonMeta(first.sourceId)).link.aliasUrls).toEqual(expect.arrayContaining([SHORT_URL]));

    const unresolvedShort = parseSocialLink(SHORT_URL);
    expect(unresolvedShort.supported).toBe(true);
    if (!unresolvedShort.supported) return;
    (resolveTikTokShortLink as jest.Mock).mockResolvedValueOnce({
      link: unresolvedShort.link,
      resolution: { status: 'unresolved', error: 'fetch-failed' },
    });
    const thirdResponse = await save(SHORT_URL);
    const third = await thirdResponse.json() as { sourceId: string; duplicate: boolean };
    expect(thirdResponse.status).toBe(200);
    expect(third).toMatchObject({ sourceId: first.sourceId, duplicate: true });
    expect(await readCell("SELECT count(*) FROM sources WHERE user_id = ? AND type = 'url'", [ALICE.id])).toBe(1);
    expect(await readCell('SELECT uri FROM sources WHERE id = ?', [first.sourceId])).toBe(CANONICAL_VIDEO);
    const meta = await jsonMeta(first.sourceId);
    expect(meta.link).toMatchObject({
      postId: '7694185850497666335',
      canonicalUrl: CANONICAL_VIDEO,
      kind: 'tiktok-video',
      resolution: { status: 'resolved' },
    });
    expect(meta.link.aliasUrls).toEqual(expect.arrayContaining([SHORT_URL]));
  });

  it('backfills postId and canonical URI when an unresolved short later resolves', async () => {
    const firstResponse = await save(SHORT_URL);
    const first = await firstResponse.json() as { sourceId: string; url: string };
    expect(first.url).toBe(SHORT_URL);
    expect((await jsonMeta(first.sourceId)).link.postId).toBeUndefined();

    const resolved = parseSocialLink(CANONICAL_VIDEO);
    expect(resolved.supported).toBe(true);
    if (!resolved.supported) return;
    (resolveTikTokShortLink as jest.Mock).mockResolvedValueOnce({
      link: { ...resolved.link, originalUrl: SHORT_URL },
      resolution: { status: 'resolved' },
    });

    const secondResponse = await save(SHORT_URL);
    const second = await secondResponse.json() as { sourceId: string; duplicate: boolean; url: string };
    expect(second).toMatchObject({ sourceId: first.sourceId, duplicate: true, url: CANONICAL_VIDEO });
    expect(await readCell('SELECT uri FROM sources WHERE id = ?', [first.sourceId])).toBe(CANONICAL_VIDEO);
    const meta = await jsonMeta(first.sourceId);
    expect(meta.link).toMatchObject({
      postId: '7694185850497666335',
      canonicalUrl: CANONICAL_VIDEO,
      kind: 'tiktok-video',
      resolution: { status: 'resolved' },
    });
    expect(await readCell("SELECT count(*) FROM sources WHERE user_id = ? AND type = 'url'", [ALICE.id])).toBe(1);
  });

  it('dedupes a later unresolved short paste against a previously resolved short via originalUrl', async () => {
    const firstResponse = await save(SHORT_URL);
    const first = await firstResponse.json() as { sourceId: string };
    expect(firstResponse.status).toBe(201);

    const resolved = parseSocialLink(CANONICAL_VIDEO);
    expect(resolved.supported).toBe(true);
    if (!resolved.supported) return;
    (resolveTikTokShortLink as jest.Mock).mockResolvedValueOnce({
      link: { ...resolved.link, originalUrl: SHORT_URL },
      resolution: { status: 'resolved' },
    });
    const backfill = await save(SHORT_URL);
    expect(backfill.status).toBe(200);
    expect(await readCell('SELECT uri FROM sources WHERE id = ?', [first.sourceId])).toBe(CANONICAL_VIDEO);

    const unresolvedShort = parseSocialLink(SHORT_URL);
    expect(unresolvedShort.supported).toBe(true);
    if (!unresolvedShort.supported) return;
    (resolveTikTokShortLink as jest.Mock).mockResolvedValueOnce({
      link: unresolvedShort.link,
      resolution: { status: 'unresolved', error: 'fetch-failed' },
    });
    const thirdResponse = await save(SHORT_URL);
    const third = await thirdResponse.json() as { sourceId: string; duplicate: boolean; url: string };
    expect(thirdResponse.status).toBe(200);
    expect(third).toMatchObject({ sourceId: first.sourceId, duplicate: true });
    expect(await readCell("SELECT count(*) FROM sources WHERE user_id = ? AND type = 'url'", [ALICE.id])).toBe(1);
    expect(await readCell('SELECT uri FROM sources WHERE id = ?', [first.sourceId])).toBe(CANONICAL_VIDEO);
    const meta = await jsonMeta(first.sourceId);
    expect(meta.link).toMatchObject({
      postId: '7694185850497666335',
      canonicalUrl: CANONICAL_VIDEO,
      kind: 'tiktok-video',
      resolution: { status: 'resolved' },
    });
  });

  it('requeues a completed source with no places on bare repaste', async () => {
    const first = await (await save(CANONICAL_VIDEO, 'No place named here')).json() as { sourceId: string };
    await databaseExec(
      `UPDATE sources SET processing_status = ?, meta = ? WHERE id = ?`,
      [
        'completed',
        JSON.stringify({
          platform: 'tiktok',
          link: {
            originalUrl: CANONICAL_VIDEO,
            canonicalUrl: CANONICAL_VIDEO,
            platform: 'tiktok',
            kind: 'tiktok-video',
            postId: '7694185850497666335',
            needsResolution: false,
            resolution: { status: 'not-needed' },
            captionText: 'No place named here',
            providers: [],
          },
          massUpload: { extraction: { places: [] }, extractedAt: '2026-01-01T00:00:00.000Z' },
        }),
        first.sourceId,
      ],
    );

    (dispatchProcessors as jest.Mock).mockClear();
    const secondResponse = await save(CANONICAL_VIDEO, 'No place named here');
    const second = await secondResponse.json() as { sourceId: string; duplicate: boolean };
    expect(secondResponse.status).toBe(200);
    expect(second).toMatchObject({ sourceId: first.sourceId, duplicate: true });
    expect(await readCell('SELECT processing_status FROM sources WHERE id = ?', [first.sourceId])).toBe('queued');
    const meta = await jsonMeta(first.sourceId);
    expect(meta.massUpload?.extraction).toBeUndefined();
    expect(dispatchProcessors).toHaveBeenCalled();
  });

  it('clears a stale queued extraction cache when a new caption is pasted', async () => {
    const first = await (await save(CANONICAL_VIDEO)).json() as { sourceId: string };
    await databaseExec(
      `UPDATE sources SET processing_status = ?, meta = ? WHERE id = ?`,
      [
        'queued',
        JSON.stringify({
          platform: 'tiktok',
          link: {
            originalUrl: CANONICAL_VIDEO,
            canonicalUrl: CANONICAL_VIDEO,
            platform: 'tiktok',
            kind: 'tiktok-video',
            postId: '7694185850497666335',
            needsResolution: false,
            resolution: { status: 'not-needed' },
            providers: [],
          },
          massUpload: { extraction: { places: [] }, extractedAt: '2026-01-01T00:00:00.000Z' },
        }),
        first.sourceId,
      ],
    );

    (dispatchProcessors as jest.Mock).mockClear();
    const secondResponse = await save(CANONICAL_VIDEO, 'Try Manteigaria in Lisbon');
    const second = await secondResponse.json() as { sourceId: string; duplicate: boolean };
    expect(secondResponse.status).toBe(200);
    expect(second).toMatchObject({ sourceId: first.sourceId, duplicate: true });
    expect(await readCell('SELECT processing_status FROM sources WHERE id = ?', [first.sourceId])).toBe('queued');
    expect(String(await readCell('SELECT ocr_text FROM sources WHERE id = ?', [first.sourceId]))).toContain('Manteigaria in Lisbon');
    const meta = await jsonMeta(first.sourceId);
    expect(meta.link.captionText).toBe('Try Manteigaria in Lisbon');
    expect(meta.massUpload?.extraction).toBeUndefined();
    expect(dispatchProcessors).toHaveBeenCalled();
  });

  it('keeps a short link when its resolution fails', async () => {
    const response = await save(SHORT_URL);
    const body = await response.json() as { sourceId: string; url: string; meta: { link: { resolution: { status: string }; kind: string } } };
    expect(resolveTikTokShortLink).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(201);
    expect(body.url).toBe(SHORT_URL);
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

  it('does not match another tenant by postId alone', async () => {
    await databaseExec(
      `INSERT INTO sources (id,user_id,type,uri,ocr_text,processing_status,meta,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        'src_bob_post',
        BOB.id,
        'url',
        CANONICAL_VIDEO,
        'Bob private context',
        'completed',
        JSON.stringify({
          platform: 'tiktok',
          link: {
            originalUrl: CANONICAL_VIDEO,
            canonicalUrl: CANONICAL_VIDEO,
            platform: 'tiktok',
            kind: 'tiktok-video',
            postId: '7694185850497666335',
            needsResolution: false,
            resolution: { status: 'not-needed' },
            providers: [],
          },
        }),
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    );

    const resolved = parseSocialLink(CANONICAL_VIDEO);
    expect(resolved.supported).toBe(true);
    if (!resolved.supported) return;
    (resolveTikTokShortLink as jest.Mock).mockResolvedValueOnce({
      link: { ...resolved.link, originalUrl: OTHER_SHORT_URL },
      resolution: { status: 'resolved' },
    });

    const response = await save(OTHER_SHORT_URL);
    const body = await response.json() as { sourceId: string; duplicate: boolean };
    expect(response.status).toBe(201);
    expect(body.sourceId).not.toBe('src_bob_post');
    expect(body.duplicate).toBe(false);
    expect(await readCell("SELECT count(*) FROM sources WHERE type = 'url'", [])).toBe(2);
  });
});
