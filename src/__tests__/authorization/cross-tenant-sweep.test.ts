/**
 * @jest-environment node
 *
 * The cross-tenant sweep: one table, one entry per API route handler, run for
 * real against a real SQLite file.
 *
 * For every handler that takes a caller-supplied id, Alice (the caller) sends
 * Bob's ids and the sweep asserts, against the database rather than against a
 * mocked query builder:
 *
 *   1. the handler refuses — 404 or 403, unless the entry records a different
 *      status and says why;
 *   2. no write touched Bob — no row Bob owns (directly, or through its place,
 *      collection or source) was added, changed or removed, and no one else's
 *      row started naming anything of Bob's;
 *   3. nothing of Bob's came back — the response never carries a Bob value
 *      beyond the ids Alice herself supplied;
 *   4. no side effect acted for Bob — `del()`, the LLM and OCR services, the
 *      Google photo resolver and the rest never received a Bob value;
 *   5. Bob's data did not shape the answer — the request runs again after every
 *      value Bob owns is changed, and Alice's response must not move. This is
 *      what catches a leaked count or status total that carries no Bob string.
 *
 * A handler that carries several ids runs once with every id foreign, and once
 * per id with only that one foreign and the rest Alice's own: owning the
 * container is not owning the rows it names, so a route that checks the
 * collection and trusts the place id has to fail here. The routes that read id
 * lists out of an upload session also run with Bob's source planted in Alice's
 * own session.
 *
 * Every entry also runs with Alice's own ids (the owner control): it must
 * succeed and, for a write, change one of Alice's rows — so a refusal is shown
 * to stop a write that would otherwise happen, not a request the harness built
 * wrong. Handlers that take no id at all run as Alice and get checks 2-5 —
 * `DELETE /api/data/delete-all` must not delete Bob. And every entry must
 * answer an anonymous caller with 401 without touching anything.
 *
 * The completeness guard at the bottom fails when a route file exists with a
 * handler that has no entry here, or an entry names a handler that no longer
 * exists. A handler that cannot sensibly be swept gets `exempt` with the
 * reason, never silence.
 *
 * Only identity (`@/lib/auth-helpers`), blob deletion and the upstream
 * services are mocked; the handlers and the database are real. The fixture
 * import must stay first — see `../helpers/tenant-fixture`.
 */
import {
  ALICE,
  FIXTURE,
  apiRequest,
  assertLocalDatabase,
  resetTenantFixture,
  setSessionUploadedFiles,
  useUniqueUuids,
} from '../helpers/tenant-fixture';
import fs from 'fs';
import path from 'path';

jest.mock('@vercel/blob', () => ({
  del: jest.fn().mockResolvedValue(undefined),
  put: jest.fn().mockRejectedValue(new Error('blob writes are not available in the sweep')),
}));
jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  getCurrentUser: jest.fn(),
  isAuthError: jest.fn((e: unknown) => e instanceof Error && e.message === 'Unauthorized'),
}));
// next-auth ships ESM that jest does not transform; the completeness guard
// only needs the route module to load and re-export NextAuth's handlers.
jest.mock('@/lib/auth', () => ({
  handlers: { GET: jest.fn(), POST: jest.fn() },
  auth: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
}));
jest.mock('@/lib/llm-extraction-service', () => ({
  llmExtractionService: {
    initialize: jest.fn().mockResolvedValue(undefined),
    updateConfig: jest.fn(),
    batchExtract: jest.fn().mockResolvedValue({ success: false, results: [], errors: ['mocked'] }),
    getServiceStats: jest.fn().mockResolvedValue({ initialized: false, health: {}, config: {} }),
    getAllProcessingStatuses: jest.fn().mockReturnValue([]),
  },
}));
jest.mock('@/lib/ocr-service-server', () => {
  const processImageBuffer = jest.fn().mockRejectedValue(new Error('OCR is not available in the sweep'));
  return {
    ocrServiceServer: { processImageBuffer },
    OCRServiceServer: jest.fn().mockImplementation(() => ({ processImageBuffer })),
  };
});
jest.mock('@/lib/gemini-vision-service', () => {
  const extractTextFromImage = jest.fn().mockRejectedValue(new Error('Gemini is not available in the sweep'));
  return { getGeminiVisionService: () => ({ extractTextFromImage }) };
});
jest.mock('@/lib/photo-sources/google-resolver', () => ({
  resolveGooglePhoto: jest.fn().mockResolvedValue({ photoUri: 'https://photos.example.test/resolved.jpg' }),
}));
jest.mock('@/lib/photo-sources', () => {
  const actual = jest.requireActual('@/lib/photo-sources');
  const search = jest.fn().mockResolvedValue({ items: [], page: 1, hasMore: false });
  return { ...actual, getAdapter: jest.fn(() => ({ search })) };
});
jest.mock('@/lib/mass-upload/dispatch', () => ({
  dispatchProcessors: jest.fn().mockResolvedValue({ dispatched: 0 }),
}));

import { requireAuthForApi } from '@/lib/auth-helpers';
import { del } from '@vercel/blob';
import { llmExtractionService } from '@/lib/llm-extraction-service';
import { ocrServiceServer } from '@/lib/ocr-service-server';
import { resolveGooglePhoto } from '@/lib/photo-sources/google-resolver';
import { getAdapter } from '@/lib/photo-sources';
import { dispatchProcessors } from '@/lib/mass-upload/dispatch';

// ---------------------------------------------------------------------------
// Tenants
// ---------------------------------------------------------------------------

/** Every kind of id a route can take, for one tenant. */
interface TenantIds {
  place: string;
  /** A second place, for routes that take two (merge, dismiss-duplicate). */
  place2: string;
  collection: string;
  source: string;
  session: string;
  attachment: string;
  link: string;
  reservation: string;
}
type Slot = keyof TenantIds;
/** `all` = every id the request carries is foreign; a slot = only that one. */
type VariantKey = 'all' | Slot;

const BOB_IDS: TenantIds = {
  place: FIXTURE.bobPlace,
  place2: 'plc_bob_second',
  collection: FIXTURE.bobCollection,
  source: FIXTURE.bobSource,
  session: FIXTURE.bobSession,
  attachment: 'att_bob_photo',
  link: 'lnk_bob',
  reservation: 'rsv_bob',
};

const ALICE_IDS: TenantIds = {
  place: FIXTURE.alicePlace,
  place2: 'plc_alice_second',
  collection: FIXTURE.aliceCollection,
  source: FIXTURE.aliceSource,
  session: FIXTURE.aliceSession,
  attachment: 'att_alice_photo',
  link: 'lnk_alice',
  reservation: 'rsv_alice',
};

/**
 * Every value seeded for Bob contains "bob" (ids, names, notes, OCR text, blob
 * URLs, the photo name, the confirmation number). That turns "did anything of
 * Bob's leak or get touched" into one case-insensitive search.
 */
const BOB_MARKER = /bob/i;

type Exec = (query: { sql: string; args: unknown[] }) => Promise<{ rows: Record<string, unknown>[] }>;
function dbExec(): Exec {
  const { client } = require('@/db') as { client: { execute: Exec } };
  return (q) => client.execute(q);
}

