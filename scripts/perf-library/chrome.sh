#!/usr/bin/env bash
# chrome.sh start|stop — the harness's own headless Chrome on its own debugging port
# with a throwaway profile; tracked by a pid file under $PERF_WORK.
# Chrome is not on PATH: PERF_CHROME_BIN defaults to the puppeteer-managed build.
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$HERE/env.sh" >/dev/null 2>&1 || true
PERF_CHROME_PORT="${PERF_CHROME_PORT:-9333}"
PERF_CHROME_BIN="${PERF_CHROME_BIN:-$HOME/.cache/puppeteer/chrome/linux-152.0.7977.75/chrome-linux64/chrome}"
PROFILE="$PERF_WORK/chrome-profile"
PIDFILE="$PERF_WORK/chrome.pid"

case "${1:-start}" in
  stop)
    [ -f "$PIDFILE" ] && kill "$(cat "$PIDFILE")" 2>/dev/null
    rm -f "$PIDFILE" ;;
  start)
    [ -f "$PIDFILE" ] && kill "$(cat "$PIDFILE")" 2>/dev/null; sleep 0.7
    [ -x "$PERF_CHROME_BIN" ] || { echo "chrome not found at $PERF_CHROME_BIN (set PERF_CHROME_BIN)"; exit 1; }
    mkdir -p "$PERF_WORK"; rm -rf "$PROFILE"
    "$PERF_CHROME_BIN" --headless=new --remote-debugging-port="$PERF_CHROME_PORT" \
      --user-data-dir="$PROFILE" --enable-precise-memory-info --js-flags=--expose-gc \
      --no-first-run --no-default-browser-check --disable-background-networking --disable-extensions \
      --window-size=1440,900 about:blank > "$PERF_WORK/chrome.log" 2>&1 &
    echo $! > "$PIDFILE"
    for i in $(seq 40); do curl -s "http://127.0.0.1:$PERF_CHROME_PORT/json/version" >/dev/null && break; sleep 0.25; done
    curl -s "http://127.0.0.1:$PERF_CHROME_PORT/json/version" | grep -E 'Browser"' ;;
esac
