/**
 * @jest-environment node
 *
 * The Library index and its version, against a real database. The version is the
 * cache key of an `immutable` response, so what matters is that it moves on every
 * edit the index shows (a stale one would show a stale library from the browser's
 * cache) and stays put on what it does not carry (hearts, saved views, the inbox)
 * and on anything another tenant does.
 *
 * The fixture must be imported first (see tenant-fixture.ts for why).
 */
import { ALICE, BOB, FIXTURE, apiRequest, assertLocalDatabase, resetTenantFixture } from '../helpers/tenant-fixture';

jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: jest.fn((e: unknown) => e instanceof Error && e.message === 'Unauthorized'),
}));

import { requireAuthForApi } from '@/lib/auth-helpers';
import { GET as getIndex } from '@/app/api/library/index/route';
import { GET as getPhotos } from '@/app/api/library/photos/[placeId]/route';
import { GET as getVersion } from '@/app/api/library/version/route';
import { batchArchivePlaces, batchDeletePlaces, batchRestorePlaces, batchSetVisitStatus } from '@/lib/db-mutations';
import { loadLibrarySeed } from '@/lib/library/seed';
import { libraryVersion } from '@/lib/library/version';
import { decodeIndex } from '@/lib/library/wire';

const mockAuth = requireAuthForApi as jest.MockedFunction<typeof requireAuthForApi>;

async function exec(sql: string, args: unknown[] = []): Promise<void> {
  const { client } = require('@/db') as { client: { execute: (q: { sql: string; args: unknown[] }) => Promise<unknown> } };
  await client.execute({ sql, args });
}

const later = (() => {
  let t = Date.now() + 60_000;
  return () => new Date((t += 1000)).toISOString();
})();

async function addPhoto(id: string, placeId: string, opts: { primary?: boolean; thumb?: string | null } = {}) {
  await exec(
    `INSERT INTO attachments (id,place_id,type,uri,filename,thumbnail_uri,is_primary,source,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, placeId, 'photo', `https://store.public.blob.vercel-storage.com/${id}.jpg`, `${id}.jpg`, opts.thumb ?? null, opts.primary ? 1 : 0, 'upload', later()]
  );
}

const ask = (v?: string) => getIndex(apiRequest(`http://localhost/api/library/index${v ? `?v=${v}` : ''}`));

beforeAll(() => {
  assertLocalDatabase();
});

beforeEach(async () => {
  await resetTenantFixture();
  mockAuth.mockResolvedValue({ id: ALICE.id, email: ALICE.email, name: ALICE.name } as never);
  await exec(`UPDATE places SET status = 'library' WHERE id IN (?, ?)`, [FIXTURE.alicePlace, FIXTURE.bobPlace]);
});

