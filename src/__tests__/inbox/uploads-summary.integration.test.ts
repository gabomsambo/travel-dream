/**
 * @jest-environment node
 *
 * `GET /api/inbox/uploads` against a real local SQLite file, with places made
 * by the real `createPlacesFromPipeline`. The fixture import must stay first:
 * it pins TURSO_DATABASE_URL to a throwaway `file:` database.
 */
import {
  ALICE,
  BOB,
  FIXTURE,
  assertLocalDatabase,
  resetTenantFixture,
  useUniqueUuids,
} from '../helpers/tenant-fixture';

jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: (error: unknown) => error instanceof Error && error.message === 'Unauthorized',
}));

import { requireAuthForApi } from '@/lib/auth-helpers';
import { createPlacesFromPipeline } from '@/lib/db-mutations';
import type { PipelinePlace } from '@/types/extraction-pipeline';
import type { InboxUploadBatch, InboxUploadsResponse } from '@/types/inbox-uploads';

type Exec = (query: { sql: string; args?: unknown[] }) => Promise<unknown>;
const execute = (sql: string, args: unknown[] = []) =>
  (require('@/db') as { client: { execute: Exec } }).client.execute({ sql, args });

function place(name: string, overrides: Partial<PipelinePlace> = {}): PipelinePlace {
  return {
    name, kind: 'landmark', city: 'Lima', country: 'Peru', admin: null, description: null,
    tags: null, vibes: null, confidence: 0.9, price_level: null, best_time: null, activities: null,
    cuisine: null, amenities: null, practicalInfo: null, recommendedBy: null, coords: null,
    address: null, googlePlaceId: null, ...overrides,
  } as PipelinePlace;
}

async function session(id: string, userId: string, startedAt: string, duplicates?: unknown[]): Promise<void> {
  await execute(
    `INSERT INTO upload_sessions (id,user_id,started_at,file_count,completed_count,failed_count,status,meta)
     VALUES (?,?,?,0,0,0,'active',?)`,
    [id, userId, startedAt, JSON.stringify({ uploadedFiles: [], errors: [], ...(duplicates ? { duplicates } : {}) })]
  );
}

async function source(
  id: string,
  userId: string,
  sessionId: string,
  status: string,
  createdAt: string,
  extra: { error?: string; places?: PipelinePlace[] } = {}
): Promise<void> {
  await execute(
    `INSERT INTO sources (id,user_id,type,uri,processing_status,processing_error,meta,created_at,updated_at)
     VALUES (?,?,'screenshot',?,?,?,?,?,?)`,
    [id, userId, `https://store.public.blob.vercel-storage.com/${id}.jpg`, status, extra.error ?? null,
     JSON.stringify({ uploadInfo: { sessionId, originalName: `${id}.jpg` } }), createdAt, createdAt]
  );
  if (extra.places) await createPlacesFromPipeline(extra.places, id, userId);
}

async function placeIdByName(name: string): Promise<string> {
  const result = (await execute('SELECT id FROM places WHERE name = ?', [name])) as { rows: Array<{ id: string }> };
  return result.rows[0].id;
}

async function getUploads(): Promise<InboxUploadBatch[]> {
  const { GET } = require('@/app/api/inbox/uploads/route') as { GET: () => Promise<Response> };
  const res = await GET();
  expect(res.status).toBe(200);
  const body = (await res.json()) as InboxUploadsResponse;
  expect(body.status).toBe('success');
  return body.uploads;
}

const names = (row: { places: Array<{ name: string }> }) => row.places.map((p) => p.name).sort();

beforeAll(() => {
  assertLocalDatabase();
  useUniqueUuids();
});

beforeEach(async () => {
  await resetTenantFixture();
  // Start Alice from no uploads; Bob keeps the fixture's upload.
  await execute('DELETE FROM sources WHERE id = ?', [FIXTURE.aliceSource]);
  await execute('DELETE FROM upload_sessions WHERE id = ?', [FIXTURE.aliceSession]);
  (requireAuthForApi as jest.Mock).mockResolvedValue(ALICE);
});

