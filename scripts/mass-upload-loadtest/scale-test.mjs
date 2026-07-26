/**
 * 500-screenshot scale test against a REAL Next.js server and a THROWAWAY
 * Docker libSQL database, with the real screenshot corpus served through the
 * fake blob host. Gemini / Google Places / Vercel Blob are intercepted, so the
 * test costs nothing and touches no production storage.
 *
 * What is real here: the routes, the queue, the leases, the HTTP fan-out to
 * workers, `after()`, sharp on real PNGs, and every database write.
 *
 * Env:
 *   LOADTEST_DB_URL    throwaway libSQL (required)
 *   SCALE_COUNT        screenshots to queue (default 500)
 *   SCALE_KILL_AT      fraction completed at which to hard-kill the server (default 0.6)
 *   STUB_CORPUS_DIR    directory of real screenshots (optional)
 *   PORT               dev server port (default 3100)
 */
import { spawn } from 'node:child_process';
import { rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getClient, resetSchema, seedQueue, statusCounts, REPO_ROOT } from './lib.mjs';

const PORT = Number(process.env.PORT ?? 3100);
const BASE = `http://127.0.0.1:${PORT}`;
const COUNT = Number(process.env.SCALE_COUNT ?? 500);
const KILL_AT = Number(process.env.SCALE_KILL_AT ?? 0.6);
const COUNTER_FILE = join(REPO_ROOT, '.loadtest-calls.tsv');
/** How long we wait for the cron to acknowledge before letting it run on alone. */
const TRIGGER_ACK_MS = Number(process.env.SCALE_TRIGGER_ACK_MS ?? 10_000);
const BLOB_PORT = Number(process.env.LOADTEST_BLOB_PORT ?? 8090);
const BLOB_BASE = `http://127.0.0.1:${BLOB_PORT}`;

/**
 * Every credential the server could otherwise pick up from .env.local is
 * overridden here. @next/env never overwrites a variable that is already set,
 * so the dev server cannot reach the owner's Turso database or Blob store even
 * though .env.local is still loaded.
 */
function safeEnv() {
  return {
    TURSO_DATABASE_URL: process.env.LOADTEST_DB_URL,
    TURSO_AUTH_TOKEN: 'loadtest',
    CRON_SECRET: 'loadtest-secret',
    NEXTAUTH_SECRET: 'loadtest-secret-loadtest-secret',
    NEXTAUTH_URL: BASE,
    NEXT_PUBLIC_APP_URL: BASE,
    MASS_UPLOAD_BASE_URL: BASE,
    GOOGLE_GENERATIVE_AI_API_KEY: 'stub-key',
    GOOGLE_PLACES_API_KEY: 'stub-key',
    GEMINI_VISION_ENABLED: 'true',
    BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_stubstore_stubtokenvalue',
    // The Blob SDK does not go through the patched fetch, so it is pointed at
    // the local blob server instead.
    VERCEL_BLOB_API_URL: `${BLOB_BASE}/api/blob`,
    // Local rate limiting only; never the shared Upstash instance.
    UPSTASH_REDIS_REST_URL: '',
    UPSTASH_REDIS_REST_TOKEN: '',
  };
}

