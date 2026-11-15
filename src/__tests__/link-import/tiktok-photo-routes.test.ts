/** @jest-environment node */
import fs from 'node:fs';
import path from 'node:path';
import { ALICE, BOB, FIXTURE, assertLocalDatabase, resetTenantFixture } from '../helpers/tenant-fixture';

jest.mock('next/server', () => ({
  NextRequest: global.Request,
  NextResponse: global.Response,
  after: (callback: () => Promise<void>) => { void callback(); },
}));
jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: jest.fn((error: unknown) => error instanceof Error && error.message === 'Unauthorized'),
}));
jest.mock('@vercel/blob', () => ({
  put: jest.fn(),
  del: jest.fn().mockResolvedValue(undefined),
  get: jest.fn(),
}));
jest.mock('@/lib/mass-upload/dispatch', () => ({ dispatchProcessors: jest.fn().mockResolvedValue({ dispatched: 0 }) }));
jest.mock('@/lib/link-import/providers/tiktok-page', () => ({
  ...jest.requireActual('@/lib/link-import/providers/tiktok-page'),
  tiktokPageProvider: { getDetails: jest.fn() },
}));

import { NextRequest } from 'next/server';
import { requireAuthForApi } from '@/lib/auth-helpers';
import { put, get, del } from '@vercel/blob';
import { createTikTokPageProvider, tiktokPageProvider } from '@/lib/link-import/providers/tiktok-page';
import type { TikTokCacheEntry, TikTokGuardrails } from '@/lib/link-import/tiktok-guardrails';
import { POST as importPhotos } from '@/app/api/inbox/links/[sourceId]/import-photos/route';
import { GET as privatePhoto } from '@/app/api/photos/private/route';

const ALICE_TIKTOK_LINK = 'https://www.tiktok.com/@alicecreator/photo/7694185850497666335';
const ALICE_TIKTOK_VIDEO_LINK = 'https://www.tiktok.com/@alicecreator/video/7694185850497666335';
const BOB_TIKTOK_LINK = 'https://www.tiktok.com/@bobcreator/photo/7634085795908881686';
const ALICE_PRIVATE_PHOTO = 'https://travel-dream.private.blob.vercel-storage.com/tiktok-imports/alice/photo.jpg';
const BOB_PRIVATE_PHOTO = 'https://travel-dream.private.blob.vercel-storage.com/tiktok-imports/bob/photo.jpg';
const PHOTO_AS_VIDEO_FIXTURE = fs.readFileSync(
  path.join(process.cwd(), 'src/__tests__/fixtures/tiktok/photo-as-video-post.html'),
  'utf8',
);

function streamResponse(bytes: Uint8Array, type = 'image/jpeg'): Response {
  let read = false;
  return {
    status: 200,
    ok: true,
    headers: {
      get(name: string) {
        if (name.toLowerCase() === 'content-length') return String(bytes.byteLength);
        if (name.toLowerCase() === 'content-type') return type;
        return null;
      },
    },
    body: {
      getReader: () => ({
        read: async () => {
          if (read) return { done: true, value: undefined };
          read = true;
          return { done: false, value: bytes };
        },
        cancel: async () => undefined,
      }),
    },
  } as unknown as Response;
}

function htmlResponse(body: string): Response {
  const bytes = new TextEncoder().encode(body);
  let read = false;
  return {
    status: 200,
    ok: true,
    headers: {
      get(name: string) {
        if (name.toLowerCase() === 'content-length') return String(bytes.byteLength);
        if (name.toLowerCase() === 'content-type') return 'text/html; charset=utf-8';
        return null;
      },
    },
    body: {
      getReader: () => ({
        read: async () => {
          if (read) return { done: true, value: undefined };
          read = true;
          return { done: false, value: bytes };
        },
        cancel: async () => undefined,
      }),
    },
  } as unknown as Response;
}

function guardrailStub(options: { busySlotOnce?: boolean } = {}): TikTokGuardrails {
  const cache = new Map<string, TikTokCacheEntry>();
  let reservations = 0;
  return {
    getCache: async (postId) => cache.get(postId),
    setCache: async (postId, entry) => { cache.set(postId, entry); },
    isBreakerOpen: async () => false,
    openBreaker: async () => 15 * 60_000,
    clearBreaker: async () => undefined,
    reserveRequestSlot: async () => {
      reservations += 1;
      if (options.busySlotOnce && reservations === 1) return null;
      return 'slot-1';
    },
    releaseRequestSlot: async () => undefined,
  };
}

