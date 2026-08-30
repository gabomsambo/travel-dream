/**
 * @jest-environment node
 *
 * Cross-tenant test for `getCoverImagesForPlaces`.
 *
 * It used to take bare place ids and was safe only because both call sites —
 * the /library and /archive pages — happened to hand it an already-scoped list.
 * `attachments` carries no `user_id`, so nothing in the query itself said whose
 * photos those were. It now takes a `userId` and scopes through the caller's
 * places; these assertions are what makes that a guarantee rather than a
 * comment, and the positive controls are what keeps the two pages rendering
 * covers at all.
 *
 * Runs against a real database — the fixture must be imported first, because it
 * pins TURSO_DATABASE_URL to a local file before `@/db` can read the production
 * URL that `jest.setup.js`'s dotenv call leaves in the environment.
 */
import {
  ALICE,
  BOB,
  FIXTURE,
  assertLocalDatabase,
  resetTenantFixture,
} from '../helpers/tenant-fixture';

import { getCoverImagesForPlaces } from '@/lib/library-adapters';

const ALICE_COVER = 'https://store.public.blob.vercel-storage.com/alice-cover.jpg';
const BOB_COVER = 'https://store.public.blob.vercel-storage.com/bob-cover.jpg';

/** `attachments` has no user_id, so seeding goes through the raw client. */
async function insertAttachment(id: string, placeId: string, uri: string, isPrimary: number) {
  const { client } = require('@/db') as {
    client: { execute: (q: { sql: string; args: unknown[] }) => Promise<unknown> };
  };
  await client.execute({
    sql: `INSERT INTO attachments (id,place_id,type,uri,filename,is_primary,created_at)
          VALUES (?,?,'photo',?,?,?,?)`,
    args: [id, placeId, uri, `${id}.jpg`, isPrimary, new Date().toISOString()],
  });
}

beforeAll(async () => {
  assertLocalDatabase();
  await resetTenantFixture();
  await insertAttachment('att_alice_primary', FIXTURE.alicePlace, ALICE_COVER, 1);
  await insertAttachment('att_alice_extra', FIXTURE.alicePlace, `${ALICE_COVER}?2`, 0);
  await insertAttachment('att_bob_primary', FIXTURE.bobPlace, BOB_COVER, 1);
});

describe('getCoverImagesForPlaces is scoped by signature, not by caller discipline', () => {
  it("returns nothing for another tenant's place, even when named explicitly", async () => {
    const covers = await getCoverImagesForPlaces([FIXTURE.bobPlace], ALICE.id);

    expect(covers.size).toBe(0);
    expect([...covers.values()]).not.toContain(BOB_COVER);
  });

  it('drops the foreign ids out of a mixed list and keeps the caller\'s own', async () => {
    // This is the shape the old signature could not defend against: an id list
    // the function had no way to know was scoped.
    const covers = await getCoverImagesForPlaces(
      [FIXTURE.alicePlace, FIXTURE.bobPlace],
      ALICE.id
    );

    expect([...covers.keys()]).toEqual([FIXTURE.alicePlace]);
    expect(covers.get(FIXTURE.bobPlace)).toBeUndefined();
  });

  it("still renders the caller's own cover — the /library and /archive control", async () => {
    const covers = await getCoverImagesForPlaces([FIXTURE.alicePlace], ALICE.id);

    expect(covers.get(FIXTURE.alicePlace)).toBe(ALICE_COVER);
    // Only the primary attachment becomes the cover, not every photo.
    expect(covers.size).toBe(1);
  });

  it('is symmetric — Bob gets his own cover and none of Alice\'s', async () => {
    const covers = await getCoverImagesForPlaces(
      [FIXTURE.alicePlace, FIXTURE.bobPlace],
      BOB.id
    );

    expect([...covers.entries()]).toEqual([[FIXTURE.bobPlace, BOB_COVER]]);
  });

  it('short-circuits an empty list without querying', async () => {
    expect(await getCoverImagesForPlaces([], ALICE.id)).toEqual(new Map());
  });
});
