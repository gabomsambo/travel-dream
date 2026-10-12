/**
 * @jest-environment node
 *
 * Regression: after a partial add-to-collection, a retry should only post
 * places that are not already in the collection. Uses real route handlers and
 * SQLite (tenant-fixture), not mocked DB.
 */
import {
  ALICE,
  assertLocalDatabase,
  resetTenantFixture,
  apiRequest,
  readCell,
  useUniqueUuids,
} from '../helpers/tenant-fixture';

jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: jest.fn((e: unknown) => e instanceof Error && e.message === 'Unauthorized'),
}));

import { requireAuthForApi } from '@/lib/auth-helpers';
import { freshPlacesForHalfBuilt } from '@/components/library/library-add-to-collection';

async function postCollection(name: string) {
  const mod = require('@/app/api/collections/route') as {
    POST: (req: Request) => Promise<{ status: number; json: () => Promise<unknown> }>;
  };
  const res = await mod.POST(apiRequest('http://localhost/api/collections', 'POST', { name, description: null }));
  return { status: res.status, body: (await res.json()) as { collection?: { id: string } } };
}

async function postPlaces(collectionId: string, placeIds: string[]) {
  const mod = require('@/app/api/collections/[id]/places/route') as {
    POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<{ status: number; json: () => Promise<unknown> }>;
  };
  const res = await mod.POST(
    apiRequest(`http://localhost/api/collections/${collectionId}/places`, 'POST', { placeIds }),
    { params: Promise.resolve({ id: collectionId }) }
  );
  return { status: res.status, body: (await res.json()) as { results?: { successful?: string[] } } };
}

describe('add-to-collection partial retry (API)', () => {
  beforeAll(() => {
    assertLocalDatabase();
    useUniqueUuids();
    (requireAuthForApi as jest.Mock).mockResolvedValue(ALICE);
  });

  beforeEach(async () => {
    await resetTenantFixture();
    const { client } = require('@/db') as {
      client: { execute: (q: { sql: string; args: unknown[] }) => Promise<unknown> };
    };
    const now = new Date().toISOString();
    for (const [id, name] of [
      ['plc_retry_a', 'Place A'],
      ['plc_retry_b', 'Place B'],
      ['plc_retry_c', 'Place C'],
    ] as const) {
      await client.execute({
        sql: `INSERT INTO places (id,user_id,name,kind,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`,
        args: [id, ALICE.id, name, 'cafe', 'library', now, now],
      });
    }
  });

  it('only adds places missing from the collection on a follow-up post', async () => {
    const created = await postCollection('Kyoto trip');
    expect(created.status).toBe(201);
    const collectionId = created.body.collection!.id;

    const first = await postPlaces(collectionId, ['plc_retry_a', 'plc_retry_b']);
    expect(first.body.results?.successful).toEqual(['plc_retry_a', 'plc_retry_b']);

    const selected = ['plc_retry_a', 'plc_retry_b', 'plc_retry_c'];
    const entry = { id: collectionId, name: 'Kyoto trip', seen: false, added: new Set(['plc_retry_a', 'plc_retry_b']) };
    const fresh = freshPlacesForHalfBuilt(
      collectionId,
      selected,
      [{ id: collectionId, name: 'Kyoto trip', placeIds: ['plc_retry_a', 'plc_retry_b'] }],
      entry
    );
    expect(fresh).toEqual(['plc_retry_c']);
    // Until the row is in the snapshot, the local record is the membership we have.
    expect(freshPlacesForHalfBuilt(collectionId, selected, [], entry)).toEqual(['plc_retry_c']);
    // Once the row is back without those places (undo or a removal), they are fresh again.
    expect(
      freshPlacesForHalfBuilt(collectionId, selected, [{ id: collectionId, name: 'Kyoto trip', placeIds: [] }], entry)
    ).toEqual(selected);

    const second = await postPlaces(collectionId, fresh);
    expect(second.body.results?.successful).toEqual(['plc_retry_c']);

    const count = await readCell(
      `SELECT COUNT(*) FROM places_to_collections WHERE collection_id = ?`,
      [collectionId]
    );
    expect(count).toBe(3);
  });
});
