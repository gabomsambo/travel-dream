# Library perf harness

One command seeds a local library (0 / 500 / 2,000 / 5,000 places), builds
production, measures `/library` in headless Chrome, and checks the 2k/5k gates
in `budget.json` (document size, load TBT, interaction INP, archive update time).
Promoted from the §8 scouting harness (report §8 row 8); **not wired into CI**
(a full run takes ~30 minutes and needs a production build).

## Run

```bash
scripts/perf-library/run.sh
```

Useful variants:

```bash
scripts/perf-library/run.sh --skip-build      # reuse the existing .next build
scripts/perf-library/run.sh --regen-images    # rebuild public/bench from dest_*.png
PERF_REPS=1 PERF_ARCHIVE_REPS=1 scripts/perf-library/run.sh   # quicker, noisier
PERF_SIZES="5000" scripts/perf-library/run.sh                 # one size only
```

`run.sh` prints the median summary table, then a `PASS`/`FAIL` line per gate
(check-budget.mjs exits non-zero on any fail). Raw rows stay in
`$PERF_WORK/results.jsonl` and `results-archive.jsonl`.

## Chrome (not on PATH)

The harness drives its **own** headless Chrome via `chrome-devtools-axi`,
separate from anything else on the machine:

- Binary: `~/.cache/puppeteer/chrome/linux-152.0.7977.75/chrome-linux64/chrome`
  (the puppeteer-managed build; override with `PERF_CHROME_BIN`).
- Ports and scratch dir: the app server (front), its upstream `next start`
  (port + 1), the Chrome debugging port, and `PERF_WORK` (default
  `/tmp/td-perf-library-<PERF_SESSION>`) all derive deterministically from
  `PERF_SESSION` (default `perf-library`), so parallel runs on one machine
  never share a browser, server, DB, or results dir. Override with `PERF_PORT` /
  `PERF_CHROME_PORT` / `PERF_WORK`; pass a task id as `PERF_SESSION` to keep
  lanes apart.
- Bridge session: `PERF_SESSION`, exported as `CHROME_DEVTOOLS_AXI_SESSION`,
  with `CHROME_DEVTOOLS_AXI_BROWSER_URL` pointing at the derived debugging port.

`cycle.sh` restarts Chrome with a throwaway profile before every run (cold cache,
no cookies); `rss.sh` reads the tab's renderer RSS from `/proc`.

## What each script does

| Script | Role |
|---|---|
| `run.sh` | Orchestrates everything; stashes `.env.local` aside (restored on exit) |
| `seed.mjs` | Builds a LOCAL SQLite DB from `src/db/migrations`, seeds 4 bench users (`bench<size>@local.test` / `benchpass123`); refuses non-`file:` URLs |
| `make-images.mjs` | Re-encodes `public/dest_*.png` into `public/bench/` (1600px full + 400×400 thumb), served locally — no network images |
| `env.sh` | Bench-only env; unsets `TURSO_*`/Upstash/Blob vars, pins `TURSO_DATABASE_URL=file:…` |
| `server.sh` | `next start` (upstream) + `proxy.mjs` front, which adds the brotli/gzip layer Vercel would (route-handler JSON is uncompressed under `next start`) |
| `chrome.sh` / `cycle.sh` / `rss.sh` / `axi.sh` | Chrome lifecycle, fresh profile per run, tab memory, axi bridge binding |
| `gen.mjs` + `metrics.fn.js` + `helpers.fn.js` | Generates the `chrome-devtools-axi run` scripts and in-page probes (LCP/TBT/INP/scroll/archive timing) |
| `login.sh` | Cookie jars per bench user (credentials provider over HTTP) |
| `bench.sh` | Cold load + scroll + interactions per size/viewport → `results.jsonl` |
| `bench-archive.sh` + `restore.py` | Archive-one-place timing (DB restored per rep) → `results-archive.jsonl` |
| `server-bench.sh` | curl TTFB + raw/gzip/brotli sizes for HTML and RSC |
| `summarize.mjs` / `check-budget.mjs` / `budget.json` | Median tables and the 2k/5k pass/fail gates |

## Local-only guarantees

- `seed.mjs` and `server.sh` exit rather than use any `TURSO_DATABASE_URL` that is
  not `file:`; `run.sh` unsets production credential vars and moves `.env.local`
  aside for the duration.
- Viewports mirror the original study: desktop 1440×900 unthrottled, phone
  390×844 @3× with 4× CPU throttle + Fast 4G.
- Phone LCP varies ±30% run to run (throttled full-size photo load), so it is
  reported but not gated; the gates are document size, TBT, INP and archive time.
