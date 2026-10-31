#!/usr/bin/env node
// Behavioral self-test for the library perf harness gates.
// Run: node scripts/perf-library/selftest-gates.mjs
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const CHECK = path.join(HERE, 'check-budget.mjs');
const BUDGET = path.join(HERE, 'budget.json');
const ENV_SH = path.join(HERE, 'env.sh');
const LOGIN_SH = path.join(HERE, 'login.sh');

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error(`FAIL  ${msg}`);
  } else {
    console.log(`PASS  ${msg}`);
  }
}

/** @typedef {{ inp: number, inputs: number } | { error: string }} Probe */

function libRow(partial) {
  const ok = (inp) => ({ inp, inputs: 1 });
  return {
    label: partial.label ?? 'harness',
    route: '/library',
    size: partial.size,
    vp: partial.vp,
    load: { docKB: partial.docKB ?? 30, tbt: partial.tbt ?? 50 },
    search: partial.search ?? ok(20),
    shelfBeen: partial.shelfBeen ?? ok(10),
    shelfAll: partial.shelfAll ?? ok(10),
    heart: partial.heart ?? ok(5),
  };
}

function writeJsonl(dir, name, rows) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
  return file;
}

function runCheck(results, archive, label = 'harness') {
  return spawnSync(process.execPath, [CHECK, results, archive, BUDGET, label], {
    encoding: 'utf8',
    cwd: ROOT,
  });
}

function fullMatrix(opts = {}) {
  const rows = [];
  for (const size of [2000, 5000]) {
    for (const vp of ['desktop', 'mobile']) {
      for (let rep = 0; rep < 2; rep++) {
        rows.push(libRow({ size, vp, search: opts.search }));
      }
    }
  }
  const arch = [2000, 5000].flatMap((size) =>
    [0, 1, 2].map(() => ({
      label: 'harness',
      size,
      archive: { msToUpdated: opts.archiveMs ?? 40 },
    }))
  );
  return { rows, arch };
}

