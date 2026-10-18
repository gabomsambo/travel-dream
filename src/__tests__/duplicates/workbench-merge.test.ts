/**
 * @jest-environment node
 *
 * The workbench's rules against a real local SQLite file: who merges, what the
 * result column says against what the merge writes, which pairs are remembered,
 * and that undo puts everything back. The fixture import must stay first.
 */
import {
  ALICE,
  apiRequest,
  assertLocalDatabase,
  resetTenantFixture,
  useUniqueUuids,
} from '../helpers/tenant-fixture';

jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: (error: unknown) => error instanceof Error && error.message === 'Unauthorized',
}));
jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }));

import type { NextRequest } from 'next/server';
import { requireAuthForApi } from '@/lib/auth-helpers';
import { buildMergePlan, fieldConflicts, resolvePairs } from '@/lib/duplicate-workbench';
import { pickMergedPlaceFields } from '@/lib/place-merge';
import type { QueueCluster } from '@/lib/duplicate-certainty';
import type { DuplicateGroupEdge } from '@/lib/duplicate-detection';
import type { Place } from '@/types/database';

const mockAuth = requireAuthForApi as jest.MockedFunction<typeof requireAuthForApi>;
type Exec = { execute: (q: string | { sql: string; args?: unknown[] }) => Promise<{ rows: Record<string, unknown>[] }> };
const sql = () => (require('@/db') as { client: Exec }).client;
const now = '2026-10-18T12:00:00.000Z';

