/** @jest-environment node */
import { ALICE, BOB, FIXTURE, assertLocalDatabase, readCell, resetTenantFixture } from '../helpers/tenant-fixture';

jest.mock('@vercel/blob', () => ({
  del: jest.fn(),
  get: jest.fn(),
  put: jest.fn(),
}));
jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: jest.fn((error: unknown) => error instanceof Error && error.message === 'Unauthorized'),
}));
jest.mock('@/lib/tiktok-private-blob', () => ({
  ...jest.requireActual('@/lib/tiktok-private-blob'),
  deleteTikTokPrivateBlobs: jest.fn(),
}));

import { del } from '@vercel/blob';
import { deleteTikTokPrivateBlobs } from '@/lib/tiktok-private-blob';
import { requireAuthForApi } from '@/lib/auth-helpers';

const PUBLIC_BLOB = 'https://store.public.blob.vercel-storage.com/alice-photo.jpg';
const SECOND_PUBLIC_BLOB = 'https://store.public.blob.vercel-storage.com/alice-second.jpg';
const PRIVATE_BLOB = 'https://travel-dream.private.blob.vercel-storage.com/tiktok-imports/alice/photo.jpg';
const SAVED_POST = 'https://www.tiktok.com/@alicecreator/video/7694185850497666335';
const EXTERNAL_PHOTO = 'https://images.pexels.com/photos/1/pexels-photo.jpeg';

function route() {
  return require('@/app/api/data/delete-all/route') as { DELETE: () => Promise<Response> };
}

async function insertSource(id: string, type: string, uri: string, userId = ALICE.id) {
  const { client } = require('@/db') as {
    client: { execute: (query: { sql: string; args: unknown[] }) => Promise<unknown> };
  };
  const now = new Date().toISOString();
  await client.execute({
    sql: `INSERT INTO sources (id,user_id,type,uri,ocr_text,processing_status,meta,created_at,updated_at)
          VALUES (?,?,?,?,NULL,'completed','{}',?,?)`,
    args: [id, userId, type, uri, now, now],
  });
}

async function insertAttachment(id: string, placeId: string, uri: string) {
  const { client } = require('@/db') as {
    client: { execute: (query: { sql: string; args: unknown[] }) => Promise<unknown> };
  };
  await client.execute({
    sql: `INSERT INTO attachments (id,place_id,type,uri,filename,thumbnail_uri,is_primary,source,created_at)
          VALUES (?,?,'photo',?,?,?,0,'pexels',?)`,
    args: [id, placeId, uri, 'external.jpg', uri, new Date().toISOString()],
  });
}

function publicDeleteBatches(): string[][] {
  return (del as jest.Mock).mock.calls.map((call: unknown[]) =>
    (Array.isArray(call[0]) ? call[0] : [call[0]]).map((url) => String(url)),
  );
}

function privateDeleteBatches(): string[][] {
  return (deleteTikTokPrivateBlobs as jest.Mock).mock.calls.map((call: unknown[]) =>
    (Array.isArray(call[0]) ? call[0] : [call[0]]).map((url) => String(url)),
  );
}

function warnings(): string {
  return (console.warn as unknown as jest.Mock).mock.calls
    .map((call: unknown[]) => call.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' '))
    .join('\n');
}

beforeAll(() => assertLocalDatabase());

beforeEach(async () => {
  await resetTenantFixture();
  (requireAuthForApi as jest.Mock).mockResolvedValue(ALICE);
  (del as jest.Mock).mockResolvedValue(undefined);
  (deleteTikTokPrivateBlobs as jest.Mock).mockResolvedValue({ status: 'deleted', count: 1 });
  await insertSource('src_alice_public', 'screenshot', PUBLIC_BLOB);
  await insertSource('src_alice_public_two', 'screenshot', SECOND_PUBLIC_BLOB);
  await insertSource('src_alice_private', 'screenshot', PRIVATE_BLOB);
  await insertSource('src_alice_saved_post', 'url', SAVED_POST);
  await insertAttachment('att_alice_external', 'plc_alice', EXTERNAL_PHOTO);
});

describe('DELETE /api/data/delete-all', () => {
  it('deletes each store in a single request and leaves URLs that are not blobs alone', async () => {
    const response = await route().DELETE();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true });

    const publicBatches = publicDeleteBatches();
    expect(publicBatches).toHaveLength(1);
    expect(publicBatches[0]).toHaveLength(3);
    expect(publicBatches[0]).toEqual(
      expect.arrayContaining([FIXTURE.aliceSourceBlob, PUBLIC_BLOB, SECOND_PUBLIC_BLOB]),
    );
    expect(publicBatches[0]).not.toContain(SAVED_POST);
    expect(publicBatches[0]).not.toContain(EXTERNAL_PHOTO);
    expect(publicBatches[0]).not.toContain(FIXTURE.bobSourceBlob);

    const privateBatches = privateDeleteBatches();
    expect(privateBatches).toEqual([[PRIVATE_BLOB]]);

    expect(await readCell('SELECT count(*) FROM sources WHERE user_id = ?', [ALICE.id])).toBe(0);
    expect(await readCell('SELECT count(*) FROM sources WHERE user_id = ?', [BOB.id])).toBe(1);
  });

  it('keeps deleting the other store when one deletion fails', async () => {
    (del as jest.Mock).mockRejectedValue(new Error('blob store unavailable'));
    (deleteTikTokPrivateBlobs as jest.Mock).mockRejectedValue(new Error('TikTok private Blob storage is not configured'));

    const response = await route().DELETE();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true });
    expect(privateDeleteBatches()).toEqual([[PRIVATE_BLOB]]);
    expect(await readCell('SELECT count(*) FROM sources WHERE user_id = ?', [ALICE.id])).toBe(0);

    const logged = warnings();
    expect(logged).toContain('Public blob cleanup failed (3 URLs)');
    expect(logged).toContain('Private TikTok blob cleanup failed (1 URLs)');
  });

  it('skips the private batch with a log line when the private store is not configured', async () => {
    (deleteTikTokPrivateBlobs as jest.Mock).mockResolvedValue({ status: 'skipped', reason: 'not_configured', count: 1 });

    const response = await route().DELETE();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true });
    expect(warnings()).toContain('Skipped private TikTok blob cleanup (1 URLs): not_configured');
  });
});