/** The real page reader, reading one fixed fixture page. */
function fixturePageProvider(options: { busySlotOnce?: boolean } = {}) {
  const fetcher = jest.fn(async () => htmlResponse(PHOTO_AS_VIDEO_FIXTURE));
  const provider = createTikTokPageProvider({
    enabled: () => true,
    getGuardrails: () => guardrailStub(options),
    hasDailyAllowance: async () => true,
    chargeDailyRequest: async () => true,
    fetcher,
    sleep: async () => undefined,
  });
  return { provider, fetcher };
}

async function insertLinkSource(
  id: string,
  userId: string,
  url: string,
  handle: string,
  postId: string,
  kind: 'tiktok-photo' | 'tiktok-video' = 'tiktok-photo',
  details?: Record<string, unknown>,
) {
  const { client } = require('@/db') as { client: { execute: (q: { sql: string; args: unknown[] }) => Promise<unknown> } };
  const now = new Date().toISOString();
  const [canonical] = [url];
  const parsed = new URL(url);
  const canonicalUrl = `https://www.tiktok.com/@${handle}/${kind === 'tiktok-photo' ? 'photo' : 'video'}/${postId}`;
  await client.execute({
    sql: `INSERT INTO sources (id,user_id,type,uri,ocr_text,processing_status,meta,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?)`,
    args: [id, userId, 'url', canonical, '', 'queued', JSON.stringify({
      url: canonicalUrl,
      platform: 'tiktok',
      link: {
        originalUrl: parsed.toString(),
        canonicalUrl,
        platform: 'tiktok',
        kind,
        handle,
        postId,
        needsResolution: false,
        resolution: { status: 'not-needed' },
        ...(details ? { details } : {}),
        providers: [],
      },
    }), now, now],
  });
}

async function attachPrivatePhoto(placeId: string, attachmentId: string, url: string) {
  const { client } = require('@/db') as { client: { execute: (q: { sql: string; args: unknown[] }) => Promise<unknown> } };
  await client.execute({
    sql: `INSERT INTO attachments (id,place_id,type,uri,filename,thumbnail_uri,is_primary,source,created_at)
          VALUES (?,?,?,?,?,?,?,?,?)`,
    args: [attachmentId, placeId, 'photo', url, 'private.jpg', url, 0, 'upload', new Date().toISOString()],
  });
}

