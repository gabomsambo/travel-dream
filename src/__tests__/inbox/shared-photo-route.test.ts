/**
 * @jest-environment node
 *
 * Live delete routes must not remove a blob another place photo or screenshot
 * in the same tenant still stores. Huacachina and Tacama share one screenshot
 * file as their primary photo; deleting Huacachina's photo has to leave that
 * file in place for Tacama and the inbox source.
 */
import {
  ALICE,
  FIXTURE,
  apiRequest,
  assertLocalDatabase,
  readCell,
  resetTenantFixture,
  setSessionUploadedFiles,
  useUniqueUuids,
} from '../helpers/tenant-fixture';

jest.mock('@vercel/blob', () => ({
  del: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: jest.fn((err: unknown) => err instanceof Error && err.message === 'Unauthorized'),
}));

import { del } from '@vercel/blob';
import { requireAuthForApi } from '@/lib/auth-helpers';

const SHARED = 'https://store.public.blob.vercel-storage.com/huacachina-tacama.jpg';
const HUACA_THUMB = 'https://store.public.blob.vercel-storage.com/huacachina-only-thumb.jpg';
const ORPHAN = 'https://store.public.blob.vercel-storage.com/orphan-place-photo.jpg';

const mockDel = del as jest.Mock;

function deletedBlobUrls(): string {
  return JSON.stringify(mockDel.mock.calls);
}

async function execute(sql: string, args: unknown[] = []) {
  const { client } = require('@/db') as {
    client: { execute: (q: { sql: string; args: unknown[] }) => Promise<unknown> };
  };
  await client.execute({ sql, args });
}

async function insertPlace(id: string, name: string) {
  const now = new Date().toISOString();
  await execute(
    `INSERT INTO places (id,user_id,name,kind,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`,
    [id, ALICE.id, name, 'landmark', 'library', now, now]
  );
}

