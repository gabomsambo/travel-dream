/**
 * @jest-environment node
 *
 * Quick look's "Also in {city}" route, against a real database. The sweep proves
 * a foreign place id is refused; this proves the answer for the caller's own
 * place never reaches into another tenant's saves in the same city.
 *
 * The fixture must be imported first (see tenant-fixture.ts for why).
 */
import { ALICE, BOB, FIXTURE, apiRequest, assertLocalDatabase, resetTenantFixture } from '../helpers/tenant-fixture';

jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: jest.fn((e: unknown) => e instanceof Error && e.message === 'Unauthorized'),
}));

import { requireAuthForApi } from '@/lib/auth-helpers';
import { GET } from '@/app/api/explore/same-city/[placeId]/route';

const mockAuth = requireAuthForApi as jest.MockedFunction<typeof requireAuthForApi>;

async function exec(sql: string, args: unknown[] = []): Promise<void> {
  const { client } = require('@/db') as { client: { execute: (q: { sql: string; args: unknown[] }) => Promise<unknown> } };
  await client.execute({ sql, args });
}

async function insertPlace(id: string, userId: string, name: string, city: string | null, status = 'library'): Promise<void> {
  const now = new Date().toISOString();
  await exec(
    `INSERT INTO places (id,user_id,name,kind,city,country,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, userId, name, 'cafe', city, city ? 'Japan' : null, status, now, now]
  );
}

async function ask(placeId: string): Promise<Response> {
  return GET(apiRequest(`http://localhost/api/explore/same-city/${placeId}`), { params: Promise.resolve({ placeId }) });
}

beforeAll(() => {
  assertLocalDatabase();
});

beforeEach(async () => {
  await resetTenantFixture();
  mockAuth.mockResolvedValue({ id: ALICE.id, email: ALICE.email, name: ALICE.name } as Awaited<ReturnType<typeof requireAuthForApi>>);
  await exec(`UPDATE places SET country = 'Japan', city = 'Tokyo' WHERE id IN (?, ?)`, [FIXTURE.alicePlace, FIXTURE.bobPlace]);
});

describe('GET /api/explore/same-city/[placeId]', () => {
  it('answers with the caller\'s other browsable places in that city, never another tenant\'s', async () => {
    await insertPlace('plc_alice_tokyo_2', ALICE.id, 'Alice Tokyo Two', 'Tokyo');
    await insertPlace('plc_alice_tokyo_inbox', ALICE.id, 'Alice Tokyo Inbox', 'Tokyo', 'inbox');
    await insertPlace('plc_alice_tokyo_archived', ALICE.id, 'Alice Tokyo Archived', 'Tokyo', 'archived');
    await insertPlace('plc_alice_kyoto', ALICE.id, 'Alice Kyoto', 'Kyoto');
    await insertPlace('plc_bob_tokyo_2', BOB.id, 'Bob Tokyo Two', 'Tokyo');

    const res = await ask(FIXTURE.alicePlace);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { places: Array<{ id: string }> };
    expect(body.places.map((p) => p.id).sort()).toEqual(['plc_alice_tokyo_2', 'plc_alice_tokyo_inbox']);
    expect(JSON.stringify(body)).not.toMatch(/bob/i);
  });

  it('refuses a place that belongs to someone else exactly like one that does not exist', async () => {
    const foreign = await ask(FIXTURE.bobPlace);
    const missing = await ask('plc_nobody');
    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await foreign.json()).toEqual(await missing.json());
  });

  it('returns at most six neighbours', async () => {
    for (let i = 0; i < 9; i++) await insertPlace(`plc_alice_extra_${i}`, ALICE.id, `Extra ${i}`, 'Tokyo');
    const body = (await (await ask(FIXTURE.alicePlace)).json()) as { places: unknown[] };
    expect(body.places).toHaveLength(6);
  });

  it('has no neighbours for a place with no city', async () => {
    await insertPlace('plc_alice_nowhere', ALICE.id, 'Nowhere', null);
    await insertPlace('plc_alice_nowhere_2', ALICE.id, 'Nowhere Two', null);
    const res = await ask('plc_alice_nowhere');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ places: [] });
  });

  it('rejects an id that cannot be one of ours before touching the database', async () => {
    const res = await ask('x'.repeat(200));
    expect(res.status).toBe(400);
  });

  it('answers 401 when nobody is signed in', async () => {
    mockAuth.mockRejectedValue(new Error('Unauthorized'));
    const res = await ask(FIXTURE.alicePlace);
    expect(res.status).toBe(401);
  });
});
