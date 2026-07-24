#!/usr/bin/env node
/**
 * Rehearse the Phase B ledger reconciliation (docs/PHASE_B_RUNBOOK.md) against a
 * throwaway local SQLite database that simulates production:
 *
 *   - schema built from docs/db/prod-schema-reference.sql
 *   - `__drizzle_migrations` pre-loaded with the 15 pre-baseline ledger rows
 *
 * It then shows both outcomes:
 *   1. WITHOUT reconciliation -> `migrate()` replays the baseline and fails
 *      ("table already exists"), which is what would happen to production today.
 *   2. WITH reconciliation    -> `migrate()` is a clean no-op.
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
const referenceSql = path.join(repoRoot, 'docs/db/prod-schema-reference.sql');
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
  // Strip comment-only lines first: the reference dump's header comment contains
  // a semicolon, which would otherwise split a statement mid-comment.
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

/** Build a local stand-in for production: real schema + the old ledger rows. */
async function simulateProduction(name) {
  const file = path.join(workDir, name);
  const client = createClient({ url: `file:${file}` });
  for (const stmt of statements(fs.readFileSync(referenceSql, 'utf8'))) {
    await client.execute(stmt);
  }
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
console.log(`\n[2] migrate() AFTER reconciliation   -> ${reconciled.ok ? 'clean no-op as expected' : 'FAILED (UNEXPECTED)'}`);
if (!reconciled.ok) console.log(`    ${reconciled.error}`);

const finalLedger = await ledger(after);
console.log(`    ledger rows: ${finalLedger.length}`);
finalLedger.forEach((r) => console.log(`      ${r.created_at}  ${r.hash}`));

// Migrating twice must stay a no-op and must not duplicate ledger rows.
const again = await tryMigrate(after);
const ledgerAfterSecondRun = await ledger(after);
console.log(`\n[3] migrate() run a second time      -> ${again.ok ? 'clean no-op' : 'FAILED'} (${ledgerAfterSecondRun.length} ledger row(s))`);

const pass =
  !unreconciled.ok &&
  reconciled.ok &&
  again.ok &&
  finalLedger.length === 1 &&
  ledgerAfterSecondRun.length === 1 &&
  String(finalLedger[0].hash) === baselineHash;

console.log(`\n${pass ? 'PASS — runbook reconciliation behaves as documented.' : 'FAIL — runbook needs revisiting.'}`);
process.exitCode = pass ? 0 : 1;