async function insertPlace(row: Partial<Place> & { id: string; name: string }): Promise<Place> {
  const { places } = require('@/db/schema') as typeof import('@/db/schema');
  const { db } = require('@/db') as { db: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { eq } = require('drizzle-orm') as typeof import('drizzle-orm');
  await db.insert(places).values({
    userId: ALICE.id, kind: 'attraction', status: 'inbox', createdAt: now, updatedAt: now,
    altNames: [], tags: [], vibes: [], confidence: 0.5, ratingSelf: 0, ...row,
  });
  const [saved] = await db.select().from(places).where(eq(places.id, row.id));
  return saved as Place;
}

async function readPlace(id: string): Promise<Place> {
  const { places } = require('@/db/schema') as typeof import('@/db/schema');
  const { db } = require('@/db') as { db: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { eq } = require('drizzle-orm') as typeof import('drizzle-orm');
  const [row] = await db.select().from(places).where(eq(places.id, id));
  return row as Place;
}

async function post(path: string, body: unknown, method = 'POST'): Promise<{ status: number; json: Record<string, unknown> }> {
  const route = require(`@/app/api/places/${path}/route`) as Record<string, (r: NextRequest) => Promise<Response>>;
  const response = await route[method](apiRequest(`http://localhost/api/places/${path}`, method, body) as unknown as NextRequest);
  return { status: response.status, json: await response.json() as Record<string, unknown> };
}

async function dismissedKeys(): Promise<string[]> {
  const { rows } = await sql().execute('SELECT place_id_1 AS a, place_id_2 AS b FROM dismissed_duplicates');
  return [...new Set(rows.map((row) => [String(row.a), String(row.b)].sort().join('|')))].sort();
}

function edge(a: string, b: string, included = true, distanceM: number | null = null): DuplicateGroupEdge {
  return {
    a, b, score: included ? 0.85 : 0.62, included, distanceM,
    factors: { name: 0.9, location: 0, kind: 1, city: 1, country: 1 },
    for: [], against: [], flags: [],
  };
}

function trio(places: Place[]): QueueCluster {
  const [a, b, c] = places.map((place) => place.id);
  return {
    cluster_id: [a, b, c].sort().join('+'),
    places,
    avgConfidence: 0.85,
    edges: [edge(a, b), edge(a, c), edge(b, c, false)],
  };
}

describe('duplicates workbench on real data', () => {
  beforeAll(() => useUniqueUuids());

  beforeEach(async () => {
    assertLocalDatabase();
    mockAuth.mockResolvedValue({ ...ALICE } as Awaited<ReturnType<typeof requireAuthForApi>>);
    for (const table of ['reservations', 'place_links', 'merge_logs', 'dismissed_duplicates']) {
      await sql().execute(`DELETE FROM ${table}`).catch((error: Error) => {
        if (!error.message.includes('no such table')) throw error;
      });
    }
    await resetTenantFixture();
  });

  it('ignores case, accents and pins within 100 m, and pre-picks the kept value for real conflicts', async () => {
    const kept = await insertPlace({ id: 'plc_k', name: 'Café Central', city: 'Vienna', description: 'Grand café', coords: { lat: 48.2104, lon: 16.3655 } });
    const near = await insertPlace({ id: 'plc_n', name: 'cafe central', city: 'VIENNA', description: 'Grand cafe', coords: { lat: 48.2108, lon: 16.3655 } });
    const far = await insertPlace({ id: 'plc_f', name: 'Cafe Central Wien', city: 'Vienna', description: 'Coffee house', coords: { lat: 48.2124, lon: 16.3655 } });

    expect(fieldConflicts(kept, [near])).toEqual([]);

    const conflicts = fieldConflicts(kept, [near, far]);
    expect(conflicts.map((conflict) => conflict.field)).toEqual(['name', 'description', 'coords']);
    for (const conflict of conflicts) {
      expect(conflict.defaultId).toBe('plc_k');
      expect(conflict.options).toHaveLength(2);
      expect(conflict.options[0].memberIds).toEqual(['plc_k', 'plc_n']);
    }
  });

  it('merges only the In members and remembers the Out member against them', async () => {
    const places = [
      await insertPlace({ id: 'plc_a', name: 'Gail\'s Bakery', status: 'library', city: 'London' }),
      await insertPlace({ id: 'plc_b', name: 'GAIL\'s Bakery Dulwich', city: 'London' }),
      await insertPlace({ id: 'plc_c', name: 'Gail\'s Bakery Wimbledon', city: 'London' }),
    ];
    const cluster = trio(places);
    const inIds = new Set(['plc_a', 'plc_b']);

    // Toggling writes nothing; the pairs are only written when the group is resolved.
    const plan = buildMergePlan({ places, keptId: 'plc_a', inIds })!;
    expect(plan.sourceIds).toEqual(['plc_b']);
    expect(await dismissedKeys()).toEqual([]);

    const merged = await post('bulk-merge', { clusters: [{ targetId: plan.targetId, sourceIds: plan.sourceIds, confidence: 0.85 }] });
    expect(merged.json.success).toBe(1);
    const pairs = resolvePairs(cluster, inIds, 'merge');
    expect((await post('dismiss-duplicate', { pairs })).status).toBe(200);

    expect((await readPlace('plc_b')).status).toBe('archived');
    expect((await readPlace('plc_c')).status).toBe('inbox');
    expect(await dismissedKeys()).toEqual(['plc_a|plc_c', 'plc_b|plc_c']);
  });

  it('Not duplicates with a member out pairs the In members and the Out member, nothing else', async () => {
    const places = [
      await insertPlace({ id: 'plc_a', name: 'Fjellheisen Cable Car' }),
      await insertPlace({ id: 'plc_b', name: 'Fjellheisen' }),
      await insertPlace({ id: 'plc_c', name: 'Fjellheisen cable car' }),
    ];
    const cluster = trio(places);

    expect(resolvePairs(cluster, new Set(['plc_a', 'plc_b', 'plc_c']), 'dismiss'))
      .toEqual([{ placeId1: 'plc_a', placeId2: 'plc_b' }, { placeId1: 'plc_a', placeId2: 'plc_c' }]);

    const pairs = resolvePairs(cluster, new Set(['plc_a', 'plc_b']), 'dismiss');
    expect((await post('dismiss-duplicate', { pairs })).status).toBe(200);
    expect(await dismissedKeys()).toEqual(['plc_a|plc_b', 'plc_a|plc_c', 'plc_b|plc_c']);
  });

  it('writes exactly the result column, picks included', async () => {
    const places = [
      await insertPlace({
        id: 'plc_pr8', name: 'PR8 Vereda da Ponta de São Lourenço', status: 'library', kind: 'hike', city: 'Caniçal',
        coords: { lat: 32.7436, lon: -16.7032 }, description: 'Circular trail with ocean views', best_time: 'Early morning',
        tags: ['hike', 'cliffs'], vibes: ['adventurous'], notes: 'Go early',
      }),
      await insertPlace({
        id: 'plc_ver', name: 'Vereda da Ponta de São Lourenço', status: 'library', kind: 'hike', city: 'Canical',
        coords: { lat: 32.7441, lon: -16.7012 }, description: 'Rated 8/10. Hot with no shade', best_time: 'Spring',
        tags: ['trail'], vibes: ['scenic'], notes: 'Bring water', address: 'Caniçal, Madeira',
      }),
    ];
    const plan = buildMergePlan({
      places, keptId: 'plc_pr8', inIds: new Set(['plc_pr8', 'plc_ver']),
      picks: { description: 'plc_ver', best_time: 'plc_pr8' },
    })!;
    expect(plan.conflicts.map((conflict) => conflict.field)).toEqual(['name', 'description', 'coords', 'best_time']);
    expect(plan.fieldOverrides).toEqual({ description: 'plc_ver' });

    const merged = await post('bulk-merge', {
      clusters: [{ targetId: plan.targetId, sourceIds: plan.sourceIds, confidence: 0.85, fieldOverrides: plan.fieldOverrides }],
    });
    expect(merged.json.success).toBe(1);

    const written = await readPlace('plc_pr8');
    expect(pickMergedPlaceFields(written)).toEqual(pickMergedPlaceFields(plan.result));
    expect(written.description).toBe('Rated 8/10. Hot with no shade');
    expect(written.address).toBe('Caniçal, Madeira');
  });

  it('undo restores the kept place, the absorbed place, and every moved row', async () => {
    const { attachments, collections, placesToCollections, sourcesToPlaces, reservations } =
      require('@/db/schema') as typeof import('@/db/schema');
    const { db } = require('@/db') as { db: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const kept = await insertPlace({ id: 'plc_k', name: 'Fjellheisen Cable Car', status: 'inbox', tags: ['viewpoint'], notes: 'Sunset' });
    const absorbed = await insertPlace({ id: 'plc_s', name: 'Fjellheisen', status: 'library', city: 'Tromsø', tags: ['cable car'], notes: 'Aurora' });

    await db.insert(collections).values({ id: 'col_trip', userId: ALICE.id, name: 'Trip', createdAt: now, updatedAt: now });
    await db.insert(placesToCollections).values([
      { placeId: 'plc_k', collectionId: 'col_trip', orderIndex: 0, isPinned: 0, note: 'KEPT NOTE' },
      { placeId: 'plc_s', collectionId: 'col_trip', orderIndex: 3, isPinned: 1, note: 'ABSORBED NOTE' },
    ]);
    await db.insert(attachments).values([
      { id: 'att_k', placeId: 'plc_k', type: 'photo', uri: 'https://example.test/k.jpg', filename: 'k.jpg', isPrimary: 1, source: 'upload' },
      { id: 'att_s', placeId: 'plc_s', type: 'photo', uri: 'https://example.test/s.jpg', filename: 's.jpg', isPrimary: 1, source: 'upload' },
    ]);
    await db.insert(reservations).values({ id: 'rsv_s', placeId: 'plc_s', reservationDate: '2026-12-01', status: 'confirmed' });
    await sql().execute({
      sql: `INSERT INTO sources (id,user_id,type,uri,processing_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`,
      args: ['src_shot', ALICE.id, 'screenshot', 'https://example.test/shot.jpg', 'completed', now, now],
    });
    await db.insert(sourcesToPlaces).values({ sourceId: 'src_shot', placeId: 'plc_s' });

    const merged = await post('bulk-merge', { clusters: [{ targetId: 'plc_k', sourceIds: ['plc_s'], confidence: 0.8 }] });
    const mergeLogId = (merged.json.results as Array<{ mergeLogId: string }>)[0].mergeLogId;
    expect((await readPlace('plc_k')).status).toBe('library');

    const undone = await post('undo-merge', { placeId: 'plc_k', mergeLogId });
    expect(undone.status).toBe(200);

    expect(pickMergedPlaceFields(await readPlace('plc_k'))).toEqual(pickMergedPlaceFields(kept));
    const back = await readPlace('plc_s');
    expect(pickMergedPlaceFields(back)).toEqual(pickMergedPlaceFields(absorbed));
    expect(back.archivedAt).toBeNull();

    const rows = (q: string) => sql().execute(q).then((result) => result.rows.map((row) => JSON.stringify(row)));
    expect(await rows('SELECT id, place_id, is_primary FROM attachments ORDER BY id')).toEqual([
      JSON.stringify({ id: 'att_k', place_id: 'plc_k', is_primary: 1 }),
      JSON.stringify({ id: 'att_s', place_id: 'plc_s', is_primary: 1 }),
    ]);
    expect(await rows("SELECT place_id, order_index, is_pinned, note FROM places_to_collections WHERE collection_id = 'col_trip' ORDER BY place_id")).toEqual([
      JSON.stringify({ place_id: 'plc_k', order_index: 0, is_pinned: 0, note: 'KEPT NOTE' }),
      JSON.stringify({ place_id: 'plc_s', order_index: 3, is_pinned: 1, note: 'ABSORBED NOTE' }),
    ]);
    expect(await rows("SELECT place_id FROM sources_to_places WHERE source_id = 'src_shot'")).toEqual([JSON.stringify({ place_id: 'plc_s' })]);
    expect(await rows("SELECT place_id FROM reservations WHERE id = 'rsv_s'")).toEqual([JSON.stringify({ place_id: 'plc_s' })]);
    expect(await rows('SELECT undone FROM merge_logs')).toEqual([JSON.stringify({ undone: 1 })]);

    expect((await post('undo-merge', { placeId: 'plc_k' })).status).toBe(404);
  });

  it('undoes merges into one place newest first', async () => {
    await insertPlace({ id: 'plc_k', name: 'Iguazu Falls' });
    await insertPlace({ id: 'plc_1', name: 'Iguazu Falls, Brasil' });
    await insertPlace({ id: 'plc_2', name: 'Cataratas do Iguaçu' });
    const first = await post('bulk-merge', { clusters: [{ targetId: 'plc_k', sourceIds: ['plc_1'], confidence: 0.9 }] });
    await post('bulk-merge', { clusters: [{ targetId: 'plc_k', sourceIds: ['plc_2'], confidence: 0.9 }] });
    const firstLog = (first.json.results as Array<{ mergeLogId: string }>)[0].mergeLogId;

    expect((await post('undo-merge', { placeId: 'plc_k', mergeLogId: firstLog })).status).toBe(409);
    expect((await post('undo-merge', { placeId: 'plc_k' })).status).toBe(200);
    expect((await readPlace('plc_2')).status).toBe('inbox');
    expect((await readPlace('plc_1')).status).toBe('archived');
    expect((await post('undo-merge', { placeId: 'plc_k', mergeLogId: firstLog })).status).toBe(200);
    expect((await readPlace('plc_1')).status).toBe('inbox');
    expect((await readPlace('plc_k')).altNames).toEqual([]);
  });
});
