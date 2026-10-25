/**
 * @jest-environment node
 *
 * Upload-outcome regressions against a real local SQLite file. The fixture
 * import must stay first: it pins TURSO_DATABASE_URL to a throwaway `file:`
 * database before any production database module can load.
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

jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: (error: unknown) => error instanceof Error && error.message === 'Unauthorized',
}));
jest.mock('@vercel/blob', () => ({ del: jest.fn().mockResolvedValue(undefined) }));

import { createHash } from 'crypto';
import { del } from '@vercel/blob';
import { requireAuthForApi } from '@/lib/auth-helpers';
import {
  createPlacesFromPipeline,
  requeueStaleUploadedSources,
} from '@/lib/db-mutations';
import type { PipelinePlace } from '@/types/extraction-pipeline';

type ExecResult = { rows: Record<string, unknown>[] };
type Exec = (query: string | { sql: string; args?: unknown[] }) => Promise<ExecResult>;

function client(): { execute: Exec } {
  return (require('@/db') as { client: { execute: Exec } }).client;
}

async function execute(sql: string, args: unknown[] = []): Promise<ExecResult> {
  return client().execute({ sql, args });
}

async function jsonCell(sql: string, args: unknown[] = []): Promise<Record<string, unknown>> {
  const value = await readCell(sql, args);
  return JSON.parse(String(value)) as Record<string, unknown>;
}

function pipelinePlace(overrides: Partial<PipelinePlace> = {}): PipelinePlace {
  return {
    name: 'New Place',
    kind: 'landmark',
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
    googlePlaceId: null,
    ...overrides,
  } as PipelinePlace;
}

beforeAll(() => {
  assertLocalDatabase();
  useUniqueUuids();
});

beforeEach(async () => {
  await resetTenantFixture();
  (requireAuthForApi as jest.Mock).mockResolvedValue(ALICE);
  jest.mocked(del).mockClear();
});

describe('source place outcomes', () => {
  it('records creations and both link reasons while preserving cached work', async () => {
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO places
         (id,user_id,name,kind,status,city,country,google_place_id,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?), (?,?,?,?,?,?,?,?,?,?)`,
      [
        'plc_google', ALICE.id, 'Old Google Name', 'cafe', 'library', 'Porto', 'Portugal',
        'google-1', now, now,
        'plc_exact', ALICE.id, 'Exact Cafe', 'cafe', 'library', 'Lisbon', 'Portugal',
        null, now, now,
      ]
    );
    await execute('UPDATE sources SET meta = ? WHERE id = ?', [
      JSON.stringify({
        uploadInfo: { sessionId: FIXTURE.aliceSession, originalName: 'batch.jpg' },
        massUpload: { extraction: { places: ['cached'] }, extractedAt: now },
      }),
      FIXTURE.aliceSource,
    ]);

    const result = await createPlacesFromPipeline([
      pipelinePlace({ name: 'Renamed', googlePlaceId: 'google-1', city: 'Porto' }),
      pipelinePlace({ name: 'exact cafe', googlePlaceId: null }),
      pipelinePlace({ name: 'Brand New', googlePlaceId: 'google-new' }),
      pipelinePlace({ name: 'Brand New', googlePlaceId: 'google-new' }),
    ], FIXTURE.aliceSource, ALICE.id);

    expect(result).toHaveLength(4);
    expect(result.createdCount).toBe(1);

    const sourceMeta = await jsonCell('SELECT meta FROM sources WHERE id = ?', [FIXTURE.aliceSource]);
    const massUpload = sourceMeta.massUpload as {
      extraction: unknown;
      outcome: {
        created: string[];
        linked: Array<{ placeId: string; reason: string }>;
      };
    };
    expect(massUpload.extraction).toEqual({ places: ['cached'] });
    expect(massUpload.outcome.created).toHaveLength(1);
    expect(massUpload.outcome.linked).toEqual(expect.arrayContaining([
      { placeId: 'plc_google', reason: 'google_place_id' },
      { placeId: 'plc_exact', reason: 'exact_name_city_country' },
    ]));
    expect(massUpload.outcome.linked).toHaveLength(2);
  });

  it('keeps places this source already created when the screenshot is processed again', async () => {
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO places
         (id,user_id,name,kind,status,city,country,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      ['plc_exact', ALICE.id, 'Exact Cafe', 'cafe', 'library', 'Lisbon', 'Portugal', now, now]
    );
    const extracted = [
      pipelinePlace({ name: 'Brand New', googlePlaceId: 'google-new' }),
      pipelinePlace({ name: 'exact cafe', googlePlaceId: null }),
    ];

    const first = await createPlacesFromPipeline(extracted, FIXTURE.aliceSource, ALICE.id);
    const createdId = first.find((place) => place.name === 'Brand New')?.id;
    expect(createdId).toEqual(expect.any(String));

    const second = await createPlacesFromPipeline(extracted, FIXTURE.aliceSource, ALICE.id);
    expect(second.createdCount).toBe(1);
    expect(second.filter((place) => place.name === 'Brand New').map((place) => place.id)).toEqual([createdId]);

    const sourceMeta = await jsonCell('SELECT meta FROM sources WHERE id = ?', [FIXTURE.aliceSource]);
    const outcome = (sourceMeta.massUpload as {
      outcome: { created: string[]; linked: Array<{ placeId: string; reason: string }> };
    }).outcome;
    expect(outcome.created).toEqual([createdId]);
    expect(outcome.linked).toEqual([
      { placeId: 'plc_exact', reason: 'exact_name_city_country' },
    ]);
    expect((await execute(
      'SELECT id FROM places WHERE user_id = ? AND lower(name) = lower(?)',
      [ALICE.id, 'Brand New']
    )).rows).toHaveLength(1);
  });

  it('prefers a google-id link when the same place is also matched by name', async () => {
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO places
         (id,user_id,name,kind,status,city,country,google_place_id,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ['plc_google', ALICE.id, 'Cafe', 'cafe', 'library', 'Lisbon', 'Portugal', 'g1', now, now]
    );

    const googleThenName = [
      pipelinePlace({ googlePlaceId: 'g1', name: 'Cafe', city: 'Lisbon', country: 'Portugal' }),
      pipelinePlace({ googlePlaceId: null, name: 'Cafe', city: 'Lisbon', country: 'Portugal' }),
    ];
    const nameThenGoogle = [...googleThenName].reverse();

    for (const extracted of [googleThenName, nameThenGoogle]) {
      await createPlacesFromPipeline(extracted, FIXTURE.aliceSource, ALICE.id);
      const sourceMeta = await jsonCell('SELECT meta FROM sources WHERE id = ?', [FIXTURE.aliceSource]);
      const outcome = (sourceMeta.massUpload as {
        outcome: { created: string[]; linked: Array<{ placeId: string; reason: string }> };
      }).outcome;
      expect(outcome.created).toEqual([]);
      expect(outcome.linked).toEqual([
        { placeId: 'plc_google', reason: 'google_place_id' },
      ]);
    }
  });

  it('keeps a repeated name match as a name link when the place has no google id', async () => {
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO places
         (id,user_id,name,kind,status,city,country,google_place_id,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ['plc_cafe', ALICE.id, 'Cafe', 'cafe', 'library', 'Lisbon', 'Portugal', null, now, now]
    );

    await createPlacesFromPipeline([
      pipelinePlace({ name: 'Cafe', city: 'Lisbon', country: 'Portugal', googlePlaceId: 'g-new' }),
      pipelinePlace({ name: 'Cafe', city: 'Lisbon', country: 'Portugal', googlePlaceId: 'g-new' }),
    ], FIXTURE.aliceSource, ALICE.id);

    const sourceMeta = await jsonCell('SELECT meta FROM sources WHERE id = ?', [FIXTURE.aliceSource]);
    const outcome = (sourceMeta.massUpload as {
      outcome: { created: string[]; linked: Array<{ placeId: string; reason: string }> };
    }).outcome;
    expect(outcome.created).toEqual([]);
    expect(outcome.linked).toEqual([
      { placeId: 'plc_cafe', reason: 'exact_name_city_country' },
    ]);
  });

  it('reports only recorded creations and tolerates an old source with no outcome', async () => {
    const { GET } = require('@/app/api/mass-upload/status/route') as
      typeof import('@/app/api/mass-upload/status/route');
    await setSessionUploadedFiles(FIXTURE.aliceSession, [FIXTURE.aliceSource]);

    let response = await GET(apiRequest(
      `http://local.test/api/mass-upload/status?sessionId=${FIXTURE.aliceSession}`
    ) as never);
    expect(response.status).toBe(200);
    expect((await response.json()).placesCreated).toBe(0);

    await createPlacesFromPipeline([
      pipelinePlace({ name: 'Alice Cafe', city: null, country: null }),
      pipelinePlace({ name: 'A Truly New Place' }),
    ], FIXTURE.aliceSource, ALICE.id);

    response = await GET(apiRequest(
      `http://local.test/api/mass-upload/status?sessionId=${FIXTURE.aliceSession}`
    ) as never);
    const body = await response.json();
    expect(body.placesCreated).toBe(1);
  });
});

describe('duplicate upload outcomes', () => {
  it('keeps the skipped filename/source through a later uploadedFiles rebuild', async () => {
    const duplicateBytes = Uint8Array.from([1, 2, 3, 4]);
    const duplicateHash = createHash('sha1').update(duplicateBytes).digest('hex');
    const now = new Date().toISOString();
    await execute('UPDATE sources SET hash = ? WHERE id = ?', [
      JSON.stringify({ sha1: duplicateHash }),
      FIXTURE.aliceSource,
    ]);
    await execute(
      `INSERT INTO upload_sessions
         (id,user_id,started_at,file_count,completed_count,failed_count,status,meta)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        'session_current', ALICE.id, now, 2, 0, 0, 'active',
        JSON.stringify({ uploadedFiles: [], processingQueue: ['preserve-me'], errors: [] }),
      ]
    );

    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => duplicateBytes.buffer })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => Uint8Array.from([9, 8, 7]).buffer }) as unknown as typeof fetch;

    const { POST } = require('@/app/api/mass-upload/register/route') as
      typeof import('@/app/api/mass-upload/register/route');
    const duplicateResponse = await POST(apiRequest(
      'http://local.test/api/mass-upload/register',
      'POST',
      {
        sessionId: 'session_current',
        blobUrl: 'https://store.public.blob.vercel-storage.com/reupload.jpg',
        originalName: 'IMG_2912.jpg',
        fileSize: 4,
        mimeType: 'image/jpeg',
      }
    ) as never);
    expect((await duplicateResponse.json()).status).toBe('duplicate');

    const newResponse = await POST(apiRequest(
      'http://local.test/api/mass-upload/register',
      'POST',
      {
        sessionId: 'session_current',
        blobUrl: 'https://store.public.blob.vercel-storage.com/new-upload.jpg',
        originalName: 'new-upload.jpg',
        fileSize: 3,
        mimeType: 'image/jpeg',
      }
    ) as never);
    const newBody = await newResponse.json();
    expect(newBody.status).toBe('success');

    const meta = await jsonCell('SELECT meta FROM upload_sessions WHERE id = ?', ['session_current']);
    expect(meta.duplicates).toEqual([
      { originalName: 'IMG_2912.jpg', duplicateOf: FIXTURE.aliceSource },
    ]);
    expect(meta.uploadedFiles).toEqual([newBody.sourceId]);
    expect(meta.processingQueue).toEqual(['preserve-me']);
    expect(del).toHaveBeenCalledWith('https://store.public.blob.vercel-storage.com/reupload.jpg');
  });
});

describe('late register into started sessions', () => {
  it('keeps pre-Start registers as uploaded despite the pending DEFAULT', async () => {
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO upload_sessions
         (id,user_id,started_at,file_count,completed_count,failed_count,status,meta)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        'session_pre_start', ALICE.id, now, 1, 0, 0, 'active',
        JSON.stringify({ uploadedFiles: [], errors: [] }),
      ]
    );
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => Uint8Array.from([4, 5, 6]).buffer,
    }) as unknown as typeof fetch;

    const { POST } = require('@/app/api/mass-upload/register/route') as
      typeof import('@/app/api/mass-upload/register/route');
    const res = await POST(apiRequest(
      'http://local.test/api/mass-upload/register',
      'POST',
      {
        sessionId: 'session_pre_start',
        blobUrl: 'https://store.public.blob.vercel-storage.com/pre-start.jpg',
        originalName: 'pre-start.jpg',
        fileSize: 3,
        mimeType: 'image/jpeg',
      }
    ) as never);
    const body = await res.json() as { status: string; sourceId: string };
    expect(body.status).toBe('success');
    expect(await readCell('SELECT processing_status FROM sources WHERE id = ?', [body.sourceId]))
      .toBe('uploaded');
  });

  it('queues a late register when Start stored processingStarted as JSON 1', async () => {
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO upload_sessions
         (id,user_id,started_at,file_count,completed_count,failed_count,status,meta)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        'session_started_num', ALICE.id, now, 1, 0, 0, 'active',
        JSON.stringify({ uploadedFiles: [], errors: [], processingStarted: 1 }),
      ]
    );
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => Uint8Array.from([7, 8, 9]).buffer,
    }) as unknown as typeof fetch;

    const { POST } = require('@/app/api/mass-upload/register/route') as
      typeof import('@/app/api/mass-upload/register/route');
    const res = await POST(apiRequest(
      'http://local.test/api/mass-upload/register',
      'POST',
      {
        sessionId: 'session_started_num',
        blobUrl: 'https://store.public.blob.vercel-storage.com/late-num.jpg',
        originalName: 'late-num.jpg',
        fileSize: 3,
        mimeType: 'image/jpeg',
      }
    ) as never);
    const body = await res.json() as { status: string; sourceId: string };
    expect(body.status).toBe('success');
    expect(await readCell('SELECT processing_status FROM sources WHERE id = ?', [body.sourceId]))
      .toBe('queued');
  });

  it('Start writes a JSON boolean so a later register queues without siblings', async () => {
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO upload_sessions
         (id,user_id,started_at,file_count,completed_count,failed_count,status,meta)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        'session_start_bool', ALICE.id, now, 0, 0, 0, 'active',
        JSON.stringify({ uploadedFiles: [], errors: [] }),
      ]
    );

    const { POST: start } = require('@/app/api/mass-upload/start/route') as
      typeof import('@/app/api/mass-upload/start/route');
    const startRes = await start(apiRequest(
      'http://local.test/api/mass-upload/start',
      'POST',
      { sessionId: 'session_start_bool' }
    ) as never);
    expect(startRes.status).toBe(200);

    const meta = await jsonCell('SELECT meta FROM upload_sessions WHERE id = ?', ['session_start_bool']);
    expect(meta.processingStarted).toBe(true);

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => Uint8Array.from([1, 1, 1]).buffer,
    }) as unknown as typeof fetch;

    const { POST: register } = require('@/app/api/mass-upload/register/route') as
      typeof import('@/app/api/mass-upload/register/route');
    const res = await register(apiRequest(
      'http://local.test/api/mass-upload/register',
      'POST',
      {
        sessionId: 'session_start_bool',
        blobUrl: 'https://store.public.blob.vercel-storage.com/after-start.jpg',
        originalName: 'after-start.jpg',
        fileSize: 3,
        mimeType: 'image/jpeg',
      }
    ) as never);
    const body = await res.json() as { status: string; sourceId: string };
    expect(body.status).toBe('success');
    expect(await readCell('SELECT processing_status FROM sources WHERE id = ?', [body.sourceId]))
      .toBe('queued');
  });
});

describe('stale uploaded recovery', () => {
  it('queues only stale uploaded rows without consuming either retry counter', async () => {
    const stale = '2026-10-18T08:00:00.000Z';
    const recent = '2026-10-18T10:00:00.000Z';
    await execute(
      `UPDATE sources
       SET processing_status = 'uploaded', processing_attempts = 2,
           processing_interruptions = 3, updated_at = ?
       WHERE id = ?`,
      [stale, FIXTURE.aliceSource]
    );
    await execute(
      `INSERT INTO sources (id,user_id,type,uri,processing_status,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?), (?,?,?,?,?,?,?)`,
      [
        'src_recent', ALICE.id, 'screenshot', 'https://example.test/recent.jpg',
        'uploaded', recent, recent,
        'src_legacy_pending', ALICE.id, 'screenshot', 'https://example.test/legacy.jpg',
        'pending', stale, stale,
      ]
    );

    const recovered = await requeueStaleUploadedSources('2026-10-18T09:00:00.000Z');
    expect(recovered.ids).toEqual([FIXTURE.aliceSource]);
    expect(await readCell('SELECT processing_status FROM sources WHERE id = ?', [FIXTURE.aliceSource]))
      .toBe('queued');
    expect(await readCell('SELECT processing_attempts FROM sources WHERE id = ?', [FIXTURE.aliceSource]))
      .toBe(2);
    expect(await readCell('SELECT processing_interruptions FROM sources WHERE id = ?', [FIXTURE.aliceSource]))
      .toBe(3);
    expect(await readCell('SELECT processing_status FROM sources WHERE id = ?', ['src_recent']))
      .toBe('uploaded');
    expect(await readCell('SELECT processing_status FROM sources WHERE id = ?', ['src_legacy_pending']))
      .toBe('pending');
  });
});
