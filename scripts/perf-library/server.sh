#!/usr/bin/env bash
# server.sh start|stop — `next start` (upstream) + compressing proxy (front) for the
# bench, both against the LOCAL bench DB only. Never touches production credentials.
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
# shellcheck disable=SC1091
source "$HERE/env.sh"

FRONT="$PERF_PORT"
UP="$PERF_UPSTREAM_PORT"

stop() { fuser -k "$FRONT"/tcp "$UP"/tcp >/dev/null 2>&1; for i in $(seq 30); do ss -ltn | grep -qE ":($FRONT|$UP) " || return 0; sleep 0.25; done; }
case "$1" in
  stop) stop ;;
  start)
    stop
    case "$TURSO_DATABASE_URL" in file:*) ;; *) echo "refusing: not a local DB"; exit 1 ;; esac
    nohup node "$REPO/node_modules/next/dist/bin/next" start -p "$UP" > "$PERF_WORK/server.log" 2>&1 &
    for i in $(seq 60); do curl -s -o /dev/null "http://127.0.0.1:$UP/login" && break; sleep 0.25; done
    PERF_PORT="$FRONT" PERF_UPSTREAM_PORT="$UP" nohup node "$HERE/proxy.mjs" > "$PERF_WORK/proxy.log" 2>&1 &
    for i in $(seq 40); do curl -s -o /dev/null "http://localhost:$FRONT/login" && break; sleep 0.25; done
    echo "server up (front :$FRONT -> upstream :$UP, db $TURSO_DATABASE_URL)" ;;
esac
