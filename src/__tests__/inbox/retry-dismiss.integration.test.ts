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
import { claimNextQueuedSource } from '@/lib/db-mutations';
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

interface StoredMeta {
  uploadInfo?: unknown;
  massUpload?: { extraction?: unknown };
  inbox?: { dismissedAt?: string };
  retry?: {
    previous?: {
      processingStatus: string;
      processingAttempts: number;
      processingInterruptions: number;
      processingError: string | null;
    };
  };
}

function asMeta(value: unknown): StoredMeta {
  if (typeof value === 'string') return JSON.parse(value) as StoredMeta;
  if (value && typeof value === 'object') return value as StoredMeta;
  throw new Error('source meta missing');
}

type RetryResponse = {
  status: number;
  json: () => Promise<{ sourceIds?: string[]; message?: string }>;
};

function retryPost(body: unknown): Promise<RetryResponse> {
  const { POST } = require('@/app/api/mass-upload/retry/route') as {
    POST: (request: Request) => Promise<RetryResponse>;
  };
  return POST(apiRequest('http://t/api/mass-upload/retry', 'POST', body));
}

type DismissResponse = {
  status: number;
  json: () => Promise<{ sourceIds?: string[]; dismissed?: boolean; message?: string }>;
};

function dismissPost(body: unknown): Promise<DismissResponse> {
  const { POST } = require('@/app/api/inbox/dismiss/route') as {
    POST: (request: Request) => Promise<DismissResponse>;
  };
  return POST(apiRequest('http://t/api/inbox/dismiss', 'POST', body));
}

const DISMISSED_AT = '2026-10-23T15:00:00.000Z';

type SqlQuery = string | { sql: string; args?: unknown[] };
type SqlTx = { execute: (query: SqlQuery) => Promise<unknown> };

async function dismissAfterNextSourcesRead(sourceId: string, run: () => Promise<void>): Promise<void> {
  const { client } = require('@/db') as {
    client: {
      execute: (query: SqlQuery) => Promise<unknown>;
      transaction: (...args: unknown[]) => Promise<SqlTx>;
    };
  };
  const originalExecute = client.execute.bind(client);
  const originalTransaction = client.transaction.bind(client);
  let pending = true;
  const wrap = (execute: (query: SqlQuery) => Promise<unknown>) => {
    return async (query: SqlQuery) => {
      const result = await execute(query);
      const text = typeof query === 'string' ? query : query.sql;
      if (pending && /^\s*select\b/i.test(text) && /\bsources\b/i.test(text)) {
        pending = false;
        await execute({
          sql: `UPDATE sources SET meta = json_set(COALESCE(meta, '{}'), '$.inbox.dismissedAt', ?) WHERE id = ?`,
          args: [DISMISSED_AT, sourceId],
        });
      }
      return result;
    };
  };
  client.execute = wrap(originalExecute);
  client.transaction = async (...args: unknown[]) => {
    const tx = await originalTransaction(...args);
    const originalTxExecute = tx.execute.bind(tx);
    tx.execute = wrap(originalTxExecute);
    return tx;
  };
  try {
    await run();
  } finally {
    client.execute = originalExecute;
    client.transaction = originalTransaction;
  }
}

