/**
 * @jest-environment node
 *
 * Try again and Dismiss against a real local SQLite file. The fixture import
 * stays first so the suite never opens a remote database.
 */
import {
  ALICE,
  FIXTURE,
  apiRequest,
  assertLocalDatabase,
  readCell,
  resetTenantFixture,
  useUniqueUuids,
} from '../helpers/tenant-fixture';

jest.mock('@vercel/blob', () => ({ del: jest.fn(), put: jest.fn() }));
jest.mock('@/lib/mass-upload/dispatch', () => ({
  dispatchProcessors: jest.fn().mockResolvedValue({ spawned: 0 }),
}));
jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: jest.fn((e: unknown) => e instanceof Error && e.message === 'Unauthorized'),
}));

import { del } from '@vercel/blob';
import { requireAuthForApi } from '@/lib/auth-helpers';
import { getInboxUploads } from '@/lib/inbox-uploads';

const EXTRACTION = {
  places: [{
    name: 'Tea Terrace',
    kind: 'cafe',
    city: 'Istanbul',
    country: 'Turkey',
    admin: null,
    description: 'Tea on a terrace',
    confidence: 0.4,
  }],
  imageContext: null,
};

function meta(extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    uploadInfo: { sessionId: 'session_retry', originalName: 'IMG_3017.jpg' },
    massUpload: { extraction: EXTRACTION, thumbnailUrl: 'https://store.public.blob.vercel-storage.com/thumb.jpg' },
    ...extra,
  });
}

const execute = (sql: string, args: unknown[] = []) => {
  const { client } = require('@/db') as {
    client: { execute: (q: { sql: string; args: unknown[] }) => Promise<unknown> };
  };
  return client.execute({ sql, args });
};

async function seedFailed(status: 'failed' | 'stalled' | 'completed' | 'uploaded' = 'failed') {
  const now = '2026-10-23T13:13:00.000Z';
  await execute(
    `INSERT INTO upload_sessions (id,user_id,started_at,file_count,completed_count,failed_count,status,meta)
     VALUES ('session_retry',?,? ,1,1,0,'active',?)`,
    [ALICE.id, now, JSON.stringify({ uploadedFiles: ['src_retry'], errors: [] })]
  );
  await execute(
    `INSERT INTO sources
       (id,user_id,type,uri,processing_status,processing_attempts,processing_interruptions,
        processing_error,processing_lease_id,next_attempt_at,meta,created_at,updated_at)
     VALUES (?,?,'screenshot',?,?,?,?,?,?,?,?,?,?)`,
    [
      'src_retry',
      ALICE.id,
      'https://store.public.blob.vercel-storage.com/src_retry.jpg',
      status,
      3,
      4,
      'reader confused',
      'lease_old',
      '2099-01-01T00:00:00.000Z',
      meta(),
      now,
      now,
    ]
  );
}

beforeAll(() => {
  assertLocalDatabase();
  useUniqueUuids();
});

beforeEach(async () => {
  await resetTenantFixture();
  (requireAuthForApi as jest.Mock).mockResolvedValue(ALICE);
  (del as jest.Mock).mockClear();
});

