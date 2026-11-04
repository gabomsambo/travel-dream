/** @jest-environment node */
import { ALICE, BOB, assertLocalDatabase, readCell, resetTenantFixture } from '../helpers/tenant-fixture';

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
  deleteTikTokPrivateBlob: jest.fn(),
}));

import { del } from '@vercel/blob';
import { deleteTikTokPrivateBlob } from '@/lib/tiktok-private-blob';
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

function deletedPublicUrls(): string[] {
  return (del as jest.Mock).mock.calls.map((call: unknown[]) => String(call[0]));
}

function deletedPrivateUrls(): string[] {
  return (deleteTikTokPrivateBlob as jest.Mock).mock.calls.map((call: unknown[]) => String(call[0]));
}

beforeAll(() => assertLocalDatabase());

beforeEach(async () => {
  await resetTenantFixture();
  (requireAuthForApi as jest.Mock).mockResolvedValue(ALICE);
  (del as jest.Mock).mockResolvedValue(undefined);
  (deleteTikTokPrivateBlob as jest.Mock).mockResolvedValue(undefined);
  await insertSource('src_alice_public', 'screenshot', PUBLIC_BLOB);
  await insertSource('src_alice_public_two', 'screenshot', SECOND_PUBLIC_BLOB);
  await insertSource('src_alice_private', 'screenshot', PRIVATE_BLOB);
  await insertSource('src_alice_saved_post', 'url', SAVED_POST);
  await insertAttachment('att_alice_external', 'plc_alice', EXTERNAL_PHOTO);
});

describe('DELETE /api/data/delete-all', () => {
  it('deletes the stored blobs and leaves URLs that are not blobs alone', async () => {
    const response = await route().DELETE();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true });

    const publicUrls = deletedPublicUrls();
    expect(publicUrls).toContain(PUBLIC_BLOB);
    expect(publicUrls).toContain(SECOND_PUBLIC_BLOB);
    expect(publicUrls).not.toContain(SAVED_POST);
    expect(publicUrls).not.toContain(EXTERNAL_PHOTO);
    expect(deletedPrivateUrls()).toEqual([PRIVATE_BLOB]);

    expect(await readCell('SELECT count(*) FROM sources WHERE user_id = ?', [ALICE.id])).toBe(0);
    expect(await readCell('SELECT count(*) FROM sources WHERE user_id = ?', [BOB.id])).toBe(1);
  });

  it('keeps deleting the other blobs when one deletion fails', async () => {
    (del as jest.Mock).mockImplementation(async (url: string) => {
      if (url === PUBLIC_BLOB) throw new Error('blob store unavailable');
    });
    (deleteTikTokPrivateBlob as jest.Mock).mockRejectedValue(new Error('TikTok private Blob storage is not configured'));

    const response = await route().DELETE();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true });
    expect(deletedPublicUrls()).toContain(SECOND_PUBLIC_BLOB);
    expect(deletedPrivateUrls()).toEqual([PRIVATE_BLOB]);
    expect(await readCell('SELECT count(*) FROM sources WHERE user_id = ?', [ALICE.id])).toBe(0);

    const warnings = (console.warn as unknown as jest.Mock).mock.calls
      .map((call: unknown[]) => call.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' '))
      .join('\n');
    expect(warnings).toContain('Failed to delete 2 of');
  });
});
