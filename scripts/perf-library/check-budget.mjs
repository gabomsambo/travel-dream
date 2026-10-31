// check-budget.mjs — pass/fail the harness results against budget.json.
// Usage: node check-budget.mjs <results.jsonl> <results-archive.jsonl> [budget.json] [label]
// INP gates use the worst rep; everything else uses the median. Exits non-zero on any fail.
import fs from 'fs';

const [resultsFile, archiveFile, budgetFile = 'budget.json', wantLabel] = process.argv.slice(2);
const budget = JSON.parse(fs.readFileSync(budgetFile, 'utf8')).library;
const rows = fs.readFileSync(resultsFile, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const arch = fs.existsSync(archiveFile)
  ? fs.readFileSync(archiveFile, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
  : [];

const labels = wantLabel ? [wantLabel] : [...new Set(rows.map((r) => r.label))];
const med = (xs) => {
  xs = xs.filter((x) => typeof x === 'number' && !Number.isNaN(x)).sort((a, b) => a - b);
  return xs.length ? xs[Math.floor((xs.length - 1) / 2)] : null;
};
const worst = (xs) => {
  xs = xs.filter((x) => typeof x === 'number' && !Number.isNaN(x));
  return xs.length ? Math.max(...xs) : null;
};
const get = (r, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), r);

const CHECKS = [
  ['document wire kB', 'load.docKB', 'docKB', med],
  ['load TBT ms', 'load.tbt', 'tbtMs', med],
  ['INP search ms', 'search.inp', 'inpSearchMs', worst],
  ['INP shelf Been ms', 'shelfBeen.inp', 'inpShelfMs', worst],
  ['INP shelf All ms', 'shelfAll.inp', 'inpShelfMs', worst],
  ['INP heart ms', 'heart.inp', 'inpHeartMs', worst],
];

let fails = 0;
for (const label of labels) {
  for (const size of [2000, 5000]) {
    for (const vp of ['desktop', 'mobile']) {
      const cell = rows.filter((r) => r.label === label && r.size === size && r.vp === vp && r.route === '/library');
      if (!cell.length) continue;
      const gates = budget[String(size)][vp];
      console.log(`\n## ${label} /library ${size} places ${vp} (${cell.length} run${cell.length > 1 ? 's' : ''})`);
      for (const [name, path, gate, agg] of CHECKS) {
        const v = agg(cell.map((r) => get(r, path)));
        const g = gates[gate];
        if (v === null || g === undefined) continue;
        const ok = v <= g;
        if (!ok) fails++;
        console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${v} (budget ${g})`);
      }
      if (vp === 'desktop' && gates.archiveMs !== undefined) {
        const runs = arch.filter((r) => r.label === label && r.size === size);
        const v = med(runs.map((r) => get(r, 'archive.msToUpdated')).filter((x) => x > 0));
        if (v !== null) {
          const ok = v <= gates.archiveMs;
          if (!ok) fails++;
          console.log(`${ok ? 'PASS' : 'FAIL'}  archive -> count on screen ms: ${v} (budget ${gates.archiveMs}, n=${runs.length})`);
        } else {
          console.log('SKIP  archive: no successful archive runs');
        }
      }
    }
  }
}
console.log(fails ? `\n${fails} gate(s) FAILED` : '\nAll gates PASSED');
process.exit(fails ? 1 : 0);
