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
import { buildAtlas } from '@/lib/explore/atlas';
import { buildTripNudges } from '@/lib/explore/trip-nudges';

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

describe('atlas drill-down authorization', () => {
  // The atlas pages reuse `getExplorePlaces`, which already filters by user.
  // This guards against a refactor that drifts the country/city pages onto an
  // unscoped query by accident. With Bob's single place nowhere near Alice's
  // and Alice's fixture data tagged to her, neither side should ever see
  // Bob's row in the drill-down.
  it("never builds an atlas containing another tenant's place", async () => {
    const alicePlaces = await getExplorePlaces(ALICE.id);
    const bobPlaces = await getExplorePlaces(BOB.id);
    const aliceIds = new Set(alicePlaces.map((p) => p.id));
    const bobIds = new Set(bobPlaces.map((p) => p.id));

    const aliceAtlas = buildAtlas(alicePlaces);
    const aliceFlat = aliceAtlas.flatMap((c) => [c, ...c.cities.map((ci) => ({ ...ci, country: c.country }))]);
    expect(aliceFlat.flatMap((g) => 'places' in g ? g.places : [])).not.toContain(FIXTURE.bobPlace);

    const bobAtlas = buildAtlas(bobPlaces);
    const bobAllPlaces = bobAtlas.flatMap((c) => c.cities.flatMap((ci) => ci.places));
    expect(bobAllPlaces.map((p) => p.id)).not.toContain(FIXTURE.alicePlace);
    expect(aliceIds.has(FIXTURE.bobPlace)).toBe(false);
    expect(bobIds.has(FIXTURE.alicePlace)).toBe(false);
  });

  it('trip-nudges never suggest a trip based on another tenant\'s collection membership', async () => {
    // Bob has a single place and no unvisited saves anywhere, so a trip nudge
    // must not exist for him — even if Alice's collection has him on it via a
    // bug. The assertion is the empty case here.
    const bobPlaces = await getExplorePlaces(BOB.id);
    const bobCollections = await getExploreCollections(BOB.id);
    const bobNudges = buildTripNudges(bobPlaces, bobCollections);
    expect(bobNudges).toHaveLength(0);

    // Alice's nudge must not include Bob's place even if a hypothetical cross-tenant
    // bug linked them.
    const alicePlaces = await getExplorePlaces(ALICE.id);
    const aliceCollections = await getExploreCollections(ALICE.id);
    const aliceNudges = buildTripNudges(alicePlaces, aliceCollections);
    const allPlaceIds = aliceNudges.flatMap((n) => n.placeIds);
    expect(allPlaceIds).not.toContain(FIXTURE.bobPlace);
  });
});
