/**
 * BEFORE evidence: reproduce "a good screenshot gets marked failed because the
 * function ran out of clock" against the pre-fix cron pipeline.
 *
 * Two scenarios, both run against a throwaway Docker libSQL server:
 *
 *   A (pure clock-out)  one screenshot whose extraction takes longer than
 *                       maxDuration. Every run is killed mid-item; after
 *                       MAX_ATTEMPTS the recovery pass marks it `failed`.
 *   B (mixed)           a screenshot that hits two transient upstream 503s and
 *                       is then interrupted once by a kill. The clock-out burns
 *                       the last attempt, so an image that WOULD have succeeded
 *                       on the next try is buried as `failed`.
 *
 * Usage: LOADTEST_DB_URL=http://127.0.0.1:8089 node scripts/mass-upload-loadtest/repro-before.mjs
 */
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { getClient, resetSchema, seedQueue, statusCounts, detail, REPO_ROOT } from './lib.mjs';

const KILL_AFTER_MS = Number(process.env.KILL_AFTER_MS ?? 120000);
const STATE_FILE = join(REPO_ROOT, '.loadtest-stub-state.json');
const SCENARIO = process.argv[2] ?? 'A';

function runCron(extraEnv) {
  const started = Date.now();
  const res = spawnSync(
    join(REPO_ROOT, 'node_modules', '.bin', 'tsx'),
    ['scripts/mass-upload-loadtest/run-cron-child.mjs', 'cron'],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require ${join(REPO_ROOT, 'scripts/mass-upload-loadtest/fetch-stub.cjs')}`.trim(),
        TURSO_DATABASE_URL: process.env.LOADTEST_DB_URL,
        TURSO_AUTH_TOKEN: 'loadtest',
        CRON_SECRET: 'loadtest-secret',
        GEMINI_VISION_ENABLED: 'true',
        GOOGLE_GENERATIVE_AI_API_KEY: 'stub-key',
        GOOGLE_PLACES_API_KEY: 'stub-key',
        BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_stubstore_stubtokenvalue',
        STUB_STATE_FILE: STATE_FILE,
        KILL_AFTER_MS: String(KILL_AFTER_MS),
        ...extraEnv,
      },
    }
  );
  const lines = (res.stdout ?? '').trim().split('\n').filter(Boolean);
  const last = lines[lines.length - 1];
  let parsed = null;
  try {
    parsed = JSON.parse(last);
  } catch {
    /* not our line */
  }
  if (!parsed) console.log((res.stdout ?? '').slice(-2000), (res.stderr ?? '').slice(-3000));
  return { wallMs: Date.now() - started, result: parsed, stderr: res.stderr };
}

/** Age out in-flight rows so the next run's recovery pass sees them as stale. */
async function backdate(client) {
  await client.execute(
    `UPDATE sources SET processing_started_at = '2020-01-01T00:00:00.000Z'
     WHERE processing_status IN ('extracting','enriching')`
  );
}

async function main() {
  const client = getClient();
  rmSync(STATE_FILE, { force: true });
  await resetSchema(client);

  let env;
  let label;
  if (SCENARIO === 'A') {
    // 6 screenshots; the FIRST one needs 150s of Gemini — more than maxDuration=120s.
    await seedQueue(client, { count: 6 });
    env = { STUB_GEMINI_MS: '4000', STUB_SLOW_SOURCES: `src_load_0000:${KILL_AFTER_MS + 30000}` };
    label = 'A: pure clock-out on one slow screenshot';
  } else {
    // 6 screenshots; the first sees two transient 503s, then a kill on attempt 3.
    await seedQueue(client, { count: 6 });
    // 6 = two full extraction attempts' worth of 503s (the service retries 3x internally).
    env = { STUB_GEMINI_MS: '4000', STUB_FAIL_SOURCES: 'src_load_0000:6', STUB_SLOW_SOURCES: `src_load_0000:${KILL_AFTER_MS + 30000}` };
    label = 'B: two transient upstream errors + one clock-out';
  }

  console.log(`\n=== BEFORE / scenario ${label} ===`);
  console.log(`maxDuration simulated at ${KILL_AFTER_MS}ms, MAX_ATTEMPTS=3\n`);

  const runs = [];
  for (let i = 1; i <= 4; i++) {
    const { wallMs, result } = runCron(env);
    const counts = await statusCounts(client);
    const row = (await detail(client)).find((r) => r.id === 'src_load_0000');
    console.log(
      `run ${i}: ${result?.event ?? 'unknown'} after ${wallMs}ms | counts=${JSON.stringify(counts)} | ` +
        `src_load_0000 status=${row.processing_status} attempts=${row.processing_attempts} err=${row.processing_error ?? '-'}`
    );
    runs.push({ run: i, wallMs, event: result?.event, counts, target: { ...row } });
    await backdate(client);
  }

  // One more run so the recovery pass sees the last interrupted item as stale.
  const final = runCron(env);
  const counts = await statusCounts(client);
  const rows = await detail(client);
  const target = rows.find((r) => r.id === 'src_load_0000');
  console.log(
    `\nfinal recovery run: ${final.result?.event} | counts=${JSON.stringify(counts)}\n` +
      `src_load_0000 → status=${target.processing_status} attempts=${target.processing_attempts} error=${target.processing_error}\n`
  );

  const verdict =
    target.processing_status === 'failed'
      ? 'REPRODUCED: a perfectly good screenshot is now marked `failed` purely because runs ran out of clock.'
      : `NOT reproduced (status=${target.processing_status})`;
  console.log(verdict);
  console.log(JSON.stringify({ scenario: SCENARIO, runs, finalCounts: counts, target }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
