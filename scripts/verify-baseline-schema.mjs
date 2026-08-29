#!/usr/bin/env node
/**
 * Verify that a fresh database built from the migration journal matches the
 * production schema reference.
 *
 * This is the guard against "migration drift": `drizzle-kit generate` only
 * compares schema code against the drizzle snapshot, so the .sql files can
 * silently disagree with both while generate keeps reporting "no changes".
 * This script closes that hole by actually replaying the journal.
 *
 *   node scripts/verify-baseline-schema.mjs
 *   node scripts/verify-baseline-schema.mjs <reference.sql> <migrationsDir>
 *
 * SAFETY: never connects to a live database. Both sides are throwaway local
 * SQLite files created under the OS temp dir and deleted on exit.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultReferenceSqlPath = path.join(repoRoot, 'docs/db/prod-schema-reference.sql');
const referenceSqlPath = process.argv[2] ?? defaultReferenceSqlPath;
const migrationsDir = process.argv[3] ?? path.join(repoRoot, 'src/db/migrations');

// Two supported modes, and a diff means opposite things in each. Against the
// checked-in reference (CI, the default) a diff means a migration landed that
// the reference does not describe. Against an operator-supplied live `.schema`
// dump (docs/PHASE_B_RUNBOOK.md §4) it means that database has drifted from the
// journal. The remediation for one is wrong for the other, so pick per mode.
const usingCheckedInReference = path.resolve(referenceSqlPath) === defaultReferenceSqlPath;
const referenceLabel = usingCheckedInReference ? 'docs/db/prod-schema-reference.sql' : referenceSqlPath;
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'td-schema-verify-'));
process.on('exit', () => fs.rmSync(workDir, { recursive: true, force: true }));

/** Split a SQL file into executable statements, tolerating drizzle breakpoints. */
function splitStatements(sql) {
  // Strip comment-only lines *before* splitting: the reference dump's header
  // comment contains a semicolon, which would otherwise split mid-comment.
  const stripped = sql
    .replace(/^\s*--.*$/gm, '')
    .replace(/-->\s*statement-breakpoint/g, '');
  const out = [];
  let buf = '';
  let inTicks = false;
  let inQuotes = false;
  for (const ch of stripped) {
    if (ch === '`') inTicks = !inTicks;
    if (ch === "'") inQuotes = !inQuotes;
    buf += ch;
    if (ch === ';' && !inTicks && !inQuotes) {
      out.push(buf);
      buf = '';
    }
  }
  if (buf.trim()) out.push(buf);
  return out.map((s) => s.trim()).filter((s) => s.length > 0);
}

function build(dbFile, statements) {
  const db = new DatabaseSync(dbFile);
  for (const stmt of statements) {
    try {
      db.exec(stmt);
    } catch (e) {
      throw new Error(`Failed statement:\n${stmt}\n--> ${e.message}`);
    }
  }
  return db;
}

// drizzle manages its own ledger table; it is not part of the app schema.
const IGNORED_TABLES = new Set(['__drizzle_migrations', 'sqlite_sequence']);