function withTmp(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'td-perf-budget-'));
  try {
    return fn(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

console.log('\n== check-budget.mjs ==');

withTmp((tmp) => {
  const results = writeJsonl(tmp, 'results.jsonl', []);
  const archive = writeJsonl(tmp, 'archive.jsonl', []);
  const r = runCheck(results, archive);
  assert(r.status !== 0, 'empty results.jsonl exits non-zero');
  assert(/FAIL\s+missing \/library results for required gate cell/.test(r.stdout), 'empty results report missing cells');
  assert(!/All gates PASSED/.test(r.stdout), 'empty results do not print All gates PASSED');
});

withTmp((tmp) => {
  const rows = [5000].flatMap((size) =>
    ['desktop', 'mobile'].flatMap((vp) => [libRow({ size, vp }), libRow({ size, vp })])
  );
  const arch = [5000].flatMap((size) =>
    [0, 1, 2].map(() => ({ label: 'harness', size, archive: { msToUpdated: 40 } }))
  );
  const r = runCheck(writeJsonl(tmp, 'results.jsonl', rows), writeJsonl(tmp, 'archive.jsonl', arch));
  assert(r.status !== 0, 'partial PERF_SIZES=5000 exits non-zero');
  assert(/2000 places desktop[\s\S]*FAIL\s+missing \/library results/.test(r.stdout), 'missing 2000 desktop fails');
  assert(/2000 places mobile[\s\S]*FAIL\s+missing \/library results/.test(r.stdout), 'missing 2000 mobile fails');
});

withTmp((tmp) => {
  const { rows, arch } = fullMatrix();
  const cell = rows.filter((row) => row.size === 2000 && row.vp === 'desktop');
  cell[1].search = { error: 'focus miss' };
  const r = runCheck(writeJsonl(tmp, 'results.jsonl', rows), writeJsonl(tmp, 'archive.jsonl', arch));
  assert(r.status !== 0, 'failed probe rep exits non-zero');
  assert(/FAIL\s+INP search ms: missing/.test(r.stdout), 'failed probe rep fails INP search gate');
});

withTmp((tmp) => {
  const { rows, arch } = fullMatrix({ search: { inp: 0, inputs: 0 } });
  const r = runCheck(writeJsonl(tmp, 'results.jsonl', rows), writeJsonl(tmp, 'archive.jsonl', arch));
  assert(r.status !== 0, 'inputs:0 INP exits non-zero');
  assert(/FAIL\s+INP search ms: missing/.test(r.stdout), 'inputs:0 INP fails search gate');
});

withTmp((tmp) => {
  const { rows } = fullMatrix();
  const arch = [2000, 5000].flatMap((size) =>
    [0, 1, 2].map((i) => ({
      label: 'harness',
      size,
      archive: { msToUpdated: i === 0 ? 40 : 0 },
    }))
  );
  const r = runCheck(writeJsonl(tmp, 'results.jsonl', rows), writeJsonl(tmp, 'archive.jsonl', arch));
  assert(r.status !== 0, 'partial archive zeros exit non-zero');
  assert(/FAIL\s+archive -> count on screen ms: missing/.test(r.stdout), 'partial archive zeros fail archive gate');
});

withTmp((tmp) => {
  const { rows, arch } = fullMatrix();
  const r = runCheck(writeJsonl(tmp, 'results.jsonl', rows), writeJsonl(tmp, 'archive.jsonl', arch));
  assert(r.status === 0, 'complete under-budget matrix exits 0');
  assert(/All gates PASSED/.test(r.stdout), 'complete under-budget matrix prints All gates PASSED');
});

withTmp((tmp) => {
  const { rows, arch } = fullMatrix();
  for (const row of rows) {
    if (row.size === 5000 && row.vp === 'mobile') row.load.tbt = 5000;
  }
  const r = runCheck(writeJsonl(tmp, 'results.jsonl', rows), writeJsonl(tmp, 'archive.jsonl', arch));
  assert(r.status !== 0, 'over-budget TBT exits non-zero');
  assert(/FAIL\s+load TBT ms: 5000/.test(r.stdout), 'over-budget TBT fails load TBT gate');
});

console.log('\n== env.sh session isolation ==');

function envDump(session) {
  const script = `
    set -euo pipefail
    unset PERF_PORT PERF_CHROME_PORT PERF_WORK PERF_UPSTREAM_PORT
    export PERF_SESSION=${JSON.stringify(session)}
    source ${JSON.stringify(ENV_SH)}
    printf '%s\\t%s\\t%s\\t%s\\n' "$PERF_SESSION" "$PERF_WORK" "$PERF_PORT" "$PERF_UPSTREAM_PORT"
  `;
  const r = spawnSync('bash', ['-c', script], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`env.sh failed for ${session}: ${r.stderr}`);
  const [sess, work, port, up] = r.stdout.trim().split('\t');
  return { sess, work, port: Number(port), up: Number(up) };
}

{
  const a = envDump('lane-alpha');
  const b = envDump('lane-beta');
  assert(a.work.includes('lane-alpha'), 'PERF_WORK includes session lane-alpha');
  assert(b.work.includes('lane-beta'), 'PERF_WORK includes session lane-beta');
  assert(a.work !== b.work, 'different sessions get different PERF_WORK');
}

{
  // Stride-2 allocation: a session's upstream (PORT+1) must never equal another
  // distinct session's front. Same-hash sessions may share a front (40 slots).
  const byFront = new Map();
  let collision = null;
  for (let i = 0; i < 80; i++) {
    const s = `s${i}`;
    const { port, up } = envDump(s);
    if (up !== port + 1) {
      collision = `${s}: upstream ${up} != front+1 ${port + 1}`;
      break;
    }
    if (port % 2 !== 0) {
      collision = `${s}: front ${port} is not even (stride-2 expected from 3420)`;
      break;
    }
    byFront.set(port, s);
  }
  if (!collision) {
    for (const [front, owner] of byFront) {
      const up = front + 1;
      if (byFront.has(up)) {
        collision = `upstream of ${owner} (${up}) lands on front of ${byFront.get(up)}`;
        break;
      }
    }
  }
  assert(
    !collision,
    collision ? `port collision: ${collision}` : 'session fronts use stride 2 so PORT+1 never hits another front'
  );
}

console.log('\n== login.sh session-cookie guard ==');

{
  // Stub auth server must be a separate process: spawnSync would block this
  // event loop and deadlock curl against an in-process listener.
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'td-perf-login-'));
  const stubFile = path.join(work, 'stub-auth.mjs');
  fs.writeFileSync(
    stubFile,
    `
import http from 'http';
const server = http.createServer((req, res) => {
  if (req.url?.startsWith('/api/auth/csrf')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ csrfToken: 'csrf-test' }));
    return;
  }
  // Credentials callback succeeds but never sets a session-token cookie.
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end('{}');
});
server.listen(0, () => {
  process.stdout.write(String(server.address().port) + '\\n');
});
`
  );
  const { spawn } = await import('child_process');
  const started = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [stubFile], { stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('stub auth server did not print a port'));
    }, 5000);
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      if (buf.includes('\n')) {
        clearTimeout(timer);
        resolve({ port: Number(buf.trim()), child });
      }
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
  try {
    const r = spawnSync('bash', [LOGIN_SH], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PERF_SESSION: 'login-guard-test',
        PERF_WORK: work,
        PERF_PORT: String(started.port),
        PERF_CHROME_PORT: '9599',
      },
      timeout: 20_000,
    });
    assert(r.status !== 0, 'login.sh exits non-zero without session-token');
    assert(/no session-token/.test(r.stderr + r.stdout), 'login.sh reports missing session-token');
  } finally {
    started.child.kill('SIGKILL');
    fs.rmSync(work, { recursive: true, force: true });
  }
}

console.log(failed ? `\n${failed} self-test assertion(s) FAILED` : '\nAll self-test assertions PASSED');
process.exit(failed ? 1 : 0);
