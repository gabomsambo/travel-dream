#!/usr/bin/env bash
# run.sh — one command: seed a LOCAL SQLite DB, build production, measure the
# Library at 2k/5k, and print pass/fail against budget.json.
#
#   scripts/perf-library/run.sh [--skip-build] [--regen-images]
#
# Env knobs (defaults shown):
#   PERF_WORK=/tmp/td-perf-library  PERF_SESSION=perf-library
#   PERF_PORT / PERF_CHROME_PORT derive from the session (override to pin)
#   PERF_SIZES="2000 5000"  PERF_REPS=2  PERF_ARCHIVE_REPS=3
#   PERF_CHROME_BIN=$HOME/.cache/puppeteer/chrome/linux-152.0.7977.75/chrome-linux64/chrome
#
# LOCAL DATABASE ONLY: env.sh unsets every TURSO_*/Upstash/Blob variable, the seed and
# the server refuse any non-file: URL, and .env.local is moved aside for the whole run
# (restored on exit) so production credentials are never read. No network images:
# bench photos are generated from public/dest_*.png into public/bench/ (gitignored).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
# shellcheck disable=SC1091
source "$HERE/env.sh"

SKIP_BUILD=0; REGEN_IMAGES=0
for a in "$@"; do case "$a" in --skip-build) SKIP_BUILD=1 ;; --regen-images) REGEN_IMAGES=1 ;; *) echo "unknown flag $a"; exit 2 ;; esac; done

SIZES="${PERF_SIZES:-2000 5000}"
REPS="${PERF_REPS:-2}"
AREPS="${PERF_ARCHIVE_REPS:-3}"
LABEL="${PERF_LABEL:-harness}"
export PERF_PORT PERF_CHROME_PORT PERF_SESSION PERF_WORK

mkdir -p "$PERF_WORK"
STASH="$PERF_WORK/env.local.stash"
if [ -f "$REPO/.env.local" ]; then mv "$REPO/.env.local" "$STASH"; STASHED=1; else STASHED=0; fi

cleanup() {
  "$HERE/chrome.sh" stop >/dev/null 2>&1 || true
  ( cd "$REPO" && source "$HERE/env.sh" >/dev/null 2>&1 && "$HERE/server.sh" stop ) >/dev/null 2>&1 || true
  if [ "$STASHED" = 1 ]; then mv "$STASH" "$REPO/.env.local"; fi
}
trap cleanup EXIT

echo "== perf-library: images =="
if [ "$REGEN_IMAGES" = 1 ] || [ ! -f "$REPO/public/bench/full-01.jpg" ]; then
  ( cd "$REPO" && mkdir -p public/bench && node scripts/perf-library/make-images.mjs )
else echo "bench images present (use --regen-images to rebuild)"; fi

echo "== perf-library: seed $PERF_WORK/bench.db =="
rm -f "$PERF_WORK/bench.db" "$PERF_WORK/bench.db-wal" "$PERF_WORK/bench.db-shm"
( cd "$REPO" && node scripts/perf-library/seed.mjs "$PERF_WORK/bench.db" )

if [ "$SKIP_BUILD" = 0 ]; then
  echo "== perf-library: production build =="
  ( cd "$REPO" && npx next build )
else echo "== perf-library: skipping build (--skip-build) =="; fi

echo "== perf-library: start server =="
"$HERE/server.sh" start
"$HERE/login.sh"

echo "== perf-library: server payloads =="
rm -f "$PERF_WORK"/server-*.tsv
"$HERE/server-bench.sh" "$LABEL" /library

echo "== perf-library: browser runs =="
rm -f "$PERF_WORK/results.jsonl" "$PERF_WORK/results-archive.jsonl"
for size in $SIZES; do
  "$HERE/bench.sh" "$LABEL" "$size" /library desktop lib "$REPS"
  "$HERE/bench.sh" "$LABEL" "$size" /library mobile libm "$REPS"
  "$HERE/bench-archive.sh" "$LABEL" "$size" "$AREPS"
done

echo
echo "== perf-library: summary =="
node "$HERE/summarize.mjs" "$PERF_WORK/results.jsonl" "$LABEL"
echo
echo "== perf-library: budget =="
node "$HERE/check-budget.mjs" "$PERF_WORK/results.jsonl" "$PERF_WORK/results-archive.jsonl" "$HERE/budget.json" "$LABEL"
