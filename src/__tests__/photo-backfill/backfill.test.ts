/**
 * @jest-environment node
 *
 * The backfill end to end against a real SQLite database (the tenant fixture),
 * with every upstream mocked. What matters here is what lands in the rows:
 * which photo ends up primary, that nothing is deleted or duplicated, that a
 * re-run after a crash converges instead of piling on, and that another user's
 * places are never read or written.
 */
import {
  ALICE,
  BOB,
  FIXTURE,
  assertLocalDatabase,
  readCell,
  resetTenantFixture,
  useUniqueUuids,
} from '../helpers/tenant-fixture';
import { RateLimitError } from '@/lib/photo-sources/types';
import type { GooglePlaceWithPhotos } from '@/lib/photo-sources/google-places';
import {
  loadUserPlaces,
  withRetry,
  type BackfillDeps,
  type Liveness,
} from '@/lib/photo-backfill/backfill';
import { runBackfill, type Ledger, type LedgerEntry } from '@/lib/photo-backfill/runner';
import { attachPhotoFromSource } from '@/lib/place-photos';

type Client = { execute: (q: { sql: string; args: unknown[] }) => Promise<{ rows: Record<string, unknown>[] }> };
const client = () => (require('@/db') as { client: Client }).client;
const ex = (sql: string, args: unknown[] = []) => client().execute({ sql, args });

const DEAD = 'https://store.public.blob.vercel-storage.com/screenshots/dead.png';
const LIVE = 'https://store.public.blob.vercel-storage.com/screenshots/live.png';
const FLAKY = 'https://store.public.blob.vercel-storage.com/screenshots/flaky.png';

const P = {
  dead: 'plc_alice_dead',
  live: 'plc_alice_live',
  repoint: 'plc_alice_repoint',
  noPrimary: 'plc_alice_no_primary',
  flaky: 'plc_alice_flaky',
  noMatch: 'plc_alice_no_match',
  bobDead: 'plc_bob_dead',
};

async function seedPlace(id: string, userId: string, name: string, extra: { gpid?: string } = {}) {
  const now = new Date().toISOString();
  await ex(
    `INSERT INTO places (id,user_id,name,kind,city,country,coords,google_place_id,status,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [id, userId, name, 'landmark', 'Madrid', 'Spain', JSON.stringify({ lat: 40.4155, lon: -3.7074 }),
     extra.gpid ?? null, 'library', now, now],
  );
}

async function seedPhoto(id: string, placeId: string, source: string, uri: string, primary: 0 | 1) {
  await ex(
    `INSERT INTO attachments (id,place_id,type,uri,filename,is_primary,source,source_id,created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, placeId, 'photo', uri, `${id}.png`, primary, source,
     source === 'upload' ? null : `places/x/photos/${id}`, new Date().toISOString()],
  );
}

function googlePlace(name: string, id = 'gp_plaza'): GooglePlaceWithPhotos {
  return {
    googlePlaceId: id,
    displayName: name,
    location: { lat: 40.4154, lon: -3.7075 },
    formattedAddress: 'Plaza Mayor, Madrid, Spain',
    types: ['tourist_attraction'],
    photos: [
      {
        source: 'google_places',
        sourceId: `places/${id}/photos/FIRST`,
        thumbnailUrl: null,
        fullUrl: null,
        width: 4000,
        height: 3000,
        attribution: {
          kind: 'google_places',
          authorAttributions: [{ displayName: 'Jane', uri: 'https://maps.google.com/contrib/1' }],
        },
      },
      {
        source: 'google_places',
        sourceId: `places/${id}/photos/SECOND`,
        thumbnailUrl: null,
        fullUrl: null,
        width: 4000,
        height: 3000,
        attribution: { kind: 'google_places', authorAttributions: [] },
      },
    ],
  };
}

function makeDeps(over: Partial<BackfillDeps> = {}): BackfillDeps & { [K in keyof BackfillDeps]: jest.Mock } {
  const liveness: Record<string, Liveness> = { [DEAD]: 'dead', [LIVE]: 'live', [FLAKY]: 'unknown' };
  return {
    fetchPlacePhotos: jest.fn(async () => googlePlace('Plaza Mayor')),
    searchPlacesWithPhotos: jest.fn(async () => [googlePlace('Somewhere Else', 'gp_other')]),
    searchWikimedia: jest.fn(async () => []),
    checkUrl: jest.fn(async (url: string) => liveness[url] ?? 'unknown'),
    ...over,
  } as never;
}

function memoryLedger(): Ledger & { entries: LedgerEntry[] } {
  const entries: LedgerEntry[] = [];
  return {
    entries,
    done: (id) => entries.some((e) => e.placeId === id),
    append: async (e) => {
      entries.push(e);
    },
  };
}

async function photosOf(placeId: string) {
  return (
    await ex(
      'SELECT id, source, source_id, uri, thumbnail_uri, is_primary, attribution FROM attachments WHERE place_id = ? ORDER BY created_at, id',
      [placeId],
    )
  ).rows;
}

const countAttachments = async () => Number(await readCell('SELECT count(*) FROM attachments'));

