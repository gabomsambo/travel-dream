/**
 * @jest-environment node
 *
 * POST /api/places/[id]/attachments/from-source — the Find-image dialog's save
 * path, now a thin wrapper over `attachPhotoFromSource`. Runs the real handler
 * against the tenant fixture's SQLite database.
 */
import {
  ALICE,
  FIXTURE,
  apiRequest,
  assertLocalDatabase,
  resetTenantFixture,
  useUniqueUuids,
} from '../helpers/tenant-fixture';

jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: jest.fn((e: unknown) => e instanceof Error && e.message === 'Unauthorized'),
}));

import { requireAuthForApi } from '@/lib/auth-helpers';
import { POST } from '@/app/api/places/[id]/attachments/from-source/route';

type Client = { execute: (q: { sql: string; args: unknown[] }) => Promise<{ rows: Record<string, unknown>[] }> };
const photos = async (placeId: string) =>
  (
    await (require('@/db') as { client: Client }).client.execute({
      sql: 'SELECT id, source, source_id, uri, is_primary FROM attachments WHERE place_id = ? ORDER BY created_at, id',
      args: [placeId],
    })
  ).rows;

const googleBody = (sourceId: string) => ({
  source: 'google_places',
  sourceId,
  thumbnailUrl: 'https://lh3.googleusercontent.com/short-lived',
  fullUrl: 'https://lh3.googleusercontent.com/short-lived',
  width: 1200,
  height: 800,
  attribution: { kind: 'google_places', authorAttributions: [] },
});

const post = (placeId: string, body: unknown) =>
  POST(apiRequest(`http://localhost/api/places/${placeId}/attachments/from-source`, 'POST', body) as never, {
    params: Promise.resolve({ id: placeId }),
  });

describe('POST /api/places/[id]/attachments/from-source', () => {
  beforeAll(() => {
    assertLocalDatabase();
    useUniqueUuids();
  });

  beforeEach(async () => {
    await resetTenantFixture();
    (requireAuthForApi as jest.Mock).mockResolvedValue(ALICE);
  });

  it('stores a Google photo as a resolver reference and makes the first photo primary', async () => {
    const res = await post(FIXTURE.alicePlace, googleBody('places/a/photos/1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deduped).toBe(false);

    const rows = await photos(FIXTURE.alicePlace);
    expect(rows).toHaveLength(1);
    expect(rows[0].uri).toBe(`/api/photos/resolve/${rows[0].id}`);
    expect(rows[0].is_primary).toBe(1);
  });

  it('leaves the primary alone for a second photo, and dedups a repeat', async () => {
    await post(FIXTURE.alicePlace, googleBody('places/a/photos/1'));
    await post(FIXTURE.alicePlace, googleBody('places/a/photos/2'));
    const repeat = await (await post(FIXTURE.alicePlace, googleBody('places/a/photos/2'))).json();

    expect(repeat.deduped).toBe(true);
    const rows = await photos(FIXTURE.alicePlace);
    expect(rows.map((r) => [r.source_id, r.is_primary])).toEqual([
      ['places/a/photos/1', 1],
      ['places/a/photos/2', 0],
    ]);
  });

  it('accepts a Wikimedia photo with a thumb.wikimedia.org thumbnail, as Commons now returns', async () => {
    const res = await post(FIXTURE.alicePlace, {
      source: 'wikimedia',
      sourceId: '42',
      thumbnailUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ee/X.jpg/330px-X.jpg',
      fullUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/ee/X.jpg',
      width: 800,
      height: 600,
      attribution: {
        kind: 'wikimedia', authorText: 'A', licenseShortName: 'CC BY-SA 4.0', licenseUrl: '', descriptionUrl: '',
      },
    });
    expect(res.status).toBe(200);
    const rows = await photos(FIXTURE.alicePlace);
    expect(rows[0].uri).toBe('https://upload.wikimedia.org/wikipedia/commons/e/ee/X.jpg');
  });

  it('rejects a Wikimedia photo hosted elsewhere', async () => {
    const res = await post(FIXTURE.alicePlace, {
      source: 'wikimedia',
      sourceId: '1',
      thumbnailUrl: null,
      fullUrl: 'https://evil.example.com/x.jpg',
      width: null,
      height: null,
      attribution: {
        kind: 'wikimedia', authorText: '', licenseShortName: 'CC0', licenseUrl: '', descriptionUrl: '',
      },
    });
    expect(res.status).toBe(400);
    expect(await photos(FIXTURE.alicePlace)).toHaveLength(0);
  });

  it("answers 404 for another user's place and writes nothing", async () => {
    const res = await post(FIXTURE.bobPlace, googleBody('places/b/photos/1'));
    expect(res.status).toBe(404);
    expect(await photos(FIXTURE.bobPlace)).toHaveLength(0);
  });
});
