#!/usr/bin/env bash
# bench.sh <label> <size> <route> <desktop|mobile> <lib|libm|explore|none> <reps> [scrollStep]
# Cold-load + scroll + interactions for one Library/Explore cell, appended to results.jsonl.
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$HERE/env.sh"
# shellcheck disable=SC1091
source "$HERE/lib.sh"
label=$1; size=$2; route=$3; vp=$4; scen=$5; reps=${6:-1}; stepPx=${7:-60}; maxFrames=${8:-2500}
export PERF_PORT
MOBILE=0; [ "$vp" = mobile ] && MOBILE=1
export MOBILE
token=$(grep session-token "$PERF_WORK/jar-$size.txt" | awk '{print $7}')
settle=6000; [ "$vp" = mobile ] && settle=12000
for rep in $(seq "$reps"); do
  "$HERE/cycle.sh" || exit 1
  if [ "$vp" = mobile ]; then timeout 60 "$HERE/axi.sh" emulate --viewport "390x844x3,mobile,touch" --cpu 4 --network "Fast 4G" >/dev/null 2>&1; fi
  node "$HERE/gen.mjs" load "$token" "$route" $settle > "$PERF_WORK/run-load.js"
  A=$(axi_run 180 "$PERF_WORK/run-load.js")
  rssLoad=$("$HERE/rss.sh")
  node "$HERE/gen.mjs" scroll "$stepPx" "$maxFrames" > "$PERF_WORK/run-scroll.js"
  C=$(axi_run 300 "$PERF_WORK/run-scroll.js")
  rssScroll=$("$HERE/rss.sh")
  B='{}'
  if [ "$scen" != none ]; then
    timeout 30 "$HERE/axi.sh" eval "document.querySelector('main').scrollTop = 0" >/dev/null 2>&1
    node "$HERE/gen.mjs" "$scen" > "$PERF_WORK/run-scen.js"
    B=$(axi_run 300 "$PERF_WORK/run-scen.js")
  fi
  node -e '
    const [label,size,route,vp,rep,rl,rs,A,B,C]=process.argv.slice(1);
    const p=(s)=>{try{return JSON.parse(s)}catch{return {parseError:String(s).slice(0,300)}}};
    console.log(JSON.stringify({label,size:+size,route,vp,rep:+rep,rssLoadMB:+rl,rssScrollMB:+rs,...p(A),...p(C),...p(B)}));
  ' "$label" "$size" "$route" "$vp" "$rep" "$rssLoad" "$rssScroll" "$A" "$B" "$C" | tee -a "$PERF_WORK/results.jsonl"
done