describe('libraryVersion', () => {
  it('holds still while nothing changes, and is the caller’s own', async () => {
    const a = await libraryVersion(ALICE.id);
    expect(await libraryVersion(ALICE.id)).toBe(a);
    expect(await libraryVersion(BOB.id)).not.toBe(a);
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it.each([
    ['a place is edited', () => exec(`UPDATE places SET name = 'Renamed', updated_at = ? WHERE id = ?`, [later(), FIXTURE.alicePlace])],
    ['a place is added', () => exec(`INSERT INTO places (id,user_id,name,kind,status,created_at,updated_at) VALUES ('plc_new',?,?,?,?,?,?)`, [ALICE.id, 'New', 'cafe', 'library', later(), later()])],
    ['a place is archived', () => exec(`UPDATE places SET status = 'archived', updated_at = ? WHERE id = ?`, [later(), FIXTURE.alicePlace])],
    ['a place is deleted', () => exec(`DELETE FROM places WHERE id = ?`, [FIXTURE.alicePlace])],
    ['a photo is added', () => addPhoto('att_new', FIXTURE.alicePlace)],
  ])('moves when %s', async (_name, change) => {
    const before = await libraryVersion(ALICE.id);
    await change();
    expect(await libraryVersion(ALICE.id)).not.toBe(before);
  });

  it('moves when a photo is removed', async () => {
    await addPhoto('att_gone', FIXTURE.alicePlace);
    const before = await libraryVersion(ALICE.id);
    await exec(`DELETE FROM attachments WHERE id = 'att_gone'`);
    expect(await libraryVersion(ALICE.id)).not.toBe(before);
  });

  it('moves when another photo is made primary, which writes no place row', async () => {
    await addPhoto('att_one', FIXTURE.alicePlace, { primary: true });
    await addPhoto('att_two', FIXTURE.alicePlace);
    const before = await libraryVersion(ALICE.id);
    await exec(`UPDATE attachments SET is_primary = CASE id WHEN 'att_two' THEN 1 ELSE 0 END WHERE place_id = ?`, [FIXTURE.alicePlace]);
    expect(await libraryVersion(ALICE.id)).not.toBe(before);
  });

  it('moves when a thumbnail lands on a photo that had none', async () => {
    await addPhoto('att_late', FIXTURE.alicePlace, { thumb: null });
    const before = await libraryVersion(ALICE.id);
    await exec(`UPDATE attachments SET thumbnail_uri = 'https://store.public.blob.vercel-storage.com/late-t.jpg' WHERE id = 'att_late'`);
    expect(await libraryVersion(ALICE.id)).not.toBe(before);
  });

  it('moves when a collection is renamed, gains a place or loses one', async () => {
    const before = await libraryVersion(ALICE.id);
    await exec(`UPDATE collections SET name = 'Renamed trip', updated_at = ? WHERE id = ?`, [later(), FIXTURE.aliceCollection]);
    const renamed = await libraryVersion(ALICE.id);
    expect(renamed).not.toBe(before);

    await exec(`INSERT INTO places (id,user_id,name,kind,status,created_at,updated_at) VALUES ('plc_second',?,?,?,?,?,?)`, [ALICE.id, 'Second', 'cafe', 'library', later(), later()]);
    const withPlace = await libraryVersion(ALICE.id);
    await exec(`INSERT INTO places_to_collections (place_id,collection_id) VALUES ('plc_second',?)`, [FIXTURE.aliceCollection]);
    const added = await libraryVersion(ALICE.id);
    expect(added).not.toBe(withPlace);

    await exec(`DELETE FROM places_to_collections WHERE place_id = 'plc_second'`);
    expect(await libraryVersion(ALICE.id)).not.toBe(added);
  });

  it('holds still for what the index does not carry', async () => {
    const before = await libraryVersion(ALICE.id);
    const now = later();
    await exec(`INSERT INTO place_hearts (id,user_id,place_id,created_at) VALUES ('hrt_a',?,?,?)`, [ALICE.id, FIXTURE.alicePlace, now]);
    await exec(`INSERT INTO saved_views (id,user_id,name,query,created_at,updated_at) VALUES ('svw_a',?,?,?,?,?)`, [ALICE.id, 'View', 'kind=cafe', now, now]);
    await exec(`INSERT INTO places (id,user_id,name,kind,status,created_at,updated_at) VALUES ('plc_inbox',?,?,?,?,?,?)`, [ALICE.id, 'Waiting', 'cafe', 'inbox', now, now]);
    await addPhoto('att_inbox', 'plc_inbox');
    await exec(`INSERT INTO places (id,user_id,name,kind,status,created_at,updated_at) VALUES ('plc_arch',?,?,?,?,?,?)`, [ALICE.id, 'Shelved', 'cafe', 'archived', now, now]);
    expect(await libraryVersion(ALICE.id)).toBe(before);
  });

  it('does not move for anything another tenant does', async () => {
    const before = await libraryVersion(ALICE.id);
    await exec(`UPDATE places SET name = 'Bob renamed', updated_at = ? WHERE id = ?`, [later(), FIXTURE.bobPlace]);
    await addPhoto('att_bob_new', FIXTURE.bobPlace, { primary: true });
    await exec(`UPDATE collections SET name = 'Bob trip', updated_at = ? WHERE id = ?`, [later(), FIXTURE.bobCollection]);
    expect(await libraryVersion(ALICE.id)).toBe(before);
  });
});

describe('libraryVersion and the edits the Library makes', () => {
  // The page patches its copy after one of these and then asks for the version: if the server's
  // version did not move, the page takes the server's word over its patch. So each must move it.
  it('moves for an archive, a restore, a status change and a delete, through the bulk-action writes themselves', async () => {
    const seen = [await libraryVersion(ALICE.id)];
    const step = async (edit: () => Promise<unknown>) => {
      await edit();
      seen.push(await libraryVersion(ALICE.id));
    };
    await step(() => batchSetVisitStatus([FIXTURE.alicePlace], 'visited', ALICE.id));
    await step(() => batchSetVisitStatus([FIXTURE.alicePlace], 'not_visited', ALICE.id));
    await step(() => batchArchivePlaces([FIXTURE.alicePlace], ALICE.id));
    await step(() => batchRestorePlaces([FIXTURE.alicePlace], ALICE.id));
    await step(() => batchDeletePlaces([FIXTURE.alicePlace], ALICE.id));
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
  });
});

describe('GET /api/library/version', () => {
  it('answers with the caller’s current version, never from a cache', async () => {
    const res = await getVersion();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await res.json()).toEqual({ version: await libraryVersion(ALICE.id) });
  });

  it('is the version the index route labels its answer with', async () => {
    const { version } = (await (await getVersion()).json()) as { version: string };
    const index = decodeIndex(await (await ask(version)).json());
    expect(index?.version).toBe(version);
  });

  it('answers 401 when signed out', async () => {
    mockAuth.mockRejectedValueOnce(new Error('Unauthorized'));
    expect((await getVersion()).status).toBe(401);
  });
});

describe('GET /api/library/index', () => {
  it('serves the caller’s places and collections under the version, cacheable for good', async () => {
    await addPhoto('att_a1', FIXTURE.alicePlace, { primary: true, thumb: 'https://store.public.blob.vercel-storage.com/a1-t.jpg' });
    await addPhoto('att_a2', FIXTURE.alicePlace);
    const version = await libraryVersion(ALICE.id);

    const res = await ask(version);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=31536000, immutable');
    const index = decodeIndex(await res.json());
    expect(index).not.toBeNull();
    expect(index!.version).toBe(version);
    const mine = index!.items.find((p) => p.id === FIXTURE.alicePlace)!;
    expect(mine.photos).toHaveLength(1);
    expect(mine.photoCount).toBe(2);
    expect(index!.items.map((p) => p.id)).not.toContain(FIXTURE.bobPlace);
    expect(JSON.stringify(index)).not.toContain(FIXTURE.bobCollectionNote);
    expect(index!.collections.map((c) => c.id)).toEqual([FIXTURE.aliceCollection]);
  });

  it('does not let an out-of-date URL cache what is now a different library', async () => {
    const res = await ask('old-version');
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    const index = decodeIndex(await res.json());
    expect(index!.version).toBe(await libraryVersion(ALICE.id));
  });

  it('is not cacheable without a version', async () => {
    expect((await ask()).headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('answers 401 when signed out', async () => {
    mockAuth.mockRejectedValueOnce(new Error('Unauthorized'));
    expect((await ask('x')).status).toBe(401);
  });
});

describe('GET /api/library/photos/[placeId]', () => {
  const photos = (placeId: string) => getPhotos(apiRequest(`http://localhost/api/library/photos/${placeId}`), { params: Promise.resolve({ placeId }) });

  it('returns every photo of the caller’s place, primary first', async () => {
    await addPhoto('att_x1', FIXTURE.alicePlace);
    await addPhoto('att_x2', FIXTURE.alicePlace, { primary: true });
    const body = (await (await photos(FIXTURE.alicePlace)).json()) as { photos: Array<{ uri: string }> };
    expect(body.photos.map((p) => p.uri.split('/').pop())).toEqual(['att_x2.jpg', 'att_x1.jpg']);
  });

  it('answers 404 for another tenant’s place, as for one that does not exist', async () => {
    await addPhoto('att_bob_x', FIXTURE.bobPlace, { primary: true });
    const foreign = await photos(FIXTURE.bobPlace);
    const missing = await photos('plc_nope');
    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await foreign.json()).toEqual(await missing.json());
  });
});

describe('the Library page payload', () => {
  const params = new URLSearchParams();

  it('carries a small library whole', async () => {
    const seed = await loadLibrarySeed(ALICE.id, params);
    expect(seed.mode).toBe('inline');
    if (seed.mode === 'inline') expect(seed.data.items.map((p) => p.id)).toContain(FIXTURE.alicePlace);
  });

  it('carries only the first screen and the version of a larger one', async () => {
    const now = later();
    for (let i = 0; i < 160; i++) {
      await exec(`INSERT INTO places (id,user_id,name,kind,status,country,city,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`, [
        `plc_big_${i}`, ALICE.id, `Big ${i}`, 'cafe', 'library', 'Japan', 'Kyoto', now, now,
      ]);
    }
    const seed = await loadLibrarySeed(ALICE.id, params);
    expect(seed.mode).toBe('indexed');
    if (seed.mode !== 'indexed') return;
    expect(seed.version).toBe(await libraryVersion(ALICE.id));
    expect(seed.total).toBe(161);
    expect(JSON.stringify(seed)).not.toContain(FIXTURE.bobPlace);
    const sent = seed.chapters.flatMap((c) => c.items);
    expect(sent.length).toBeLessThan(20);
  });
});
