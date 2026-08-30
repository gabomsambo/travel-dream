/**
 * Real-database fixture for the cross-tenant suite.
 *
 * The rest of `src/__tests__/authorization/` mocks `@/db` and asserts the
 * *shape* of the WHERE clause. That cannot catch a query which is correctly
 * scoped on the container (an upload session) and unscoped on the rows it then
 * touches — which is exactly how `mass-upload/{cancel,start,status}` leaked.
 * So this fixture runs the real handlers against a real SQLite file built from
 * the repo's own migrations, and asserts on the rows that come back.
 *
 * Importing this module pins `TURSO_DATABASE_URL` to that file. It MUST be the
 * first import in a suite, ahead of anything that pulls in `@/db`: `@/db` reads
 * the URL at module load, and `jest.setup.js` has already run `dotenv.config()`,
 * which would otherwise leave the PRODUCTION Turso URL in the environment.
 * `assertLocalDatabase()` re-checks the `file:` prefix at run time so a suite
 * can never reach a remote database even if the import order is disturbed.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

export const ALICE = {
  id: 'user_alice',
  email: 'alice@tenant-fixture.test',
  name: 'Alice',
  image: null,
} as const;

export const BOB = {
  id: 'user_bob',
  email: 'bob@tenant-fixture.test',
  name: 'Bob',
  image: null,
} as const;

/** Fixture row ids, so assertions never hard-code strings. */
export const FIXTURE = {
  bobPlace: 'plc_bob_secret',
  bobCollection: 'col_bob',
  bobCollectionNote: 'BOB PRIVATE COLLECTION NOTE: book the suite',
  bobSource: 'src_bob_1',
  bobSourceOcr: 'BOB OCR TEXT: passport number and hotel confirmation',
  bobSourceBlob: 'https://store.public.blob.vercel-storage.com/bob-private.jpg',
  bobSession: 'session_bob',
  alicePlace: 'plc_alice',
  aliceCollection: 'col_alice',
  aliceCollectionNote: 'ALICE COLLECTION NOTE: window seat',
  aliceSession: 'session_alice',
  aliceSource: 'src_alice_1',
  aliceSourceBlob: 'https://store.public.blob.vercel-storage.com/alice-own.jpg',
} as const;

// Jest runs suites in parallel workers; give each its own database file.
const DB_FILE = path.join(
  os.tmpdir(),
  `td-tenant-fixture-${process.pid}-${process.env.JEST_WORKER_ID ?? '0'}.db`
);

