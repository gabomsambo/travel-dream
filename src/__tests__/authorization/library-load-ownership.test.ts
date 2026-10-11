/**
 * @jest-environment node
 *
 * Cross-tenant test for the Library page's loader and its own store.
 * `loadLibrary` joins five queries (the library rows, Explore's
 * places-with-photos, collections, hearts and saved views), so a single
 * unscoped one would put another tenant's places, photos, collection names,
 * hearts or saved searches on the page — and in the client bundle's RSC payload.
 *
 * Runs the real loader against a real SQLite file; the fixture must be
 * imported first (see tenant-fixture.ts for why).
 */
import { ALICE, BOB, FIXTURE, assertLocalDatabase, resetTenantFixture } from '../helpers/tenant-fixture';

import { loadLibrary } from '@/lib/library/load';
import { createSavedView, deleteSavedView, getHeartIds, setHearts, updateSavedView } from '@/lib/library/store';

const BOB_PHOTO = 'https://store.public.blob.vercel-storage.com/bob-library-photo.jpg';
const ALICE_PHOTO = 'https://store.public.blob.vercel-storage.com/alice-library-photo.jpg';

async function exec(sql: string, args: unknown[]): Promise<void> {
  const { client } = require('@/db') as { client: { execute: (q: { sql: string; args: unknown[] }) => Promise<unknown> } };
  await client.execute({ sql, args });
}

beforeAll(async () => {
  assertLocalDatabase();
  await resetTenantFixture();
  const now = new Date().toISOString();
  for (const [id, placeId, uri] of [
    ['att_bob_lib', FIXTURE.bobPlace, BOB_PHOTO],
    ['att_alice_lib', FIXTURE.alicePlace, ALICE_PHOTO],
  ]) {
    await exec(
      `INSERT INTO attachments (id, place_id, type, uri, filename, is_primary, created_at, source) VALUES (?,?,?,?,?,?,?,?)`,
      [id, placeId, 'photo', uri, 'x.jpg', 1, now, 'upload']
    );
  }
  // Same city for both tenants, so an unscoped join would sit them side by side.
  await exec(`UPDATE places SET country = ?, city = ?, visit_status = ?, last_visited = ?, tags = ? WHERE id IN (?, ?)`, [
    'Japan', 'Kyoto', 'visited', '2024-04-12', JSON.stringify(['temples']), FIXTURE.alicePlace, FIXTURE.bobPlace,
  ]);
  // Each tenant has a heart and a saved view of their own.
  await exec(`INSERT INTO place_hearts (id,user_id,place_id,created_at) VALUES (?,?,?,?)`, ['hrt_bob', BOB.id, FIXTURE.bobPlace, now]);
  await exec(`INSERT INTO place_hearts (id,user_id,place_id,created_at) VALUES (?,?,?,?)`, ['hrt_alice', ALICE.id, FIXTURE.alicePlace, now]);
  await exec(`INSERT INTO saved_views (id,user_id,name,query,created_at,updated_at) VALUES (?,?,?,?,?,?)`, [
    'svw_bob', BOB.id, 'BOB PRIVATE VIEW', 'search=bob+secret', now, now,
  ]);
  await exec(`INSERT INTO saved_views (id,user_id,name,query,created_at,updated_at) VALUES (?,?,?,?,?,?)`, [
    'svw_alice', ALICE.id, 'Kyoto temples', 'city=Kyoto', now, now,
  ]);
  // Alice also has a place waiting in the Inbox and one in the Archive.
  for (const [id, status] of [['plc_alice_inbox', 'inbox'], ['plc_alice_archived', 'archived']]) {
    await exec(`INSERT INTO places (id,user_id,name,kind,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`, [
      id, ALICE.id, `Alice ${status}`, 'cafe', status, now, now,
    ]);
  }
});