describe('place photo backfill', () => {
  beforeAll(() => {
    assertLocalDatabase();
    useUniqueUuids();
  });

  beforeEach(async () => {
    await resetTenantFixture();
    await seedPlace(P.dead, ALICE.id, 'Plaza Mayor', { gpid: 'gp_plaza' });
    await seedPhoto('att_dead', P.dead, 'upload', DEAD, 1);

    await seedPlace(P.live, ALICE.id, 'Plaza Mayor');
    await seedPhoto('att_live', P.live, 'upload', LIVE, 1);

    await seedPlace(P.repoint, ALICE.id, 'Plaza Mayor');
    await seedPhoto('att_repoint_dead', P.repoint, 'upload', DEAD, 1);
    await seedPhoto('att_repoint_google', P.repoint, 'google_places', '/api/photos/resolve/att_repoint_google', 0);

    await seedPlace(P.noPrimary, ALICE.id, 'Plaza Mayor');
    await seedPhoto('att_np_google', P.noPrimary, 'google_places', '/api/photos/resolve/att_np_google', 0);

    await seedPlace(P.flaky, ALICE.id, 'Plaza Mayor');
    await seedPhoto('att_flaky', P.flaky, 'upload', FLAKY, 1);

    await seedPlace(P.noMatch, ALICE.id, 'Unfindable Corner');
    await seedPhoto('att_nomatch', P.noMatch, 'upload', DEAD, 1);

    await seedPlace(P.bobDead, BOB.id, 'Plaza Mayor', { gpid: 'gp_plaza' });
    await seedPhoto('att_bob_dead', P.bobDead, 'upload', DEAD, 1);
  });

  it("loads only the caller's places", async () => {
    const places = await loadUserPlaces(ALICE.id);
    const ids = places.map((p) => p.id);
    expect(ids).toContain(P.dead);
    expect(ids).not.toContain(P.bobDead);
    expect(ids).not.toContain(FIXTURE.bobPlace);
  });

  it('dry-run decides every class and writes nothing', async () => {
    const before = await countAttachments();
    const reports: Record<string, string> = {};
    const summary = await runBackfill(await loadUserPlaces(ALICE.id), {
      userId: ALICE.id,
      mode: 'dry-run',
      deps: makeDeps(),
      onPlace: (r) => {
        reports[r.place.id] = r.decision!.action;
      },
    });

    expect(reports[P.dead]).toBe('attach');
    expect(reports[P.live]).toBe('keep');
    expect(reports[P.repoint]).toBe('repoint');
    expect(reports[P.noPrimary]).toBe('repoint');
    expect(reports[P.flaky]).toBe('retry-later');
    expect(reports[P.noMatch]).toBe('unmatched');
    expect(summary.errors).toBe(0);
    expect(await countAttachments()).toBe(before);
    expect(await photosOf(P.dead)).toHaveLength(1);
  });

  it('apply attaches the first Google photo like the dialog and makes it the only primary', async () => {
    const ledger = memoryLedger();
    await runBackfill(await loadUserPlaces(ALICE.id), {
      userId: ALICE.id,
      mode: 'apply',
      deps: makeDeps(),
      ledger,
    });

    const rows = await photosOf(P.dead);
    expect(rows).toHaveLength(2); // the dead screenshot is kept
    const dead = rows.find((r) => r.id === 'att_dead')!;
    const added = rows.find((r) => r.id !== 'att_dead')!;
    expect(dead.is_primary).toBe(0);
    expect(added.is_primary).toBe(1);
    expect(added.source).toBe('google_places');
    expect(added.source_id).toBe('places/gp_plaza/photos/FIRST');
    // A reference resolved on view, never a stored Google image URL.
    expect(added.uri).toBe(`/api/photos/resolve/${added.id}`);
    expect(added.thumbnail_uri).toBe(`/api/photos/resolve/${added.id}?w=400`);
    expect(JSON.parse(String(added.attribution))).toEqual({
      kind: 'google_places',
      authorAttributions: [{ displayName: 'Jane', uri: 'https://maps.google.com/contrib/1' }],
    });

    // Re-pointed to the already-attached working photo; nothing added.
    const repoint = await photosOf(P.repoint);
    expect(repoint).toHaveLength(2);
    expect(repoint.find((r) => r.id === 'att_repoint_google')!.is_primary).toBe(1);
    expect(repoint.find((r) => r.id === 'att_repoint_dead')!.is_primary).toBe(0);
    expect((await photosOf(P.noPrimary))[0].is_primary).toBe(1);

    // Untouched.
    expect((await photosOf(P.live))[0].is_primary).toBe(1);
    expect(await photosOf(P.live)).toHaveLength(1);
    expect(await photosOf(P.noMatch)).toHaveLength(1);
    expect((await photosOf(P.bobDead)).map((r) => [r.id, r.is_primary])).toEqual([['att_bob_dead', 1]]);

    // Retry-later places are not ledgered, so the next run tries them again.
    expect(ledger.done(P.flaky)).toBe(false);
    expect(ledger.done(P.dead)).toBe(true);
    expect(ledger.done(P.noMatch)).toBe(true);
  });

  it('a second run with the same ledger makes no calls and no writes', async () => {
    const ledger = memoryLedger();
    const places = await loadUserPlaces(ALICE.id);
    await runBackfill(places, { userId: ALICE.id, mode: 'apply', deps: makeDeps(), ledger });
    const after = await countAttachments();

    const deps = makeDeps();
    const summary = await runBackfill(await loadUserPlaces(ALICE.id), {
      userId: ALICE.id,
      mode: 'apply',
      deps,
      ledger,
    });
    expect(summary.skippedFromLedger).toBe(places.length - 1); // all but the flaky one
    expect(deps.fetchPlacePhotos).not.toHaveBeenCalled();
    expect(await countAttachments()).toBe(after);
  });

  it('a re-run with the ledger lost converges from the database without duplicating', async () => {
    await runBackfill(await loadUserPlaces(ALICE.id), {
      userId: ALICE.id,
      mode: 'apply',
      deps: makeDeps(),
      ledger: memoryLedger(),
    });
    const after = await countAttachments();

    const deps = makeDeps();
    const reports: Record<string, string> = {};
    await runBackfill(await loadUserPlaces(ALICE.id), {
      userId: ALICE.id,
      mode: 'apply',
      deps,
      ledger: memoryLedger(),
      onPlace: (r) => {
        reports[r.place.id] = r.decision!.action;
      },
    });

    expect(reports[P.dead]).toBe('keep');
    expect(deps.fetchPlacePhotos).not.toHaveBeenCalled();
    expect(await countAttachments()).toBe(after);
  });

  it('recovers a crash between attaching and promoting by re-pointing, not re-attaching', async () => {
    // A run that died after the insert: the photo is there but not primary.
    await seedPhoto('att_other', P.dead, 'upload', DEAD, 0);
    const half = await attachPhotoFromSource(
      ALICE.id,
      P.dead,
      googlePlace('Plaza Mayor').photos[0],
      'if-first',
    );
    expect(half.ok && half.attachment.isPrimary).toBe(0);
    const before = await countAttachments();

    const deps = makeDeps();
    await runBackfill(await loadUserPlaces(ALICE.id), {
      userId: ALICE.id,
      mode: 'apply',
      deps,
      ledger: memoryLedger(),
    });

    const rows = await photosOf(P.dead);
    const google = rows.filter((r) => r.source === 'google_places');
    expect(google).toHaveLength(1);
    expect(google[0].is_primary).toBe(1);
    expect(rows.filter((r) => r.is_primary === 1)).toHaveLength(1);
    expect(deps.fetchPlacePhotos).not.toHaveBeenCalledWith('gp_plaza');
    expect(await countAttachments()).toBe(before);
  });

  it('an upstream failure is an error to retry, not an unmatched place', async () => {
    const ledger = memoryLedger();
    const deps = makeDeps({
      fetchPlacePhotos: jest.fn(async () => {
        throw Object.assign(new Error('Google Places request failed: 503'), { status: 503 });
      }),
    });
    const summary = await runBackfill(await loadUserPlaces(ALICE.id), {
      userId: ALICE.id,
      mode: 'apply',
      deps,
      ledger,
    });
    expect(summary.errors).toBe(1);
    expect(ledger.done(P.dead)).toBe(false);
    expect(await photosOf(P.dead)).toHaveLength(1);
  });

  it('a stale stored Google id falls through to text search', async () => {
    const deps = makeDeps({
      fetchPlacePhotos: jest.fn(async () => {
        throw Object.assign(new Error('Google Places request failed: 404'), { status: 404 });
      }),
      searchPlacesWithPhotos: jest.fn(async () => [googlePlace('Plaza Mayor', 'gp_fresh')]),
    });
    const reports: Record<string, { action: string; via?: string }> = {};
    await runBackfill(await loadUserPlaces(ALICE.id), {
      userId: ALICE.id,
      mode: 'dry-run',
      deps,
      onPlace: (r) => {
        const d = r.decision!;
        reports[r.place.id] = { action: d.action, via: d.action === 'attach' ? d.match.via : undefined };
      },
    });
    expect(reports[P.dead]).toEqual({ action: 'attach', via: 'text-search' });
  });
});

describe('withRetry', () => {
  const noSleep = async () => {};

  it('retries rate limits and 5xx, then succeeds', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new RateLimitError(1))
      .mockRejectedValueOnce(Object.assign(new Error('x'), { status: 502 }))
      .mockResolvedValue('ok');
    await expect(withRetry(fn, { sleep: noSleep })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry a verdict such as 403', async () => {
    const fn = jest.fn().mockRejectedValue(Object.assign(new Error('x'), { status: 403 }));
    await expect(withRetry(fn, { sleep: noSleep })).rejects.toThrow('x');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after the attempt budget', async () => {
    const fn = jest.fn().mockRejectedValue(new RateLimitError(1));
    await expect(withRetry(fn, { attempts: 3, sleep: noSleep })).rejects.toBeInstanceOf(RateLimitError);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
