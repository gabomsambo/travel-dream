/**
 * @jest-environment node
 *
 * Screenshot / attachment delete must not remove blobs still referenced elsewhere
 * in the same tenant.
 */
import {
  ALICE,
  BOB,
  FIXTURE,
  assertLocalDatabase,
  readCell,
  resetTenantFixture,
  useUniqueUuids,
} from '../helpers/tenant-fixture';

jest.mock('@vercel/blob', () => ({
  del: jest.fn().mockResolvedValue(undefined),
}));

import { del } from '@vercel/blob';
import {
  clearAllScreenshots,
  deleteAttachment,
  deleteSource,
} from '@/lib/db-mutations';

const SHARED_BLOB = 'https://store.public.blob.vercel-storage.com/shared-screenshot.jpg';
const THUMB_BLOB = 'https://store.public.blob.vercel-storage.com/shared-thumb.jpg';
const ORPHAN_BLOB = 'https://store.public.blob.vercel-storage.com/orphan-only.jpg';

const mockDel = del as jest.Mock;

async function insertSharedScreenshotSource(id: string, userId: string, uri: string, thumb?: string) {
  const { client } = require('@/db') as {
    client: { execute: (q: { sql: string; args: unknown[] }) => Promise<unknown> };
  };
  const now = new Date().toISOString();
  const meta = thumb
    ? JSON.stringify({ uploadInfo: { thumbnailPath: thumb, originalName: 'shot.jpg' } })
    : JSON.stringify({ uploadInfo: { originalName: 'shot.jpg' } });
  await client.execute({
    sql: `INSERT INTO sources (id, user_id, type, uri, processing_status, meta, created_at, updated_at)
          VALUES (?,?,?,?,?,?,?,?)`,
    args: [id, userId, 'screenshot', uri, 'done', meta, now, now],
  });
}

async function insertPlaceAttachment(
  id: string,
  placeId: string,
  uri: string,
  thumbnailUri?: string | null
) {
  const { client } = require('@/db') as {
    client: { execute: (q: { sql: string; args: unknown[] }) => Promise<unknown> };
  };
  const now = new Date().toISOString();
  await client.execute({
    sql: `INSERT INTO attachments
            (id, place_id, type, uri, filename, thumbnail_uri, is_primary, source, created_at)
          VALUES (?,?,?,?,?,?,?,?,?)`,
    args: [id, placeId, 'photo', uri, 'shot.jpg', thumbnailUri ?? null, 1, 'upload', now],
  });
}

describe('shared blob cleanup on delete', () => {
  beforeAll(() => {
    assertLocalDatabase();
    useUniqueUuids();
  });

  beforeEach(async () => {
    mockDel.mockClear();
    await resetTenantFixture();
  });

  it('keeps the blob when deleting a screenshot still used as a place photo', async () => {
    await insertSharedScreenshotSource('src_shared', ALICE.id, SHARED_BLOB, THUMB_BLOB);
    await insertPlaceAttachment('att_shared', FIXTURE.alicePlace, SHARED_BLOB, THUMB_BLOB);

    await deleteSource('src_shared', ALICE.id);

    expect(mockDel).not.toHaveBeenCalled();
    expect(await readCell('SELECT uri FROM attachments WHERE id = ?', ['att_shared'])).toBe(SHARED_BLOB);
    expect(await readCell('SELECT id FROM sources WHERE id = ?', ['src_shared'])).toBeUndefined();
  });

  it('deletes the blob when the screenshot has no remaining references', async () => {
    await insertSharedScreenshotSource('src_orphan', ALICE.id, ORPHAN_BLOB);

    await deleteSource('src_orphan', ALICE.id);

    expect(mockDel).toHaveBeenCalledTimes(1);
    expect(mockDel).toHaveBeenCalledWith(ORPHAN_BLOB);
  });

  it('keeps the blob when deleting an attachment still used by a screenshot source', async () => {
    await insertSharedScreenshotSource('src_keeps_blob', ALICE.id, SHARED_BLOB);
    await insertPlaceAttachment('att_linked', FIXTURE.alicePlace, SHARED_BLOB);

    await deleteAttachment('att_linked', ALICE.id);

    expect(mockDel).not.toHaveBeenCalled();
    expect(await readCell('SELECT uri FROM sources WHERE id = ?', ['src_keeps_blob'])).toBe(SHARED_BLOB);
  });

  it('clear-all skips blobs still referenced by place attachments', async () => {
    await insertSharedScreenshotSource('src_clear_a', ALICE.id, SHARED_BLOB);
    await insertSharedScreenshotSource('src_clear_b', ALICE.id, ORPHAN_BLOB);
    await insertPlaceAttachment('att_clear', FIXTURE.alicePlace, SHARED_BLOB);

    const result = await clearAllScreenshots(ALICE.id);
    expect(result.deleted).toBe(3);

    expect(mockDel).not.toHaveBeenCalledWith(SHARED_BLOB);
    expect(mockDel).toHaveBeenCalledWith(ORPHAN_BLOB);
    expect(mockDel).toHaveBeenCalledWith(FIXTURE.aliceSourceBlob);
    expect(await readCell('SELECT uri FROM attachments WHERE id = ?', ['att_clear'])).toBe(SHARED_BLOB);
  });

  it('does not treat another tenant attachment as a reference when deleting a source', async () => {
    await insertSharedScreenshotSource('src_alice_only', ALICE.id, SHARED_BLOB);
    await insertPlaceAttachment('att_bob', FIXTURE.bobPlace, SHARED_BLOB);

    await deleteSource('src_alice_only', ALICE.id);

    expect(mockDel).toHaveBeenCalledWith(SHARED_BLOB);
    expect(await readCell('SELECT uri FROM attachments WHERE id = ?', ['att_bob'])).toBe(SHARED_BLOB);
  });
});
