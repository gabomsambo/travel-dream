#!/usr/bin/env bash
# chrome-devtools-axi bound to this harness's own Chrome and session.
# PERF_SESSION (default perf-library) keeps parallel runs apart; the debugging
# port defaults from the session name (see env.sh) or PERF_CHROME_PORT.
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$HERE/env.sh" >/dev/null 2>&1
export CHROME_DEVTOOLS_AXI_SESSION="$PERF_SESSION"
export CHROME_DEVTOOLS_AXI_BROWSER_URL="http://127.0.0.1:$PERF_CHROME_PORT"
exec chrome-devtools-axi "$@"