async function changeMetaBeforeNextSourcesUpdate(
  statement: { sql: string; args: unknown[] },
  run: () => Promise<void>
): Promise<void> {
  const { client } = require('@/db') as {
    client: {
      execute: (query: SqlQuery) => Promise<unknown>;
      transaction: (...args: unknown[]) => Promise<SqlTx>;
    };
  };
  const originalExecute = client.execute.bind(client);
  const originalTransaction = client.transaction.bind(client);
  let pending = true;
  const wrap = (execute: (query: SqlQuery) => Promise<unknown>) => {
    return async (query: SqlQuery) => {
      const text = typeof query === 'string' ? query : query.sql;
      if (pending && /^\s*update\b/i.test(text) && /\bsources\b/i.test(text)) {
        pending = false;
        await execute(statement);
      }
      return execute(query);
    };
  };
  client.execute = wrap(originalExecute);
  client.transaction = async (...args: unknown[]) => {
    const tx = await originalTransaction(...args);
    const originalTxExecute = tx.execute.bind(tx);
    tx.execute = wrap(originalTxExecute);
    return tx;
  };
  try {
    await run();
  } finally {
    client.execute = originalExecute;
    client.transaction = originalTransaction;
  }
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
    const before = asMeta(await readCell('SELECT meta FROM sources WHERE id = ?', ['src_retry']));

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
    const stored = asMeta(await readCell('SELECT meta FROM sources WHERE id = ?', ['src_retry']));
    expect(stored.uploadInfo).toEqual(before.uploadInfo);
    expect(stored.massUpload).toEqual(before.massUpload);
    expect(stored.retry?.previous).toEqual({
      processingStatus: 'failed',
      processingAttempts: 3,
      processingInterruptions: 4,
      processingError: 'reader confused',
    });
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
    expect(asMeta(await readCell('SELECT meta FROM sources WHERE id = ?', ['src_retry'])).retry?.previous).toMatchObject({
      processingStatus: 'stalled',
      processingAttempts: 3,
      processingInterruptions: 4,
      processingError: 'reader confused',
    });
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

  it('keeps a dismiss that lands while a retry is being claimed', async () => {
    await seedFailed('failed');
    expect((await retryPost({ sourceIds: ['src_retry'] })).status).toBe(200);

    await dismissAfterNextSourcesRead('src_retry', async () => {
      const claim = await claimNextQueuedSource('lease_dismiss');
      expect(claim.source?.id).toBe('src_retry');
    });

    expect(await readCell('SELECT processing_status FROM sources WHERE id = ?', ['src_retry'])).toBe('extracting');
    expect(await readCell('SELECT processing_lease_id FROM sources WHERE id = ?', ['src_retry'])).toBe('lease_dismiss');
    const stored = asMeta(await readCell('SELECT meta FROM sources WHERE id = ?', ['src_retry']));
    expect(stored.inbox?.dismissedAt).toBe(DISMISSED_AT);
    expect(stored.retry).toBeUndefined();
    expect(stored.massUpload?.extraction).toEqual(EXTRACTION);

    const hidden = await getInboxUploads(ALICE.id);
    const batch = hidden.uploads.find((upload) => upload.sessionId === 'session_retry');
    expect(batch?.dismissedCount).toBe(1);
    expect(batch?.screenshotCount).toBe(1);
    expect(batch?.screenshots).toEqual([]);
    expect(batch?.rows.stillReading.sourceIds).toEqual([]);
  });

  it('keeps a dismiss that lands while undo puts the screenshot back', async () => {
    await seedFailed('failed');
    expect((await retryPost({ sourceIds: ['src_retry'] })).status).toBe(200);

    let undone: RetryResponse | undefined;
    await dismissAfterNextSourcesRead('src_retry', async () => {
      undone = await retryPost({ sourceIds: ['src_retry'], undo: true });
    });

    expect(undone?.status).toBe(200);
    expect((await undone?.json())?.sourceIds).toEqual(['src_retry']);
    expect(await readCell('SELECT processing_status FROM sources WHERE id = ?', ['src_retry'])).toBe('failed');
    expect(await readCell('SELECT processing_attempts FROM sources WHERE id = ?', ['src_retry'])).toBe(3);
    expect(await readCell('SELECT processing_interruptions FROM sources WHERE id = ?', ['src_retry'])).toBe(4);
    expect(await readCell('SELECT processing_error FROM sources WHERE id = ?', ['src_retry'])).toBe('reader confused');
    const stored = asMeta(await readCell('SELECT meta FROM sources WHERE id = ?', ['src_retry']));
    expect(stored.inbox?.dismissedAt).toBe(DISMISSED_AT);
    expect(stored.retry).toBeUndefined();
    expect(stored.massUpload?.extraction).toEqual(EXTRACTION);

    const hidden = await getInboxUploads(ALICE.id);
    const batch = hidden.uploads.find((upload) => upload.sessionId === 'session_retry');
    expect(batch?.dismissedCount).toBe(1);
    expect(batch?.screenshots).toEqual([]);
    expect(batch?.rows.couldNotRead.sourceIds).toEqual([]);
  });

  it('undo before a worker claims the row restores the failed screenshot', async () => {
    await seedFailed('failed');
    const queued = await retryPost({ sourceIds: ['src_retry'] });
    expect(queued.status).toBe(200);

    const undone = await retryPost({ sourceIds: ['src_retry'], undo: true });
    expect(undone.status).toBe(200);
    expect((await undone.json()).sourceIds).toEqual(['src_retry']);

    expect(await readCell('SELECT processing_status FROM sources WHERE id = ?', ['src_retry'])).toBe('failed');
    expect(await readCell('SELECT processing_attempts FROM sources WHERE id = ?', ['src_retry'])).toBe(3);
    expect(await readCell('SELECT processing_interruptions FROM sources WHERE id = ?', ['src_retry'])).toBe(4);
    expect(await readCell('SELECT processing_error FROM sources WHERE id = ?', ['src_retry'])).toBe('reader confused');
    expect(await readCell('SELECT processing_lease_id FROM sources WHERE id = ?', ['src_retry'])).toBeNull();
    expect(await readCell('SELECT next_attempt_at FROM sources WHERE id = ?', ['src_retry'])).toBeNull();
    const stored = asMeta(await readCell('SELECT meta FROM sources WHERE id = ?', ['src_retry']));
    expect(stored.retry).toBeUndefined();
    expect(stored.massUpload?.extraction).toEqual(EXTRACTION);
    expect(await readCell('SELECT uri FROM sources WHERE id = ?', ['src_retry'])).toBe(
      'https://store.public.blob.vercel-storage.com/src_retry.jpg'
    );
    expect(del).not.toHaveBeenCalled();
  });

  it('undo after a worker claims the row says processing already started and changes nothing', async () => {
    await seedFailed('failed');
    expect((await retryPost({ sourceIds: ['src_retry'] })).status).toBe(200);

    const claim = await claimNextQueuedSource('lease_undo');
    expect(claim.source?.id).toBe('src_retry');
    expect(await readCell('SELECT processing_status FROM sources WHERE id = ?', ['src_retry'])).toBe('extracting');
    expect(await readCell('SELECT processing_lease_id FROM sources WHERE id = ?', ['src_retry'])).toBe('lease_undo');
    const claimed = asMeta(await readCell('SELECT meta FROM sources WHERE id = ?', ['src_retry']));
    expect(claimed.retry).toBeUndefined();
    expect(claimed.massUpload?.extraction).toEqual(EXTRACTION);

    const before = {
      status: await readCell('SELECT processing_status FROM sources WHERE id = ?', ['src_retry']),
      attempts: await readCell('SELECT processing_attempts FROM sources WHERE id = ?', ['src_retry']),
      interruptions: await readCell('SELECT processing_interruptions FROM sources WHERE id = ?', ['src_retry']),
      error: await readCell('SELECT processing_error FROM sources WHERE id = ?', ['src_retry']),
      lease: await readCell('SELECT processing_lease_id FROM sources WHERE id = ?', ['src_retry']),
      nextAttemptAt: await readCell('SELECT next_attempt_at FROM sources WHERE id = ?', ['src_retry']),
      meta: await readCell('SELECT meta FROM sources WHERE id = ?', ['src_retry']),
      updatedAt: await readCell('SELECT updated_at FROM sources WHERE id = ?', ['src_retry']),
    };

    const undone = await retryPost({ sourceIds: ['src_retry'], undo: true });
    expect(undone.status).toBe(409);
    expect((await undone.json()).message).toBe('Processing already started.');
    expect(await readCell('SELECT processing_status FROM sources WHERE id = ?', ['src_retry'])).toBe(before.status);
    expect(await readCell('SELECT processing_attempts FROM sources WHERE id = ?', ['src_retry'])).toBe(before.attempts);
    expect(await readCell('SELECT processing_interruptions FROM sources WHERE id = ?', ['src_retry'])).toBe(before.interruptions);
    expect(await readCell('SELECT processing_error FROM sources WHERE id = ?', ['src_retry'])).toBe(before.error);
    expect(await readCell('SELECT processing_lease_id FROM sources WHERE id = ?', ['src_retry'])).toBe(before.lease);
    expect(await readCell('SELECT next_attempt_at FROM sources WHERE id = ?', ['src_retry'])).toBe(before.nextAttemptAt);
    expect(await readCell('SELECT meta FROM sources WHERE id = ?', ['src_retry'])).toBe(before.meta);
    expect(await readCell('SELECT updated_at FROM sources WHERE id = ?', ['src_retry'])).toBe(before.updatedAt);
    expect(del).not.toHaveBeenCalled();
  });

  it("undo does not restore another user's screenshot", async () => {
    await seedFailed('failed');
    const bobMeta = JSON.stringify({
      uploadInfo: { sessionId: 'session_bob', originalName: 'bob-passport.png' },
      retry: {
        previous: {
          processingStatus: 'failed',
          processingAttempts: 2,
          processingInterruptions: 1,
          processingError: 'bob failed',
        },
      },
    });
    await execute(
      `UPDATE sources SET processing_status = 'queued', processing_attempts = 0,
         processing_interruptions = 0, processing_error = NULL, processing_lease_id = NULL,
         next_attempt_at = NULL, meta = ? WHERE id = ?`,
      [bobMeta, FIXTURE.bobSource]
    );
    expect((await retryPost({ sourceIds: ['src_retry'] })).status).toBe(200);

    const undone = await retryPost({ sourceIds: ['src_retry', FIXTURE.bobSource], undo: true });
    expect(undone.status).toBe(200);
    const body = await undone.json();
    expect(body.sourceIds).toEqual(['src_retry']);
    expect(JSON.stringify(body)).not.toMatch(/bob/i);

    expect(await readCell('SELECT processing_status FROM sources WHERE id = ?', ['src_retry'])).toBe('failed');
    expect(await readCell('SELECT processing_status FROM sources WHERE id = ?', [FIXTURE.bobSource])).toBe('queued');
    expect(await readCell('SELECT processing_error FROM sources WHERE id = ?', [FIXTURE.bobSource])).toBeNull();
    expect(await readCell('SELECT meta FROM sources WHERE id = ?', [FIXTURE.bobSource])).toBe(bobMeta);
    expect(await readCell('SELECT uri FROM sources WHERE id = ?', [FIXTURE.bobSource])).toBe(FIXTURE.bobSourceBlob);
  });

  it('undo of a batch changes nothing once any screenshot was claimed', async () => {
    await seedFailed('failed');
    await execute(
      `INSERT INTO sources
         (id,user_id,type,uri,processing_status,processing_attempts,processing_interruptions,
          processing_error,meta,created_at,updated_at)
       VALUES (?,?,'screenshot',?,?,?,?,?,?,?,?)`,
      [
        'src_retry_2',
        ALICE.id,
        'https://store.public.blob.vercel-storage.com/src_retry_2.jpg',
        'failed',
        3,
        4,
        'reader confused',
        meta(),
        '2026-10-23T13:14:00.000Z',
        '2026-10-23T13:14:00.000Z',
      ]
    );
    expect((await retryPost({ sourceIds: ['src_retry', 'src_retry_2'] })).status).toBe(200);
    const claim = await claimNextQueuedSource('lease_one');
    expect(['src_retry', 'src_retry_2']).toContain(claim.source?.id);

    const waitingId = claim.source?.id === 'src_retry' ? 'src_retry_2' : 'src_retry';
    const waitingBefore = await readCell('SELECT meta FROM sources WHERE id = ?', [waitingId]);
    const undone = await retryPost({ sourceIds: ['src_retry', 'src_retry_2'], undo: true });
    expect(undone.status).toBe(409);
    expect((await undone.json()).message).toBe('Processing already started.');

    expect(await readCell('SELECT processing_status FROM sources WHERE id = ?', [claim.source?.id])).toBe('extracting');
    expect(await readCell('SELECT processing_status FROM sources WHERE id = ?', [waitingId])).toBe('queued');
    expect(await readCell('SELECT processing_attempts FROM sources WHERE id = ?', [waitingId])).toBe(0);
    expect(asMeta(await readCell('SELECT meta FROM sources WHERE id = ?', [waitingId])).retry?.previous?.processingStatus).toBe('failed');
    expect(await readCell('SELECT meta FROM sources WHERE id = ?', [waitingId])).toBe(waitingBefore);
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

  it('patches dismissedAt without dropping meta written while the dismiss is in flight', async () => {
    await seedFailed('completed');
    const previous = {
      processingStatus: 'failed',
      processingAttempts: 3,
      processingInterruptions: 4,
      processingError: 'reader confused',
    };
    const extraction = { places: [{ name: 'Injected Terrace' }] };

    let response: DismissResponse | undefined;
    await changeMetaBeforeNextSourcesUpdate(
      {
        sql: `UPDATE sources SET meta = json_set(
                COALESCE(meta, '{}'),
                '$.retry.previous', json(?),
                '$.massUpload.extraction', json(?)
              ) WHERE id = ?`,
        args: [JSON.stringify(previous), JSON.stringify(extraction), 'src_retry'],
      },
      async () => {
        response = await dismissPost({ sourceIds: ['src_retry'], dismissed: true });
      }
    );

    expect(response?.status).toBe(200);
    expect((await response?.json())?.sourceIds).toEqual(['src_retry']);
    const stored = asMeta(await readCell('SELECT meta FROM sources WHERE id = ?', ['src_retry']));
    expect(stored.inbox?.dismissedAt).toEqual(expect.any(String));
    expect(stored.retry?.previous).toEqual(previous);
    expect(stored.massUpload?.extraction).toEqual(extraction);
    expect(stored.uploadInfo).toEqual({ sessionId: 'session_retry', originalName: 'IMG_3017.jpg' });

    const undo = await dismissPost({ sourceIds: ['src_retry'], dismissed: false });
    expect(undo.status).toBe(200);
    expect((await undo.json()).sourceIds).toEqual(['src_retry']);
    const restored = asMeta(await readCell('SELECT meta FROM sources WHERE id = ?', ['src_retry']));
    expect(restored.inbox).toBeUndefined();
    expect(restored.retry?.previous).toEqual(previous);
    expect(restored.massUpload?.extraction).toEqual(extraction);
    expect(String(await readCell('SELECT meta FROM sources WHERE id = ?', ['src_retry']))).not.toContain('dismissedAt');
    expect(del).not.toHaveBeenCalled();
  });

  it('changes only screenshots that are not already in the requested state', async () => {
    await seedFailed('completed');
    const secondMeta = meta({ uploadInfo: { sessionId: 'session_retry', originalName: 'IMG_3024.jpg' } });
    await execute(
      `INSERT INTO sources
         (id,user_id,type,uri,processing_status,meta,created_at,updated_at)
       VALUES (?,?,'screenshot',?,?,?,?,?)`,
      [
        'src_retry_2',
        ALICE.id,
        'https://store.public.blob.vercel-storage.com/src_retry_2.jpg',
        'completed',
        secondMeta,
        '2026-10-23T13:14:00.000Z',
        '2026-10-23T13:14:00.000Z',
      ]
    );
    await execute(
      `UPDATE sources SET meta = json_set(COALESCE(meta, '{}'), '$.inbox.dismissedAt', ?), updated_at = ? WHERE id = ?`,
      [DISMISSED_AT, '2026-10-23T13:13:00.000Z', 'src_retry']
    );
    const hiddenUpdatedAt = await readCell('SELECT updated_at FROM sources WHERE id = ?', ['src_retry']);

    const dismissed = await dismissPost({ sourceIds: ['src_retry', 'src_retry_2'], dismissed: true });
    expect(dismissed.status).toBe(200);
    expect((await dismissed.json()).sourceIds).toEqual(['src_retry_2']);
    expect(asMeta(await readCell('SELECT meta FROM sources WHERE id = ?', ['src_retry'])).inbox?.dismissedAt).toBe(DISMISSED_AT);
    expect(await readCell('SELECT updated_at FROM sources WHERE id = ?', ['src_retry'])).toBe(hiddenUpdatedAt);
    const freshlyHidden = asMeta(await readCell('SELECT meta FROM sources WHERE id = ?', ['src_retry_2']));
    expect(freshlyHidden.inbox?.dismissedAt).toEqual(expect.any(String));
    expect(freshlyHidden.massUpload?.extraction).toEqual(EXTRACTION);

    await execute(
      `INSERT INTO sources
         (id,user_id,type,uri,processing_status,meta,created_at,updated_at)
       VALUES (?,?,'screenshot',?,?,?,?,?)`,
      [
        'src_visible',
        ALICE.id,
        'https://store.public.blob.vercel-storage.com/src_visible.jpg',
        'completed',
        meta(),
        '2026-10-23T13:15:00.000Z',
        '2026-10-23T13:15:00.000Z',
      ]
    );
    const visibleBefore = await readCell('SELECT meta FROM sources WHERE id = ?', ['src_visible']);
    const putBack = await dismissPost({ sourceIds: ['src_retry_2', 'src_visible'], dismissed: false });
    expect(putBack.status).toBe(200);
    expect((await putBack.json()).sourceIds).toEqual(['src_retry_2']);
    expect(await readCell('SELECT meta FROM sources WHERE id = ?', ['src_visible'])).toBe(visibleBefore);
    expect(asMeta(await readCell('SELECT meta FROM sources WHERE id = ?', ['src_retry_2'])).inbox).toBeUndefined();
    expect(asMeta(await readCell('SELECT meta FROM sources WHERE id = ?', ['src_retry'])).inbox?.dismissedAt).toBe(DISMISSED_AT);
  });
});
