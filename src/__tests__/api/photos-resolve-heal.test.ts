/**
 * @jest-environment node
 *
 * GET /api/photos/resolve/[attachmentId] storing a refreshed Google photo name
 * when the stored one has expired. Runs the real handler against the tenant
 * fixture's SQLite database, with the Google resolver mocked.
 */
import {
  ALICE,
  FIXTURE,
  assertLocalDatabase,
  resetTenantFixture,
} from '../helpers/tenant-fixture';

jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: jest.fn((e: unknown) => e instanceof Error && e.message === 'Unauthorized'),
}));
jest.mock('@/lib/photo-sources/google-resolver', () => ({
  resolveGooglePhoto: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { requireAuthForApi } from '@/lib/auth-helpers';
import { resolveGooglePhoto } from '@/lib/photo-sources/google-resolver';
import { GET } from '@/app/api/photos/resolve/[attachmentId]/route';

type Client = { execute: (q: { sql: string; args: unknown[] }) => Promise<{ rows: Record<string, unknown>[] }> };
const ex = (sql: string, args: unknown[] = []) => (require('@/db') as { client: Client }).client.execute({ sql, args });
const mockResolve = resolveGooglePhoto as jest.MockedFunction<typeof resolveGooglePhoto>;

const OLD = 'places/ChIJ/photos/OLD';
const FRESH = {
  name: 'places/ChIJ/photos/FRESH',
  widthPx: 1200,
  heightPx: 900,
  authorAttributions: [{ displayName: 'Julio', uri: 'https://maps.google.com/contrib/julio' }],
};

async function seedGooglePhoto(id: string, placeId: string) {
  await ex(
    `INSERT INTO attachments (id,place_id,type,uri,filename,is_primary,source,source_id,attribution,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [id, placeId, 'photo', `/api/photos/resolve/${id}`, `${id}.jpg`, 1, 'google_places', OLD,
     JSON.stringify({ kind: 'google_places', authorAttributions: [{ displayName: 'Julio', uri: 'https://maps.google.com/contrib/julio' }] }),
     new Date().toISOString()],
  );
}

const row = async (id: string) =>
  (await ex('SELECT source_id, width, attribution FROM attachments WHERE id = ?', [id])).rows[0];

const get = (id: string) =>
  GET(new NextRequest(`http://localhost/api/photos/resolve/${id}?w=400`), {
    params: Promise.resolve({ attachmentId: id }),
  });

describe('photo resolve self-heal', () => {
  beforeAll(() => assertLocalDatabase());

  beforeEach(async () => {
    jest.clearAllMocks();
    await resetTenantFixture();
    await seedGooglePhoto('att_alice', FIXTURE.alicePlace);
    await seedGooglePhoto('att_bob', FIXTURE.bobPlace);
    (requireAuthForApi as jest.Mock).mockResolvedValue(ALICE);
  });

  it('stores the refreshed name and attribution for the owner, and redirects to it', async () => {
    mockResolve.mockResolvedValueOnce({ photoUri: 'https://lh3/fresh', refreshed: FRESH });

    const res = await get('att_alice');

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://lh3/fresh');
    expect(mockResolve).toHaveBeenCalledWith(OLD, 400, 'https://maps.google.com/contrib/julio');
    const r = await row('att_alice');
    expect(r.source_id).toBe(FRESH.name);
    expect(r.width).toBe(1200);
    expect(JSON.parse(String(r.attribution))).toEqual({ kind: 'google_places', authorAttributions: FRESH.authorAttributions });
  });

  it('writes nothing when the name was still live', async () => {
    mockResolve.mockResolvedValueOnce({ photoUri: 'https://lh3/live' });
    expect((await get('att_alice')).status).toBe(302);
    expect((await row('att_alice')).source_id).toBe(OLD);
  });

  it('does not overwrite stored dimensions when the fresh photo omits them', async () => {
    await ex(
      'UPDATE attachments SET width = ?, height = ? WHERE id = ?',
      [1000, 800, 'att_alice'],
    );
    mockResolve.mockResolvedValueOnce({
      photoUri: 'https://lh3/fresh',
      refreshed: { name: FRESH.name, widthPx: null, heightPx: null, authorAttributions: FRESH.authorAttributions },
    });

    expect((await get('att_alice')).status).toBe(302);
    const r = await row('att_alice');
    expect(r.source_id).toBe(FRESH.name);
    expect((await ex('SELECT width, height FROM attachments WHERE id = ?', ['att_alice'])).rows[0]).toEqual({
      width: 1000,
      height: 800,
    });
  });

  it('writes nothing when the heal fails', async () => {
    mockResolve.mockResolvedValueOnce(null);
    expect((await get('att_alice')).status).toBe(502);
    expect((await row('att_alice')).source_id).toBe(OLD);
  });

  it("never resolves or rewrites another user's photo", async () => {
    mockResolve.mockResolvedValue({ photoUri: 'https://lh3/fresh', refreshed: FRESH });
    expect((await get('att_bob')).status).toBe(404);
    expect(mockResolve).not.toHaveBeenCalled();
    expect((await row('att_bob')).source_id).toBe(OLD);
  });
});
