/**
 * @jest-environment node
 *
 * Caching a paid read must patch the row as it stands when the write commits.
 * A dismiss, or its undo, that lands while Gemini is in flight has to survive.
 * The fixture import stays first so the suite never opens a remote database.
 */
import {
  ALICE,
  assertLocalDatabase,
  readCell,
  resetTenantFixture,
  useUniqueUuids,
} from '../helpers/tenant-fixture';

jest.mock('@vercel/blob', () => ({ del: jest.fn(), put: jest.fn() }));

import { cacheSourceProcessingWork } from '@/lib/db-mutations';

const SOURCE_ID = 'src_cache';
const LEASE_ID = 'lease_cache';
const THUMB = 'https://store.public.blob.vercel-storage.com/thumb.jpg';
const EXTRACTION = { places: [{ name: 'Tea Terrace' }], imageContext: null };
const SEEDED_AT = '2026-10-24T11:00:00.000Z';
const DISMISSED_AT = '2026-10-24T12:00:00.000Z';

interface StoredMeta {
  uploadInfo?: {
    sessionId?: string;
    originalName?: string;
    storedPath?: string;
    thumbnailPath?: string;
  };
  massUpload?: {
    extraction?: unknown;
    extractedAt?: string;
    thumbnailUrl?: string;
    outcome?: { created: string[]; linked: Array<{ placeId: string; reason: string }> };
  };
  inbox?: { dismissedAt?: string };
}

function asMeta(value: unknown): StoredMeta {
  if (typeof value === 'string') return JSON.parse(value) as StoredMeta;
  if (value && typeof value === 'object') return value as StoredMeta;
  throw new Error('source meta missing');
}

type SqlQuery = string | { sql: string; args?: unknown[] };

async function changeMetaBeforeNextSourcesUpdate(
  statement: { sql: string; args: unknown[] },
  run: () => Promise<void>
): Promise<void> {
  const { client } = require('@/db') as {
    client: { execute: (query: SqlQuery) => Promise<unknown> };
  };
  const originalExecute = client.execute.bind(client);
  let pending = true;
  client.execute = async (query: SqlQuery) => {
    const text = typeof query === 'string' ? query : query.sql;
    if (pending && /^\s*update\b/i.test(text) && /\bsources\b/i.test(text)) {
      pending = false;
      await originalExecute(statement);
    }
    return originalExecute(query);
  };
  try {
    await run();
  } finally {
    client.execute = originalExecute;
  }
}

function execute(sql: string, args: unknown[] = []) {
  const { client } = require('@/db') as {
    client: { execute: (q: { sql: string; args: unknown[] }) => Promise<unknown> };
  };
  return client.execute({ sql, args });
}

async function seed(meta: Record<string, unknown>, leaseId = LEASE_ID) {
  await execute(
    `INSERT INTO sources
       (id,user_id,type,uri,processing_status,processing_lease_id,meta,created_at,updated_at)
     VALUES (?,?,'screenshot',?,'extracting',?,?,?,?)`,
    [
      SOURCE_ID,
      ALICE.id,
      'https://store.public.blob.vercel-storage.com/src_cache.jpg',
      leaseId,
      JSON.stringify(meta),
      SEEDED_AT,
      SEEDED_AT,
    ]
  );
}

const baseMeta = {
  uploadInfo: {
    sessionId: 'session_cache',
    originalName: 'IMG_3017.jpg',
    storedPath: 'https://store.public.blob.vercel-storage.com/src_cache.jpg',
  },
};

beforeAll(() => {
  assertLocalDatabase();
  useUniqueUuids();
});

beforeEach(async () => {
  await resetTenantFixture();
});

