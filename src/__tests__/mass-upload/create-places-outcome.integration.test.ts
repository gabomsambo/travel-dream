/**
 * @jest-environment node
 *
 * Writing `massUpload.outcome` must patch the row as it stands when the write
 * commits. A dismiss, or its undo, that lands while createPlaces is mid-flight
 * has to survive. The fixture import stays first so the suite never opens a
 * remote database.
 */
import {
  ALICE,
  assertLocalDatabase,
  readCell,
  resetTenantFixture,
  useUniqueUuids,
} from '../helpers/tenant-fixture';

jest.mock('@vercel/blob', () => ({ del: jest.fn(), put: jest.fn() }));

import { createPlacesFromPipeline } from '@/lib/db-mutations';
import type { PipelinePlace } from '@/types/extraction-pipeline';

const SOURCE_ID = 'src_outcome';
const SEEDED_AT = '2026-10-24T11:00:00.000Z';
const DISMISSED_AT = '2026-10-24T12:00:00.000Z';
const EXTRACTED_AT = '2026-10-24T11:30:00.000Z';
const EXTRACTION = { places: [{ name: 'Tea Terrace' }], imageContext: null };

interface StoredMeta {
  uploadInfo?: {
    sessionId?: string;
    originalName?: string;
    storedPath?: string;
  };
  massUpload?: {
    extraction?: unknown;
    extractedAt?: string;
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
type ExecFn = (query: SqlQuery) => Promise<unknown>;
type TxHandle = {
  execute: ExecFn;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
};

async function changeMetaBeforeNextSourcesUpdate(
  statement: { sql: string; args: unknown[] },
  run: () => Promise<void>
): Promise<void> {
  const { client } = require('@/db') as {
    client: {
      execute: ExecFn;
      transaction: (...args: unknown[]) => Promise<TxHandle>;
    };
  };
  const originalExecute = client.execute.bind(client);
  const originalTransaction = client.transaction.bind(client);
  let pending = true;

  const wrapExecute = (execute: ExecFn): ExecFn => async (query) => {
    const text = typeof query === 'string' ? query : query.sql;
    if (pending && /^\s*update\b/i.test(text) && /\bsources\b/i.test(text)) {
      pending = false;
      await execute(statement);
    }
    return execute(query);
  };

  client.execute = wrapExecute(originalExecute);
  client.transaction = async (...args: unknown[]) => {
    const tx = await originalTransaction(...args);
    tx.execute = wrapExecute(tx.execute.bind(tx));
    return tx;
  };

  try {
    await run();
  } finally {
    client.execute = originalExecute;
    client.transaction = originalTransaction;
  }
}

function execute(sql: string, args: unknown[] = []) {
  const { client } = require('@/db') as {
    client: { execute: (q: { sql: string; args: unknown[] }) => Promise<unknown> };
  };
  return client.execute({ sql, args });
}

async function seed(meta: Record<string, unknown>) {
  await execute(
    `INSERT INTO sources
       (id,user_id,type,uri,processing_status,meta,created_at,updated_at)
     VALUES (?,?,'screenshot',?,'enriching',?,?,?)`,
    [
      SOURCE_ID,
      ALICE.id,
      'https://store.public.blob.vercel-storage.com/src_outcome.jpg',
      JSON.stringify(meta),
      SEEDED_AT,
      SEEDED_AT,
    ]
  );
}

function pipelinePlace(overrides: Partial<PipelinePlace> = {}): PipelinePlace {
  return {
    name: 'Brand New Cafe',
    kind: 'cafe',
    city: 'Lisbon',
    country: 'Portugal',
    admin: null,
    description: null,
    tags: null,
    vibes: null,
    confidence: 0.9,
    price_level: null,
    best_time: null,
    activities: null,
    cuisine: null,
    amenities: null,
    practicalInfo: null,
    recommendedBy: null,
    coords: { lat: 38.72, lon: -9.14 },
    address: null,
    googlePlaceId: 'google-outcome-new',
    ...overrides,
  } as PipelinePlace;
}

const baseMeta = {
  uploadInfo: {
    sessionId: 'session_outcome',
    originalName: 'IMG_4017.jpg',
    storedPath: 'https://store.public.blob.vercel-storage.com/src_outcome.jpg',
  },
  massUpload: {
    extraction: EXTRACTION,
    extractedAt: EXTRACTED_AT,
  },
};

beforeAll(() => {
  assertLocalDatabase();
  useUniqueUuids();
});

beforeEach(async () => {
  await resetTenantFixture();
});

describe('createPlacesFromPipeline outcome meta', () => {
  it('keeps a dismiss and sibling meta that land while outcome is written', async () => {
    await seed(baseMeta);

    let created: Awaited<ReturnType<typeof createPlacesFromPipeline>> | null = null;
    await changeMetaBeforeNextSourcesUpdate(
      {
        sql: `UPDATE sources SET meta = json_set(
                COALESCE(meta, '{}'),
                '$.inbox.dismissedAt', ?,
                '$.uploadInfo.originalName', ?
              ) WHERE id = ?`,
        args: [DISMISSED_AT, 'renamed-while-creating.jpg', SOURCE_ID],
      },
      async () => {
        created = await createPlacesFromPipeline([pipelinePlace()], SOURCE_ID, ALICE.id);
      }
    );

    expect(created).not.toBeNull();
    expect(created!.createdCount).toBe(1);
    const placeId = created![0].id;

    const stored = asMeta(await readCell('SELECT meta FROM sources WHERE id = ?', [SOURCE_ID]));
    expect(stored.inbox?.dismissedAt).toBe(DISMISSED_AT);
    expect(stored.uploadInfo).toEqual({
      sessionId: 'session_outcome',
      originalName: 'renamed-while-creating.jpg',
      storedPath: 'https://store.public.blob.vercel-storage.com/src_outcome.jpg',
    });
    expect(stored.massUpload?.extraction).toEqual(EXTRACTION);
    expect(stored.massUpload?.extractedAt).toBe(EXTRACTED_AT);
    expect(stored.massUpload?.outcome).toEqual({
      created: [placeId],
      linked: [],
    });
  });

  it('keeps an undo that clears the dismiss while outcome is written', async () => {
    await seed({
      ...baseMeta,
      inbox: { dismissedAt: DISMISSED_AT },
    });

    let created: Awaited<ReturnType<typeof createPlacesFromPipeline>> | null = null;
    await changeMetaBeforeNextSourcesUpdate(
      {
        sql: `UPDATE sources SET meta = json_set(
                json_remove(meta, '$.inbox'),
                '$.uploadInfo.originalName', ?
              ) WHERE id = ?`,
        args: ['restored-name.jpg', SOURCE_ID],
      },
      async () => {
        created = await createPlacesFromPipeline([pipelinePlace()], SOURCE_ID, ALICE.id);
      }
    );

    expect(created).not.toBeNull();
    expect(created!.createdCount).toBe(1);
    const placeId = created![0].id;

    const stored = asMeta(await readCell('SELECT meta FROM sources WHERE id = ?', [SOURCE_ID]));
    expect(stored.inbox).toBeUndefined();
    expect(String(await readCell('SELECT meta FROM sources WHERE id = ?', [SOURCE_ID]))).not.toContain(
      'dismissedAt'
    );
    expect(stored.uploadInfo?.originalName).toBe('restored-name.jpg');
    expect(stored.uploadInfo?.sessionId).toBe('session_outcome');
    expect(stored.massUpload?.extraction).toEqual(EXTRACTION);
    expect(stored.massUpload?.extractedAt).toBe(EXTRACTED_AT);
    expect(stored.massUpload?.outcome).toEqual({
      created: [placeId],
      linked: [],
    });
  });
});
