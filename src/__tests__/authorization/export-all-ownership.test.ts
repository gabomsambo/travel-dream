/**
 * @jest-environment node
 *
 * Cross-tenant regression test for `GET /api/export/all`.
 *
 * Three of the four queries in that handler filtered on the caller; the fourth
 * read `places_to_collections` unfiltered. That table is not a bare join table:
 * it carries `order_index`, `is_pinned`, and the user-authored per-place
 * `note`. So one ordinary signed-in request returned every other user's
 * collection-membership graph and every private note they had written.
 *
 * These assertions run the real handler against a real seeded database — see
 * `../helpers/tenant-fixture`. It must be imported first: it pins
 * TURSO_DATABASE_URL to a local file before `@/db` can read the production URL
 * that `jest.setup.js`'s dotenv call leaves in the environment.
 */
import {
  ALICE,
  BOB,
  FIXTURE,
  assertLocalDatabase,
  resetTenantFixture,
} from '../helpers/tenant-fixture';

jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  getCurrentUser: jest.fn(),
  isAuthError: jest.fn((e: unknown) => e instanceof Error && e.message === 'Unauthorized'),
}));

import { requireAuthForApi } from '@/lib/auth-helpers';

type ExportBody = {
  data: {
    places: Array<{ id: string }>;
    collections: Array<{ id: string }>;
    placesToCollections: Array<{
      placeId: string;
      collectionId: string;
      orderIndex: number;
      isPinned: number;
      note: string | null;
    }>;
  };
};

async function exportAs(user: typeof ALICE | typeof BOB): Promise<ExportBody> {
  (requireAuthForApi as jest.Mock).mockResolvedValue(user);
  const { GET } = require('@/app/api/export/all/route');
  return (await GET()).json();
}

beforeAll(async () => {
  assertLocalDatabase();
  await resetTenantFixture();
});

describe('GET /api/export/all — placesToCollections is scoped to the caller', () => {
  it("does not export another user's collection membership rows", async () => {
    const body = await exportAs(ALICE);

    expect(body.data.placesToCollections.map((r) => r.collectionId))
      .not.toContain(FIXTURE.bobCollection);
    expect(body.data.placesToCollections.map((r) => r.placeId))
      .not.toContain(FIXTURE.bobPlace);
  });

  it("does not export another user's private per-place note", async () => {
    const body = await exportAs(ALICE);

    expect(JSON.stringify(body.data.placesToCollections))
      .not.toContain(FIXTURE.bobCollectionNote);
  });

  it('still exports the caller\'s own membership rows, with the flat JSON shape', async () => {
    const body = await exportAs(ALICE);

    // The fix joins to `collections`; an implicit select() after that join
    // would nest the rows under table names and silently break every consumer
    // of this export. These five columns are the whole of the table, so the
    // explicit projection reproduces the pre-fix shape exactly.
    expect(body.data.placesToCollections).toEqual([
      {
        placeId: FIXTURE.alicePlace,
        collectionId: FIXTURE.aliceCollection,
        orderIndex: 0,
        isPinned: 0,
        note: FIXTURE.aliceCollectionNote,
      },
    ]);
  });

  it('is symmetric — Bob gets his rows and none of Alice\'s', async () => {
    const body = await exportAs(BOB);

    expect(body.data.placesToCollections.map((r) => r.collectionId))
      .toEqual([FIXTURE.bobCollection]);
    expect(JSON.stringify(body.data.placesToCollections))
      .not.toContain(FIXTURE.aliceCollectionNote);
  });

  it('the other three collections stay scoped too (control)', async () => {
    const body = await exportAs(ALICE);

    expect(body.data.places.map((p) => p.id)).toEqual([FIXTURE.alicePlace]);
    expect(body.data.collections.map((c) => c.id)).toEqual([FIXTURE.aliceCollection]);
  });
});
