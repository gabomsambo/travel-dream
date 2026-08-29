#!/usr/bin/env node
/**
 * Rehearse the Phase B ledger reconciliation (docs/PHASE_B_RUNBOOK.md) against a
 * throwaway local SQLite database that simulates production:
 *
 *   - schema built from src/db/migrations/0000_baseline.sql (production's
 *     schema at the moment its ledger held those 15 rows)
 *   - `__drizzle_migrations` pre-loaded with the 15 pre-baseline ledger rows
 *
 * It then shows both outcomes:
 *   1. WITHOUT reconciliation -> `migrate()` replays the baseline and fails
 *      ("table already exists") — what would have happened to production had
 *      Phase B not been run.
 *   2. WITH reconciliation    -> `migrate()` succeeds, applying only the
 *      journal entries newer than the baseline, and is a no-op on a second run.
 *
 * SAFETY: this never connects to a live database. It only ever opens a `file:`
 * SQLite database in a temp dir, which is deleted on exit. Run it before Phase B
 * to confirm the runbook steps still behave as documented.
 *
 *   node scripts/rehearse-ledger-reconciliation.mjs
 */
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsFolder = path.join(repoRoot, 'src/db/migrations');
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'td-ledger-rehearsal-'));
process.on('exit', () => fs.rmSync(workDir, { recursive: true, force: true }));

// The 15 migrations production's ledger recorded before the baseline landed.
// created_at values are the `when` fields from the pre-baseline _journal.json.
const PRE_BASELINE_LEDGER = [
  1759077770601, 1759091058813, 1759204221066, 1759450654214, 1759469309314,
  1759879176861, 1760283881595, 1763940636097, 1765064326834, 1765209362052,
  1765209548101, 1771715931459, 1772944754872, 1777141240216, 1777154624696,
];

const journal = JSON.parse(fs.readFileSync(path.join(migrationsFolder, 'meta/_journal.json'), 'utf8'));
const baseline = journal.entries[0];
const baselineSql = fs.readFileSync(path.join(migrationsFolder, `${baseline.tag}.sql`), 'utf8');
const baselineHash = crypto.createHash('sha256').update(baselineSql).digest('hex');

function statements(sql) {
  // Strip comment-only lines first: a header comment containing a semicolon
  // would otherwise split a statement mid-comment.
  const stripped = sql.replace(/^\s*--.*$/gm, '');
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
  return out.map((s) => s.trim()).filter(Boolean);
}

/**
 * Build a local stand-in for production *at the moment Phase B runs*: the
 * baseline-era schema plus the 15 old ledger rows.
 *
 * The schema comes from `0000_baseline.sql`, not from
 * docs/db/prod-schema-reference.sql. The reference tracks production as it is
 * *today* and moves forward every time a migration is applied there, so
 * building from it would hand this rehearsal a database that already contains
 * the columns the post-baseline migrations add — a state that never existed,
 * and one where scenario 2 dies on `duplicate column name`. The baseline is by
 * construction the schema production had when its ledger held those 15 rows,
 * and `scripts/verify-baseline-schema.mjs` is what keeps it equivalent to the
 * reference.
 */
async function simulateProduction(name) {
  const file = path.join(workDir, name);
  const client = createClient({ url: `file:${file}` });
  for (const stmt of statements(baselineSql.replace(/-->\s*statement-breakpoint/g, ''))) {
    await client.execute(stmt);
  }
  // The baseline does not create drizzle's ledger table; production already had it.
  await client.execute(
    'CREATE TABLE IF NOT EXISTS __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)',
  );
  for (const [i, createdAt] of PRE_BASELINE_LEDGER.entries()) {
    await client.execute({
      sql: 'INSERT INTO __drizzle_migrations ("hash", "created_at") VALUES (?, ?)',
      args: [`simulated_pre_baseline_hash_${i}`, createdAt],
    });
  }
  return client;
}

async function tryMigrate(client) {
  try {
    await migrate(drizzle(client), { migrationsFolder });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message.split('\n')[0] };
  }
}

async function ledger(client) {
  const rows = await client.execute(
    'SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at',
  );
  return rows.rows;
}

console.log(`baseline tag  : ${baseline.tag}`);
console.log(`baseline hash : ${baselineHash}`);
console.log(`baseline when : ${baseline.when} (${new Date(baseline.when).toISOString()})`);
console.log(`old ledger max: ${Math.max(...PRE_BASELINE_LEDGER)} (${new Date(Math.max(...PRE_BASELINE_LEDGER)).toISOString()})`);

// --- Scenario 1: what happens to production today, with no reconciliation ------
const before = await simulateProduction('unreconciled.db');
const unreconciled = await tryMigrate(before);
console.log(`\n[1] migrate() WITHOUT reconciliation -> ${unreconciled.ok ? 'succeeded (UNEXPECTED)' : 'FAILED as expected'}`);
if (!unreconciled.ok) console.log(`    ${unreconciled.error}`);

// --- Scenario 2: the runbook's reconciliation, then migrate ------------------
const after = await simulateProduction('reconciled.db');
// These two statements are the reconciliation. They must match the runbook exactly.
await after.execute('DELETE FROM __drizzle_migrations');
await after.execute({
  sql: 'INSERT INTO __drizzle_migrations ("hash", "created_at") VALUES (?, ?)',
  args: [baselineHash, baseline.when],
});

const reconciled = await tryMigrate(after);
const pendingAfterBaseline = journal.entries.length - 1;
console.log(
  `\n[2] migrate() AFTER reconciliation   -> ${
    reconciled.ok
      ? `succeeded as expected (applies the ${pendingAfterBaseline} migration(s) newer than the baseline)`
      : 'FAILED (UNEXPECTED)'
  }`,
);
if (!reconciled.ok) console.log(`    ${reconciled.error}`);

const finalLedger = await ledger(after);
console.log(`    ledger rows: ${finalLedger.length} (expected ${journal.entries.length})`);
finalLedger.forEach((r) => console.log(`      ${r.created_at}  ${r.hash}`));

// Migrating twice must stay a no-op and must not duplicate ledger rows.
const again = await tryMigrate(after);
const ledgerAfterSecondRun = await ledger(after);
console.log(`\n[3] migrate() run a second time      -> ${again.ok ? 'clean no-op' : 'FAILED'} (${ledgerAfterSecondRun.length} ledger row(s))`);

// The end state is one ledger row per journal entry: the baseline row the
// reconciliation writes, plus one for every migration `migrate()` then applies.
// Do NOT hardcode this - it was pinned at 1, which made the script exit
// non-zero the moment PR #30 added two migrations, even though every scenario
// above still behaved exactly as documented.
const expectedLedgerRows = journal.entries.length;

const pass =
  !unreconciled.ok &&
  reconciled.ok &&
  again.ok &&
  finalLedger.length === expectedLedgerRows &&
  ledgerAfterSecondRun.length === expectedLedgerRows &&
  String(finalLedger[0].hash) === baselineHash;

console.log(`\n${pass ? 'PASS — runbook reconciliation behaves as documented.' : 'FAIL — runbook needs revisiting.'}`);
process.exitCode = pass ? 0 : 1;
