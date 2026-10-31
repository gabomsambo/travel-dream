#!/usr/bin/env bash
# server-bench.sh <label> <route> [runs] — per size: median TTFB, total, raw/gzip/brotli
# bytes for the HTML and RSC variants. Appends TSV to server-<label>.tsv.
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$HERE/env.sh"
label=$1; route=$2; runs=${3:-5}
OUT="$PERF_WORK/server-$label.tsv"
for s in 0 500 2000 5000; do
  for kind in html rsc; do
    hdr=(); [ $kind = rsc ] && hdr=(-H 'RSC: 1')
    curl -s -o /dev/null -b "$PERF_WORK/jar-$s.txt" "${hdr[@]}" "http://localhost:$PERF_PORT$route" # warm
    ttfb=(); tot=()
    for i in $(seq "$runs"); do
      read -r a b < <(curl -s -o "$PERF_WORK/body.tmp" -b "$PERF_WORK/jar-$s.txt" "${hdr[@]}" -w '%{time_starttransfer} %{time_total}' "http://localhost:$PERF_PORT$route")
      ttfb+=("$a"); tot+=("$b")
    done
    raw=$(stat -c %s "$PERF_WORK/body.tmp")
    gz=$(gzip -6 -c "$PERF_WORK/body.tmp" | wc -c)
    br=$(node -e 'const z=require("zlib");const b=require("fs").readFileSync(process.env.PERF_WORK+"/body.tmp");console.log(z.brotliCompressSync(b,{params:{[z.constants.BROTLI_PARAM_QUALITY]:5}}).length)')
    med() { printf '%s\n' "$@" | sort -n | awk '{a[NR]=$1} END {print a[int((NR+1)/2)]}'; }
    printf '%s\t%s\t%s\t%s\tttfb_ms=%.0f\ttotal_ms=%.0f\traw_kB=%.1f\tgzip_kB=%.1f\tbr_kB=%.1f\n' "$label" "$route" "$s" "$kind" "$(echo "$(med "${ttfb[@]}")*1000" | bc)" "$(echo "$(med "${tot[@]}")*1000" | bc)" "$(echo "$raw/1024" | bc -l)" "$(echo "$gz/1024" | bc -l)" "$(echo "$br/1024" | bc -l)" | tee -a "$OUT"
  done
done
