# Mass-upload load / reliability harness

Runtime-shaped verification for the mass-upload processing queue: real routes, real queue, real
leases, real `sharp`, real database writes — against a **throwaway Docker libSQL database** and a
**local blob server**. Gemini and Google Places are intercepted, so a run costs nothing and cannot
trip a rate limit.

**Nothing here may point at production.** `getClient()` refuses any URL that looks like Turso, the
blob SDK is redirected with `VERCEL_BLOB_API_URL`, and the dev server is started with every
credential explicitly overridden (`@next/env` never overwrites an already-set variable).

## Pieces

| File | Role |
|------|------|
| `reset-db.sh` | recreates the throwaway libSQL container (`td-cron-sqld`, port 8089) |
| `lib.mjs` | applies the checked-in migrations, seeds a queue, reads status counts |
| `blob-server.mjs` | stands in for Vercel Blob: serves screenshots, accepts thumbnail uploads |
| `fetch-stub.cjs` | intercepts Gemini / Google Places with tunable latency and failures |
| `run-cron-child.mjs` | runs one invocation and hard-kills the process at `KILL_AFTER_MS` (what Vercel does at `maxDuration`) |
| `repro-before.mjs` | reproduces the pre-fix "good screenshot marked `failed`" behaviour |
| `verify-after.mjs` | the same shapes against the fixed pipeline (`A2`, `C`, `D`) |
| `scale-test.mjs` | 500 screenshots through a real Next.js server, with a mid-run `kill -9` |

## Running

```bash
export PATH=~/.nvm/versions/node/v22.23.1/bin:$PATH     # Node 22 required
./scripts/mass-upload-loadtest/reset-db.sh

# Interruption / concurrency scenarios (a few minutes each)
LOADTEST_DB_URL=http://127.0.0.1:8089 node scripts/mass-upload-loadtest/verify-after.mjs C

# 500-screenshot scale test with the owner's real corpus (read-only, never copied)
LOADTEST_DB_URL=http://127.0.0.1:8089 SCALE_COUNT=500 \
  STUB_CORPUS_DIR=/path/to/test-example-photos \
  node scripts/mass-upload-loadtest/scale-test.mjs
```

`repro-before.mjs` only reproduces anything when the pre-fix pipeline is checked out
(`git checkout <base> -- src`); against current `main` it is expected to pass cleanly.

Results from the run that accompanied the fix are in `docs/evidence/mass-upload-queue-reliability/`.
