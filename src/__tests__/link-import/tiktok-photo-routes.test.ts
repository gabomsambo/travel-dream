/** @jest-environment node */
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
import { put, get } from '@vercel/blob';
import { tiktokPageProvider } from '@/lib/link-import/providers/tiktok-page';
import { POST as importPhotos } from '@/app/api/inbox/links/[sourceId]/import-photos/route';
import { GET as privatePhoto } from '@/app/api/photos/private/route';

const ALICE_TIKTOK_LINK = 'https://www.tiktok.com/@alicecreator/photo/7694185850497666335';
const BOB_TIKTOK_LINK = 'https://www.tiktok.com/@bobcreator/photo/7634085795908881686';
const ALICE_PRIVATE_PHOTO = 'https://travel-dream.private.blob.vercel-storage.com/tiktok-imports/alice/photo.jpg';
const BOB_PRIVATE_PHOTO = 'https://travel-dream.private.blob.vercel-storage.com/tiktok-imports/bob/photo.jpg';

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

async function insertLinkSource(id: string, userId: string, url: string, handle: string, postId: string) {
  const { client } = require('@/db') as { client: { execute: (q: { sql: string; args: unknown[] }) => Promise<unknown> } };
  const now = new Date().toISOString();
  const [canonical] = [url];
  const parsed = new URL(url);
  const canonicalUrl = `https://www.tiktok.com/@${handle}/photo/${postId}`;
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
        kind: 'tiktok-photo',
        handle,
        postId,
        needsResolution: false,
        resolution: { status: 'not-needed' },
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
});
