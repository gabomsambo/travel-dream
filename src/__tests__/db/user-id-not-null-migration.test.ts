/**
 * @jest-environment node
 *
 * Rehearses `npm run db:migrate` (drizzle's libSQL migrator) against a throwaway
 * file database. The migration must refuse to rebuild while any owner is null,
 * then make user_id NOT NULL on the five tenant tables without dropping the
 * rows that point at them.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';

jest.setTimeout(60_000);

const MIGRATIONS_DIR = path.join(process.cwd(), 'src/db/migrations');
const LAST_TAG = '20261012125529_user_id_not_null';

const OWNED = [
  'places',
  'sources',
  'collections',
  'upload_sessions',
  'dismissed_duplicates',
] as const;

const PRESERVED = [
  ...OWNED,
  'attachments',
  'place_links',
  'reservations',
  'place_hearts',
  'places_to_collections',
  'sources_to_places',
  'saved_views',
] as const;

const EXPECTED_ON_DELETE: Record<(typeof OWNED)[number], string> = {
  places: 'CASCADE',
  sources: 'CASCADE',
  collections: 'CASCADE',
  upload_sessions: 'CASCADE',
  dismissed_duplicates: 'NO ACTION',
};

type Journal = { entries: Array<{ tag: string; when: number }> };

const trash: string[] = [];

function stagePriorMigrations(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'td-userid-prior-'));
  trash.push(dir);
  fs.cpSync(MIGRATIONS_DIR, dir, { recursive: true });
  fs.rmSync(path.join(dir, `${LAST_TAG}.sql`));
  const journalPath = path.join(dir, 'meta', '_journal.json');
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as Journal;
  journal.entries = journal.entries.filter((entry) => entry.tag !== LAST_TAG);
  fs.writeFileSync(journalPath, JSON.stringify(journal));
  return dir;
}

function newDbFile(): string {
  const file = path.join(
    os.tmpdir(),
    `td-userid-${process.pid}-${Math.random().toString(16).slice(2)}.db`
  );
  trash.push(file, `${file}-wal`, `${file}-shm`);
  return file;
}

function openDb(file: string): Client {
  return createClient({ url: `file:${file}` });
}

async function migrateFolder(client: Client, folder: string): Promise<void> {
  await migrate(drizzle(client), { migrationsFolder: folder });
}

function journalWhen(tag: string): number {
  const journal = JSON.parse(
    fs.readFileSync(path.join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8')
  ) as Journal;
  const entry = journal.entries.find((item) => item.tag === tag);
  if (!entry) throw new Error(`journal is missing ${tag}`);
  return entry.when;
}

async function rows(client: Client, sql: string): Promise<Array<Record<string, unknown>>> {
  const result = await client.execute(sql);
  return result.rows as Array<Record<string, unknown>>;
}

async function counts(
  client: Client,
  tables: readonly string[]
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of tables) {
    const result = await rows(client, `SELECT COUNT(*) AS n FROM ${table}`);
    out[table] = Number(result[0]?.n);
  }
  return out;
}

async function userIdNotNull(client: Client): Promise<Record<string, number>> {
  const tables = await rows(
    client,
    `SELECT name FROM sqlite_master
     WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations'
     ORDER BY name`
  );
  const out: Record<string, number> = {};
  for (const table of tables) {
    const name = String(table.name);
    if (!/^[A-Za-z0-9_]+$/.test(name)) continue;
    const cols = await rows(client, `PRAGMA table_info('${name}')`);
    const userId = cols.find((col) => col.name === 'user_id');
    if (userId) out[name] = Number(userId.notnull);
  }
  return out;
}

function check(
  lines: string[],
  label: string,
  actual: unknown,
  expected: unknown
): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  lines.push(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(actual)}`);
  expect(actual).toEqual(expected);
}

function publish(name: string, lines: string[]): void {
  const body = `${lines.join('\n')}\n`;
  console.log(body);
  const dir = process.env.NM_EVIDENCE_DIR;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), body);
}

async function seedOwnedLibrary(client: Client): Promise<void> {
  const statements = [
    `INSERT INTO users (id, email, name) VALUES ('user_owner', 'owner@example.test', 'Owner')`,
    `INSERT INTO places (id, user_id, name, kind, notes, archived_at)
     VALUES ('plc_1', 'user_owner', 'Harbor Cafe', 'cafe', 'window seat', '2026-04-01')`,
    `INSERT INTO places (id, user_id, name, kind)
     VALUES ('plc_2', 'user_owner', 'Lookout', 'viewpoint')`,
    `INSERT INTO collections (id, user_id, name, description)
     VALUES ('col_1', 'user_owner', 'Lisbon', 'trams')`,
    `INSERT INTO sources (id, user_id, type, uri, ocr_text)
     VALUES ('src_1', 'user_owner', 'image', 'https://store.public.blob.vercel-storage.com/shot.jpg', 'menu photo')`,
    `INSERT INTO upload_sessions (id, user_id, started_at, file_count, status)
     VALUES ('ses_1', 'user_owner', '2026-10-01T00:00:00.000Z', 3, 'active')`,
    `INSERT INTO dismissed_duplicates (id, user_id, place_id_1, place_id_2, reason)
     VALUES ('dd_1', 'user_owner', 'plc_1', 'plc_2', 'same doorway')`,
    `INSERT INTO attachments (id, place_id, type, uri, filename)
     VALUES ('att_1', 'plc_1', 'image', 'https://store.public.blob.vercel-storage.com/shot.jpg', 'shot.jpg')`,
    `INSERT INTO place_links (id, place_id, url, title)
     VALUES ('lnk_1', 'plc_1', 'https://harbor.example/cafe', 'Harbor')`,
    `INSERT INTO reservations (id, place_id, reservation_date, confirmation_number)
     VALUES ('res_1', 'plc_1', '2026-11-02', 'ABC123')`,
    `INSERT INTO place_hearts (id, user_id, place_id) VALUES ('ph_1', 'user_owner', 'plc_1')`,
    `INSERT INTO places_to_collections (place_id, collection_id, note)
     VALUES ('plc_1', 'col_1', 'book the corner')`,
    `INSERT INTO sources_to_places (source_id, place_id) VALUES ('src_1', 'plc_1')`,
    `INSERT INTO saved_views (id, user_id, name, query)
     VALUES ('sv_1', 'user_owner', 'Cafes', '{"kind":"cafe"}')`,
  ];
  for (const statement of statements) await client.execute(statement);
}

describe('user_id NOT NULL migration', () => {
  afterAll(() => {
    for (const file of trash) fs.rmSync(file, { recursive: true, force: true });
  });

  it('keeps owned rows, rejects a null owner, and leaves dismissals in place when the user is deleted', async () => {
    const lines: string[] = ['# owned library survives user_id NOT NULL'];
    const prior = stagePriorMigrations();
    const client = openDb(newDbFile());
    try {
      await migrateFolder(client, prior);
      await seedOwnedLibrary(client);
      const beforeCounts = await counts(client, PRESERVED);
      const beforeNotNull = await userIdNotNull(client);
      lines.push(`before counts ${JSON.stringify(beforeCounts)}`);
      lines.push(`before user_id notnull ${JSON.stringify(beforeNotNull)}`);
      for (const table of OWNED) check(lines, `${table} nullable before migration`, beforeNotNull[table], 0);
      check(lines, 'place_hearts already required', beforeNotNull.place_hearts, 1);
      check(lines, 'saved_views already required', beforeNotNull.saved_views, 1);

      await migrateFolder(client, MIGRATIONS_DIR);

      const fk = await rows(client, 'PRAGMA foreign_keys');
      lines.push(`PRAGMA foreign_keys ${JSON.stringify(fk)}`);
      check(lines, 'foreign keys on after migrate', Number(fk[0]?.foreign_keys), 1);

      const nullCounts = await rows(
        client,
        `SELECT 'places' AS t, COUNT(*) AS null_user_ids FROM places WHERE user_id IS NULL
         UNION ALL SELECT 'sources', COUNT(*) FROM sources WHERE user_id IS NULL
         UNION ALL SELECT 'collections', COUNT(*) FROM collections WHERE user_id IS NULL
         UNION ALL SELECT 'upload_sessions', COUNT(*) FROM upload_sessions WHERE user_id IS NULL
         UNION ALL SELECT 'dismissed_duplicates', COUNT(*) FROM dismissed_duplicates WHERE user_id IS NULL`
      );
      lines.push('null user_id counts:');
      for (const row of nullCounts) {
        lines.push(`  ${String(row.t)} ${String(row.null_user_ids)}`);
        check(lines, `${String(row.t)} null owners`, Number(row.null_user_ids), 0);
      }

      const notNull = await rows(
        client,
        `SELECT 'places' AS t, "notnull" FROM pragma_table_info('places') WHERE name = 'user_id'
         UNION ALL SELECT 'sources', "notnull" FROM pragma_table_info('sources') WHERE name = 'user_id'
         UNION ALL SELECT 'collections', "notnull" FROM pragma_table_info('collections') WHERE name = 'user_id'
         UNION ALL SELECT 'upload_sessions', "notnull" FROM pragma_table_info('upload_sessions') WHERE name = 'user_id'
         UNION ALL SELECT 'dismissed_duplicates', "notnull" FROM pragma_table_info('dismissed_duplicates') WHERE name = 'user_id'`
      );
      lines.push('user_id notnull:');
      for (const row of notNull) {
        lines.push(`  ${String(row.t)} ${String(row.notnull)}`);
        check(lines, `${String(row.t)} user_id NOT NULL`, Number(row.notnull), 1);
      }

      const afterNotNull = await userIdNotNull(client);
      lines.push(`after user_id notnull ${JSON.stringify(afterNotNull)}`);
      check(lines, 'place_hearts still required', afterNotNull.place_hearts, 1);
      check(lines, 'saved_views still required', afterNotNull.saved_views, 1);
      check(lines, 'accounts still required', afterNotNull.accounts, 1);

      const onDelete = await rows(
        client,
        `SELECT "from", on_delete FROM pragma_foreign_key_list('dismissed_duplicates') WHERE "from" = 'user_id'`
      );
      lines.push(`dismissed_duplicates user_id fk ${JSON.stringify(onDelete)}`);
      check(lines, 'dismissal on_delete', onDelete.map((row) => String(row.on_delete)), ['NO ACTION']);

      for (const table of OWNED) {
        const fkRows = await rows(
          client,
          `SELECT on_delete FROM pragma_foreign_key_list('${table}') WHERE "from" = 'user_id'`
        );
        check(
          lines,
          `${table}.user_id on_delete`,
          fkRows.map((row) => String(row.on_delete).toUpperCase()),
          [EXPECTED_ON_DELETE[table]]
        );
      }

      const fkCheck = await rows(client, 'PRAGMA foreign_key_check');
      lines.push(`foreign_key_check rows ${fkCheck.length}`);
      check(lines, 'foreign_key_check', fkCheck, []);

      const afterCounts = await counts(client, PRESERVED);
      lines.push(`after counts ${JSON.stringify(afterCounts)}`);
      check(lines, 'row counts unchanged', afterCounts, beforeCounts);

      const kept = await rows(
        client,
        `SELECT
           (SELECT notes FROM places WHERE id = 'plc_1') AS notes,
           (SELECT archived_at FROM places WHERE id = 'plc_1') AS archived_at,
           (SELECT ocr_text FROM sources WHERE id = 'src_1') AS ocr_text,
           (SELECT note FROM places_to_collections WHERE place_id = 'plc_1') AS collection_note,
           (SELECT reason FROM dismissed_duplicates WHERE id = 'dd_1') AS reason,
           (SELECT confirmation_number FROM reservations WHERE id = 'res_1') AS confirmation`
      );
      lines.push(`preserved content ${JSON.stringify(kept[0])}`);
      check(lines, 'place notes', kept[0]?.notes, 'window seat');
      check(lines, 'archived_at copied', kept[0]?.archived_at, '2026-04-01');
      check(lines, 'source text', kept[0]?.ocr_text, 'menu photo');
      check(lines, 'collection note', kept[0]?.collection_note, 'book the corner');
      check(lines, 'dismissal reason', kept[0]?.reason, 'same doorway');
      check(lines, 'reservation', kept[0]?.confirmation, 'ABC123');

      const ledger = await rows(
        client,
        `SELECT created_at FROM __drizzle_migrations ORDER BY created_at`
      );
      const applied = ledger.map((row) => Number(row.created_at));
      lines.push(`ledger ${applied.join(', ')}`);
      check(
        lines,
        'migration in ledger',
        applied.includes(journalWhen(LAST_TAG)) ? 'recorded' : 'absent',
        'recorded'
      );

      const nullInserts: Record<string, string> = {
        places: `INSERT INTO places (id, user_id, name, kind) VALUES ('plc_null', NULL, 'Nope', 'cafe')`,
        sources: `INSERT INTO sources (id, user_id, type, uri) VALUES ('src_null', NULL, 'image', 'https://example.test/a.jpg')`,
        collections: `INSERT INTO collections (id, user_id, name) VALUES ('col_null', NULL, 'Nope')`,
        upload_sessions: `INSERT INTO upload_sessions (id, user_id, started_at) VALUES ('ses_null', NULL, '2026-10-12T00:00:00Z')`,
        dismissed_duplicates: `INSERT INTO dismissed_duplicates (id, user_id, place_id_1, place_id_2) VALUES ('dd_null', NULL, 'plc_1', 'plc_2')`,
      };
      for (const [table, statement] of Object.entries(nullInserts)) {
        let message = 'inserted';
        try {
          await client.execute(statement);
        } catch (error) {
          message = error instanceof Error ? error.message : String(error);
        }
        lines.push(`null insert ${table}: ${message}`);
        expect(message).toContain(`NOT NULL constraint failed: ${table}.user_id`);
      }
      check(lines, 'counts after rejected nulls', await counts(client, PRESERVED), beforeCounts);

      let fkMessage = 'inserted';
      try {
        await client.execute(
          `INSERT INTO places (id, user_id, name, kind) VALUES ('plc_fk', 'user_missing', 'Ghost', 'cafe')`
        );
      } catch (error) {
        fkMessage = error instanceof Error ? error.message : String(error);
      }
      lines.push(`missing owner insert: ${fkMessage}`);
      expect(fkMessage).toContain('FOREIGN KEY constraint failed');

      await client.execute(
        `INSERT INTO places (id, user_id, name, kind) VALUES ('plc_ok', 'user_owner', 'Still Open', 'cafe')`
      );
      const owned = await rows(client, `SELECT name FROM places WHERE id = 'plc_ok'`);
      check(lines, 'owned insert still works', owned[0]?.name, 'Still Open');
      await client.execute(`DELETE FROM places WHERE id = 'plc_ok'`);

      let deleteMessage = 'deleted';
      try {
        await client.execute(`DELETE FROM users WHERE id = 'user_owner'`);
      } catch (error) {
        deleteMessage = error instanceof Error ? error.message : String(error);
      }
      lines.push(`delete user while a dismissal exists: ${deleteMessage}`);
      expect(deleteMessage).toContain('FOREIGN KEY constraint failed');
      check(lines, 'counts after blocked delete', await counts(client, PRESERVED), beforeCounts);

      await client.execute(`DELETE FROM dismissed_duplicates WHERE id = 'dd_1'`);
      const afterDismissal = await counts(client, PRESERVED);
      check(lines, 'dismissal row removed first', afterDismissal.dismissed_duplicates, 0);
      check(lines, 'places still present after removing the dismissal', afterDismissal.places, beforeCounts.places);

      await client.execute(`DELETE FROM users WHERE id = 'user_owner'`);
      const remaining = await counts(client, PRESERVED);
      lines.push(`counts after deleting the user ${JSON.stringify(remaining)}`);
      for (const table of PRESERVED) {
        if (table === 'dismissed_duplicates') continue;
        check(lines, `${table} removed with the user`, remaining[table], 0);
      }
      check(lines, 'dismissal stays gone', remaining.dismissed_duplicates, 0);
    } finally {
      publish('user-id-not-null-owned-library.txt', lines);
      client.close();
    }
  });

  it('aborts before rebuilding when a tenant row has no owner', async () => {
    const lines: string[] = ['# null owner aborts the migration'];
    const prior = stagePriorMigrations();
    const client = openDb(newDbFile());
    try {
      await migrateFolder(client, prior);
      await client.execute(
        `INSERT INTO users (id, email, name) VALUES ('user_owner', 'owner@example.test', 'Owner')`
      );
      await client.execute(
        `INSERT INTO places (id, user_id, name, kind, notes) VALUES ('plc_orphan', NULL, 'Orphan', 'cafe', 'keep me')`
      );
      await client.execute(
        `INSERT INTO attachments (id, place_id, type, uri, filename)
         VALUES ('att_orphan', 'plc_orphan', 'image', 'https://example.test/o.jpg', 'o.jpg')`
      );
      await client.execute(
        `INSERT INTO collections (id, user_id, name) VALUES ('col_ok', 'user_owner', 'Kept')`
      );

      let message = 'applied';
      try {
        await migrateFolder(client, MIGRATIONS_DIR);
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      lines.push(`migration error: ${message}`);
      expect(message).toContain('CHECK constraint failed');
      expect(message).toContain('user_id_not_null_guard');

      const notNull = await userIdNotNull(client);
      lines.push(`user_id notnull after abort ${JSON.stringify(notNull)}`);
      for (const table of OWNED) check(lines, `${table} still nullable`, notNull[table], 0);

      const orphan = await rows(
        client,
        `SELECT notes FROM places WHERE id = 'plc_orphan'`
      );
      check(lines, 'orphan place kept', orphan[0]?.notes, 'keep me');
      check(lines, 'attachment kept', (await counts(client, ['attachments'])).attachments, 1);
      const kept = await rows(client, `SELECT name FROM collections WHERE id = 'col_ok'`);
      check(lines, 'owned collection kept', kept[0]?.name, 'Kept');

      const guard = await rows(
        client,
        `SELECT name FROM sqlite_master WHERE name = '__userid_not_null_guard'`
      );
      check(lines, 'guard table rolled back', guard, []);

      const ledger = await rows(
        client,
        `SELECT created_at FROM __drizzle_migrations ORDER BY created_at`
      );
      const applied = ledger.map((row) => Number(row.created_at));
      lines.push(`ledger ${applied.join(', ')}`);
      check(
        lines,
        'migration in ledger',
        applied.includes(journalWhen(LAST_TAG)) ? 'recorded' : 'absent',
        'absent'
      );

      await client.execute(
        `INSERT INTO places (id, user_id, name, kind) VALUES ('plc_still_null', NULL, 'Still Null', 'cafe')`
      );
      const stillNull = await rows(
        client,
        `SELECT COUNT(*) AS n FROM places WHERE user_id IS NULL`
      );
      check(lines, 'null owners still accepted', Number(stillNull[0]?.n), 2);
    } finally {
      publish('user-id-not-null-abort.txt', lines);
      client.close();
    }
  });

  it('enforces NOT NULL on a database built by one migrate of the full journal', async () => {
    const lines: string[] = ['# fresh journal replay'];
    const client = openDb(newDbFile());
    try {
      await migrateFolder(client, MIGRATIONS_DIR);
      const notNull = await userIdNotNull(client);
      lines.push(`user_id notnull ${JSON.stringify(notNull)}`);
      for (const table of OWNED) check(lines, `${table} NOT NULL`, notNull[table], 1);

      await client.execute(
        `INSERT INTO users (id, email) VALUES ('user_fresh', 'fresh@example.test')`
      );
      let message = 'inserted';
      try {
        await client.execute(
          `INSERT INTO upload_sessions (id, user_id, started_at) VALUES ('ses_null', NULL, '2026-10-12T00:00:00Z')`
        );
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      lines.push(`null upload session: ${message}`);
      expect(message).toContain('NOT NULL constraint failed: upload_sessions.user_id');

      await client.execute(
        `INSERT INTO upload_sessions (id, user_id, started_at) VALUES ('ses_ok', 'user_fresh', '2026-10-12T00:00:00Z')`
      );
      const created = await rows(client, `SELECT user_id FROM upload_sessions WHERE id = 'ses_ok'`);
      check(lines, 'owned session inserted', created[0]?.user_id, 'user_fresh');
    } finally {
      publish('user-id-not-null-fresh.txt', lines);
      client.close();
    }
  });
});
