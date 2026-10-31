#!/usr/bin/env bash
# rss.sh — largest renderer RSS (MB) under the harness Chrome: the page's tab,
# including decoded images (which the JS heap does not).
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$HERE/env.sh" >/dev/null 2>&1 || true
root=$(cat "${PERF_WORK:-/tmp/td-perf-library}/chrome.pid")
best=0
for p in $(pgrep -f -- '--type=renderer'); do
  pp=$p; ok=0
  for i in 1 2 3 4; do pp=$(ps -o ppid= -p "$pp" 2>/dev/null | tr -d ' '); [ -z "$pp" ] && break; [ "$pp" = "$root" ] && { ok=1; break; }; done
  [ $ok = 1 ] || continue
  r=$(awk '/VmRSS/ {print $2}' /proc/"$p"/status 2>/dev/null); [ -n "$r" ] && [ "$r" -gt "$best" ] && best=$r
done
echo $((best/1024))
