#!/usr/bin/env bash
# cycle.sh — fresh Chrome profile (cold cache, no cookies) + reattach the axi bridge.
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$HERE/env.sh" >/dev/null 2>&1 || true
PERF_CHROME_PORT="${PERF_CHROME_PORT:-9333}"
timeout 30 "$HERE/axi.sh" stop >/dev/null 2>&1
"$HERE/chrome.sh" start >/dev/null
for i in $(seq 40); do ss -ltn | grep -q "127.0.0.1:$PERF_CHROME_PORT " && break; sleep 0.25; done
timeout 60 "$HERE/axi.sh" newpage "http://localhost:${PERF_PORT:-3417}/login" >/dev/null 2>&1 || { echo "bridge open failed"; exit 1; }