function startBlobServer() {
  const child = spawn(process.execPath, [join(REPO_ROOT, 'scripts/mass-upload-loadtest/blob-server.mjs'), String(BLOB_PORT)], {
    cwd: REPO_ROOT,
    env: { ...process.env, STUB_CORPUS_DIR: process.env.STUB_CORPUS_DIR ?? '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => process.stdout.write(`[blob] ${d}`));
  return child;
}

function startServer() {
  const child = spawn(
    join(REPO_ROOT, 'node_modules', '.bin', 'next'),
    ['dev', '-p', String(PORT), '-H', '127.0.0.1'],
    {
      cwd: REPO_ROOT,
      // `next dev` is a wrapper around a `next-server` child: killing only the
      // wrapper leaves a live worker behind, which would make the mid-run kill a
      // lie (and let the lease-ageing shortcut steal leases from a process that
      // is still working). Own the whole group so the kill is a real kill.
      detached: true,
      env: {
        ...process.env,
        ...safeEnv(),
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require ${join(REPO_ROOT, 'scripts/mass-upload-loadtest/fetch-stub.cjs')}`.trim(),
        NODE_ENV: 'development',
        STUB_COUNTER_FILE: COUNTER_FILE,
        STUB_GEMINI_MS: process.env.STUB_GEMINI_MS ?? '8000',
        STUB_GOOGLE_MS: process.env.STUB_GOOGLE_MS ?? '150',
        STUB_PLACES_PER_IMAGE: process.env.STUB_PLACES_PER_IMAGE ?? '3',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  child.stdout.on('data', (d) => process.env.SCALE_VERBOSE && process.stdout.write(`[next] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[next!] ${d}`));
  return child;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** SIGKILL the server's whole process group and wait for the port to be free. */
async function killServer(child) {
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      /* already gone */
    }
  }
  for (let i = 0; i < 40; i++) {
    try {
      await fetch(`${BASE}/api/mass-upload/cron`, { signal: AbortSignal.timeout(500) });
    } catch {
      return; // nothing is listening any more — the kill is complete
    }
    await sleep(250);
  }
  throw new Error('server survived SIGKILL');
}

/** Fail loudly instead of silently measuring somebody else's server. */
async function assertPortFree() {
  try {
    const res = await fetch(`${BASE}/api/mass-upload/cron`, { signal: AbortSignal.timeout(2000) });
    throw new Error(`something is already listening on ${BASE} (status ${res.status}) — stop it first`);
  } catch (err) {
    if (err instanceof Error && err.message.includes('already listening')) throw err;
  }
}

async function waitForBlobServer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BLOB_BASE}/stats`);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error('blob server never became ready');
}

async function waitForServer(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/mass-upload/cron`, { method: 'GET' });
      if (res.status === 401 || res.status === 200) return true;
    } catch {
      /* not up yet */
    }
    await sleep(1000);
  }
  throw new Error('dev server never became ready');
}

function geminiCalls() {
  if (!existsSync(COUNTER_FILE)) return 0;
  return readFileSync(COUNTER_FILE, 'utf8').split('\n').filter((l) => l.startsWith('gemini\t')).length;
}

/**
 * Fire the safety-net cron. It drains the queue in-process and can run for its
 * full budget, so the harness must not wait on the response — undici's default
 * headers timeout would kill the harness, not the run.
 */
function triggerCron() {
  return fetch(`${BASE}/api/mass-upload/cron`, {
    headers: { authorization: 'Bearer loadtest-secret' },
    signal: AbortSignal.timeout(TRIGGER_ACK_MS),
  }).catch(() => null);
}

async function main() {
  const client = getClient();
  await assertPortFree();
  const blobServer = startBlobServer();
  await waitForBlobServer();
  rmSync(COUNTER_FILE, { force: true });
  await resetSchema(client);
  await seedQueue(client, { count: COUNT, uriBase: `${BLOB_BASE}/screenshots` });
  console.log(`seeded ${COUNT} screenshots into the throwaway database`);

  const timeline = [];
  let server = startServer();
  const startedAt = Date.now();
  let killed = false;

  try {
    await waitForServer();
    console.log(`dev server ready on ${BASE}`);

    // Kick off processing the way an upload would (dispatch + a working run).
    const trigger = triggerCron();

    let lastLog = 0;
    while (true) {
      await sleep(5000);
      const counts = await statusCounts(client);
      const done = (counts.completed ?? 0) + (counts.failed ?? 0) + (counts.stalled ?? 0);
      const elapsed = Math.round((Date.now() - startedAt) / 1000);

      if (elapsed - lastLog >= 15 || done >= COUNT) {
        lastLog = elapsed;
        console.log(`t+${elapsed}s ${JSON.stringify(counts)} gemini=${geminiCalls()}`);
        timeline.push({ elapsed, counts: { ...counts }, gemini: geminiCalls() });
      }

      // ── The real-world case: hard kill mid-flight ──────────────────────
      if (!killed && (counts.completed ?? 0) >= COUNT * KILL_AT) {
        killed = true;
        const inFlight = (counts.extracting ?? 0) + (counts.enriching ?? 0);
        console.log(
          `\n*** KILL -9 at ${counts.completed} completed, ${inFlight} in-flight, t+${elapsed}s ***\n`
        );
        await killServer(server);

        // Simulate the lease TTL elapsing, then bring the app back.
        await client.execute(
          `UPDATE sources SET processing_started_at = '2020-01-01T00:00:00.000Z'
           WHERE processing_status IN ('extracting','enriching')`
        );
        server = startServer();
        await waitForServer();
        console.log('server restarted; safety-net cron takes over');
        await triggerCron();
        continue;
      }

      if (done >= COUNT) break;

      // Nothing in flight and nothing queued would mean the pool died — the
      // safety-net cron is what recovers that in production.
      if ((counts.queued ?? 0) > 0 && (counts.extracting ?? 0) + (counts.enriching ?? 0) === 0) {
        await triggerCron();
      }

      if (elapsed > Number(process.env.SCALE_TIMEOUT_S ?? 3600)) {
        throw new Error('scale test timed out');
      }
    }

    await trigger;
    const counts = await statusCounts(client);
    const wallSeconds = Math.round((Date.now() - startedAt) / 1000);
    const places = await client.execute('SELECT COUNT(*) AS n FROM places');
    const attachments = await client.execute('SELECT COUNT(*) AS n FROM attachments');
    const interrupted = await client.execute(
      'SELECT COALESCE(SUM(processing_interruptions),0) AS n FROM sources'
    );
    const attempts = await client.execute('SELECT COALESCE(SUM(processing_attempts),0) AS n FROM sources');

    console.log('\n=== SCALE TEST RESULT ===');
    console.log(`screenshots         ${COUNT}`);
    console.log(`final counts        ${JSON.stringify(counts)}`);
    console.log(`wall time           ${wallSeconds}s`);
    console.log(`gemini calls        ${geminiCalls()} (one per screenshot + one per screenshot killed mid-extraction)`);
    console.log(`places created      ${places.rows[0].n}`);
    console.log(`attachments created ${attachments.rows[0].n}`);
    console.log(`total interruptions ${interrupted.rows[0].n}`);
    console.log(`total attempts used ${attempts.rows[0].n} (attempts are only spent on genuine failures)`);
    console.log(
      (counts.failed ?? 0) === 0 && (counts.completed ?? 0) === COUNT
        ? 'PASS: every uploaded screenshot completed; none marked failed despite the mid-run kill'
        : 'REGRESSION'
    );
    console.log(JSON.stringify({ timeline }, null, 1));
    const blobStats = await fetch(`${BLOB_BASE}/stats`).then((r) => r.json());
    console.log(`thumbnails uploaded  ${blobStats.uploads} (all to the local blob server)`);
  } finally {
    await killServer(server).catch(() => {});
    blobServer.kill('SIGKILL');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
