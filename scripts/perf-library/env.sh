#!/usr/bin/env bash
# Bench-only env for scripts/perf-library. Source explicitly; no .env* file is read.
# LOCAL DATABASE ONLY: refuses any TURSO_DATABASE_URL that is not file:.
#
#   PERF_SESSION  lane id (default perf-library); scopes ports and scratch dir
#   PERF_WORK     scratch dir (default /tmp/td-perf-library-<PERF_SESSION>)
#   PERF_PORT     front (proxy) port; upstream next start is PORT+1
#
# Production credentials are never read: every TURSO_*/Upstash/Blob variable is
# unset here, and run.sh additionally moves .env.local aside for the whole run.

unset TURSO_DATABASE_URL TURSO_AUTH_TOKEN \
  UPSTASH_REDIS_REST_URL UPSTASH_REDIS_REST_TOKEN \
  BLOB_READ_WRITE_TOKEN KV_REST_API_URL KV_REST_API_TOKEN

PERF_SESSION="${PERF_SESSION:-perf-library}"
PERF_WORK="${PERF_WORK:-/tmp/td-perf-library-${PERF_SESSION}}"
# Parallel harness runs on one machine must not share a server, Chrome, or
# scratch dir. Unless overridden, ports and PERF_WORK derive from the session
# name (override with PERF_PORT / PERF_CHROME_PORT / PERF_WORK; e.g.
# PERF_SESSION=<task id> keeps lanes apart). The upstream `next start` always
# listens on PORT+1.
if [ -z "${PERF_PORT:-}" ]; then
  _h=$(printf '%s' "$PERF_SESSION" | cksum | awk '{print $1}')
  PERF_PORT=$((3420 + _h % 80))
fi
if [ -z "${PERF_CHROME_PORT:-}" ]; then
  _h=$(printf '%s' "$PERF_SESSION" | cksum | awk '{print $1}')
  PERF_CHROME_PORT=$((9400 + _h % 200))
fi
PERF_UPSTREAM_PORT="${PERF_UPSTREAM_PORT:-$((PERF_PORT + 1))}"
export PERF_WORK PERF_PORT PERF_UPSTREAM_PORT PERF_SESSION PERF_CHROME_PORT

export TURSO_DATABASE_URL="file:${PERF_WORK}/bench.db"
export TURSO_AUTH_TOKEN=local-bench
export AUTH_SECRET="bench-local-secret-not-for-production"
export AUTH_URL="http://localhost:${PERF_PORT}"
export NEXTAUTH_URL="http://localhost:${PERF_PORT}"
export AUTH_TRUST_HOST=true
export AUTH_GOOGLE_ID=bench-dummy
export AUTH_GOOGLE_SECRET=bench-dummy
export NEXT_PUBLIC_APP_URL="http://localhost:${PERF_PORT}"
export NEXT_TELEMETRY_DISABLED=1

case "$TURSO_DATABASE_URL" in file:*) ;; *) echo "refusing: not a local DB" >&2; return 1 2>/dev/null; exit 1 ;; esac
