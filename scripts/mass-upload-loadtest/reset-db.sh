#!/usr/bin/env bash
# Recreate the THROWAWAY libSQL container used by the mass-upload load tests.
# Nothing here ever touches Turso: the container is local, unnamed-volume, and
# destroyed on every run.
set -euo pipefail

NAME="${LOADTEST_DB_CONTAINER:-td-cron-sqld}"
PORT="${LOADTEST_DB_PORT:-8089}"

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -p "${PORT}:8080" -e SQLD_NODE=primary \
  ghcr.io/tursodatabase/libsql-server:latest >/dev/null

for _ in $(seq 1 30); do
  if curl -sf -m 2 "http://127.0.0.1:${PORT}/health" >/dev/null; then
    echo "throwaway libSQL ready on http://127.0.0.1:${PORT}"
    exit 0
  fi
  sleep 1
done

echo "libSQL container did not become healthy" >&2
exit 1
