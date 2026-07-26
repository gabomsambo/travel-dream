# Mass-upload queue reliability — before / after evidence

Everything here was produced by `scripts/mass-upload-loadtest/` against a **throwaway Docker libSQL
database** and a **local blob server**. Gemini and Google Places are intercepted with tunable latency
and failure injection; no production database, blob store, or paid API was touched.

## What was reproduced first (before the fix)

`before-scenario-A.txt` — **pure clock-out.** Six screenshots, one whose extraction takes longer than
the function's 120s `maxDuration`. Each run is killed mid-item exactly the way Vercel kills a
function; `processingAttempts` was incremented at claim time, so three kills exhausted the retry
budget and the recovery pass marked a perfectly good screenshot:

```
src_load_0000 → status=failed attempts=3 error=Timed out after maximum retry attempts
```

`before-scenario-B.txt` — **mixed.** The same screenshot hits two transient Gemini 503s (attempts 1
and 2) and is then interrupted once by a clock-out. The clock-out consumed the last attempt, so an
image that would have succeeded on the very next try was buried as `failed`. This is the shape that
loses work silently at volume: a rate limit and a timeout spend the same budget as a bad image.

Both were run against the pre-fix code (`git checkout <base> -- src`), at the real 120s limit.

## What the fix does about it

| | before | after |
|---|---|---|
| clock-out | consumes an attempt → `failed` | consumes an *interruption* → requeued |
| upstream 429/503 | consumes an attempt → `failed` | consumes an *interruption* → requeued |
| bad image / 404 blob | consumes an attempt → `failed` | unchanged: `failed` after `maxAttempts` |
| repeatedly interrupted | `failed` | `stalled` — surfaced as "needs retry", never a verdict |

## After: the same scenarios

`after-scenario-A2.txt` — the screenshot that used to be buried now completes. 6/6 completed,
0 failed, 151s, 18 places, 6 Gemini calls.

`after-scenario-C-kill.txt` — **hard `kill -9` mid-run** with 40 screenshots:

```
after kill: completed=24, 4 in-flight holding leases, 12 queued
run 2 (lease still valid): leases respected — the 4 in-flight items were NOT stolen
after lease expiry: recovery requeued them
final: 40 completed, 0 failed, 0 stalled, 44 Gemini calls
```

The 4 extra Gemini calls are exactly the 4 screenshots that were killed *during* extraction. Anything
killed after extraction reuses the cached result instead of paying for it twice.

`after-scenario-D-concurrency.txt` — **three runs racing on one 30-screenshot queue**:

```
claims across runs=30  items=30  gemini calls=30  completed=30  failed=0
```

Exactly one claim, one extraction and one completion per screenshot.

## After: 500 screenshots end to end

`after-scale-500.txt` — 500 queued screenshots processed through a **real Next.js server** (real
routes, real HTTP fan-out to workers, real `after()`, real `sharp` on the owner's real 320-PNG
corpus), with a deliberate `kill -9` of the whole server half-way through:

```
*** KILL -9 at 256 completed, 16 in-flight, t+149s ***
server restarted; safety-net cron takes over

screenshots         500
final counts        {"completed":500}
wall time           301s
gemini calls        516          (500 + the 16 killed mid-extraction)
places created      454
attachments created 454
thumbnails uploaded 516          (all to the local blob server)
total interruptions 16           (exactly the 16 that were in flight at the kill)
total attempts used 0            (attempts are only spent on genuine failures)
PASS: every uploaded screenshot completed; none marked failed despite the mid-run kill
```

500 screenshots, one hard kill, zero lost work, 5m01s wall clock — against ~100 minutes of
one-cron-tick-per-minute before, with items being buried along the way. The kill takes down the
server's whole process group, so no worker survives it; completions resume ~20s later because the
reclaimed items serve their backoff while the workers carry on with ready work.

## Which runs are on which code

`after-scale-500.txt` was re-run on the final shipped code, after `next_attempt_at` and the
claim-contention fix landed, and is the transcript to trust for timings.

**The A2 / C / D transcripts predate the retry backoff.** Their outcomes still describe shipped
behaviour — everything completes, nothing is marked `failed` — but their recovery latency does not: a
requeued item now waits at least the base backoff before it is claimable, and if no ready work keeps
a worker alive it waits for the next safety-net cron tick. They are left exactly as they were
executed rather than rewritten.

## Limits of this evidence

- Gemini and Google Places responses are stubbed; latency and failures are injected, not observed.
  Model output quality is out of scope here — this is about the queue, not the extraction.
- The kill test kills the server's whole process group at once. On Vercel each invocation is killed
  independently, so this is the harsher case.
- Lease expiry is simulated by ageing `processing_started_at` rather than waiting out the real TTL.
- The `before-*` runs were made before the harness grew a local blob server, so thumbnail uploads
  failed in them (best-effort in the pipeline, non-fatal, and not what is being measured). The
  `after-*` runs all upload thumbnails to the local blob server.
- No load-test blob ever reached the production store: listing it with the real token afterwards
  returned 691 pre-existing blobs and 0 matching `loadtest` / `src_load_`.
