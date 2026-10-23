/**
 * @jest-environment node
 *
 * Review's inline duplicate check against a real local SQLite file.
 * The fixture import must stay first so `@/db` never opens a remote database.
 */
import {
  ALICE,
  BOB,
  FIXTURE,
  assertLocalDatabase,
  resetTenantFixture,
  apiRequest,
  useUniqueUuids,
} from '../helpers/tenant-fixture';

jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: (error: unknown) => error instanceof Error && error.message === 'Unauthorized',
}));

import { requireAuthForApi } from '@/lib/auth-helpers';
import { GET as checkDuplicate } from '@/app/api/places/[id]/duplicate-check/route';
import { POST as bulkMerge } from '@/app/api/places/bulk-merge/route';
import { getDuplicateScanCache, setDuplicateScanCache } from '@/lib/duplicate-scan-cache';

const mockAuth = requireAuthForApi as jest.MockedFunction<typeof requireAuthForApi>;

function database() {
  return (require('@/db') as { db: {
    insert: (table: unknown) => { values: (row: unknown) => Promise<unknown> };
  } }).db;
}

async function insertPlace(row: Record<string, unknown>) {
  const { places } = require('@/db/schema') as typeof import('@/db/schema');
  const db = database();
  await db.insert(places).values({
    userId: ALICE.id,
    kind: 'experience',
    status: 'inbox',
    city: 'Tromsø',
    country: 'Norway',
    createdAt: '2026-10-18T12:00:00.000Z',
    updatedAt: '2026-10-18T12:00:00.000Z',
    altNames: [],
    tags: [],
    vibes: [],
    confidence: 0.8,
    ratingSelf: 0,
    ...row,
  });
}

const LIBRARY = {
  id: 'plc_fjell_lib',
  name: 'Fjellheisen',
  status: 'library',
  coords: { lat: 69.6492, lon: 18.9553 },
  createdAt: '2026-09-02T12:00:00.000Z',
};

const INBOX = {
  id: 'plc_fjell_inbox',
  name: 'Fjellheisen Cable Car',
  status: 'inbox',
  coords: { lat: 69.64965, lon: 18.9553 },
};

async function check(id: string) {
  const response = await checkDuplicate(
    apiRequest(`http://localhost/api/places/${id}/duplicate-check`) as never,
    { params: Promise.resolve({ id }) },
  );
  const body = await response.json() as {
    status: string;
    message?: string;
    match: null | {
      placeId: string;
      name: string;
      certainty: string;
      label: string;
      summary: string;
      photoUrl: string | null;
      confidence: number;
    };
  };
  return { status: response.status, body };
}