/**
 * Alice: an older batch (A), a newer batch (B) with every outcome row, and a
 * legacy batch (C) whose sources predate the recorded outcome. Bob: a
 * completed batch of his own.
 */
async function seedWorld(): Promise<void> {
  const now = new Date().toISOString();
  await execute(
    `INSERT INTO places (id,user_id,name,kind,status,city,country,google_place_id,created_at,updated_at)
     VALUES ('plc_alice_pancakes',?, 'Pancake House','restaurant','library','London','United Kingdom','g-pancakes',?,?)`,
    [ALICE.id, now, now]
  );

  // Batch A, 10:00 — two new places, one since confirmed; one unreadable screenshot.
  await session('session_a', ALICE.id, '2026-10-18T10:00:00.000Z');
  await source('src_a1', ALICE.id, 'session_a', 'completed', '2026-10-18 10:01:00', {
    places: [place('Huacachina', { city: 'Ica' }), place('Plaza de Armas')],
  });
  await execute(`UPDATE places SET status = 'library' WHERE name = 'Plaza de Armas'`);
  await source('src_a2', ALICE.id, 'session_a', 'failed', '2026-10-18 10:02:00', {
    error: '503 Service Unavailable: model overloaded',
  });

  // Batch B, 15:00 — every outcome row, plus a re-upload of A's screenshot.
  await session('session_b', ALICE.id, '2026-10-18T15:00:00.000Z', [
    { originalName: 'IMG_2912.jpg', duplicateOf: 'src_a1' },
  ]);
  await source('src_b1', ALICE.id, 'session_b', 'completed', '2026-10-18T15:01:00.000Z', {
    places: [
      place('Pancake House', { city: 'London', country: 'United Kingdom', googlePlaceId: 'g-pancakes' }),
      place('Medanos de Coro', { city: 'Coro', country: 'Venezuela' }),
      place('Tea Terrace', { city: 'Istanbul', country: 'Turkey' }),
    ],
  });
  await execute(`UPDATE places SET status = 'archived' WHERE name = 'Tea Terrace'`);
  // A second screenshot of the same new place: still one new place, two screenshots.
  await source('src_b2', ALICE.id, 'session_b', 'completed', '2026-10-18T15:02:00.000Z', {
    places: [place('Medanos de Coro', { city: 'Coro', country: 'Venezuela' })],
  });
  await source('src_b3', ALICE.id, 'session_b', 'completed', '2026-10-18T15:03:00.000Z', { places: [] });
  await source('src_b4', ALICE.id, 'session_b', 'stalled', '2026-10-18T15:04:00.000Z', { error: 'Lease expired: timed out' });
  await source('src_b5', ALICE.id, 'session_b', 'queued', '2026-10-18T15:05:00.000Z');
  await source('src_b6', ALICE.id, 'session_b', 'extracting', '2026-10-18T15:06:00.000Z');
  await source('src_b7', ALICE.id, 'session_b', 'uploaded', '2026-10-18T15:07:00.000Z');
  await source('src_b8', ALICE.id, 'session_b', 'cancelled', '2026-10-18T15:08:00.000Z');

  // Batch C, 08:00 — legacy: processed before outcomes were recorded.
  await session('session_c', ALICE.id, '2026-10-18T08:00:00.000Z');
  await source('src_c1', ALICE.id, 'session_c', 'completed', '2026-10-18 08:01:00', {
    places: [place('Old Town Square', { city: 'Prague', country: 'Czechia' }), place('Pancake House', {
      city: 'London', country: 'United Kingdom', googlePlaceId: 'g-pancakes',
    })],
  });
  await source('src_c2', ALICE.id, 'session_c', 'completed', '2026-10-18 08:02:00', { places: [] });
  await execute(`UPDATE sources SET meta = json_remove(meta, '$.massUpload') WHERE id IN ('src_c1','src_c2')`);

  // Not batches: an old-uploader session with nothing in it, and a legacy
  // `pending` source from the old uploader.
  await session('session_old_empty', ALICE.id, '2026-10-18T16:00:00.000Z');
  await source('src_pending', ALICE.id, 'session_old_pending', 'pending', '2026-10-18T16:01:00.000Z');

  // Bob: his own completed, newest batch.
  await session('session_bob_batch', BOB.id, '2026-10-18T18:00:00.000Z', [
    { originalName: 'bob-again.jpg', duplicateOf: FIXTURE.bobSource },
  ]);
  await source('src_bob_batch', BOB.id, 'session_bob_batch', 'completed', '2026-10-18T18:01:00.000Z', {
    places: [place('Bob Secret Bar')],
  });
}