describe('cacheSourceProcessingWork', () => {
  it('keeps a dismiss and sibling meta that land while the cache write is in flight', async () => {
    await seed(baseMeta);
    const outcome = {
      created: ['plc_keep'],
      linked: [{ placeId: 'plc_old', reason: 'google_place_id' }],
    };

    let cached = false;
    await changeMetaBeforeNextSourcesUpdate(
      {
        sql: `UPDATE sources SET meta = json_set(
                COALESCE(meta, '{}'),
                '$.inbox.dismissedAt', ?,
                '$.uploadInfo.originalName', ?,
                '$.massUpload.outcome', json(?)
              ) WHERE id = ?`,
        args: [DISMISSED_AT, 'renamed-while-caching.jpg', JSON.stringify(outcome), SOURCE_ID],
      },
      async () => {
        cached = await cacheSourceProcessingWork(SOURCE_ID, LEASE_ID, {
          extraction: EXTRACTION,
          thumbnailUrl: THUMB,
        });
      }
    );

    expect(cached).toBe(true);
    const stored = asMeta(await readCell('SELECT meta FROM sources WHERE id = ?', [SOURCE_ID]));
    expect(stored.inbox?.dismissedAt).toBe(DISMISSED_AT);
    expect(stored.uploadInfo).toEqual({
      sessionId: 'session_cache',
      originalName: 'renamed-while-caching.jpg',
      storedPath: 'https://store.public.blob.vercel-storage.com/src_cache.jpg',
      thumbnailPath: THUMB,
    });
    expect(stored.massUpload?.outcome).toEqual(outcome);
    expect(stored.massUpload?.extraction).toEqual(EXTRACTION);
    expect(stored.massUpload?.thumbnailUrl).toBe(THUMB);
    expect(stored.massUpload?.extractedAt).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(stored.massUpload?.extractedAt ?? ''))).toBe(false);
    expect(await readCell('SELECT processing_status FROM sources WHERE id = ?', [SOURCE_ID])).toBe('extracting');
    expect(await readCell('SELECT processing_lease_id FROM sources WHERE id = ?', [SOURCE_ID])).toBe(LEASE_ID);
    expect(await readCell('SELECT uri FROM sources WHERE id = ?', [SOURCE_ID])).toBe(
      'https://store.public.blob.vercel-storage.com/src_cache.jpg'
    );
  });

  it('keeps an undo that clears the dismiss while the cache write is in flight', async () => {
    await seed({
      ...baseMeta,
      inbox: { dismissedAt: DISMISSED_AT },
    });

    let cached = false;
    await changeMetaBeforeNextSourcesUpdate(
      {
        sql: `UPDATE sources SET meta = json_set(
                json_remove(meta, '$.inbox'),
                '$.uploadInfo.originalName', ?
              ) WHERE id = ?`,
        args: ['restored-name.jpg', SOURCE_ID],
      },
      async () => {
        cached = await cacheSourceProcessingWork(SOURCE_ID, LEASE_ID, {
          extraction: EXTRACTION,
          thumbnailUrl: THUMB,
        });
      }
    );

    expect(cached).toBe(true);
    const stored = asMeta(await readCell('SELECT meta FROM sources WHERE id = ?', [SOURCE_ID]));
    expect(stored.inbox).toBeUndefined();
    expect(String(await readCell('SELECT meta FROM sources WHERE id = ?', [SOURCE_ID]))).not.toContain('dismissedAt');
    expect(stored.uploadInfo?.originalName).toBe('restored-name.jpg');
    expect(stored.uploadInfo?.sessionId).toBe('session_cache');
    expect(stored.uploadInfo?.thumbnailPath).toBe(THUMB);
    expect(stored.massUpload?.extraction).toEqual(EXTRACTION);
    expect(stored.massUpload?.thumbnailUrl).toBe(THUMB);
  });

  it('adds a thumbnail without dropping a cached read or a dismiss already stored', async () => {
    const extractedAt = '2026-10-24T11:30:00.000Z';
    await seed({
      ...baseMeta,
      inbox: { dismissedAt: DISMISSED_AT },
      massUpload: { extraction: EXTRACTION, extractedAt },
    });

    const cached = await cacheSourceProcessingWork(SOURCE_ID, LEASE_ID, { thumbnailUrl: THUMB });
    expect(cached).toBe(true);

    const stored = asMeta(await readCell('SELECT meta FROM sources WHERE id = ?', [SOURCE_ID]));
    expect(stored.inbox?.dismissedAt).toBe(DISMISSED_AT);
    expect(stored.massUpload?.extraction).toEqual(EXTRACTION);
    expect(stored.massUpload?.extractedAt).toBe(extractedAt);
    expect(stored.massUpload?.thumbnailUrl).toBe(THUMB);
    expect(stored.uploadInfo?.thumbnailPath).toBe(THUMB);
    expect(stored.uploadInfo?.originalName).toBe('IMG_3017.jpg');
  });

  it('leaves the row alone when the lease is no longer held', async () => {
    await seed({ ...baseMeta, inbox: { dismissedAt: DISMISSED_AT } });
    const before = await readCell('SELECT meta FROM sources WHERE id = ?', [SOURCE_ID]);

    const cached = await cacheSourceProcessingWork(SOURCE_ID, 'lease_other', {
      extraction: EXTRACTION,
      thumbnailUrl: THUMB,
    });

    expect(cached).toBe(false);
    expect(await readCell('SELECT meta FROM sources WHERE id = ?', [SOURCE_ID])).toBe(before);
    expect(await readCell('SELECT updated_at FROM sources WHERE id = ?', [SOURCE_ID])).toBe(SEEDED_AT);
    expect(await readCell('SELECT processing_lease_id FROM sources WHERE id = ?', [SOURCE_ID])).toBe(LEASE_ID);
  });
});
