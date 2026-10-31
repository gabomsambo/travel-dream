#!/usr/bin/env bash
# bench-archive.sh <label> <size> <reps> — archive one place from its ⋯ menu; time until
# the page shows the new count. Appends to results-archive.jsonl; DB restored per rep.
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$HERE/env.sh"
# shellcheck disable=SC1091
source "$HERE/lib.sh"
label=$1; size=$2; reps=${3:-3}
export PERF_PORT PERF_WORK PERF_DB
PERF_DB="${PERF_DB:-$PERF_WORK/bench.db}"
MOBILE=0; export MOBILE
token=$(grep session-token "$PERF_WORK/jar-$size.txt" | awk '{print $7}')
for rep in $(seq "$reps"); do
  "$HERE/cycle.sh" || exit 1
  python3 "$HERE/restore.py" snapshot
  node "$HERE/gen.mjs" load "$token" /library 6000 > "$PERF_WORK/run-load.js"
  A=$(axi_run 180 "$PERF_WORK/run-load.js")
  node "$HERE/gen.mjs" archive > "$PERF_WORK/run-archive.js"
  B=$(axi_run 120 "$PERF_WORK/run-archive.js")
  python3 "$HERE/restore.py" revert >/dev/null
  node -e 'const [l,s,rep,A,B]=process.argv.slice(1); const p=(x)=>{try{return JSON.parse(x)}catch{return {parseError:String(x).slice(0,300)}}}; console.log(JSON.stringify({label:l,size:+s,rep:+rep,load:p(A).load,...p(B)}))' "$label" "$size" "$rep" "$A" "$B" | tee -a "$PERF_WORK/results-archive.jsonl"
done