async function insertAttachment(
  id: string,
  placeId: string,
  uri: string,
  thumbnailUri: string | null
) {
  await execute(
    `INSERT INTO attachments
       (id,place_id,type,uri,filename,thumbnail_uri,is_primary,source,created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, placeId, 'photo', uri, 'photo.jpg', thumbnailUri, 1, 'upload', new Date().toISOString()]
  );
}

async function insertSource(
  id: string,
  uri: string,
  status: string,
  meta: Record<string, unknown>
) {
  const now = new Date().toISOString();
  await execute(
    `INSERT INTO sources (id,user_id,type,uri,processing_status,meta,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [id, ALICE.id, 'screenshot', uri, status, JSON.stringify(meta), now, now]
  );
}

async function deletePlacePhoto(placeId: string, attachmentId: string) {
  const { DELETE } = require('@/app/api/places/[id]/attachments/[attachmentId]/route') as {
    DELETE: (
      req: Request,
      ctx: { params: Promise<{ id: string; attachmentId: string }> }
    ) => Promise<{ status: number; json: () => Promise<{ success?: boolean }> }>;
  };
  const res = await DELETE(
    apiRequest(`http://localhost/api/places/${placeId}/attachments/${attachmentId}`, 'DELETE'),
    { params: Promise.resolve({ id: placeId, attachmentId }) }
  );
  return { status: res.status, body: await res.json() };
}

describe('shared photo blob on live delete routes', () => {
  beforeAll(() => {
    assertLocalDatabase();
    useUniqueUuids();
    (requireAuthForApi as jest.Mock).mockResolvedValue(ALICE);
  });

  beforeEach(async () => {
    mockDel.mockClear();
    await resetTenantFixture();
  });

  it('keeps the Huacachina/Tacama screenshot when one place photo is deleted', async () => {
    await insertPlace('plc_huacachina', 'Huacachina');
    await insertPlace('plc_tacama', 'Tacama');
    await insertSource('src_img_2912', SHARED, 'done', {
      uploadInfo: { originalName: 'IMG_2912.jpg' },
    });
    await insertAttachment('att_huacachina', 'plc_huacachina', SHARED, HUACA_THUMB);
    await insertAttachment('att_tacama', 'plc_tacama', SHARED, SHARED);

    const res = await deletePlacePhoto('plc_huacachina', 'att_huacachina');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(deletedBlobUrls()).not.toContain(SHARED);
    expect(deletedBlobUrls()).toContain(HUACA_THUMB);
    expect(await readCell('SELECT id FROM attachments WHERE id = ?', ['att_huacachina'])).toBeUndefined();
    expect(await readCell('SELECT uri FROM attachments WHERE id = ?', ['att_tacama'])).toBe(SHARED);
    expect(await readCell('SELECT uri FROM sources WHERE id = ?', ['src_img_2912'])).toBe(SHARED);
  });

  it('releases a place photo blob when nothing else references it', async () => {
    await insertPlace('plc_only', 'Solo stop');
    await insertAttachment('att_only', 'plc_only', ORPHAN, null);

    const res = await deletePlacePhoto('plc_only', 'att_only');

    expect(res.status).toBe(200);
    expect(deletedBlobUrls()).toContain(ORPHAN);
    expect(await readCell('SELECT id FROM attachments WHERE id = ?', ['att_only'])).toBeUndefined();
  });

  it('cancel keeps a blob a place photo still uses and releases an unshared one', async () => {
    await insertPlace('plc_tacama', 'Tacama');
    await insertAttachment('att_tacama', 'plc_tacama', SHARED, null);
    await insertSource('src_shared_q', SHARED, 'queued', {
      uploadInfo: { originalName: 'shared.jpg' },
    });
    await insertSource('src_orphan_q', ORPHAN, 'queued', {
      uploadInfo: { originalName: 'orphan.jpg' },
    });
    await setSessionUploadedFiles(FIXTURE.aliceSession, ['src_shared_q', 'src_orphan_q']);

    const { POST } = require('@/app/api/mass-upload/cancel/route') as {
      POST: (req: Request) => Promise<{ status: number; json: () => Promise<{ cancelled?: number }> }>;
    };
    const res = await POST(
      apiRequest('http://localhost/api/mass-upload/cancel', 'POST', {
        sessionId: FIXTURE.aliceSession,
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.cancelled).toBe(2);
    expect(deletedBlobUrls()).not.toContain(SHARED);
    expect(deletedBlobUrls()).toContain(ORPHAN);
    expect(await readCell('SELECT uri FROM attachments WHERE id = ?', ['att_tacama'])).toBe(SHARED);
    expect(await readCell('SELECT processing_status FROM sources WHERE id = ?', ['src_shared_q'])).toBe(
      'cancelled'
    );
  });

  it('session cleanup keeps a blob a place photo still uses and releases an unshared one', async () => {
    await insertPlace('plc_tacama', 'Tacama');
    await insertAttachment('att_tacama', 'plc_tacama', SHARED, null);
    await insertSource('src_shared_s', SHARED, 'uploaded', {
      uploadInfo: { storageType: 'vercel-blob', originalName: 'shared.jpg' },
    });
    await insertSource('src_orphan_s', ORPHAN, 'uploaded', {
      uploadInfo: { storageType: 'vercel-blob', originalName: 'orphan.jpg' },
    });
    await setSessionUploadedFiles(FIXTURE.aliceSession, ['src_shared_s', 'src_orphan_s']);

    const { DELETE } = require('@/app/api/upload/sessions/route') as {
      DELETE: (req: Request) => Promise<{ status: number; json: () => Promise<{ status?: string }> }>;
    };
    const res = await DELETE(
      apiRequest(
        `http://localhost/api/upload/sessions?sessionId=${FIXTURE.aliceSession}&cleanup=true`,
        'DELETE'
      )
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('success');
    expect(deletedBlobUrls()).not.toContain(SHARED);
    expect(deletedBlobUrls()).toContain(ORPHAN);
    expect(await readCell('SELECT uri FROM attachments WHERE id = ?', ['att_tacama'])).toBe(SHARED);
    expect(await readCell('SELECT id FROM sources WHERE id = ?', ['src_shared_s'])).toBeUndefined();
    expect(await readCell('SELECT id FROM sources WHERE id = ?', ['src_orphan_s'])).toBeUndefined();
  });
});