describe('loadLibrary', () => {
  it("never returns another tenant's places or photos", async () => {
    const { items } = await loadLibrary(ALICE.id);
    expect(items.map((p) => p.id)).not.toContain(FIXTURE.bobPlace);
    expect(items.flatMap((p) => p.photos.map((ph) => ph.uri))).not.toContain(BOB_PHOTO);
    expect(JSON.stringify(items)).not.toContain('BOB PRIVATE NOTE');
  });

  it("returns the caller's own library place with its photo and visit date (positive control)", async () => {
    const { items } = await loadLibrary(ALICE.id);
    expect(items.map((p) => p.id)).toEqual([FIXTURE.alicePlace]);
    const [alice] = items;
    expect(alice.photos.map((ph) => ph.uri)).toEqual([ALICE_PHOTO]);
    expect(alice.lastVisited).toBe('2024-04-12');
    expect(alice.visitStatus).toBe('visited');
    expect(alice.tags).toEqual(['temples']);
  });

  it('counts Inbox places for "Needs review" without showing them, and leaves the Archive out', async () => {
    const { items, inboxCount } = await loadLibrary(ALICE.id);
    const ids = items.map((p) => p.id);
    expect(ids).not.toContain('plc_alice_inbox');
    expect(ids).not.toContain('plc_alice_archived');
    expect(inboxCount).toBe(1);
  });

  it("only lists the caller's collections and memberships", async () => {
    const { collections } = await loadLibrary(ALICE.id);
    expect(collections.map((c) => c.id)).toEqual([FIXTURE.aliceCollection]);
    expect(collections.flatMap((c) => c.placeIds)).not.toContain(FIXTURE.bobPlace);
    expect(JSON.stringify(collections)).not.toContain(FIXTURE.bobCollectionNote);
  });

  it("gives Bob his own data and none of Alice's", async () => {
    const { items, collections, inboxCount } = await loadLibrary(BOB.id);
    expect(items.map((p) => p.id)).toEqual([FIXTURE.bobPlace]);
    expect(items[0].photos.map((ph) => ph.uri)).toEqual([BOB_PHOTO]);
    expect(collections.map((c) => c.id)).toEqual([FIXTURE.bobCollection]);
    expect(inboxCount).toBe(0);
  });

  it("only returns the caller's hearts and saved views", async () => {
    const alice = await loadLibrary(ALICE.id);
    expect(alice.heartIds).toEqual([FIXTURE.alicePlace]);
    expect(alice.savedViews).toEqual([{ id: 'svw_alice', name: 'Kyoto temples', query: 'city=Kyoto' }]);
    expect(JSON.stringify(alice)).not.toContain('BOB PRIVATE VIEW');
    const bob = await loadLibrary(BOB.id);
    expect(bob.heartIds).toEqual([FIXTURE.bobPlace]);
    expect(bob.savedViews.map((v) => v.id)).toEqual(['svw_bob']);
  });
});

describe('the Library store', () => {
  it("hearts only the caller's own places, even in a list that names someone else's", async () => {
    const applied = await setHearts(ALICE.id, [FIXTURE.bobPlace, 'plc_alice_inbox', 'plc_nowhere'], true);
    expect(applied).toEqual(['plc_alice_inbox']);
    expect(new Set(await getHeartIds(ALICE.id))).toEqual(new Set([FIXTURE.alicePlace, 'plc_alice_inbox']));
    expect(await getHeartIds(BOB.id)).toEqual([FIXTURE.bobPlace]);
  });

  it('is idempotent: hearting twice keeps one heart', async () => {
    await setHearts(ALICE.id, [FIXTURE.alicePlace], true);
    await setHearts(ALICE.id, [FIXTURE.alicePlace], true);
    expect((await getHeartIds(ALICE.id)).filter((id) => id === FIXTURE.alicePlace)).toHaveLength(1);
  });

  it("never removes someone else's heart", async () => {
    expect(await setHearts(ALICE.id, [FIXTURE.bobPlace], false)).toEqual([]);
    expect(await getHeartIds(BOB.id)).toEqual([FIXTURE.bobPlace]);
  });

  it("can't rename or delete another tenant's saved view", async () => {
    expect(await updateSavedView(ALICE.id, 'svw_bob', { name: 'stolen' })).toBeNull();
    expect(await deleteSavedView(ALICE.id, 'svw_bob')).toBe(false);
    const bob = await loadLibrary(BOB.id);
    expect(bob.savedViews).toEqual([{ id: 'svw_bob', name: 'BOB PRIVATE VIEW', query: 'search=bob+secret' }]);
  });

  it('creates a view for the caller only', async () => {
    const view = await createSavedView(ALICE.id, 'Cafés', 'kind=cafe');
    expect((await loadLibrary(ALICE.id)).savedViews.map((v) => v.id)).toContain(view.id);
    expect((await loadLibrary(BOB.id)).savedViews.map((v) => v.id)).not.toContain(view.id);
  });
});
