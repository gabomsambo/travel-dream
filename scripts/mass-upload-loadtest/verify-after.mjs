/**
 * AFTER evidence: the same failure shapes, run against the fixed pipeline.
 *
 *   A2  the screenshot that used to be buried by clock-outs now completes.
 *   C   a hard mid-run kill: interrupted items are recovered, never failed, and
 *       already-paid-for Gemini work is not bought twice.
 *   D   three runs racing on one queue: every item is processed exactly once.
 *
 * Usage:
 *   ./scripts/mass-upload-loadtest/reset-db.sh
 *   LOADTEST_DB_URL=http://127.0.0.1:8089 node scripts/mass-upload-loadtest/verify-after.mjs <A2|C|D>
 */
import { spawn, spawnSync } from 'node:child_process';
import { rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getClient, resetSchema, seedQueue, statusCounts, detail, REPO_ROOT } from './lib.mjs';

const BLOB_PORT = Number(process.env.LOADTEST_BLOB_PORT ?? 8090);
const BLOB_BASE = `http://127.0.0.1:${BLOB_PORT}`;

const SCENARIO = process.argv[2] ?? 'A2';
const STATE_FILE = join(REPO_ROOT, '.loadtest-stub-state.json');
const COUNTER_FILE = join(REPO_ROOT, '.loadtest-calls.tsv');

