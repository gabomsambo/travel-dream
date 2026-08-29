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

// Two supported modes. Against the checked-in reference (CI, the default) a diff
// means a migration landed that the reference does not describe. Against an
// operator-supplied live `.schema` dump (docs/PHASE_B_RUNBOOK.md §4) the diffs
// alone cannot say why: unapplied migrations and real drift need opposite fixes
// and can produce the same shapes, so that mode's message routes the verdict
// through the journal-vs-ledger timestamp comparison instead of the diffs.
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

// The disambiguator for live-dump mode: the journal's newest entry is what an
// operator compares against `SELECT MAX(created_at) FROM __drizzle_migrations`
// on the database they dumped. Migrator and journal both key off epoch ms.
const journalNewest = journal.entries.reduce((newest, e) => (newest && newest.when >= e.when ? newest : e), null);
const journalNewestWhen = journalNewest?.when ?? null;
const journalNewestTag = journalNewest?.tag ?? null;

const reference = introspect(build(path.join(workDir, 'reference.db'), referenceStatements));
const fresh = introspect(build(path.join(workDir, 'fresh.db'), freshStatements));

const diffs = [];
const accepted = [];
const allTables = [...new Set([...Object.keys(reference), ...Object.keys(fresh)])].sort();

// Each diff carries which side holds the object, so the failure message can
// report what differs. Against the checked-in reference that direction is also
// the diagnosis; against a live dump it is only evidence — the ledger check in
// the live-dump remediation is what decides unapplied-migration vs drift.
const pushDiff = (direction, text) => diffs.push({ direction, text });

for (const t of allTables) {
  if (!reference[t]) {
    pushDiff('journal-ahead', `TABLE ONLY IN FRESH: ${t}`);
    continue;
  }
  if (!fresh[t]) {
    pushDiff('reference-ahead', `TABLE MISSING FROM FRESH: ${t}`);
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
        else pushDiff('reference-ahead', `${t}.${kind}: MISSING FROM FRESH ${JSON.stringify(v)}`);
      } else if (JSON.stringify(frs.get(k)) !== JSON.stringify(v)) {
        pushDiff(
          'mismatch',
          `${t}.${kind}: MISMATCH\n      reference: ${JSON.stringify(v)}\n      fresh    : ${JSON.stringify(frs.get(k))}`,
        );
      }
    }
    for (const [k, v] of frs) {
      if (ref.has(k)) continue;
      if (reference[t][kind].some((r) => isAcceptedEquivalence(t, r, v))) continue;
      pushDiff('journal-ahead', `${t}.${kind}: EXTRA IN FRESH ${JSON.stringify(v)}`);
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
  diffs.forEach((d) => console.log('  - ' + d.text));

  const count = (direction) => diffs.filter((d) => d.direction === direction).length;
  const journalAhead = count('journal-ahead');
  const referenceAhead = count('reference-ahead');
  const mismatched = count('mismatch');
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
    : [
        `WHAT THIS MEANS

You compared an operator-supplied reference against the migration journal:

    reference : ${referenceSqlPath}
    journal   : ${migrationsDir}

That is the read-only check in docs/PHASE_B_RUNBOOK.md §4, where the reference
is a \`.schema\` dump of a live database.

Do NOT read the fix off the direction of the diffs. Direction tells you which
side holds more objects, not why. Every shape below is ambiguous: an unapplied
additive migration adds to the journal side, an unapplied destructive one (DROP
COLUMN / DROP TABLE, or a drizzle-kit table rebuild that removes a column) adds
to the dump side, an unapplied column alteration redefines an object on both
sides, and a single unapplied rename produces two opposite-direction diffs at
once. Real drift can produce any of them too. Work the three steps instead.`,

        `  STEP 1 — rule out the boring causes before interpreting anything.

    An incomplete or stale \`.schema\` dump, or a journal that is not the one
    that database was built from. A truncated dump looks exactly like an
    unapplied migration.

    Note also that docs/db/prod-schema-reference.sql is NOT the file compared in
    this run. Editing it would hide this result without changing anything.`,

        `  STEP 2 — ask the one question that actually decides it:
  IS THE JOURNAL AHEAD OF THAT DATABASE'S MIGRATION LEDGER?

    journal newest \`when\` : ${journalNewestWhen ?? '(journal has no entries)'}${
      journalNewestTag ? `  (${journalNewestTag})` : ''
    }
        from ${path.join(migrationsDir, 'meta/_journal.json')}

    ledger newest        : run this against the database you dumped —

        SELECT MAX(created_at) FROM __drizzle_migrations;

    Both are epoch milliseconds, so compare them directly.`,

        `  STEP 3 — decide from step 2, not from the diffs.

    Journal newer than the ledger
      → Migrations are merged but were never applied to that database, whatever
        direction the diffs point. This is the PR #30 shape — production was
        missing three \`sources\` columns and returned HTTP 500 on every
        screenshot upload, every place-detail page, /review and the 5-minute
        cron until they were applied.

        APPLY THE MIGRATIONS. That is what un-breaks it; nothing else here does.

            npm run db:migrate    # atomic: one PRAGMA/BEGIN/.../COMMIT batch
                                  # (docs/PHASE_B_RUNBOOK.md §1)

        Take a backup first. Never \`drizzle-kit push\` against a shared
        database - it rebuilds tables.

    Ledger at or ahead of the journal, and the schemas still differ
      → Genuine drift: no migration reconciles it. STOP. Do not run
        \`npm run db:migrate\` to "catch it up". Re-baseline rather than
        reconcile — docs/PHASE_B_RUNBOOK.md §4 is the step that produced this
        comparison, and its instruction on a diff is to stop and re-baseline.`,

        `  EVIDENCE — what differs, and what each shape is consistent with.
  Diagnostics only. None of these is an instruction to act; step 3 decides.` +
          [
            journalAhead &&
              `

    "EXTRA IN FRESH" / "TABLE ONLY IN FRESH" (${journalAhead} above)
      The journal builds objects the dump does not have. Consistent with an
      unapplied additive migration, and with an object dropped out-of-band on
      that database.`,
            referenceAhead &&
              `

    "MISSING FROM FRESH" / "TABLE MISSING FROM FRESH" (${referenceAhead} above)
      The dump has objects replaying the journal does not produce. Consistent
      with drift, and with an unapplied destructive migration.`,
            mismatched &&
              `

    "MISMATCH" (${mismatched} above)
      The same object is defined differently on each side. Consistent with an
      unapplied column alteration — drizzle-kit cannot ALTER a SQLite column in
      place and renders it as a table rebuild that redefines the column — and
      with drift.`,
            journalAhead &&
              referenceAhead &&
              `

    Diffs in BOTH directions at once usually mean one rename or one table
    rebuild, not two independent problems. Do not treat them as two findings.`,
          ]
            .filter(Boolean)
            .join(''),
      ]
        .filter(Boolean)
        .join('\n\n');

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