// Start from nothing, so the schema always matches the current migrations
// rather than whatever a previous run happened to leave behind.
for (const stale of [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`]) {
  fs.rmSync(stale, { force: true });
}

process.env.TURSO_DATABASE_URL = `file:${DB_FILE}`;
process.env.TURSO_AUTH_TOKEN = 'local-fixture';

let schemaApplied = false;

/**
 * Refuse to run against anything but a local file. Call this in `beforeAll`.
 * This is the guard that keeps the suite off production.
 */
export function assertLocalDatabase(): void {
  expect(process.env.TURSO_DATABASE_URL).toMatch(/^file:/);
}

type Client = {
  execute: (query: string | { sql: string; args: unknown[] }) => Promise<unknown>;
};

async function applyMigrations(client: Client): Promise<void> {
  const dir = path.join(process.cwd(), 'src/db/migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  if (files.length === 0) throw new Error('no migrations found — fixture cannot build a schema');

  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const statement of sql.split('--> statement-breakpoint')) {
      const trimmed = statement.trim();
      if (!trimmed) continue;
      await client.execute(trimmed);
    }
  }
}

/**
 * Build the schema (once per worker) and reset the two-tenant fixture data.
 * Call from `beforeAll`; call again from `beforeEach` if a test mutates rows.
 */
export async function resetTenantFixture(): Promise<void> {
  assertLocalDatabase();

  // Required lazily: `@/db` must not be loaded before this module pins the URL.
  const { client } = require('@/db') as { client: Client };

  if (!schemaApplied) {
    await applyMigrations(client);
    schemaApplied = true;
  }

  const now = new Date().toISOString();
  const ex = (sql: string, args: unknown[] = []) => client.execute({ sql, args });

  for (const table of [
    'places_to_collections', 'sources_to_places', 'attachments',
    'upload_sessions', 'collections', 'sources', 'places', 'users',
  ]) {
    await ex(`DELETE FROM ${table}`);
  }

  await ex(
    `INSERT INTO users (id,name,email,created_at,updated_at) VALUES (?,?,?,?,?)`,
    [BOB.id, BOB.name, BOB.email, now, now]
  );
  await ex(
    `INSERT INTO users (id,name,email,created_at,updated_at) VALUES (?,?,?,?,?)`,
    [ALICE.id, ALICE.name, ALICE.email, now, now]
  );

  // --- Bob: the victim. Private place, collection with a per-place note,
  //     an uploaded source carrying OCR text, and the session that tracks it.
  await ex(
    `INSERT INTO places (id,user_id,name,kind,status,notes,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [FIXTURE.bobPlace, BOB.id, 'Bob Secret Hideaway', 'hotel', 'library',
     'BOB PRIVATE NOTE: anniversary trip', now, now]
  );
  await ex(
    `INSERT INTO collections (id,user_id,name,created_at,updated_at) VALUES (?,?,?,?,?)`,
    [FIXTURE.bobCollection, BOB.id, 'Bob Honeymoon 2027', now, now]
  );
  await ex(
    `INSERT INTO places_to_collections (place_id,collection_id,order_index,is_pinned,note)
     VALUES (?,?,?,?,?)`,
    [FIXTURE.bobPlace, FIXTURE.bobCollection, 0, 1, FIXTURE.bobCollectionNote]
  );
  await ex(
    `INSERT INTO sources (id,user_id,type,uri,ocr_text,processing_status,meta,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [FIXTURE.bobSource, BOB.id, 'screenshot', FIXTURE.bobSourceBlob, FIXTURE.bobSourceOcr,
     'uploaded',
     JSON.stringify({ uploadInfo: { sessionId: FIXTURE.bobSession, originalName: 'bob-passport.png' } }),
     now, now]
  );
  await ex(
    `INSERT INTO upload_sessions
       (id,user_id,started_at,file_count,completed_count,failed_count,status,meta)
     VALUES (?,?,?,?,?,?,?,?)`,
    [FIXTURE.bobSession, BOB.id, now, 1, 1, 0, 'active',
     JSON.stringify({ uploadedFiles: [FIXTURE.bobSource], errors: [] })]
  );

  // --- Alice: the attacker. Owns ordinary data of her own, so the positive
  //     controls can show the fixes did not simply empty the responses.
  await ex(
    `INSERT INTO places (id,user_id,name,kind,status,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?)`,
    [FIXTURE.alicePlace, ALICE.id, 'Alice Cafe', 'cafe', 'library', now, now]
  );
  await ex(
    `INSERT INTO collections (id,user_id,name,created_at,updated_at) VALUES (?,?,?,?,?)`,
    [FIXTURE.aliceCollection, ALICE.id, 'Alice Trip', now, now]
  );
  await ex(
    `INSERT INTO places_to_collections (place_id,collection_id,order_index,is_pinned,note)
     VALUES (?,?,?,?,?)`,
    [FIXTURE.alicePlace, FIXTURE.aliceCollection, 0, 0, FIXTURE.aliceCollectionNote]
  );
  // Alice's own uploaded source, tagged with her own session. Kept OUT of the
  // session's `uploadedFiles` so the cross-tenant tests start from an empty
  // list; the positive controls put it back in.
  await ex(
    `INSERT INTO sources (id,user_id,type,uri,ocr_text,processing_status,meta,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [FIXTURE.aliceSource, ALICE.id, 'screenshot', FIXTURE.aliceSourceBlob,
     'ALICE OCR TEXT: her own screenshot', 'uploaded',
     JSON.stringify({ uploadInfo: { sessionId: FIXTURE.aliceSession, originalName: 'alice.png' } }),
     now, now]
  );
  await ex(
    `INSERT INTO upload_sessions
       (id,user_id,started_at,file_count,completed_count,failed_count,status,meta)
     VALUES (?,?,?,?,?,?,?,?)`,
    [FIXTURE.aliceSession, ALICE.id, now, 0, 0, 0, 'active',
     JSON.stringify({ uploadedFiles: [], errors: [] })]
  );
}

/** Overwrite a session's `meta.uploadedFiles` directly, bypassing the API. */
export async function setSessionUploadedFiles(sessionId: string, sourceIds: string[]): Promise<void> {
  const { client } = require('@/db') as {
    client: { execute: (q: { sql: string; args: unknown[] }) => Promise<unknown> };
  };
  await client.execute({
    sql: 'UPDATE upload_sessions SET meta = ? WHERE id = ?',
    args: [JSON.stringify({ uploadedFiles: sourceIds, errors: [] }), sessionId],
  });
}

/** Read one column back out of the fixture database. */
export async function readCell(sql: string, args: unknown[] = []): Promise<unknown> {
  const { client } = require('@/db') as {
    client: { execute: (q: { sql: string; args: unknown[] }) => Promise<{ rows: Record<string, unknown>[] }> };
  };
  const result = await client.execute({ sql, args });
  const row = result.rows[0];
  return row === undefined ? undefined : Object.values(row)[0];
}

/** Build a Request the App Router handlers accept (jest.setup.js supplies the shim). */
export function apiRequest(url: string, method = 'GET', body?: unknown): Request {
  return new (global as unknown as { Request: new (u: string, o: unknown) => Request }).Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/**
 * `jest.setup.js` pins `crypto.randomUUID` to a constant, which collides on the
 * `sources` primary key as soon as a suite inserts more than one row.
 */
export function useUniqueUuids(): void {
  let n = 0;
  Object.defineProperty(global, 'crypto', {
    value: { randomUUID: () => `tenant-fixture-${Date.now()}-${n++}` },
    configurable: true,
  });
}
