/**
 * @jest-environment node
 *
 * Status of a foreign id on the three handlers the sweep used to accept as a
 * known deviation: a reservation whose place is not the one in the URL, an
 * add-to-collection whose every id misses, and a bulk merge whose every
 * cluster misses. Each one must answer 404 and leave the other tenant's rows
 * alone. A genuine mix keeps its previous status and still writes only the
 * caller's own rows.
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

jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: jest.fn((e: unknown) => e instanceof Error && e.message === 'Unauthorized'),
}));

import { requireAuthForApi } from '@/lib/auth-helpers';
import { PATCH, DELETE } from '@/app/api/places/[id]/reservations/[reservationId]/route';
import { POST as addPlaces } from '@/app/api/collections/[id]/places/route';
import { POST as bulkMerge } from '@/app/api/places/bulk-merge/route';

const ALICE_OTHER = 'plc_alice_other';
const BOB_OTHER = 'plc_bob_other';
const ALICE_RESERVATION = 'rsv_alice_bound';

type Client = { execute: (q: { sql: string; args: unknown[] }) => Promise<unknown> };

async function exec(sql: string, args: unknown[] = []): Promise<void> {
  const { client } = require('@/db') as { client: Client };
  await client.execute({ sql, args });
}

async function seed(): Promise<void> {
  await exec('DELETE FROM merge_logs');
  await exec('DELETE FROM reservations');
  await resetTenantFixture();
  const now = new Date().toISOString();
  await exec(
    `INSERT INTO places (id,user_id,name,kind,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`,
    [ALICE_OTHER, ALICE.id, 'Alice Other', 'cafe', 'library', now, now]
  );
  await exec(
    `INSERT INTO places (id,user_id,name,kind,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`,
    [BOB_OTHER, 'user_bob', 'Bob Other', 'cafe', 'library', 'bob other note', now, now]
  );
  await exec(
    `INSERT INTO reservations (id,place_id,reservation_date,notes,created_at,updated_at) VALUES (?,?,?,?,?,?)`,
    [ALICE_RESERVATION, FIXTURE.alicePlace, '2027-03-01', 'alice original note', now, now]
  );
}

describe('foreign ids answer 404 unless a batch is genuinely mixed', () => {
  beforeAll(async () => {
    assertLocalDatabase();
    useUniqueUuids();
    await resetTenantFixture();
  });

  beforeEach(async () => {
    (requireAuthForApi as jest.Mock).mockResolvedValue(ALICE);
    await seed();
  });

  it('refuses to update a reservation through a different place the caller owns', async () => {
    const res = await PATCH(
      apiRequest(
        `http://localhost/api/places/${ALICE_OTHER}/reservations/${ALICE_RESERVATION}`,
        'PATCH',
        { notes: 'written through the wrong place' }
      ) as never,
      { params: Promise.resolve({ id: ALICE_OTHER, reservationId: ALICE_RESERVATION }) }
    );

    expect(res.status).toBe(404);
    expect(await readCell('SELECT notes FROM reservations WHERE id = ?', [ALICE_RESERVATION])).toBe(
      'alice original note'
    );
  });

  it('refuses to delete a reservation through a different place the caller owns', async () => {
    const res = await DELETE(
      apiRequest(
        `http://localhost/api/places/${ALICE_OTHER}/reservations/${ALICE_RESERVATION}`,
        'DELETE'
      ) as never,
      { params: Promise.resolve({ id: ALICE_OTHER, reservationId: ALICE_RESERVATION }) }
    );

    expect(res.status).toBe(404);
    expect(await readCell('SELECT id FROM reservations WHERE id = ?', [ALICE_RESERVATION])).toBe(
      ALICE_RESERVATION
    );
  });

  it('still updates a reservation through its own place', async () => {
    const res = await PATCH(
      apiRequest(
        `http://localhost/api/places/${FIXTURE.alicePlace}/reservations/${ALICE_RESERVATION}`,
        'PATCH',
        { notes: 'updated in place' }
      ) as never,
      { params: Promise.resolve({ id: FIXTURE.alicePlace, reservationId: ALICE_RESERVATION }) }
    );

    expect(res.status).toBe(200);
    expect(await readCell('SELECT notes FROM reservations WHERE id = ?', [ALICE_RESERVATION])).toBe(
      'updated in place'
    );
  });

  it('returns 404 when every place added to a collection is foreign', async () => {
    const before = await readCell('SELECT COUNT(*) FROM places_to_collections');
    const res = await addPlaces(
      apiRequest(`http://localhost/api/collections/${FIXTURE.bobCollection}/places`, 'POST', {
        placeIds: [FIXTURE.bobPlace, BOB_OTHER],
      }) as never,
      { params: Promise.resolve({ id: FIXTURE.bobCollection }) }
    );

    expect(res.status).toBe(404);
    expect(await readCell('SELECT COUNT(*) FROM places_to_collections')).toBe(before);
    expect(
      await readCell(
        'SELECT note FROM places_to_collections WHERE place_id = ? AND collection_id = ?',
        [FIXTURE.bobPlace, FIXTURE.bobCollection]
      )
    ).toBe(FIXTURE.bobCollectionNote);
  });

  it('keeps 207 when a collection add mixes an owned place with a foreign one', async () => {
    const res = await addPlaces(
      apiRequest(`http://localhost/api/collections/${FIXTURE.aliceCollection}/places`, 'POST', {
        placeIds: [ALICE_OTHER, FIXTURE.bobPlace],
      }) as never,
      { params: Promise.resolve({ id: FIXTURE.aliceCollection }) }
    );
    const body = (await res.json()) as {
      status: string;
      results: { successful: string[]; failed: { placeId: string }[] };
    };

    expect(res.status).toBe(207);
    expect(body.status).toBe('partial');
    expect(body.results.successful).toEqual([ALICE_OTHER]);
    expect(body.results.failed.map((f) => f.placeId)).toEqual([FIXTURE.bobPlace]);
    expect(
      await readCell(
        'SELECT COUNT(*) FROM places_to_collections WHERE place_id = ? AND collection_id = ?',
        [ALICE_OTHER, FIXTURE.aliceCollection]
      )
    ).toBe(1);
    expect(
      await readCell(
        'SELECT COUNT(*) FROM places_to_collections WHERE place_id = ? AND collection_id = ?',
        [FIXTURE.bobPlace, FIXTURE.aliceCollection]
      )
    ).toBe(0);
    expect(
      await readCell(
        'SELECT note FROM places_to_collections WHERE place_id = ? AND collection_id = ?',
        [FIXTURE.bobPlace, FIXTURE.bobCollection]
      )
    ).toBe(FIXTURE.bobCollectionNote);
  });

  it('returns 404 when every bulk-merge cluster names foreign places', async () => {
    const res = await bulkMerge(
      apiRequest('http://localhost/api/places/bulk-merge', 'POST', {
        clusters: [{ targetId: FIXTURE.bobPlace, sourceIds: [BOB_OTHER], confidence: 0.9 }],
      }) as never
    );

    expect(res.status).toBe(404);
    expect(await readCell('SELECT COUNT(*) FROM merge_logs')).toBe(0);
    expect(await readCell('SELECT status FROM places WHERE id = ?', [FIXTURE.bobPlace])).toBe('library');
    expect(await readCell('SELECT status FROM places WHERE id = ?', [BOB_OTHER])).toBe('library');
    expect(await readCell('SELECT notes FROM places WHERE id = ?', [FIXTURE.bobPlace])).toBe(
      'BOB PRIVATE NOTE: anniversary trip'
    );
  });

  it('keeps 200 when one bulk-merge cluster is the caller\'s and another is foreign', async () => {
    const res = await bulkMerge(
      apiRequest('http://localhost/api/places/bulk-merge', 'POST', {
        clusters: [
          { targetId: FIXTURE.alicePlace, sourceIds: [ALICE_OTHER], confidence: 0.9 },
          { targetId: FIXTURE.bobPlace, sourceIds: [BOB_OTHER], confidence: 0.8 },
        ],
      }) as never
    );
    const body = (await res.json()) as { status: string; success: number; failed: number };

    expect(res.status).toBe(200);
    expect(body.status).toBe('success');
    expect(body.success).toBe(1);
    expect(body.failed).toBe(1);
    expect(await readCell('SELECT status FROM places WHERE id = ?', [ALICE_OTHER])).toBe('archived');
    expect(await readCell('SELECT status FROM places WHERE id = ?', [FIXTURE.bobPlace])).toBe('library');
    expect(await readCell('SELECT status FROM places WHERE id = ?', [BOB_OTHER])).toBe('library');
    expect(await readCell('SELECT notes FROM places WHERE id = ?', [FIXTURE.bobPlace])).toBe(
      'BOB PRIVATE NOTE: anniversary trip'
    );
    expect(await readCell('SELECT COUNT(*) FROM merge_logs')).toBe(1);
  });
});
