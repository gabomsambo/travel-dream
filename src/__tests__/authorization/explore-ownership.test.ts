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
import { shufflePool, weightedShuffle } from '@/lib/explore/shuffle';

const BOB_PHOTO = 'https://store.public.blob.vercel-storage.com/bob-photo.jpg';
const ALICE_PHOTO = 'https://store.public.blob.vercel-storage.com/alice-photo.jpg';
const ALICE_THUMB = 'https://store.public.blob.vercel-storage.com/alice-photo-thumb.jpg';
const ALICE_PHOTO_NO_THUMB = 'https://store.public.blob.vercel-storage.com/alice-photo-2.jpg';

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
  // A photo with a thumbnail of its own, plus one without: Explore renders the
  // small sizes from the thumbnail and the big ones from the full image.
  await exec(`UPDATE attachments SET thumbnail_uri = ? WHERE id = ?`, [ALICE_THUMB, 'att_alice']);
  await exec(
    `INSERT INTO attachments (id, place_id, type, uri, filename, is_primary, created_at, source)
     VALUES (?,?,?,?,?,?,?,?)`,
    ['att_alice_2', FIXTURE.alicePlace, 'photo', ALICE_PHOTO_NO_THUMB, 'y.jpg', 0, now, 'upload']
  );
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
    expect(places.flatMap((p) => p.photos.map((ph) => ph.uri))).not.toContain(BOB_PHOTO);
  });

  it("attaches the caller's own photos at both sizes (positive control)", async () => {
    const [alice] = (await getExplorePlaces(ALICE.id)).filter((p) => p.id === FIXTURE.alicePlace);
    expect(alice.photos).toEqual([
      { uri: ALICE_PHOTO, thumb: ALICE_THUMB },
      { uri: ALICE_PHOTO_NO_THUMB, thumb: ALICE_PHOTO_NO_THUMB },
    ]);
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

describe('shuffle deck data', () => {
  it('only ever contains the caller own places when built from scoped queries', async () => {
    const now = new Date('2026-10-02T12:00:00Z');
    const alicePlaces = await getExplorePlaces(ALICE.id);
    const { pool } = shufflePool(alicePlaces, {}, now);
    const deck = weightedShuffle(pool, now).map((p) => p.id);
    expect(deck).not.toContain(FIXTURE.bobPlace);
    expect(deck.every((id) => alicePlaces.some((p) => p.id === id))).toBe(true);
  });
});
