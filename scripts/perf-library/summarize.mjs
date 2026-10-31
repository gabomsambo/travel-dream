// node summarize.mjs results.jsonl labelA labelB  -> markdown table of the gate numbers (median over reps)
import fs from 'fs';
const [file, ...labels] = process.argv.slice(2);
const rows = fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const med = (xs) => { xs = xs.filter((x) => typeof x === 'number' && !Number.isNaN(x)).sort((a, b) => a - b); return xs.length ? xs[Math.floor((xs.length - 1) / 2)] : null; };
const get = (r, path) => {
  // A scenario that never got its input (the element was not found) reports nothing, not 0 ms.
  const [head] = path.split('.');
  if (r[head] && typeof r[head] === 'object' && 'inputs' in r[head] && !r[head].inputs) return null;
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), r);
};
const METRICS = [
  ['doc transfer kB', 'load.docKB'], ['TTFB ms', 'load.ttfb'], ['FCP ms', 'load.fcp'], ['LCP ms', 'load.lcp'], ['TBT ms', 'load.tbt'],
  ['longest task ms', 'load.longestTask'], ['CLS', 'load.cls'], ['DOM nodes at load', 'load.dom'], ['img requests at load', 'load.imgReq'],
  ['tab RSS after load MB', 'rssLoadMB'], ['tab RSS after scroll MB', 'rssScrollMB'], ['scroll frames >50 ms', 'scroll.over50ms'], ['scroll blocking ms', 'scroll.blocking'],
  ['INP search keystrokes', 'search.inp'], ['INP shelf (Been)', 'shelfBeen.inp'], ['INP shelf (All)', 'shelfAll.inp'], ['INP heart', 'heart.inp'],
  ['INP select mode', 'selectMode.inp'], ['INP group by City', 'groupCity.inp'],
];
for (const vp of ['desktop', 'mobile']) {
  for (const size of [2000, 5000]) {
    const sel = labels.map((l) => rows.filter((r) => r.label === l && r.size === size && r.vp === vp));
    if (!sel.some((s) => s.length)) continue;
    console.log(`\n### ${vp}, ${size} places (median of ${sel.map((s) => s.length).join('/')} runs; INP is the worst run)\n`);
    console.log(`| metric | ${labels.join(' | ')} |\n|---|${labels.map(() => '---:').join('|')}|`);
    for (const [name, path] of METRICS) {
      const agg = name.startsWith('INP') ? (xs) => { xs = xs.filter((x) => typeof x === 'number'); return xs.length ? Math.max(...xs) : null; } : med;
      const vals = sel.map((s) => agg(s.map((r) => get(r, path))));
      if (vals.every((v) => v === null)) continue;
      console.log(`| ${name} | ${vals.map((v) => (v === null ? '–' : v)).join(' | ')} |`);
    }
  }
}
