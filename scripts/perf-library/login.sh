#!/usr/bin/env bash
# login.sh — log each seeded bench user in over HTTP (credentials provider) -> jar-<size>.txt
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$HERE/env.sh"
PORT="$PERF_PORT"
for s in 0 500 2000 5000; do
  jar="$PERF_WORK/jar-$s.txt"; rm -f "$jar"
  csrf=$(curl -s -c "$jar" -b "$jar" "http://localhost:$PORT/api/auth/csrf" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).csrfToken')
  curl -s -o /dev/null -c "$jar" -b "$jar" -X POST "http://localhost:$PORT/api/auth/callback/credentials" \
    --data-urlencode "csrfToken=$csrf" --data-urlencode "email=bench$s@local.test" --data-urlencode "password=benchpass123" --data-urlencode "json=true" --data-urlencode "callbackUrl=http://localhost:$PORT/library"
  count=$(grep -c session-token "$jar" || true)
  echo "$s: $count session cookie"
  if [ "$count" -lt 1 ]; then
    echo "error: login produced no session-token for bench$s@local.test ($jar)" >&2
    exit 1
  fi
done
