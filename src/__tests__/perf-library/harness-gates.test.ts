/**
 * @jest-environment node
 *
 * Thin wrapper: the behavioral assertions live in
 * scripts/perf-library/selftest-gates.mjs (spawned as a real Node process so
 * check-budget / env.sh / login.sh are exercised as end users invoke them).
 */
import { spawnSync } from 'child_process';
import path from 'path';

const ROOT = process.cwd();
const SELFTEST = path.join(ROOT, 'scripts/perf-library/selftest-gates.mjs');

describe('library perf harness gates', () => {
  it('passes the behavioral self-test (budget / env / login)', () => {
    const r = spawnSync(process.execPath, [SELFTEST], {
      encoding: 'utf8',
      cwd: ROOT,
      timeout: 60_000,
    });
    if (r.status !== 0) {
      throw new Error(
        `selftest-gates.mjs exited ${r.status}\n--- stdout ---\n${r.stdout}\n--- stderr ---\n${r.stderr}`
      );
    }
    expect(r.stdout).toMatch(/All self-test assertions PASSED/);
  });
});