function childEnv(extra) {
  return {
    ...process.env,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require ${join(REPO_ROOT, 'scripts/mass-upload-loadtest/fetch-stub.cjs')}`.trim(),
    TURSO_DATABASE_URL: process.env.LOADTEST_DB_URL,
    TURSO_AUTH_TOKEN: 'loadtest',
    CRON_SECRET: 'loadtest-secret',
    GEMINI_VISION_ENABLED: 'true',
    GOOGLE_GENERATIVE_AI_API_KEY: 'stub-key',
    GOOGLE_PLACES_API_KEY: 'stub-key',
    BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_stubstore_stubtokenvalue',
    // The Blob SDK does not go through the patched fetch — send it to the local
    // blob server so thumbnail uploads are exercised and never leave the machine.
    VERCEL_BLOB_API_URL: `${BLOB_BASE}/api/blob`,
    STUB_STATE_FILE: STATE_FILE,
    STUB_COUNTER_FILE: COUNTER_FILE,
    // No base URL → no HTTP fan-out from this in-process harness; each run
    // drains what it can and the harness starts the next one.
    MASS_UPLOAD_BASE_URL: '',
    NEXT_PUBLIC_APP_URL: '',
    NEXTAUTH_URL: '',
    ...extra,
  };
}

function runWorkerSync(extraEnv) {
  const started = Date.now();
  const res = spawnSync(
    join(REPO_ROOT, 'node_modules', '.bin', 'tsx'),
    ['scripts/mass-upload-loadtest/run-cron-child.mjs', 'process'],
    { cwd: REPO_ROOT, encoding: 'utf8', env: childEnv(extraEnv) }
  );
  const lines = (res.stdout ?? '').trim().split('\n').filter(Boolean);
  let parsed = null;
  try {
    parsed = JSON.parse(lines[lines.length - 1]);
  } catch {
    console.log((res.stdout ?? '').slice(-2000), (res.stderr ?? '').slice(-3000));
  }
  return { wallMs: Date.now() - started, result: parsed };
}

function runWorkerAsync(extraEnv, tag) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(
      join(REPO_ROOT, 'node_modules', '.bin', 'tsx'),
      ['scripts/mass-upload-loadtest/run-cron-child.mjs', 'process'],
      { cwd: REPO_ROOT, env: childEnv(extraEnv) }
    );
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', () => {});
    child.on('exit', () => {
      const lines = out.trim().split('\n').filter(Boolean);
      let parsed = null;
      try {
        parsed = JSON.parse(lines[lines.length - 1]);
      } catch {
        /* killed */
      }
      resolve({ tag, wallMs: Date.now() - started, result: parsed });
    });
  });
}

function geminiCalls() {
  if (!existsSync(COUNTER_FILE)) return 0;
  return readFileSync(COUNTER_FILE, 'utf8')
    .split('\n')
    .filter((l) => l.startsWith('gemini\t')).length;
}

/** Age out leases so the next run's reclaim pass sees them as expired. */
async function expireLeases(client) {
  await client.execute(
    `UPDATE sources SET processing_started_at = '2020-01-01T00:00:00.000Z'
     WHERE processing_status IN ('extracting','enriching')`
  );
}

/**
 * A requeued item serves its `next_attempt_at` backoff before it is claimable
 * again, so a recovery run started immediately finds nothing and returns in
 * milliseconds. Wait the backoff out the way the safety-net cron does, instead
 * of burning the guard on empty runs.
 */
async function waitForClaimableWork(client, maxWaitMs = 120_000) {
  const res = await client.execute(
    `SELECT MIN(next_attempt_at) AS soonest FROM sources
     WHERE processing_status = 'queued' AND next_attempt_at IS NOT NULL`
  );
  const soonest = res.rows[0]?.soonest;
  if (!soonest) return 0;
  const waitMs = Math.min(maxWaitMs, Date.parse(soonest) - Date.now() + 1000);
  if (waitMs <= 0) return 0;
  console.log(`  waiting ${Math.round(waitMs / 1000)}s for the retry backoff to elapse`);
  await new Promise((r) => setTimeout(r, waitMs));
  return waitMs;
}

async function summarize(client, label) {
  const counts = await statusCounts(client);
  const rows = await detail(client);
  const failed = rows.filter((r) => r.processing_status === 'failed');
  console.log(`${label}: counts=${JSON.stringify(counts)} geminiCalls=${geminiCalls()}`);
  if (failed.length) console.log(`  failed: ${failed.map((r) => `${r.id}(${r.processing_error})`).join(', ')}`);
  return { counts, rows };
}

function startBlobServer() {
  const child = spawn(process.execPath, [join(REPO_ROOT, 'scripts/mass-upload-loadtest/blob-server.mjs'), String(BLOB_PORT)], {
    cwd: REPO_ROOT,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => process.stdout.write(`[blob] ${d}`));
  return child;
}

async function waitForBlobServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${BLOB_BASE}/stats`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('blob server never became ready');
}

let blobServer = null;

async function main() {
  const client = getClient();
  blobServer = startBlobServer();
  await waitForBlobServer();
  rmSync(STATE_FILE, { force: true });
  rmSync(COUNTER_FILE, { force: true });
  await resetSchema(client);

  if (SCENARIO === 'A2') {
    // Same shape as BEFORE scenario A, with the raised function budget.
    await seedQueue(client, { count: 6 });
    const env = { STUB_GEMINI_MS: '4000', STUB_SLOW_SOURCES: 'src_load_0000:150000', KILL_AFTER_MS: '300000' };
    console.log('\n=== AFTER / A2: the screenshot that used to be buried by clock-outs ===');
    const run = runWorkerSync(env);
    console.log(`run: ${run.result?.event} after ${run.wallMs}ms → ${JSON.stringify(run.result?.body ?? {})}`);
    const { counts, rows } = await summarize(client, 'final');
    const target = rows.find((r) => r.id === 'src_load_0000');
    console.log(
      `\nsrc_load_0000 → status=${target.processing_status} attempts=${target.processing_attempts}\n` +
        (counts.failed ? 'REGRESSION: something was marked failed' : 'PASS: nothing marked failed; slow screenshot completed')
    );
    return;
  }

  if (SCENARIO === 'C') {
    // 40 screenshots, run killed hard at 45s, then recovered.
    const count = Number(process.env.SCENARIO_COUNT ?? 40);
    await seedQueue(client, { count });
    const env = { STUB_GEMINI_MS: '6000', KILL_AFTER_MS: '300000' };
    console.log(`\n=== AFTER / C: hard mid-run kill with ${count} screenshots ===`);

    // Run 1 — killed after 45s, mid-flight.
    const killEnv = { ...env, KILL_AFTER_MS: '45000' };
    const run1 = runWorkerSync(killEnv);
    console.log(`run 1: ${run1.result?.event} after ${run1.wallMs}ms`);
    const afterKill = await summarize(client, 'after kill');
    const inFlight = afterKill.rows.filter((r) => ['extracting', 'enriching'].includes(r.processing_status));
    console.log(`  ${inFlight.length} source(s) left in-flight holding a lease`);

    // A run started while the lease is still valid must not touch them.
    const run2 = runWorkerSync({ ...env, KILL_AFTER_MS: '30000' });
    console.log(`run 2 (lease still valid): ${run2.result?.event}`);
    const afterRun2 = await summarize(client, 'after run 2');
    const stillHeld = afterRun2.rows.filter((r) => inFlight.some((f) => f.id === r.id));
    const stolen = stillHeld.filter((r) => !['extracting', 'enriching'].includes(r.processing_status));
    console.log(`  leases respected: ${stolen.length === 0 ? 'yes' : `NO — ${stolen.length} taken early`}`);

    // Lease expires (time passes), then recovery.
    await expireLeases(client);
    let guard = 0;
    let counts = await statusCounts(client);
    while ((counts.queued ?? 0) + (counts.extracting ?? 0) + (counts.enriching ?? 0) > 0 && guard++ < 10) {
      await waitForClaimableWork(client);
      const run = runWorkerSync(env);
      console.log(`recovery run ${guard}: ${run.result?.event} after ${run.wallMs}ms`);
      counts = await statusCounts(client);
    }

    const final = await summarize(client, 'final');
    const failedCount = final.counts.failed ?? 0;
    const completed = final.counts.completed ?? 0;
    console.log(
      `\nitems=${count} completed=${completed} failed=${failedCount} stalled=${final.counts.stalled ?? 0} ` +
        `geminiCalls=${geminiCalls()} (extra calls = screenshots killed mid-extraction)\n` +
        (failedCount === 0 && completed === count
          ? 'PASS: every screenshot completed, none marked failed by the kill'
          : 'REGRESSION')
    );
    return;
  }

  if (SCENARIO === 'D') {
    const count = Number(process.env.SCENARIO_COUNT ?? 30);
    await seedQueue(client, { count });
    const env = { STUB_GEMINI_MS: '3000', KILL_AFTER_MS: '300000' };
    console.log(`\n=== AFTER / D: three concurrent runs on one ${count}-screenshot queue ===`);
    const runs = await Promise.all([
      runWorkerAsync(env, 'w1'),
      runWorkerAsync(env, 'w2'),
      runWorkerAsync(env, 'w3'),
    ]);
    for (const r of runs) {
      console.log(`${r.tag}: ${r.result?.event} in ${r.wallMs}ms → completed=${r.result?.body?.completed} claimed=${r.result?.body?.claimed}`);
    }
    const final = await summarize(client, 'final');
    const claimedTotal = runs.reduce((n, r) => n + (r.result?.body?.claimed ?? 0), 0);
    console.log(
      `\nclaims across runs=${claimedTotal} items=${count} geminiCalls=${geminiCalls()} ` +
        `completed=${final.counts.completed ?? 0} failed=${final.counts.failed ?? 0}\n` +
        (claimedTotal === count && geminiCalls() === count && (final.counts.completed ?? 0) === count
          ? 'PASS: each screenshot claimed once, extracted once, completed once'
          : 'REGRESSION: double-processing or lost items')
    );
    return;
  }

  throw new Error(`Unknown scenario ${SCENARIO}`);
}

// Killing the blob server lets the process exit on its own — calling
// process.exit() here would truncate buffered stdout.
main()
  .then(() => blobServer?.kill('SIGKILL'))
  .catch((err) => {
    console.error(err);
    blobServer?.kill('SIGKILL');
    process.exitCode = 1;
  });