/**
 * The rows the fixture does not seed: a second place each, an attachment, a
 * link, a reservation, a source-to-place edge and a dismissed pair.
 */
async function seedSweepRows(): Promise<void> {
  const ex = dbExec();
  const now = new Date().toISOString();
  const run = (sql: string, args: unknown[] = []) => ex({ sql, args });

  for (const [owner, ids, label] of [
    [ALICE.id, ALICE_IDS, 'alice'],
    ['user_bob', BOB_IDS, 'bob'],
  ] as const) {
    await run(
      `INSERT INTO places (id,user_id,name,kind,status,notes,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [ids.place2, owner, `${label} second place`, 'cafe', 'library', `${label} second note`, now, now]
    );
    await run(
      `INSERT INTO attachments (id,place_id,type,uri,filename,thumbnail_uri,is_primary,source,source_id,attribution,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [ids.attachment, ids.place, 'photo', `https://store.public.blob.vercel-storage.com/${label}-photo.jpg`,
       `${label}-photo.jpg`, `https://store.public.blob.vercel-storage.com/${label}-thumb.jpg`, 0,
       'google_places', `places/${label}/photos/${label}-photo-name`,
       JSON.stringify({ kind: 'google_places', authorAttributions: [] }), now]
    );
    await run(`UPDATE places SET google_place_id = ? WHERE id = ?`, [`ChIJ_${label}_google`, ids.place]);
    await run(
      `INSERT INTO place_links (id,place_id,url,title,created_at) VALUES (?,?,?,?,?)`,
      [ids.link, ids.place, `https://example.com/${label}-link`, `${label} link`, now]
    );
    await run(
      `INSERT INTO reservations (id,place_id,reservation_date,confirmation_number,notes,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?)`,
      [ids.reservation, ids.place, '2027-01-01', `${label.toUpperCase()}-CONF-777`, `${label} reservation note`, now, now]
    );
    await run(
      `INSERT INTO sources_to_places (source_id,place_id) VALUES (?,?)`,
      [ids.source, ids.place]
    );
    // Give the owner controls something to change: an order to rewrite, and a
    // session that tracks the tenant's own source (the fixture leaves it out).
    await run(
      `UPDATE places_to_collections SET order_index = 5 WHERE collection_id = ?`,
      [ids.collection]
    );
    await run(`UPDATE upload_sessions SET meta = ? WHERE id = ?`, [
      JSON.stringify({ uploadedFiles: [ids.source], errors: [] }),
      ids.session,
    ]);
    await run(
      `INSERT INTO dismissed_duplicates (id,user_id,place_id_1,place_id_2,reason) VALUES (?,?,?,?,?)`,
      [`dd_${label}`, owner, ids.place, ids.place2, `${label} dismissed reason`]
    );
  }
}

async function resetWorld(): Promise<void> {
  const ex = dbExec();
  // A throwaway file, so trade durability for a ~100x faster reset. Re-applied
  // every time: libSQL hands the client a fresh connection after a handler
  // runs a transaction, and the pragma is per connection.
  await ex({ sql: 'PRAGMA synchronous = OFF', args: [] });
  // Rows with a no-action foreign key to `users` go first, or the fixture's
  // `DELETE FROM users` trips the constraint.
  for (const table of ['dismissed_duplicates', 'merge_logs']) {
    await ex({ sql: `DELETE FROM ${table}`, args: [] });
  }
  await resetTenantFixture();
  await seedSweepRows();
}

/**
 * Change every value Bob owns that a response could be built from — names,
 * statuses, counts, notes, OCR text — and give Bob more rows of every kind.
 * The ids the requests carry all still exist. Alice's response must not move:
 * if it does, Bob's data shaped it, even when no "bob" string came back (a
 * count, a status total, an ordering).
 */
async function perturbBob(): Promise<void> {
  const ex = dbExec();
  const run = (sql: string, args: unknown[] = []) => ex({ sql, args });
  const now = new Date().toISOString();
  await run(
    `INSERT INTO places (id,user_id,name,kind,status,notes,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    ['plc_bob_extra', 'user_bob', 'bob extra place', 'hotel', 'inbox', 'bob extra note', now, now]
  );
  await run(
    `INSERT INTO collections (id,user_id,name,created_at,updated_at) VALUES (?,?,?,?,?)`,
    ['col_bob_extra', 'user_bob', 'bob extra collection', now, now]
  );
  await run(
    `INSERT INTO places_to_collections (place_id,collection_id,order_index,is_pinned,note) VALUES (?,?,?,?,?)`,
    ['plc_bob_extra', BOB_IDS.collection, 1, 0, 'bob extra membership note']
  );
  await run(
    `INSERT INTO places_to_collections (place_id,collection_id,order_index,is_pinned,note) VALUES (?,?,?,?,?)`,
    ['plc_bob_extra', 'col_bob_extra', 0, 0, 'bob extra collection note']
  );
  await run(
    `INSERT INTO upload_sessions (id,user_id,started_at,file_count,completed_count,failed_count,status,meta)
     VALUES (?,?,?,?,?,?,?,?)`,
    ['session_bob_extra', 'user_bob', now, 1, 1, 0, 'active',
     JSON.stringify({ uploadedFiles: ['src_bob_extra'], errors: [] })]
  );
  await run(
    `INSERT INTO sources (id,user_id,type,uri,ocr_text,processing_status,meta,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    ['src_bob_extra', 'user_bob', 'screenshot', 'https://store.public.blob.vercel-storage.com/bob-extra.jpg',
     'bob extra OCR text', 'completed',
     JSON.stringify({ uploadInfo: { sessionId: 'session_bob_extra', originalName: 'bob-extra.png' } }), now, now]
  );
  await run(`INSERT INTO sources_to_places (source_id,place_id) VALUES (?,?)`, ['src_bob_extra', 'plc_bob_extra']);
  await run(
    `INSERT INTO dismissed_duplicates (id,user_id,place_id_1,place_id_2,reason) VALUES (?,?,?,?,?)`,
    ['dd_bob_extra', 'user_bob', BOB_IDS.place2, 'plc_bob_extra', 'bob extra dismissed reason']
  );

  await run(`UPDATE places SET name = name || ' (bob perturbed)', status = 'archived', city = 'Bobville',
             notes = 'bob perturbed note', rating_self = 1 WHERE user_id = 'user_bob'`);
  await run(`UPDATE collections SET name = name || ' (bob perturbed)', description = 'bob perturbed'
             WHERE user_id = 'user_bob'`);
  await run(`UPDATE places_to_collections SET note = 'bob perturbed note', order_index = 7, is_pinned = 0
             WHERE collection_id IN (SELECT id FROM collections WHERE user_id = 'user_bob')`);
  await run(`UPDATE sources SET processing_status = 'failed', processing_error = 'bob perturbed 503 failure',
             ocr_text = 'bob perturbed OCR text, long enough to be processed' WHERE user_id = 'user_bob'`);
  await run(`UPDATE upload_sessions SET status = 'completed', file_count = 9, completed_count = 9
             WHERE user_id = 'user_bob'`);
  await run(`UPDATE reservations SET notes = 'bob perturbed', status = 'cancelled'
             WHERE place_id IN (SELECT id FROM places WHERE user_id = 'user_bob')`);
  await run(`UPDATE attachments SET is_primary = 1, caption = 'bob perturbed'
             WHERE place_id IN (SELECT id FROM places WHERE user_id = 'user_bob')`);
  await run(`UPDATE dismissed_duplicates SET reason = 'bob perturbed' WHERE user_id = 'user_bob'`);
}

/** Every row of every table, as `table:json` strings (a multiset). */
async function snapshot(): Promise<string[]> {
  const ex = dbExec();
  const tables = await ex({
    sql: `SELECT name FROM sqlite_master WHERE type='table'
          AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_\\_%' ESCAPE '\\' ORDER BY name`,
    args: [],
  });
  const out: string[] = [];
  for (const { name } of tables.rows) {
    const rows = await ex({ sql: `SELECT * FROM "${String(name)}"`, args: [] });
    for (const row of rows.rows) out.push(`${String(name)}:${JSON.stringify(row)}`);
  }
  return out.sort();
}

/** Rows present in `a` and not in `b`, respecting multiplicity. */
function minus(a: string[], b: string[]): string[] {
  const remaining = new Map<string, number>();
  for (const row of b) remaining.set(row, (remaining.get(row) ?? 0) + 1);
  return a.filter((row) => {
    const n = remaining.get(row) ?? 0;
    if (n > 0) {
      remaining.set(row, n - 1);
      return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

interface RequestSpec {
  url: string;
  body?: unknown;
  params?: Record<string, string>;
}

interface Case {
  /** Shown in the test name when a handler has more than one case. */
  name?: string;
  /** The tenant ids this request carries. Empty for a handler that takes none. */
  slots: Slot[];
  request: (t: TenantIds) => RequestSpec;
  /**
   * Statuses accepted when an id is foreign. Defaults to 404/403. A list
   * applies to every variant; a map sets them per variant (`all` = every id
   * foreign, a slot name = only that id foreign) and the rest keep the
   * default. Anything but 404/403 must say why in `because` — and is still
   * held to "no write, no leak".
   */
  refuses?: number[] | Partial<Record<VariantKey, number[]>>;
  because?: string;
  /** Statuses expected for Alice's own ids. Defaults to any 2xx. */
  owner?: number[];
  /**
   * A write handler's owner control must change one of the caller's rows —
   * that is what shows the refusal stopped a write that would otherwise
   * happen. Set this, with the reason, when the owner call writes nothing.
   */
  ownerWritesNothing?: string;
  /** Extra proof the owner control reached the work, for handlers that store nothing. */
  ownerReaches?: () => void;
  /**
   * Runs after the reset and before the call; returns the foreign ids it
   * planted in the caller's own rows, which the caller can then see.
   */
  setup?: () => Promise<string[]>;
  /**
   * The handler writes a row owned by the caller that names a foreign id.
   * Allowed only with a reason that explains why it reaches nobody else.
   */
  callerRowMayNameForeignId?: string;
}

type Entry = Case | Case[] | { exempt: string };
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';

const API = 'http://localhost/api';

// Reasons shared by entries whose refusal is not a 404/403. Each is still held
// to "no write, no leak"; the status is recorded so a change is noticed.
const MUTATION_THROWS =
  'Refused by the userId-scoped function in db-mutations, which throws "not found or unauthorized"; ' +
  'the route maps every throw to 500 instead of 404.';
/**
 * Owning a container is not owning the rows it names. These cases put Bob's
 * source id inside Alice's own upload session — the shape `mass-upload/status`
 * leaked through while its session check was correct — and call with Alice's
 * session, so only a row-level scope can keep Bob's source out.
 */
const PLANTED_IN_OWN_SESSION: Pick<Case, 'name' | 'slots' | 'setup'> = {
  name: "Bob's source planted in Alice's own session",
  slots: [],
  setup: async () => {
    // A mixed list: the handler should act on Alice's source and not on Bob's.
    await setSessionUploadedFiles(FIXTURE.aliceSession, [FIXTURE.aliceSource, FIXTURE.bobSource]);
    return [FIXTURE.bobSource];
  },
};
const SCOPED_QUERY_EMPTY =
  'The caller-scoped query matches nothing, so the handler answers 200 with an empty result and writes nothing.';

const ROUTES: Record<string, Partial<Record<Method, Entry>>> = {
  // --- auth & upload plumbing --------------------------------------------
  'auth/[...nextauth]': {
    GET: { exempt: 'NextAuth\'s own handlers; they take no tenant id and serve sign-in, not tenant data.' },
    POST: { exempt: 'NextAuth\'s own handlers; they take no tenant id and serve sign-in, not tenant data.' },
  },
  'auth/register': {
    POST: { exempt: 'Runs before the user exists, so there is no tenant to cross.' },
  },
  'blob/upload': {
    POST: { exempt: 'Mints a Vercel Blob client token for a caller-proposed key; reads and writes no tenant row.' },
  },

  // --- collections ---------------------------------------------------------
  'collections': {
    GET: { slots: [], request: () => ({ url: `${API}/collections` }) },
    POST: {
      slots: [],
      request: () => ({ url: `${API}/collections`, body: { name: 'sweep collection' } }),
    },
  },
  'collections/[id]': {
    GET: { slots: ['collection'], request: (t) => ({ url: `${API}/collections/${t.collection}`, params: { id: t.collection } }) },
    PATCH: {
      slots: ['collection'],
      request: (t) => ({ url: `${API}/collections/${t.collection}`, params: { id: t.collection }, body: { name: 'renamed by sweep' } }),
      refuses: [500],
      because: MUTATION_THROWS,
    },
    DELETE: {
      slots: ['collection'],
      request: (t) => ({ url: `${API}/collections/${t.collection}`, params: { id: t.collection } }),
      refuses: [500],
      because: MUTATION_THROWS,
    },
  },
  'collections/[id]/available-images': {
    GET: { slots: ['collection'], request: (t) => ({ url: `${API}/collections/${t.collection}/available-images`, params: { id: t.collection } }) },
  },
  'collections/[id]/cover': {
    DELETE: { slots: ['collection'], request: (t) => ({ url: `${API}/collections/${t.collection}/cover`, params: { id: t.collection } }) },
  },
  'collections/[id]/cover/blob-complete': {
    POST: {
      slots: ['collection'],
      request: (t) => ({
        url: `${API}/collections/${t.collection}/cover/blob-complete`,
        params: { id: t.collection },
        body: { blobUrl: 'https://store.public.blob.vercel-storage.com/sweep-cover.jpg' },
      }),
    },
  },
  'collections/[id]/days': {
    GET: { slots: ['collection'], request: (t) => ({ url: `${API}/collections/${t.collection}/days`, params: { id: t.collection } }) },
    PATCH: {
      slots: ['collection', 'place'],
      request: (t) => ({
        url: `${API}/collections/${t.collection}/days`,
        params: { id: t.collection },
        body: { dayBuckets: [{ id: 'day-1', dayNumber: 1, placeIds: [t.place] }], unscheduledPlaceIds: [] },
      }),
      refuses: { all: [500], collection: [500], place: [200] },
      because:
        'A foreign collection throws in saveDayBuckets (500). The place ids are not checked: in the ' +
        'caller\'s own collection they are stored as given (200) — see callerRowMayNameForeignId.',
      callerRowMayNameForeignId:
        'day_buckets is JSON on the caller\'s own collection row. Nothing on the server dereferences its ' +
        'place ids; the day planner only matches them against the places the scoped collection query ' +
        'already returned, so a foreign id renders as nothing and reaches no one else.',
    },
  },
  'collections/[id]/days/auto-schedule': {
    POST: {
      slots: ['collection'],
      request: (t) => ({
        url: `${API}/collections/${t.collection}/days/auto-schedule`,
        params: { id: t.collection },
        body: { hoursPerDay: 8, transportMode: 'walk' },
      }),
      refuses: [200],
      because: SCOPED_QUERY_EMPTY,
      ownerWritesNothing: 'Computes a proposed schedule and returns it; saving it is PATCH /days.',
    },
  },
  'collections/[id]/export/csv': {
    GET: { slots: ['collection'], request: (t) => ({ url: `${API}/collections/${t.collection}/export/csv`, params: { id: t.collection } }) },
  },
  'collections/[id]/places': {
    POST: {
      // place2 is in neither tenant's collection, so the owner control adds it.
      slots: ['collection', 'place2'],
      request: (t) => ({
        url: `${API}/collections/${t.collection}/places`,
        params: { id: t.collection },
        body: { placeIds: [t.place2] },
      }),
      refuses: [207],
      because:
        'addPlaceToCollection checks that both the place and the collection are the caller\'s and throws ' +
        'otherwise; the route reports per-id failures as 207 Multi-Status.',
    },
  },
  'collections/[id]/places/[placeId]': {
    DELETE: {
      slots: ['collection', 'place'],
      request: (t) => ({
        url: `${API}/collections/${t.collection}/places/${t.place}`,
        params: { id: t.collection, placeId: t.place },
      }),
      refuses: { all: [500], collection: [500], place: [200] },
      because:
        'A foreign collection throws in removePlaceFromCollection (500); in the caller\'s own collection ' +
        'the delete matches no membership row for a foreign place and answers 200.',
    },
  },
  'collections/[id]/places/[placeId]/note': {
    PATCH: {
      slots: ['collection', 'place'],
      request: (t) => ({
        url: `${API}/collections/${t.collection}/places/${t.place}/note`,
        params: { id: t.collection, placeId: t.place },
        body: { note: 'overwritten by sweep' },
      }),
      refuses: { all: [500], collection: [500], place: [200] },
      because:
        'updatePlaceNote throws for a foreign collection (500); in the caller\'s own collection the update ' +
        'matches no membership row for a foreign place and answers 200.',
    },
  },
  'collections/[id]/places/[placeId]/pin': {
    PATCH: {
      slots: ['collection', 'place'],
      request: (t) => ({
        url: `${API}/collections/${t.collection}/places/${t.place}/pin`,
        params: { id: t.collection, placeId: t.place },
      }),
      refuses: [500],
      because: MUTATION_THROWS,
    },
  },
  'collections/[id]/reorder': {
    PATCH: {
      slots: ['collection', 'place'],
      request: (t) => ({
        url: `${API}/collections/${t.collection}/reorder`,
        params: { id: t.collection },
        body: { placeIds: [t.place] },
      }),
      refuses: { all: [500], collection: [500], place: [200] },
      because:
        'reorderPlacesInCollection throws for a foreign collection (500); in the caller\'s own collection ' +
        'it updates order only on membership rows that exist, so a foreign place changes nothing (200).',
    },
  },
  'collections/[id]/settings': {
    PATCH: {
      slots: ['collection'],
      request: (t) => ({
        url: `${API}/collections/${t.collection}/settings`,
        params: { id: t.collection },
        body: { transportMode: 'drive' },
      }),
      refuses: [500],
      because: MUTATION_THROWS,
    },
  },

  // --- account-wide data ---------------------------------------------------
  'data/delete-all': {
    DELETE: { slots: [], request: () => ({ url: `${API}/data/delete-all` }) },
  },
  'export': {
    POST: [
      {
        name: 'collection scope',
        slots: ['collection'],
        request: (t) => ({ url: `${API}/export`, body: { scope: { type: 'collection', collectionId: t.collection }, format: 'csv' } }),
        ownerWritesNothing: 'Builds an export file from a read; POST only because the scope is a body.',
      },
      {
        name: 'selected places',
        slots: ['place'],
        request: (t) => ({ url: `${API}/export`, body: { scope: { type: 'selected', placeIds: [t.place] }, format: 'csv' } }),
        refuses: [500],
        because: 'exportData selects only the caller\'s places, finds none, and throws "No places found to export" (500).',
        ownerWritesNothing: 'Builds an export file from a read; POST only because the scope is a body.',
      },
    ],
  },
  'export/all': {
    GET: { slots: [], request: () => ({ url: `${API}/export/all` }) },
  },
  'export/preview': {
    GET: [
      {
        name: 'collection scope',
        slots: ['collection'],
        request: (t) => ({ url: `${API}/export/preview?scope=${encodeURIComponent(JSON.stringify({ type: 'collection', collectionId: t.collection }))}` }),
        refuses: [200],
        because: SCOPED_QUERY_EMPTY,
      },
      {
        name: 'selected places',
        slots: ['place'],
        request: (t) => ({ url: `${API}/export/preview?scope=${encodeURIComponent(JSON.stringify({ type: 'selected', placeIds: [t.place] }))}` }),
        refuses: [200],
        because: SCOPED_QUERY_EMPTY,
      },
    ],
  },
  'google-places/autocomplete': {
    GET: { exempt: 'Proxies Google Places autocomplete; the only id it takes is Google\'s, and it reads no tenant row.' },
  },
  'google-places/details': {
    GET: { exempt: 'Proxies Google Place Details for a Google place id; it reads no tenant row.' },
  },
  'import/execute': {
    POST: {
      slots: ['collection'],
      request: (t) => ({
        url: `${API}/import/execute`,
        body: {
          rows: [['Imported by sweep']],
          mappings: [{ sourceColumn: 'Name', sourceIndex: 0, targetField: 'name', confidence: 1 }],
          options: { confidentMode: true, targetStatus: 'library', collectionId: t.collection, template: 'auto' },
        },
      }),
      refuses: [500],
      because: MUTATION_THROWS,
    },
  },
  'import/parse': {
    POST: { exempt: 'Parses an uploaded CSV/XLSX into a preview; takes no id and touches no table.' },
  },

  // --- LLM processing ------------------------------------------------------
  'llm-process': {
    POST: [
      {
        name: 'by sourceIds',
        slots: ['source'],
        request: (t) => ({ url: `${API}/llm-process`, body: { sourceIds: [t.source] } }),
        refuses: [200],
        because: SCOPED_QUERY_EMPTY,
        ownerWritesNothing: 'Extraction is mocked to return nothing, so there is nothing to store.',
        ownerReaches: () => expect(llmExtractionService.batchExtract).toHaveBeenCalled(),
      },
      {
        name: 'by sessionId',
        slots: ['session'],
        request: (t) => ({ url: `${API}/llm-process`, body: { sessionId: t.session } }),
        ownerWritesNothing: 'Extraction is mocked to return nothing, so there is nothing to store.',
        ownerReaches: () => expect(llmExtractionService.batchExtract).toHaveBeenCalled(),
      },
      {
        ...PLANTED_IN_OWN_SESSION,
        request: (t) => ({ url: `${API}/llm-process`, body: { sessionId: t.session } }),
        ownerWritesNothing: 'Extraction is mocked to return nothing, so there is nothing to store.',
        ownerReaches: () => expect(llmExtractionService.batchExtract).toHaveBeenCalled(),
      },
    ],
    GET: { slots: [], request: () => ({ url: `${API}/llm-process` }) },
  },
  'llm-process/batch': {
    POST: [
      {
        slots: ['session'],
        request: (t) => ({ url: `${API}/llm-process/batch`, body: { sessionIds: [t.session] } }),
        refuses: [200],
        because: SCOPED_QUERY_EMPTY,
        ownerWritesNothing: 'Extraction is mocked to return nothing, so there is nothing to store.',
        ownerReaches: () => expect(llmExtractionService.batchExtract).toHaveBeenCalled(),
      },
      {
        ...PLANTED_IN_OWN_SESSION,
        request: (t) => ({ url: `${API}/llm-process/batch`, body: { sessionIds: [t.session] } }),
        ownerWritesNothing: 'Extraction is mocked to return nothing, so there is nothing to store.',
        ownerReaches: () => expect(llmExtractionService.batchExtract).toHaveBeenCalled(),
      },
    ],
    GET: { slots: [], request: () => ({ url: `${API}/llm-process/batch` }) },
  },
  'llm-process/status': {
    GET: {
      slots: ['session'],
      request: (t) => ({ url: `${API}/llm-process/status?sessionId=${t.session}` }),
      refuses: [200],
      because:
        'The sessionId only filters the caller\'s own in-memory queue entries ' +
        '(getAllProcessingStatuses(user.id)); a foreign id matches nothing and the 200 carries no session data.',
    },
    OPTIONS: { exempt: 'CORS preflight; returns static headers and reads nothing.' },
  },

  // --- mass upload ---------------------------------------------------------
  'mass-upload/cancel': {
    POST: [
      { slots: ['session'], request: (t) => ({ url: `${API}/mass-upload/cancel`, body: { sessionId: t.session } }) },
      { ...PLANTED_IN_OWN_SESSION, request: (t) => ({ url: `${API}/mass-upload/cancel`, body: { sessionId: t.session } }) },
    ],
  },
  'mass-upload/cron': {
    GET: { exempt: 'System route authenticated by CRON_SECRET; it has no user and takes no caller-supplied id.' },
  },
  'mass-upload/dev-trigger': {
    POST: { exempt: '404s outside NODE_ENV=development, then only re-invokes the cron handler; takes no id.' },
  },
  'mass-upload/process': {
    POST: { exempt: 'System route authenticated by CRON_SECRET; it has no user and takes no caller-supplied id.' },
  },
  'mass-upload/register': {
    POST: {
      slots: ['session'],
      request: (t) => ({
        url: `${API}/mass-upload/register`,
        body: {
          sessionId: t.session,
          blobUrl: 'https://store.public.blob.vercel-storage.com/sweep-register.jpg',
          originalName: 'sweep.png',
          fileSize: 10,
          mimeType: 'image/png',
        },
      }),
    },
  },
  'mass-upload/start': {
    POST: [
      { slots: ['session'], request: (t) => ({ url: `${API}/mass-upload/start`, body: { sessionId: t.session } }) },
      { ...PLANTED_IN_OWN_SESSION, request: (t) => ({ url: `${API}/mass-upload/start`, body: { sessionId: t.session } }) },
    ],
  },
  'mass-upload/status': {
    GET: [
      { slots: ['session'], request: (t) => ({ url: `${API}/mass-upload/status?sessionId=${t.session}` }) },
      { ...PLANTED_IN_OWN_SESSION, request: (t) => ({ url: `${API}/mass-upload/status?sessionId=${t.session}` }) },
    ],
  },

  // --- photos --------------------------------------------------------------
  'photos/resolve/[attachmentId]': {
    GET: {
      slots: ['attachment'],
      request: (t) => ({ url: `${API}/photos/resolve/${t.attachment}`, params: { attachmentId: t.attachment } }),
      owner: [302],
    },
  },
  'photos/search': {
    GET: {
      slots: ['place'],
      request: (t) => ({ url: `${API}/photos/search?source=google_places&q=cafe&placeId=${t.place}` }),
    },
  },

  // --- places --------------------------------------------------------------
  'places': {
    GET: { slots: [], request: () => ({ url: `${API}/places` }) },
    POST: {
      slots: [],
      request: () => ({ url: `${API}/places`, body: { name: 'sweep place', kind: 'cafe' } }),
    },
  },
  'places/[id]': {
    GET: { slots: ['place'], request: (t) => ({ url: `${API}/places/${t.place}`, params: { id: t.place } }) },
    PATCH: {
      slots: ['place'],
      request: (t) => ({ url: `${API}/places/${t.place}`, params: { id: t.place }, body: { name: 'renamed by sweep' } }),
    },
    DELETE: { slots: ['place'], request: (t) => ({ url: `${API}/places/${t.place}`, params: { id: t.place } }) },
  },
  'places/[id]/attachments/[attachmentId]': {
    DELETE: {
      slots: ['place', 'attachment'],
      request: (t) => ({
        url: `${API}/places/${t.place}/attachments/${t.attachment}`,
        params: { id: t.place, attachmentId: t.attachment },
      }),
    },
  },
  'places/[id]/attachments/[attachmentId]/primary': {
    PUT: {
      slots: ['place', 'attachment'],
      request: (t) => ({
        url: `${API}/places/${t.place}/attachments/${t.attachment}/primary`,
        params: { id: t.place, attachmentId: t.attachment },
      }),
    },
  },
  'places/[id]/attachments/blob-complete': {
    POST: {
      slots: ['place'],
      request: (t) => ({
        url: `${API}/places/${t.place}/attachments/blob-complete`,
        params: { id: t.place },
        body: {
          blobUrl: 'https://store.public.blob.vercel-storage.com/sweep-attachment.jpg',
          originalName: 'sweep.jpg',
          fileSize: 10,
          mimeType: 'image/jpeg',
        },
      }),
    },
  },
  'places/[id]/attachments/from-source': {
    POST: {
      slots: ['place'],
      request: (t) => ({
        url: `${API}/places/${t.place}/attachments/from-source`,
        params: { id: t.place },
        body: {
          source: 'google_places',
          sourceId: 'places/sweep/photos/new-photo',
          thumbnailUrl: null,
          fullUrl: null,
          width: null,
          height: null,
          attribution: { kind: 'google_places', authorAttributions: [] },
        },
      }),
    },
  },
  'places/[id]/links': {
    POST: {
      slots: ['place'],
      request: (t) => ({ url: `${API}/places/${t.place}/links`, params: { id: t.place }, body: { url: 'https://example.com/sweep' } }),
      refuses: [500],
      because: MUTATION_THROWS,
    },
  },
  'places/[id]/reservations': {
    POST: {
      slots: ['place'],
      request: (t) => ({
        url: `${API}/places/${t.place}/reservations`,
        params: { id: t.place },
        body: { reservationDate: '2027-02-02' },
      }),
      refuses: [500],
      because: MUTATION_THROWS,
    },
  },
  'places/[id]/reservations/[reservationId]': {
    PATCH: {
      slots: ['place', 'reservation'],
      request: (t) => ({
        url: `${API}/places/${t.place}/reservations/${t.reservation}`,
        params: { id: t.place, reservationId: t.reservation },
        body: { notes: 'overwritten by sweep' },
      }),
      refuses: { all: [500], reservation: [500], place: [200] },
      because:
        'The reservation is scoped to the caller through its place and a foreign one throws (500). The ' +
        '[id] segment is never read, so a foreign place id with the caller\'s own reservation acts on the ' +
        'caller\'s own reservation (200).',
    },
    DELETE: {
      slots: ['place', 'reservation'],
      request: (t) => ({
        url: `${API}/places/${t.place}/reservations/${t.reservation}`,
        params: { id: t.place, reservationId: t.reservation },
      }),
      refuses: { all: [500], reservation: [500], place: [200] },
      because:
        'The reservation is scoped to the caller through its place and a foreign one throws (500). The ' +
        '[id] segment is never read, so a foreign place id with the caller\'s own reservation acts on the ' +
        'caller\'s own reservation (200).',
    },
  },
  'places/bulk-actions': {
    POST: [
      ...(['confirm', 'archive', 'restore', 'delete'] as const).map((action): Case => ({
        name: action,
        slots: ['place'],
        request: (t) => ({ url: `${API}/places/bulk-actions`, body: { action, placeIds: [t.place] } }),
        refuses: [500],
        because: 'The userId-scoped batch update/delete matches no row; the route answers 500 "No places were updated".',
      })),
    ],
    GET: { exempt: 'Returns static API documentation; reads nothing.' },
  },
  'places/bulk-merge': {
    POST: {
      slots: ['place', 'place2'],
      request: (t) => ({
        url: `${API}/places/bulk-merge`,
        body: { clusters: [{ targetId: t.place, sourceIds: [t.place2], confidence: 0.9 }] },
      }),
      refuses: [200],
      because:
        'bulkMergePlaces refuses any cluster whose places are not all the caller\'s and reports it as a ' +
        'per-cluster error inside a 200.',
    },
  },
  'places/dismiss-duplicate': {
    POST: {
      slots: ['place', 'place2'],
      request: (t) => ({
        url: `${API}/places/dismiss-duplicate`,
        body: { pairs: [{ placeId1: t.place, placeId2: t.place2 }] },
      }),
      refuses: [200],
      because: 'Writes only a row owned by the caller — see callerRowMayNameForeignId.',
      callerRowMayNameForeignId:
        'The dismissed pair is stored with user_id = caller. dismissed_duplicates has no unique constraint ' +
        'or foreign key on the place ids, and every read filters on user_id, so a pair naming someone ' +
        'else\'s place is visible to, and affects, only the caller.',
    },
    DELETE: {
      slots: ['place', 'place2'],
      request: (t) => ({
        url: `${API}/places/dismiss-duplicate`,
        body: { pairs: [{ placeId1: t.place, placeId2: t.place2 }] },
      }),
      refuses: [200],
      because: 'The delete is scoped to the caller\'s own rows; a pair naming a foreign place matches none.',
    },
    GET: { slots: [], request: () => ({ url: `${API}/places/dismiss-duplicate` }) },
  },
  'places/duplicates': {
    GET: [
      {
        name: 'single mode',
        slots: ['place'],
        request: (t) => ({ url: `${API}/places/duplicates?mode=single&placeId=${t.place}` }),
      },
      {
        name: 'whole library',
        slots: [],
        request: () => ({ url: `${API}/places/duplicates?mode=batch` }),
      },
    ],
    DELETE: {
      slots: [],
      request: () => ({ url: `${API}/places/duplicates` }),
      ownerWritesNothing: 'Clears the in-process duplicate-detection cache; it writes no row.',
    },
    OPTIONS: { exempt: 'Returns static API documentation; reads nothing.' },
  },
  'places/merge': {
    POST: {
      slots: ['place', 'place2'],
      request: (t) => ({ url: `${API}/places/merge`, body: { sourceId: t.place2, targetId: t.place } }),
    },
    GET: { exempt: 'Returns static API documentation; reads nothing.' },
  },

  // --- sources -------------------------------------------------------------
  'sources/[id]': {
    DELETE: {
      slots: ['source'],
      request: (t) => ({ url: `${API}/sources/${t.source}`, params: { id: t.source } }),
      refuses: [500],
      because: MUTATION_THROWS,
    },
  },
  'sources/clear': {
    DELETE: { slots: [], request: () => ({ url: `${API}/sources/clear` }) },
  },

  // --- debug & upload ------------------------------------------------------
  'test-db': {
    GET: { slots: [], request: () => ({ url: `${API}/test-db` }) },
  },
  'upload/blob-complete': {
    POST: {
      slots: ['session'],
      request: (t) => ({
        url: `${API}/upload/blob-complete`,
        body: {
          sessionId: t.session,
          blobUrl: 'https://store.public.blob.vercel-storage.com/sweep-upload.jpg',
          originalName: 'sweep.png',
          fileSize: 10,
          mimeType: 'image/png',
        },
      }),
    },
  },
  'upload/process': {
    POST: {
      slots: ['source'],
      request: (t) => ({ url: `${API}/upload/process`, body: { sourceIds: [t.source] } }),
    },
    GET: { slots: ['source'], request: (t) => ({ url: `${API}/upload/process?sourceId=${t.source}` }) },
  },
  'upload/sessions': {
    POST: { slots: [], request: () => ({ url: `${API}/upload/sessions`, body: { fileCount: 1 } }) },
    GET: [
      {
        name: 'by sessionId with details',
        slots: ['session'],
        request: (t) => ({ url: `${API}/upload/sessions?sessionId=${t.session}&details=true` }),
      },
      { name: 'list', slots: [], request: () => ({ url: `${API}/upload/sessions?limit=50` }) },
      {
        ...PLANTED_IN_OWN_SESSION,
        name: "details, with Bob's source planted in Alice's own session",
        request: (t) => ({ url: `${API}/upload/sessions?sessionId=${t.session}&details=true` }),
      },
    ],
    PATCH: {
      slots: ['session'],
      request: (t) => ({
        url: `${API}/upload/sessions?sessionId=${t.session}`,
        body: { status: 'cancelled', metadata: { label: 'written by sweep' } },
      }),
    },
    DELETE: [
      {
        slots: ['session'],
        request: (t) => ({ url: `${API}/upload/sessions?sessionId=${t.session}&cleanup=true` }),
        refuses: [500],
        because:
          'The handler throws "Session not found" for a session the caller does not own — the same message ' +
          'as a missing one — and maps it to 500.',
      },
      {
        ...PLANTED_IN_OWN_SESSION,
        name: "cleanup, with Bob's source planted in Alice's own session",
        request: (t) => ({ url: `${API}/upload/sessions?sessionId=${t.session}&cleanup=true` }),
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// The runner
// ---------------------------------------------------------------------------

const DEFAULT_REFUSAL = [403, 404];

/** Every side effect the sweep can observe outside the database. */
function sideEffectCalls(): unknown[] {
  const svc = llmExtractionService as unknown as Record<string, jest.Mock>;
  return [
    (del as jest.Mock).mock.calls,
    svc.batchExtract.mock.calls,
    (ocrServiceServer.processImageBuffer as jest.Mock).mock.calls,
    (resolveGooglePhoto as jest.Mock).mock.calls,
    (getAdapter as jest.Mock).mock.results.map((r) => (r.value as { search: jest.Mock }).search.mock.calls),
    (dispatchProcessors as jest.Mock).mock.calls,
    (global.fetch as jest.Mock).mock.calls,
  ];
}

async function bodyText(res: unknown): Promise<string> {
  const body = (res as { body?: unknown }).body;
  if (body === null || body === undefined) return '';
  if (typeof body === 'string') return body;
  if (body instanceof Uint8Array) return Buffer.from(body).toString('utf8');
  return JSON.stringify(body);
}

/** Remove the ids the caller supplied, so an echoed request id is not a leak. */
function withoutSupplied(text: string, supplied: string[]): string {
  let out = text;
  for (const id of supplied) out = out.split(id).join('<supplied>');
  return out;
}

interface Outcome {
  status: number;
  text: string;
  added: string[];
  removed: string[];
  /** Before and after together, for resolving who owns a row. */
  everything: string[];
  effects: string;
}

async function invoke(route: string, method: Method, spec: RequestSpec): Promise<Outcome> {
  const before = await snapshot();
  // Required per call: the handlers must load after the fixture pins the URL.
  const mod = require(`@/app/api/${route}/route`) as Record<string, (...args: unknown[]) => Promise<unknown>>;
  const res = await mod[method](
    apiRequest(spec.url, method, spec.body),
    { params: Promise.resolve(spec.params ?? {}) }
  );
  const after = await snapshot();
  return {
    status: (res as { status: number }).status,
    text: await bodyText(res),
    added: minus(after, before),
    removed: minus(before, after),
    everything: [...before, ...after],
    effects: JSON.stringify(sideEffectCalls()),
  };
}

/** A response with the run-to-run noise removed: timestamps, minted ids, timings. */
function comparable(o: Outcome): { status: number; body: string } {
  const body = o.text
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, '<ts>')
    .replace(/tenant-fixture-\d+-\d+/g, '<uuid>')
    .replace(/batch_\d+_[a-z0-9]+/g, '<batch>')
    .replace(/"(processing_duration_ms|avg_processing_time_ms)":\d+/g, '"$1":<ms>');
  return { status: o.status, body };
}

/**
 * Empty the in-process caches handlers keep between requests, or the second
 * world would be answered from the first world's cache and could hide a leak.
 */
async function flushHandlerCaches(): Promise<void> {
  // places/duplicates memoises detection results per user and query.
  const { DELETE } = require('@/app/api/places/duplicates/route') as { DELETE: () => Promise<unknown> };
  await DELETE();
}

/**
 * Run the request in the seeded world, then again after `perturbBob`, and
 * hand back both outcomes. The caller asserts the invariants on each and that
 * the two responses match.
 */
async function invokeInBothWorlds(
  route: string,
  method: Method,
  spec: RequestSpec,
  setup?: () => Promise<string[]>
): Promise<{ planted: string[]; seeded: Outcome; perturbed: Outcome }> {
  const planted = setup ? await setup() : [];
  await flushHandlerCaches();
  const seeded = await invoke(route, method, spec);
  await resetWorld();
  if (setup) await setup();
  await perturbBob();
  await flushHandlerCaches();
  const perturbed = await invoke(route, method, spec);
  return { planted, seeded, perturbed };
}

function expectIndependentOfBob(r: { seeded: Outcome; perturbed: Outcome }): void {
  expect(comparable(r.perturbed)).toEqual(comparable(r.seeded));
}

function casesOf(entry: Entry): Case[] {
  if ('exempt' in entry) return [];
  return Array.isArray(entry) ? entry : [entry];
}

/** All-foreign, plus — for a request with several ids — each id foreign alone. */
interface Variant {
  key: VariantKey;
  label: string;
  ids: TenantIds;
  foreign: Slot[];
}

function variantsOf(c: Case): Variant[] {
  if (c.slots.length === 0) return [];
  const variants: Variant[] = [
    { key: 'all', label: 'every id foreign', ids: { ...ALICE_IDS, ...pick(BOB_IDS, c.slots) }, foreign: c.slots },
  ];
  if (c.slots.length > 1) {
    for (const slot of c.slots) {
      variants.push({ key: slot, label: `only ${slot} foreign`, ids: { ...ALICE_IDS, [slot]: BOB_IDS[slot] }, foreign: [slot] });
    }
  }
  return variants;
}

function refusalFor(c: Case, key: VariantKey): number[] {
  if (!c.refuses) return DEFAULT_REFUSAL;
  if (Array.isArray(c.refuses)) return c.refuses;
  return c.refuses[key] ?? DEFAULT_REFUSAL;
}

function pick(ids: TenantIds, slots: Slot[]): Partial<TenantIds> {
  return Object.fromEntries(slots.map((s) => [s, ids[s]]));
}

function expectStatus(o: Outcome, accepted: number[]): void {
  if (!accepted.includes(o.status)) {
    throw new Error(`status ${o.status}, expected one of ${accepted.join('/')}; body: ${o.text.slice(0, 300)}`);
  }
}

interface Row {
  table: string;
  data: Record<string, unknown>;
  raw: string;
}

function parseRow(raw: string): Row {
  const at = raw.indexOf(':');
  return { table: raw.slice(0, at), data: JSON.parse(raw.slice(at + 1)) as Record<string, unknown>, raw };
}

/** The column through which a table without `user_id` is owned. */
const OWNED_THROUGH: Record<string, string> = {
  attachments: 'place_id',
  place_links: 'place_id',
  reservations: 'place_id',
  places_to_collections: 'collection_id',
  sources_to_places: 'source_id',
  merge_logs: 'target_id',
};

/** Resolves a row to the user who owns it, directly or through its parent. */
function ownerResolver(rows: Row[]): (row: Row) => string {
  const ownerOfId = new Map<string, string>();
  for (const r of rows) {
    if (typeof r.data.id === 'string' && typeof r.data.user_id === 'string') ownerOfId.set(r.data.id, r.data.user_id);
  }
  return (row) => {
    if (row.table === 'users') return String(row.data.id);
    if (typeof row.data.user_id === 'string') return row.data.user_id;
    const via = OWNED_THROUGH[row.table];
    return (via && ownerOfId.get(String(row.data[via]))) || 'unknown';
  };
}

/** Every token in a row that names something of Bob's. */
function bobMentions(text: string): Set<string> {
  return new Set(text.match(/[\w./:-]*bob[\w./:-]*/gi) ?? []);
}

function rowKey(row: Row): string {
  return `${row.table}:${String(row.data.id ?? row.data.session_token ?? row.raw)}`;
}

function assertBobUntouched(o: Outcome, supplied: string[], c: Case): void {
  const ownerOf = ownerResolver(o.everything.map(parseRow));
  const added = o.added.map(parseRow);
  const removed = o.removed.map(parseRow);

  // 1. No row Bob owns was inserted, updated or deleted — directly or through
  //    the place, collection or source it hangs off.
  expect([...added, ...removed].filter((r) => ownerOf(r) === 'user_bob').map((r) => r.raw)).toEqual([]);

  // 2. No row anyone else owns started naming something of Bob's. A row that
  //    already named it (a planted id) and was merely updated is not new.
  const before = new Map<string, Set<string>>();
  for (const r of removed) before.set(rowKey(r), bobMentions(r.raw));
  const newlyNaming = added.filter((r) => ownerOf(r) !== 'user_bob').filter((r) => {
    const had = before.get(rowKey(r)) ?? new Set<string>();
    return [...bobMentions(r.raw)].some((m) => !had.has(m));
  });
  const allowed = (r: Row) => c.callerRowMayNameForeignId !== undefined && ownerOf(r) === ALICE.id;
  expect(newlyNaming.filter((r) => !allowed(r)).map((r) => r.raw)).toEqual([]);

  // 3. Nothing of Bob's came back, beyond the ids Alice put in the request.
  expect(withoutSupplied(o.text, supplied)).not.toMatch(BOB_MARKER);

  // 4. No side effect — blob deletion, OCR, the LLM, Google — acted for Bob.
  expect(withoutSupplied(o.effects, supplied)).not.toMatch(BOB_MARKER);
}

describe('cross-tenant sweep — every route, real handlers, real database', () => {
  // The handlers log freely on every refusal; keep the run readable.
  const quiet = (['log', 'info', 'error'] as const).map((fn) => {
    const original = console[fn];
    return { fn, original };
  });

  beforeAll(async () => {
    assertLocalDatabase();
    useUniqueUuids();
    for (const { fn } of quiet) console[fn] = () => undefined;
    // Builds the schema; `resetWorld` needs the tables to exist.
    await resetTenantFixture();
  });

  afterAll(() => {
    for (const { fn, original } of quiet) console[fn] = original;
  });

  beforeEach(async () => {
    (requireAuthForApi as jest.Mock).mockResolvedValue(ALICE);
    await resetWorld();
  });

  for (const [route, methods] of Object.entries(ROUTES)) {
    for (const [method, entry] of Object.entries(methods) as Array<[Method, Entry]>) {
      for (const c of casesOf(entry)) {
        const title = `${method} /api/${route}${c.name ? ` (${c.name})` : ''}`;

        describe(title, () => {
          for (const v of variantsOf(c)) {
            it(`refuses Alice with ${v.label}`, async () => {
              const supplied = v.foreign.map((s) => BOB_IDS[s]);
              const r = await invokeInBothWorlds(route, method, c.request(v.ids), c.setup);
              for (const o of [r.seeded, r.perturbed]) assertBobUntouched(o, supplied, c);
              expectIndependentOfBob(r);
              expectStatus(r.seeded, refusalFor(c, v.key));
            });
          }

          it('refuses an anonymous caller with 401 and touches nothing', async () => {
            (requireAuthForApi as jest.Mock).mockRejectedValue(new Error('Unauthorized'));
            const o = await invoke(route, method, c.request(c.slots.length ? BOB_IDS : ALICE_IDS));
            expect({ added: o.added, removed: o.removed }).toEqual({ added: [], removed: [] });
            expect(o.effects).toBe(JSON.stringify(sideEffectCalls().map(() => [])));
            expectStatus(o, [401]);
          });

          it(c.slots.length === 0 ? 'answers Alice and shows or touches nothing of Bob\'s' : 'still works for the owner (control)', async () => {
            const r = await invokeInBothWorlds(route, method, c.request(ALICE_IDS), c.setup);
            for (const o of [r.seeded, r.perturbed]) assertBobUntouched(o, r.planted, c);
            expectIndependentOfBob(r);
            expectStatus(r.seeded, c.owner ?? [200, 201, 202, 204, 207]);
            c.ownerReaches?.();
            if (method !== 'GET' && c.ownerWritesNothing === undefined) {
              const ownerOf = ownerResolver(r.seeded.everything.map(parseRow));
              const changed = [...r.seeded.added, ...r.seeded.removed].map(parseRow);
              expect(changed.filter((row) => ownerOf(row) === ALICE.id).length).toBeGreaterThan(0);
            }
          });
        });
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Completeness guard
// ---------------------------------------------------------------------------

const API_DIR = path.join(process.cwd(), 'src/app/api');
const HTTP_METHODS: Method[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) return routeFiles(full);
    return d.name === 'route.ts' ? [full] : [];
  });
}

/** The HTTP methods a route module exports as functions — what Next.js serves. */
function exportedMethods(file: string): Method[] {
  const mod = require(file) as Record<string, unknown>;
  return HTTP_METHODS.filter((method) => typeof mod[method] === 'function');
}

describe('completeness guard', () => {
  const onDisk = routeFiles(API_DIR).map((file) => ({
    route: path.relative(API_DIR, path.dirname(file)).split(path.sep).join('/'),
    methods: exportedMethods(file),
  }));

  it('finds the route files (guards the guard)', () => {
    expect(onDisk.length).toBeGreaterThan(40);
    expect(onDisk.find((r) => r.route === 'places/[id]')?.methods).toEqual(['GET', 'PATCH', 'DELETE']);
  });

  it('has an entry — a case or a commented exemption — for every handler on disk', () => {
    const missing = onDisk.flatMap(({ route, methods }) =>
      methods.filter((m) => ROUTES[route]?.[m] === undefined).map((m) => `${m} /api/${route}`)
    );
    expect(missing).toEqual([]);
  });

  it('has no entry for a handler that no longer exists', () => {
    const live = new Set(onDisk.flatMap(({ route, methods }) => methods.map((m) => `${m} ${route}`)));
    const stale = Object.entries(ROUTES).flatMap(([route, methods]) =>
      Object.keys(methods).filter((m) => !live.has(`${m} ${route}`)).map((m) => `${m} /api/${route}`)
    );
    expect(stale).toEqual([]);
  });

  it('gives every exemption, non-404/403 refusal and owner-control waiver a reason', () => {
    const unexplained = Object.entries(ROUTES).flatMap(([route, methods]) =>
      Object.entries(methods).flatMap(([m, entry]) => {
        if (!entry) return [];
        if ('exempt' in entry) return entry.exempt.trim().length < 20 ? [`${m} /api/${route}`] : [];
        return casesOf(entry)
          .filter((c) =>
            (c.refuses !== undefined && (c.because ?? '').trim().length < 20) ||
            [c.callerRowMayNameForeignId, c.ownerWritesNothing].some((r) => r !== undefined && r.trim().length < 20)
          )
          .map((c) => `${m} /api/${route}${c.name ? ` (${c.name})` : ''}`);
      })
    );
    expect(unexplained).toEqual([]);
  });

  it('can load the handlers with `server-only` in their import graph', () => {
    // `@/db` and `@/lib/tenant-db` carry `import 'server-only'`; next/jest maps
    // it to an empty module. If that mapping ever goes, every case above fails
    // at require time — this names the cause.
    expect(() => require('server-only')).not.toThrow();
  });
});