describe('POST /api/mass-upload/retry', () => {
  it('requeues a failed screenshot, resets counters, and keeps the cached read', async () => {
    await seedFailed('failed');
    const before = await readCell('SELECT meta FROM sources WHERE id = ?', ['src_retry']);

    const { POST } = require('@/app/api/mass-upload/retry/route') as {
      POST: (request: Request) => Promise<{ status: number; json: () => Promise<{ sourceIds: string[] }> }>;
    };
    const response = await POST(apiRequest('http://t/api/mass-upload/retry', 'POST', { sourceIds: ['src_retry'] }));
    expect(response.status).toBe(200);
    expect((await response.json()).sourceIds).toEqual(['src_retry']);

    expect(await readCell('SELECT processing_status FROM sources WHERE id = ?', ['src_retry'])).toBe('queued');
    expect(await readCell('SELECT processing_attempts FROM sources WHERE id = ?', ['src_retry'])).toBe(0);
    expect(await readCell('SELECT processing_interruptions FROM sources WHERE id = ?', ['src_retry'])).toBe(0);
    expect(await readCell('SELECT processing_error FROM sources WHERE id = ?', ['src_retry'])).toBeNull();
    expect(await readCell('SELECT processing_lease_id FROM sources WHERE id = ?', ['src_retry'])).toBeNull();
    expect(await readCell('SELECT next_attempt_at FROM sources WHERE id = ?', ['src_retry'])).toBeNull();
    expect(await readCell('SELECT uri FROM sources WHERE id = ?', ['src_retry'])).toBe(
      'https://store.public.blob.vercel-storage.com/src_retry.jpg'
    );
    expect(await readCell('SELECT meta FROM sources WHERE id = ?', ['src_retry'])).toBe(before);
    expect(del).not.toHaveBeenCalled();
  });

  it('requeues a stalled screenshot the same way', async () => {
    await seedFailed('stalled');
    const { POST } = require('@/app/api/mass-upload/retry/route') as {
      POST: (request: Request) => Promise<{ status: number }>;
    };
    const response = await POST(apiRequest('http://t/api/mass-upload/retry', 'POST', { sourceIds: ['src_retry'] }));
    expect(response.status).toBe(200);
    expect(await readCell('SELECT processing_status FROM sources WHERE id = ?', ['src_retry'])).toBe('queued');
    expect(await readCell('SELECT processing_interruptions FROM sources WHERE id = ?', ['src_retry'])).toBe(0);
  });

  it('does not requeue a finished or still-uploading screenshot', async () => {
    await seedFailed('completed');
    const { POST } = require('@/app/api/mass-upload/retry/route') as {
      POST: (request: Request) => Promise<{ status: number }>;
    };
    const response = await POST(apiRequest('http://t/api/mass-upload/retry', 'POST', { sourceIds: ['src_retry'] }));
    expect(response.status).toBe(404);
    expect(await readCell('SELECT processing_status FROM sources WHERE id = ?', ['src_retry'])).toBe('completed');
    expect(await readCell('SELECT processing_attempts FROM sources WHERE id = ?', ['src_retry'])).toBe(3);
  });

  it("skips another user's screenshot listed in the same request", async () => {
    await seedFailed('failed');
    await execute(
      `UPDATE sources SET processing_status = 'failed', processing_attempts = 3, processing_error = 'bob failed' WHERE id = ?`,
      [FIXTURE.bobSource]
    );
    const bobBefore = await readCell('SELECT processing_status FROM sources WHERE id = ?', [FIXTURE.bobSource]);

    const { POST } = require('@/app/api/mass-upload/retry/route') as {
      POST: (request: Request) => Promise<{ status: number; json: () => Promise<{ sourceIds: string[] }> }>;
    };
    const response = await POST(apiRequest('http://t/api/mass-upload/retry', 'POST', {
      sourceIds: ['src_retry', FIXTURE.bobSource],
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.sourceIds).toEqual(['src_retry']);
    expect(JSON.stringify(body)).not.toMatch(/bob/i);
    expect(await readCell('SELECT processing_status FROM sources WHERE id = ?', [FIXTURE.bobSource])).toBe(bobBefore);
    expect(await readCell('SELECT processing_error FROM sources WHERE id = ?', [FIXTURE.bobSource])).toBe('bob failed');
  });
});

describe('POST /api/inbox/dismiss', () => {
  it('hides the screenshot from the Inbox and keeps the file', async () => {
    await seedFailed('completed');
    await execute(
      `UPDATE sources SET meta = ? WHERE id = ?`,
      [meta(), 'src_retry']
    );

    const { POST } = require('@/app/api/inbox/dismiss/route') as {
      POST: (request: Request) => Promise<{ status: number; json: () => Promise<{ sourceIds: string[]; dismissed: boolean }> }>;
    };
    const response = await POST(apiRequest('http://t/api/inbox/dismiss', 'POST', {
      sourceIds: ['src_retry'],
      dismissed: true,
    }));
    expect(response.status).toBe(200);
    expect((await response.json()).sourceIds).toEqual(['src_retry']);

    const stored = String(await readCell('SELECT meta FROM sources WHERE id = ?', ['src_retry']));
    expect(stored).toContain('dismissedAt');
    expect(stored).toContain('Tea Terrace');
    expect(await readCell('SELECT uri FROM sources WHERE id = ?', ['src_retry'])).toBe(
      'https://store.public.blob.vercel-storage.com/src_retry.jpg'
    );
    expect(del).not.toHaveBeenCalled();

    const hidden = await getInboxUploads(ALICE.id);
    const batch = hidden.uploads.find((upload) => upload.sessionId === 'session_retry');
    expect(batch?.dismissedCount).toBe(1);
    expect(batch?.screenshotCount).toBe(1);
    expect(batch?.rows.noPlaceFound.sourceIds).toEqual([]);
    expect(batch?.screenshots).toEqual([]);
    expect(batch?.screenshots.map((shot) => shot.handAdd)).toEqual([]);

    const undo = await POST(apiRequest('http://t/api/inbox/dismiss', 'POST', {
      sourceIds: ['src_retry'],
      dismissed: false,
    }));
    expect(undo.status).toBe(200);
    const restored = await getInboxUploads(ALICE.id);
    const back = restored.uploads.find((upload) => upload.sessionId === 'session_retry');
    expect(back?.dismissedCount).toBe(0);
    expect(back?.rows.noPlaceFound.sourceIds).toEqual(['src_retry']);
    expect(back?.screenshots[0]?.handAdd).toEqual({
      name: 'Tea Terrace',
      kind: 'cafe',
      city: 'Istanbul',
      country: 'Turkey',
      admin: null,
      description: 'Tea on a terrace',
    });
    expect(String(await readCell('SELECT meta FROM sources WHERE id = ?', ['src_retry']))).not.toContain('dismissedAt');
  });

  it("does not hide another user's screenshot", async () => {
    const before = await readCell('SELECT meta FROM sources WHERE id = ?', [FIXTURE.bobSource]);
    const { POST } = require('@/app/api/inbox/dismiss/route') as {
      POST: (request: Request) => Promise<{ status: number }>;
    };
    const response = await POST(apiRequest('http://t/api/inbox/dismiss', 'POST', {
      sourceIds: [FIXTURE.bobSource],
    }));
    expect(response.status).toBe(404);
    expect(await readCell('SELECT meta FROM sources WHERE id = ?', [FIXTURE.bobSource])).toBe(before);
    expect(await readCell('SELECT uri FROM sources WHERE id = ?', [FIXTURE.bobSource])).toBe(FIXTURE.bobSourceBlob);
    expect(del).not.toHaveBeenCalled();
  });
});