function introspect(db) {
  const q = (sql) => db.prepare(sql).all();
  const tables = q(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
    .map((r) => r.name)
    .filter((n) => !IGNORED_TABLES.has(n) && !n.startsWith('sqlite_'));

  const schema = {};
  for (const t of tables) {
    const cols = q(`PRAGMA table_info(\`${t}\`)`)
      .map((r) => ({
        name: r.name,
        type: String(r.type || '').toUpperCase(),
        notnull: !!r.notnull,
        dflt: r.dflt_value === null || r.dflt_value === undefined ? null : String(r.dflt_value),
        pk: Number(r.pk),
      }))
      // Physical column order differs (production grew via ALTER TABLE ADD COLUMN)
      // and carries no semantics in SQLite; compare by name.
      .sort((a, b) => a.name.localeCompare(b.name));

    const fks = q(`PRAGMA foreign_key_list(\`${t}\`)`)
      .map((r) => ({
        from: r.from,
        table: r.table,
        to: r.to,
        on_delete: String(r.on_delete || 'NO ACTION').toUpperCase(),
        on_update: String(r.on_update || 'NO ACTION').toUpperCase(),
      }))
      .sort((a, b) => (a.from + a.table).localeCompare(b.from + b.table));

    const indexes = q(`PRAGMA index_list(\`${t}\`)`)
      .map((r) => ({
        // origin 'c' = CREATE INDEX, 'u' = UNIQUE constraint, 'pk' = PRIMARY KEY.
        // Auto-created indexes get generated names that are not comparable across
        // the two spellings of the same constraint, so compare them by shape.
        name: String(r.origin) === 'c' ? r.name : `<auto:${r.origin}>`,
        unique: !!r.unique,
        columns: q(`PRAGMA index_info(\`${r.name}\`)`).map((i) => i.name),
      }))
      .sort((a, b) => (a.name + a.columns.join()).localeCompare(b.name + b.columns.join()));

    schema[t] = { cols, fks, indexes };
  }
  return schema;
}

/**
 * Differences that are functionally identical, only spelled differently.
 * Production declares `users.email text NOT NULL UNIQUE` (enforced by an
 * implicit sqlite_autoindex); drizzle emits an equivalent named
 * `CREATE UNIQUE INDEX users_email_unique`. Both reject duplicate emails.
 */
function isAcceptedEquivalence(table, prodIdx, freshIdx) {
  return (
    table === 'users' &&
    prodIdx?.name === '<auto:u>' &&
    freshIdx?.name === 'users_email_unique' &&
    prodIdx.unique &&
    freshIdx.unique &&
    JSON.stringify(prodIdx.columns) === JSON.stringify(freshIdx.columns)
  );
}

const referenceStatements = splitStatements(fs.readFileSync(referenceSqlPath, 'utf8')).filter(
  (s) => !/__drizzle_migrations/.test(s),
);

const journal = JSON.parse(fs.readFileSync(path.join(migrationsDir, 'meta/_journal.json'), 'utf8'));
const freshStatements = journal.entries.flatMap((e) =>
  splitStatements(fs.readFileSync(path.join(migrationsDir, `${e.tag}.sql`), 'utf8')),
);

const reference = introspect(build(path.join(workDir, 'reference.db'), referenceStatements));
const fresh = introspect(build(path.join(workDir, 'fresh.db'), freshStatements));

const diffs = [];
const accepted = [];
const allTables = [...new Set([...Object.keys(reference), ...Object.keys(fresh)])].sort();

for (const t of allTables) {
  if (!reference[t]) {
    diffs.push(`TABLE ONLY IN FRESH: ${t}`);
    continue;
  }
  if (!fresh[t]) {
    diffs.push(`TABLE MISSING FROM FRESH: ${t}`);
    continue;
  }
  for (const kind of ['cols', 'fks', 'indexes']) {
    if (JSON.stringify(reference[t][kind]) === JSON.stringify(fresh[t][kind])) continue;

    const identity = (x) => JSON.stringify([x.name ?? x.from, x.columns ?? null]);
    const ref = new Map(reference[t][kind].map((x) => [identity(x), x]));
    const frs = new Map(fresh[t][kind].map((x) => [identity(x), x]));

    for (const [k, v] of ref) {
      if (!frs.has(k)) {
        const match = fresh[t][kind].find((f) => isAcceptedEquivalence(t, v, f));
        if (match) accepted.push(`${t}: ${JSON.stringify(v)} == ${JSON.stringify(match)}`);
        else diffs.push(`${t}.${kind}: MISSING FROM FRESH ${JSON.stringify(v)}`);
      } else if (JSON.stringify(frs.get(k)) !== JSON.stringify(v)) {
        diffs.push(
          `${t}.${kind}: MISMATCH\n      reference: ${JSON.stringify(v)}\n      fresh    : ${JSON.stringify(frs.get(k))}`,
        );
      }
    }
    for (const [k, v] of frs) {
      if (ref.has(k)) continue;
      if (reference[t][kind].some((r) => isAcceptedEquivalence(t, r, v))) continue;
      diffs.push(`${t}.${kind}: EXTRA IN FRESH ${JSON.stringify(v)}`);
    }
  }
}

const namedIndexes = (s) =>
  Object.values(s).reduce((n, t) => n + t.indexes.filter((i) => !i.name.startsWith('<auto')).length, 0);

console.log(`reference : ${Object.keys(reference).length} tables, ${namedIndexes(reference)} named indexes`);
console.log(`fresh     : ${Object.keys(fresh).length} tables, ${namedIndexes(fresh)} named indexes`);
console.log(`journal   : ${journal.entries.length} migration(s) — ${journal.entries.map((e) => e.tag).join(', ')}`);

if (accepted.length) {
  console.log(`\nAccepted equivalences (${accepted.length}):`);
  accepted.forEach((a) => console.log('  ~ ' + a));
}

if (diffs.length) {
  console.log(`\nFAIL — ${diffs.length} difference(s):`);
  diffs.forEach((d) => console.log('  - ' + d));
  const whatThisMeans = usingCheckedInReference
    ? `WHAT THIS MEANS

The migration journal now builds a schema that
docs/db/prod-schema-reference.sql does not describe. That reference is what
production is believed to have, so this is the shape of "a migration landed
and the database was never migrated".

This exact failure is what PR #30 would have produced. It merged instead,
deployed, and production returned HTTP 500 on every screenshot upload, every
place-detail page, /review and the 5-minute cron until the migrations were
applied by hand.

HOW TO FIX IT — both steps, in this order

  1. APPLY THE MIGRATIONS to production. This is the step that actually
     un-breaks production; nothing else here does.

         npm run db:migrate        # atomic: one PRAGMA/BEGIN/.../COMMIT batch

     Take a backup first and read docs/PHASE_B_RUNBOOK.md. Never run
     \`drizzle-kit push\` against a shared database - it rebuilds tables.

  2. THEN refresh docs/db/prod-schema-reference.sql from the migrated
     production database (read-only \`.schema\` dump) and re-run this script.

Do not do step 2 alone. Editing the reference until this script goes green,
without applying the migrations, silences the check and leaves production
broken in exactly the way it was broken this morning.`
    : `WHAT THIS MEANS

You compared an operator-supplied reference against the migration journal:

    reference : ${referenceSqlPath}
    journal   : ${migrationsDir}

That is the read-only drift check in docs/PHASE_B_RUNBOOK.md §4, where the
reference is a \`.schema\` dump of a live database. So these differences mean
THAT DATABASE HAS DRIFTED from the journal — its schema is not what replaying
the journal produces. This is NOT the "a migration landed unapplied" case.

WHAT TO DO

  1. STOP. Do not run \`npm run db:migrate\` to "catch it up" — the journal is
     not a description of that database, and applying it can collide with
     columns that already exist.

  2. Do not edit docs/db/prod-schema-reference.sql either. It is not the file
     compared in this run, so changing it would hide the drift without
     touching it.

  3. Rule out the boring causes first: an incomplete or stale \`.schema\` dump,
     and a journal that is not the one that database was built from.

  4. If the drift is real, re-baseline rather than reconcile. Read
     docs/PHASE_B_RUNBOOK.md — §4 is the step that produced this comparison,
     and its instruction on a diff is to stop and re-baseline.`;

  console.log(`
------------------------------------------------------------------------------
${whatThisMeans}

If a diff listed above is a deliberate, functionally-equivalent spelling difference,
add it to isAcceptedEquivalence() in this file with a comment saying why -
do not paper over it in ${referenceLabel}.
------------------------------------------------------------------------------`);
  process.exitCode = 1;
} else {
  console.log('\nPASS — a fresh database from the journal is schema-equivalent to the reference.');
}
