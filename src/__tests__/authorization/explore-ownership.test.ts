/**
 * @jest-environment node
 *
 * Cross-tenant test for Explore's loaders. Explore reads every browsable place,
 * every photo and every collection membership in one go, so a single unscoped
 * query there would hand one user the whole atlas of another — including the
 * private per-place collection notes on `places_to_collections`.
 *
 * Runs against a real database; the fixture must be imported first (see
 * tenant-fixture.ts for why).
 */
import { ALICE, BOB, FIXTURE, assertLocalDatabase, resetTenantFixture } from '../helpers/tenant-fixture';

import { getExploreCollections, getExplorePlaces } from '@/lib/explore/queries';

const BOB_PHOTO = 'https://store.public.blob.vercel-storage.com/bob-photo.jpg';
const ALICE_PHOTO = 'https://store.public.blob.vercel-storage.com/alice-photo.jpg';

async function exec(sql: string, args: unknown[]): Promise<void> {
  const { client } = require('@/db') as { client: { execute: (q: { sql: string; args: unknown[] }) => Promise<unknown> } };
  await client.execute({ sql, args });
}

beforeAll(async () => {
  assertLocalDatabase();
  await resetTenantFixture();
  const now = new Date().toISOString();
  for (const [id, placeId, uri] of [
    ['att_bob', FIXTURE.bobPlace, BOB_PHOTO],
    ['att_alice', FIXTURE.alicePlace, ALICE_PHOTO],
  ]) {
    await exec(
      `INSERT INTO attachments (id, place_id, type, uri, filename, is_primary, created_at, source) VALUES (?,?,?,?,?,?,?,?)`,
      [id, placeId, 'photo', uri, 'x.jpg', 1, now, 'upload']
    );
  }
  // Archived places stay out of Explore even for their owner.
  await exec(`INSERT INTO places (id,user_id,name,kind,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`, [
    'plc_alice_archived', ALICE.id, 'Alice Archived', 'cafe', 'archived', now, now,
  ]);
});

describe('getExplorePlaces', () => {
  it("never returns another tenant's places or photos", async () => {
    const places = await getExplorePlaces(ALICE.id);
    const ids = places.map((p) => p.id);
    expect(ids).toContain(FIXTURE.alicePlace);
    expect(ids).not.toContain(FIXTURE.bobPlace);
    expect(places.flatMap((p) => p.photos)).not.toContain(BOB_PHOTO);
  });

  it('attaches the caller\'s own photos (positive control)', async () => {
    const [alice] = (await getExplorePlaces(ALICE.id)).filter((p) => p.id === FIXTURE.alicePlace);
    expect(alice.photos).toEqual([ALICE_PHOTO]);
  });

  it('leaves archived places out', async () => {
    const ids = (await getExplorePlaces(ALICE.id)).map((p) => p.id);
    expect(ids).not.toContain('plc_alice_archived');
  });

  it("returns Bob's own data to Bob", async () => {
    const ids = (await getExplorePlaces(BOB.id)).map((p) => p.id);
    expect(ids).toEqual([FIXTURE.bobPlace]);
  });
});

describe('getExploreCollections', () => {
  it("only lists the caller's collections and memberships", async () => {
    const cols = await getExploreCollections(ALICE.id);
    expect(cols.map((c) => c.id)).toEqual([FIXTURE.aliceCollection]);
    expect(cols.flatMap((c) => c.placeIds)).toEqual([FIXTURE.alicePlace]);
  });
});
