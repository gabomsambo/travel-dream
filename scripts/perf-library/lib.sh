#!/usr/bin/env bash
# lib.sh — shared helpers for the bench runners. Source after env.sh.
# axi_run <timeoutSecs> <scriptFile>: pipe a generated `axi run` script at the
# bridge and print its last output line. One re-cycle retry on failure (a second
# failure aborts loudly instead of recording an empty row). MOBILE=1 re-applies
# the phone emulation after the re-cycle.
axi_run() {
  local to=$1 file=$2 out
  _axi_json() { printf '%s' "$1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{JSON.parse(s);process.exit(0)}catch{process.exit(1)}})'; }
  out=$(timeout "$to" "$HERE/axi.sh" run < "$file" 2>&1 | tail -1)
  if ! _axi_json "$out"; then
    echo "perf-library: axi run failed, re-cycling once" >&2
    "$HERE/cycle.sh" >&2 || true
    if [ "${MOBILE:-0}" = 1 ]; then timeout 60 "$HERE/axi.sh" emulate --viewport "390x844x3,mobile,touch" --cpu 4 --network "Fast 4G" >/dev/null 2>&1; fi
    out=$(timeout "$to" "$HERE/axi.sh" run < "$file" 2>&1 | tail -1)
    _axi_json "$out" || { echo "perf-library: axi run failed twice, aborting" >&2; return 1; }
  fi
  printf '%s\n' "$out"
}