describe('GET /api/inbox/uploads', () => {
  it('answers 401 without a signed-in user', async () => {
    (requireAuthForApi as jest.Mock).mockRejectedValue(new Error('Unauthorized'));
    const { GET } = require('@/app/api/inbox/uploads/route') as { GET: () => Promise<Response> };
    expect((await GET()).status).toBe(401);
  });

  it('returns an empty list for a user with no uploads', async () => {
    expect(await getUploads()).toEqual([]);
  });

  it('groups batches newest first and leaves out sessions with no mass upload in them', async () => {
    await seedWorld();
    const uploads = await getUploads();
    expect(uploads.map((u) => u.sessionId)).toEqual(['session_b', 'session_a', 'session_c']);
    expect(uploads.map((u) => u.uploadedAt)).toEqual([
      '2026-10-18T15:00:00.000Z', '2026-10-18T10:00:00.000Z', '2026-10-18T08:00:00.000Z',
    ]);
    expect(uploads.map((u) => u.screenshotCount)).toEqual([9, 2, 2]);
  });

  it('puts every screenshot and place of a batch in exactly one outcome row', async () => {
    await seedWorld();
    const b = (await getUploads())[0];
    const coro = await placeIdByName('Medanos de Coro');

    expect(names(b.rows.toReview)).toEqual(['Medanos de Coro']);
    expect(b.rows.toReview.places[0].sourceIds).toEqual(['src_b1', 'src_b2']);
    expect(b.rows.toReview.placeIds).toEqual([coro]);
    expect(b.rows.toReview.checkCount).toBeNull();
    expect(b.rows.added.places).toEqual([]);
    expect(names(b.rows.notAPlace)).toEqual(['Tea Terrace']);
    expect(b.rows.alreadyInLibrary.placeIds).toEqual(['plc_alice_pancakes']);
    expect(b.rows.alreadyInLibrary.sourceIds).toEqual(['src_b1']);
    expect(b.rows.uploadedBefore.items).toEqual([{
      originalName: 'IMG_2912.jpg',
      duplicateOfSourceId: 'src_a1',
      duplicateOfSessionId: 'session_a',
      duplicateOfUploadedAt: '2026-10-18T10:00:00.000Z',
    }]);
    expect(b.rows.noPlaceFound.sourceIds).toEqual(['src_b3']);
    expect(b.rows.couldNotRead.items).toEqual([
      { sourceId: 'src_b4', status: 'stalled', error: 'Processing timed out after multiple attempts' },
    ]);
    expect(b.rows.stillReading.sourceIds).toEqual(['src_b5', 'src_b6', 'src_b7']);
    expect(b.rows.cancelled.sourceIds).toEqual(['src_b8']);
    expect(b.placesRead).toBe(3);
    expect(b.newPlaces).toBe(2);
    expect(b.outcomeDerived).toBe(false);
    expect(b.screenshots.map((s) => [s.sourceId, s.outcome])).toEqual([
      ['src_b1', 'places'], ['src_b2', 'places'], ['src_b3', 'noPlaceFound'], ['src_b4', 'couldNotRead'],
      ['src_b5', 'stillReading'], ['src_b6', 'stillReading'], ['src_b7', 'stillReading'], ['src_b8', 'cancelled'],
    ]);

    const a = (await getUploads())[1];
    expect(names(a.rows.toReview)).toEqual(['Huacachina']);
    expect(names(a.rows.added)).toEqual(['Plaza de Armas']);
    expect(a.rows.couldNotRead.items).toEqual([
      { sourceId: 'src_a2', status: 'failed', error: 'AI service was unavailable after multiple attempts' },
    ]);
  });

  it('derives created vs linked for sources processed before outcomes were recorded', async () => {
    await seedWorld();
    const c = (await getUploads())[2];
    expect(c.outcomeDerived).toBe(true);
    expect(names(c.rows.toReview)).toEqual(['Old Town Square']);
    expect(c.rows.alreadyInLibrary.placeIds).toEqual(['plc_alice_pancakes']);
    expect(c.rows.noPlaceFound.sourceIds).toEqual(['src_c2']);
    expect(c.screenshots.map((s) => s.outcomeDerived)).toEqual([true, true]);
  });

  it('never errors on malformed outcome or skip records', async () => {
    await session('session_bad', ALICE.id, '2026-10-18T12:00:00.000Z', [null, { duplicateOf: 'src_x' }, 'junk']);
    await source('src_bad', ALICE.id, 'session_bad', 'completed', '2026-10-18T12:01:00.000Z');
    await execute(`UPDATE sources SET meta = json_set(meta, '$.massUpload', json('{"outcome":{"created":"nope"}}')) WHERE id = 'src_bad'`);
    const [bad] = await getUploads();
    expect(bad.rows.noPlaceFound.sourceIds).toEqual(['src_bad']);
    expect(bad.rows.uploadedBefore.items).toEqual([]);
    expect(bad.outcomeDerived).toBe(true);
  });

  it("never shows another user's batches, places or sources", async () => {
    await seedWorld();
    const text = JSON.stringify(await getUploads());
    expect(text).not.toMatch(/bob/i);

    (requireAuthForApi as jest.Mock).mockResolvedValue(BOB);
    const bobs = await getUploads();
    expect(bobs.map((u) => u.sessionId).sort()).toEqual([FIXTURE.bobSession, 'session_bob_batch']);
    expect(JSON.stringify(bobs)).not.toMatch(/alice|src_[abc]\d|Huacachina|Pancake/i);
  });

  it("does not describe another user's place or source named in the caller's own JSON", async () => {
    await seedWorld();
    const bobPlace = await placeIdByName('Bob Secret Bar');
    await session('session_planted', ALICE.id, '2026-10-18T17:00:00.000Z', [
      { originalName: 'planted.jpg', duplicateOf: 'src_bob_batch' },
    ]);
    await source('src_planted', ALICE.id, 'session_planted', 'completed', '2026-10-18T17:01:00.000Z');
    await execute(`UPDATE sources SET meta = json_set(meta, '$.massUpload', json(?)) WHERE id = 'src_planted'`, [
      JSON.stringify({ outcome: { created: [bobPlace], linked: [{ placeId: FIXTURE.bobPlace, reason: 'google_place_id' }] } }),
    ]);
    const [planted] = await getUploads();
    expect(planted.sessionId).toBe('session_planted');
    expect(planted.placesRead).toBe(0);
    expect(planted.screenshots[0].createdPlaceIds).toEqual([]);
    expect(planted.screenshots[0].linkedPlaceIds).toEqual([]);
    expect(planted.rows.uploadedBefore.items).toEqual([{
      originalName: 'planted.jpg', duplicateOfSourceId: null, duplicateOfSessionId: null, duplicateOfUploadedAt: null,
    }]);
    expect(JSON.stringify(planted)).not.toMatch(/bob/i);
  });
});