describe('GET /api/places/[id]/duplicate-check', () => {
  beforeAll(() => {
    useUniqueUuids();
  });

  beforeEach(async () => {
    assertLocalDatabase();
    mockAuth.mockResolvedValue({ ...ALICE });
    const client = (require('@/db') as { client: { execute: (q: string) => Promise<unknown> } }).client;
    for (const table of ['merge_logs', 'dismissed_duplicates']) {
      try {
        await client.execute(`DELETE FROM ${table}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('no such table')) throw error;
      }
    }
    await resetTenantFixture();
  });

  it('returns the Library place, with a certainty word from a 2-place cluster', async () => {
    const { attachments } = require('@/db/schema') as typeof import('@/db/schema');
    await insertPlace(LIBRARY);
    await insertPlace(INBOX);
    await database().insert(attachments).values({
      id: 'att_fjell_lib',
      placeId: LIBRARY.id,
      type: 'photo',
      uri: 'https://example.test/fjellheisen.jpg',
      filename: 'fjellheisen.jpg',
      isPrimary: 1,
      source: 'upload',
    });

    const { status, body } = await check(INBOX.id);
    expect(status).toBe(200);
    expect(body.match).toEqual(expect.objectContaining({
      placeId: LIBRARY.id,
      name: 'Fjellheisen',
      photoUrl: 'https://example.test/fjellheisen.jpg',
    }));
    expect(['likely', 'very-likely', 'same']).toContain(body.match?.certainty);
    expect(body.match?.label).toBeTruthy();
    expect(body.match?.summary).toContain('Same name start');
    expect(body.match?.summary).toContain('both Tromsø');
    expect(body.match?.summary).toMatch(/pins \d+ m apart/);
    expect(body.match?.summary).toContain('saved 2 Sept');
    expect(body.match?.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('drops a dismissed pair and ignores inbox, archived, and other tenants', async () => {
    const { dismissedDuplicates } = require('@/db/schema') as typeof import('@/db/schema');
    await insertPlace(LIBRARY);
    await insertPlace(INBOX);
    await insertPlace({
      id: 'plc_fjell_inbox_twin',
      name: 'Fjellheisen Cable Car',
      status: 'inbox',
      coords: LIBRARY.coords,
    });
    await insertPlace({
      id: 'plc_fjell_archived',
      name: 'Fjellheisen',
      status: 'archived',
      coords: LIBRARY.coords,
    });
    await insertPlace({
      id: 'plc_bob_fjell',
      userId: BOB.id,
      name: 'BOB SECRET FJELL',
      status: 'library',
      coords: LIBRARY.coords,
    });

    const shown = await check(INBOX.id);
    expect(shown.body.match?.placeId).toBe(LIBRARY.id);
    expect(JSON.stringify(shown.body)).not.toContain('BOB SECRET');

    await database().insert(dismissedDuplicates).values({
      id: 'dis_fjell',
      userId: ALICE.id,
      placeId1: INBOX.id,
      placeId2: LIBRARY.id,
    });
    const hidden = await check(INBOX.id);
    expect(hidden.status).toBe(200);
    expect(hidden.body.match).toBeNull();

    await insertPlace({
      id: 'plc_only_bob_side',
      name: 'Pust Floating Sauna',
      status: 'inbox',
      city: 'Tromsø',
      coords: { lat: 69.65, lon: 18.96 },
    });
    await insertPlace({
      id: 'plc_bob_sauna',
      userId: BOB.id,
      name: 'BOB SECRET SAUNA',
      status: 'library',
      city: 'Tromsø',
      coords: { lat: 69.65, lon: 18.96 },
    });
    const foreignOnly = await check('plc_only_bob_side');
    expect(foreignOnly.body.match).toBeNull();
    expect(JSON.stringify(foreignOnly.body)).not.toContain('BOB');
  });

  it('answers 404 for a missing id and for another tenant', async () => {
    const missing = await check('plc_missing');
    expect(missing.status).toBe(404);
    expect(missing.body.match).toBeUndefined();

    mockAuth.mockResolvedValue({ ...ALICE });
    const foreign = await check(FIXTURE.bobPlace);
    expect(foreign.status).toBe(404);
    expect(JSON.stringify(foreign.body)).not.toMatch(/bob/i);
  });

  it('clears the duplicate scan cache after a merge', async () => {
    await insertPlace(LIBRARY);
    await insertPlace(INBOX);
    setDuplicateScanCache('review-probe', { mode: 'clusters', clusters: ['stale'] });

    const refused = await bulkMerge(apiRequest('http://localhost/api/places/bulk-merge', 'POST', {
      clusters: [{ targetId: FIXTURE.bobPlace, sourceIds: [INBOX.id], confidence: 0.9 }],
    }) as never);
    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect(getDuplicateScanCache('review-probe')).toEqual({ mode: 'clusters', clusters: ['stale'] });

    const merged = await bulkMerge(apiRequest('http://localhost/api/places/bulk-merge', 'POST', {
      clusters: [{ targetId: LIBRARY.id, sourceIds: [INBOX.id], confidence: 0.9 }],
    }) as never);
    expect(merged.status).toBe(200);
    expect(getDuplicateScanCache('review-probe')).toBeNull();
  });
});