describe('TikTok private photo routes', () => {
  const priorEnv = {
    enabled: process.env.TIKTOK_PAGE_FETCH_ENABLED,
    token: process.env.TIKTOK_PRIVATE_BLOB_READ_WRITE_TOKEN,
  };
  let imageBytes: Buffer;

  beforeAll(async () => {
    assertLocalDatabase();
    const sharp = (await import('sharp')).default;
    imageBytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#c04a31' } }).jpeg().toBuffer();
  });

  beforeEach(async () => {
    await resetTenantFixture();
    jest.clearAllMocks();
    (requireAuthForApi as jest.Mock).mockResolvedValue(ALICE);
    (tiktokPageProvider.getDetails as jest.Mock).mockResolvedValue({
      details: { title: 'A carousel', authorHandle: 'alicecreator', contentKind: 'photo' },
      transient: { imageRefs: [{ url: 'https://p16-sign.tiktokcdn.com/photo.jpg?x-expires=1900000000', expiresAt: 1_900_000_000_000 }] },
    });
    (put as jest.Mock).mockImplementation(async (pathname: string) => ({ url: `https://travel-dream.private.blob.vercel-storage.com/${pathname}` }));
    (get as jest.Mock).mockResolvedValue({
      statusCode: 200,
      stream: new ReadableStream(),
      blob: { contentType: 'image/jpeg', size: imageBytes.byteLength, etag: '"photo-etag"' },
    });
    process.env.TIKTOK_PAGE_FETCH_ENABLED = 'true';
    process.env.TIKTOK_PRIVATE_BLOB_READ_WRITE_TOKEN = 'test-private-store-token';
    global.fetch = jest.fn(async () => streamResponse(imageBytes)) as unknown as typeof fetch;
  });

  afterAll(() => {
    if (priorEnv.enabled === undefined) delete process.env.TIKTOK_PAGE_FETCH_ENABLED;
    else process.env.TIKTOK_PAGE_FETCH_ENABLED = priorEnv.enabled;
    if (priorEnv.token === undefined) delete process.env.TIKTOK_PRIVATE_BLOB_READ_WRITE_TOKEN;
    else process.env.TIKTOK_PRIVATE_BLOB_READ_WRITE_TOKEN = priorEnv.token;
  });

  it('requires authentication before starting photo import', async () => {
    (requireAuthForApi as jest.Mock).mockRejectedValue(new Error('Unauthorized'));
    const response = await importPhotos(new NextRequest('https://tabidreams.com/api/inbox/links/src_alice_link/import-photos', { method: 'POST' }) as never, {
      params: Promise.resolve({ sourceId: 'src_alice_link' }),
    });
    expect(response.status).toBe(401);
    expect(put).not.toHaveBeenCalled();
  });

  it('does not expose or mutate another tenant’s TikTok link', async () => {
    await insertLinkSource('src_alice_link', ALICE.id, ALICE_TIKTOK_LINK, 'alicecreator', '7694185850497666335');
    await insertLinkSource('src_bob_link', BOB.id, BOB_TIKTOK_LINK, 'bobcreator', '7634085795908881686');

    const response = await importPhotos(new NextRequest('https://tabidreams.com/api/inbox/links/src_bob_link/import-photos', { method: 'POST' }) as never, {
      params: Promise.resolve({ sourceId: 'src_bob_link' }),
    });
    expect(response.status).toBe(404);
    expect(tiktokPageProvider.getDetails).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it('copies carousel photos to private storage and queues only caller-owned screenshots', async () => {
    await insertLinkSource('src_alice_link', ALICE.id, ALICE_TIKTOK_LINK, 'alicecreator', '7694185850497666335');
    const response = await importPhotos(new NextRequest('https://tabidreams.com/api/inbox/links/src_alice_link/import-photos', { method: 'POST' }) as never, {
      params: Promise.resolve({ sourceId: 'src_alice_link' }),
    });
    expect(response.status).toBe(200);
    expect(tiktokPageProvider.getDetails).toHaveBeenCalledWith(expect.objectContaining({ kind: 'tiktok-photo' }), {
      userId: ALICE.id,
      forceRefresh: true,
      waitForSlot: true,
    });
    expect(put).toHaveBeenCalledTimes(1);
    expect(String((global.fetch as jest.Mock).mock.calls[0][0])).toContain('p16-sign.tiktokcdn.com');

    const { client } = require('@/db') as { client: { execute: (q: { sql: string; args: unknown[] }) => Promise<{ rows: Record<string, unknown>[] }> } };
    const rows = await client.execute({
      sql: `SELECT user_id, type, uri, processing_status, meta FROM sources WHERE id != ? AND user_id = ?`,
      args: ['src_alice_link', ALICE.id],
    });
    const imported = rows.rows.find((row) => String(row.uri).includes('.private.blob.vercel-storage.com/'));
    expect(imported).toMatchObject({ user_id: ALICE.id, type: 'screenshot', processing_status: 'queued' });
    expect(JSON.stringify(imported?.meta)).toContain('@alicecreator');
    expect(JSON.stringify(imported?.meta)).toContain(ALICE_TIKTOK_LINK);
    const allUsers = await client.execute({
      sql: `SELECT user_id FROM sources WHERE type = 'screenshot' AND processing_status = 'queued'`,
      args: [],
    });
    expect(allUsers.rows.every((row) => row.user_id === ALICE.id)).toBe(true);
  });

  it('imports a carousel from a photo post saved under its video URL', async () => {
    await insertLinkSource(
      'src_alice_video_link',
      ALICE.id,
      ALICE_TIKTOK_VIDEO_LINK,
      'alicecreator',
      '7694185850497666335',
      'tiktok-video',
      { contentKind: 'photo' },
    );
    const { provider } = fixturePageProvider();
    (tiktokPageProvider.getDetails as jest.Mock).mockImplementation(
      (link: unknown, context: unknown) => provider.getDetails(link as never, context as never),
    );

    const response = await importPhotos(new NextRequest('https://tabidreams.com/api/inbox/links/src_alice_video_link/import-photos', { method: 'POST' }) as never, {
      params: Promise.resolve({ sourceId: 'src_alice_video_link' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ imported: 2 });
    expect(tiktokPageProvider.getDetails).toHaveBeenCalledWith(expect.objectContaining({ kind: 'tiktok-video' }), {
      userId: ALICE.id,
      forceRefresh: true,
      waitForSlot: true,
    });

    const { client } = require('@/db') as { client: { execute: (q: { sql: string; args: unknown[] }) => Promise<{ rows: Record<string, unknown>[] }> } };
    const rows = await client.execute({
      sql: `SELECT user_id, uri, meta FROM sources WHERE type = 'screenshot' AND user_id = ?`,
      args: [ALICE.id],
    });
    expect(rows.rows.filter((row) => String(row.uri).includes('.private.blob.vercel-storage.com/'))).toHaveLength(2);
    expect(JSON.stringify(rows.rows)).toContain(ALICE_TIKTOK_VIDEO_LINK);
  });

  it('waits for the app-wide request slot instead of failing the import', async () => {
    await insertLinkSource('src_alice_link', ALICE.id, ALICE_TIKTOK_LINK, 'alicecreator', '7694185850497666335');
    const { provider } = fixturePageProvider({ busySlotOnce: true });
    (tiktokPageProvider.getDetails as jest.Mock).mockImplementation(
      (link: unknown, context: unknown) => provider.getDetails(link as never, context as never),
    );

    const response = await importPhotos(new NextRequest('https://tabidreams.com/api/inbox/links/src_alice_link/import-photos', { method: 'POST' }) as never, {
      params: Promise.resolve({ sourceId: 'src_alice_link' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ imported: 2 });
  });

  it('identifies the same way to TikTok when reading the page and downloading the photos', async () => {
    await insertLinkSource('src_alice_link', ALICE.id, ALICE_TIKTOK_LINK, 'alicecreator', '7694185850497666335');
    const { provider, fetcher } = fixturePageProvider();
    (tiktokPageProvider.getDetails as jest.Mock).mockImplementation(
      (link: unknown, context: unknown) => provider.getDetails(link as never, context as never),
    );

    const response = await importPhotos(new NextRequest('https://tabidreams.com/api/inbox/links/src_alice_link/import-photos', { method: 'POST' }) as never, {
      params: Promise.resolve({ sourceId: 'src_alice_link' }),
    });

    expect(response.status).toBe(200);
    const pageInit = (fetcher.mock.calls[0] as unknown as [unknown, RequestInit])[1];
    const imageInit = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    const pageAgent = (pageInit.headers as Record<string, string>)['user-agent'];
    const imageAgent = (imageInit.headers as Record<string, string>)['user-agent'];
    expect(imageAgent).toBe(pageAgent);
    expect(imageAgent).toBe('TravelDreamLinkPreview/1.0 (+https://tabidreams.com)');
  });

  it('refuses a video post that has no carousel', async () => {
    await insertLinkSource(
      'src_alice_plain_video',
      ALICE.id,
      ALICE_TIKTOK_VIDEO_LINK,
      'alicecreator',
      '7694185850497666335',
      'tiktok-video',
      { contentKind: 'video' },
    );
    (tiktokPageProvider.getDetails as jest.Mock).mockResolvedValue({
      details: { authorHandle: 'alicecreator', contentKind: 'video' },
      transient: { imageRefs: [{ url: 'https://p16-sign.tiktokcdn.com/cover.jpg?x-expires=1900000000' }] },
    });

    const response = await importPhotos(new NextRequest('https://tabidreams.com/api/inbox/links/src_alice_plain_video/import-photos', { method: 'POST' }) as never, {
      params: Promise.resolve({ sourceId: 'src_alice_plain_video' }),
    });

    expect(response.status).toBe(400);
    expect(put).not.toHaveBeenCalled();
  });

  it('keeps the internal read reason out of the message the user sees', async () => {
    await insertLinkSource('src_alice_link', ALICE.id, ALICE_TIKTOK_LINK, 'alicecreator', '7694185850497666335');
    (tiktokPageProvider.getDetails as jest.Mock).mockResolvedValue({ empty: true, reason: 'throttled' });

    const response = await importPhotos(new NextRequest('https://tabidreams.com/api/inbox/links/src_alice_link/import-photos', { method: 'POST' }) as never, {
      params: Promise.resolve({ sourceId: 'src_alice_link' }),
    });

    expect(response.status).toBe(502);
    const payload = await response.json() as { error?: string };
    expect(payload.error).toBe("Couldn't read TikTok right now.");
    expect(payload.error).not.toContain('throttled');
    expect(put).not.toHaveBeenCalled();
    const logged = (console.warn as unknown as jest.Mock).mock.calls
      .map((call: unknown[]) => call.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' '))
      .join('\n');
    expect(logged).toContain('throttled');
  });

  it('says the daily reading limit is used up instead of inviting a retry', async () => {
    await insertLinkSource('src_alice_link', ALICE.id, ALICE_TIKTOK_LINK, 'alicecreator', '7694185850497666335');
    (tiktokPageProvider.getDetails as jest.Mock).mockResolvedValue({ empty: true, reason: 'daily_limit' });

    const response = await importPhotos(new NextRequest('https://tabidreams.com/api/inbox/links/src_alice_link/import-photos', { method: 'POST' }) as never, {
      params: Promise.resolve({ sourceId: 'src_alice_link' }),
    });

    expect(response.status).toBe(429);
    const payload = await response.json() as { error?: string };
    expect(payload.error).toBe("Today's TikTok reading limit is used up. Try again tomorrow.");
    expect(put).not.toHaveBeenCalled();

    // The link stays saved and can be tapped again later: nothing was queued or lost.
    const { client } = require('@/db') as { client: { execute: (q: { sql: string; args: unknown[] }) => Promise<{ rows: Record<string, unknown>[] }> } };
    const parent = await client.execute({ sql: `SELECT meta FROM sources WHERE id = ?`, args: ['src_alice_link'] });
    expect(JSON.parse(String(parent.rows[0].meta)).link.tiktokPhotoImport.status).toBe('failed');
    const imported = await client.execute({
      sql: `SELECT id FROM sources WHERE user_id = ? AND uri LIKE '%.private.blob.vercel-storage.com/%'`,
      args: [ALICE.id],
    });
    expect(imported.rows).toHaveLength(0);
  });

  it('answers an unexpected failure with a generic message and logs the detail', async () => {
    await insertLinkSource('src_alice_link', ALICE.id, ALICE_TIKTOK_LINK, 'alicecreator', '7694185850497666335');
    (put as jest.Mock).mockRejectedValue(new Error('Vercel Blob: Failed to fetch blob: 403 store_abc123'));
    const logSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await importPhotos(new NextRequest('https://tabidreams.com/api/inbox/links/src_alice_link/import-photos', { method: 'POST' }) as never, {
      params: Promise.resolve({ sourceId: 'src_alice_link' }),
    });

    expect(response.status).toBe(502);
    const payload = await response.json() as { error?: string };
    expect(payload.error).toBe("Couldn't import these photos. Try again.");
    expect(JSON.stringify(payload)).not.toContain('store_abc123');
    const logged = logSpy.mock.calls
      .map((call: unknown[]) => call.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' '))
      .join('\n');
    expect(logged).toContain('store_abc123');
    logSpy.mockRestore();
  });

  it('tells the user when an image is not what its type claims', async () => {
    await insertLinkSource('src_alice_link', ALICE.id, ALICE_TIKTOK_LINK, 'alicecreator', '7694185850497666335');
    global.fetch = jest.fn(async () => streamResponse(new TextEncoder().encode('not an image at all'))) as unknown as typeof fetch;

    const response = await importPhotos(new NextRequest('https://tabidreams.com/api/inbox/links/src_alice_link/import-photos', { method: 'POST' }) as never, {
      params: Promise.resolve({ sourceId: 'src_alice_link' }),
    });

    expect(response.status).toBe(502);
    const payload = await response.json() as { error?: string };
    expect(payload.error).toBe('TikTok image contents did not match its type');
    expect(put).not.toHaveBeenCalled();
  });

  it('rejects an untrusted image host before downloading or storing bytes', async () => {
    await insertLinkSource('src_alice_link', ALICE.id, ALICE_TIKTOK_LINK, 'alicecreator', '7694185850497666335');
    (tiktokPageProvider.getDetails as jest.Mock).mockResolvedValue({
      details: { authorHandle: 'alicecreator', contentKind: 'photo' },
      transient: { imageRefs: [{ url: 'https://example.com/not-a-tiktok-image.jpg' }] },
    });
    const response = await importPhotos(new NextRequest('https://tabidreams.com/api/inbox/links/src_alice_link/import-photos', { method: 'POST' }) as never, {
      params: Promise.resolve({ sourceId: 'src_alice_link' }),
    });
    expect(response.status).toBe(422);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it('rejects public Blob destinations because imported images must stay private', async () => {
    await insertLinkSource('src_alice_link', ALICE.id, ALICE_TIKTOK_LINK, 'alicecreator', '7694185850497666335');
    (put as jest.Mock).mockResolvedValue({ url: 'https://travel-dream.public.blob.vercel-storage.com/exposed.jpg' });
    const response = await importPhotos(new NextRequest('https://tabidreams.com/api/inbox/links/src_alice_link/import-photos', { method: 'POST' }) as never, {
      params: Promise.resolve({ sourceId: 'src_alice_link' }),
    });
    expect(response.status).toBe(502);
    expect(del).toHaveBeenCalledWith(
      'https://travel-dream.public.blob.vercel-storage.com/exposed.jpg',
      expect.anything(),
    );
    const { client } = require('@/db') as { client: { execute: (q: { sql: string; args: unknown[] }) => Promise<{ rows: Record<string, unknown>[] }> } };
    const sources = await client.execute({ sql: `SELECT id FROM sources WHERE type = 'screenshot' AND user_id = ?`, args: [ALICE.id] });
    expect(sources.rows).toHaveLength(1); // the fixture's own screenshot only
  });

  it('rejects a public Blob URL that only mentions the private host in its query', async () => {
    await insertLinkSource('src_alice_link', ALICE.id, ALICE_TIKTOK_LINK, 'alicecreator', '7694185850497666335');
    (put as jest.Mock).mockResolvedValue({
      url: 'https://travel-dream.public.blob.vercel-storage.com/exposed.jpg?.private.blob.vercel-storage.com/',
    });
    const response = await importPhotos(new NextRequest('https://tabidreams.com/api/inbox/links/src_alice_link/import-photos', { method: 'POST' }) as never, {
      params: Promise.resolve({ sourceId: 'src_alice_link' }),
    });
    expect(response.status).toBe(502);
    const { client } = require('@/db') as { client: { execute: (q: { sql: string; args: unknown[] }) => Promise<{ rows: Record<string, unknown>[] }> } };
    const sources = await client.execute({ sql: `SELECT id FROM sources WHERE type = 'screenshot' AND user_id = ?`, args: [ALICE.id] });
    expect(sources.rows).toHaveLength(1);
  });

  it('serves a private photo only when this user owns an attachment reference', async () => {
    await attachPrivatePhoto(FIXTURE.alicePlace, 'att_alice_private', ALICE_PRIVATE_PHOTO);
    await attachPrivatePhoto(FIXTURE.bobPlace, 'att_bob_private', BOB_PRIVATE_PHOTO);
    const foreign = await privatePhoto(new NextRequest(`https://tabidreams.com/api/photos/private?url=${encodeURIComponent(BOB_PRIVATE_PHOTO)}`) as never);
    expect(foreign.status).toBe(404);
    expect(get).not.toHaveBeenCalled();

    const own = await privatePhoto(new NextRequest(`https://tabidreams.com/api/photos/private?url=${encodeURIComponent(ALICE_PRIVATE_PHOTO)}`) as never);
    expect(own.status).toBe(200);
    expect(get).toHaveBeenCalledWith(expect.stringContaining('tiktok-imports/alice/photo.jpg'), expect.anything());
    expect(own.headers.get('Cache-Control')).toBe('private, no-cache');
  });

  it('does not serve a private photo that only a collection cover names', async () => {
    const { client } = require('@/db') as { client: { execute: (q: { sql: string; args: unknown[] }) => Promise<unknown> } };
    await client.execute({
      sql: 'UPDATE collections SET cover_image_url = ? WHERE id = ?',
      args: [ALICE_PRIVATE_PHOTO, FIXTURE.aliceCollection],
    });

    const response = await privatePhoto(new NextRequest(`https://tabidreams.com/api/photos/private?url=${encodeURIComponent(ALICE_PRIVATE_PHOTO)}`) as never);
    expect(response.status).toBe(404);
    expect(get).not.toHaveBeenCalled();
  });

  it('still serves a private photo the caller owns when it is also a collection cover', async () => {
    const { client } = require('@/db') as { client: { execute: (q: { sql: string; args: unknown[] }) => Promise<unknown> } };
    await attachPrivatePhoto(FIXTURE.alicePlace, 'att_alice_private', ALICE_PRIVATE_PHOTO);
    await client.execute({
      sql: 'UPDATE collections SET cover_image_url = ? WHERE id = ?',
      args: [ALICE_PRIVATE_PHOTO, FIXTURE.aliceCollection],
    });

    const response = await privatePhoto(new NextRequest(`https://tabidreams.com/api/photos/private?url=${encodeURIComponent(ALICE_PRIVATE_PHOTO)}`) as never);
    expect(response.status).toBe(200);
    expect(get).toHaveBeenCalledWith(expect.stringContaining('tiktok-imports/alice/photo.jpg'), expect.anything());
  });
});
