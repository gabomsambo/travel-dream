// Prints a chrome-devtools-axi `run` script.
// node gen.mjs load  <token> <route> <settleMs>
// node gen.mjs lib|libm|explore|scroll
// node gen.mjs archive|undo|refresh
// Origin port comes from PERF_PORT (default 3417).
import fs from 'fs';
const [phase, token, route, settle] = process.argv.slice(2);
const PORT = process.env.PERF_PORT || 3417;
const METRICS = fs.readFileSync(new URL('./metrics.fn.js', import.meta.url), 'utf8');
const HELPERS = fs.readFileSync(new URL('./helpers.fn.js', import.meta.url), 'utf8');
const sleep = 'const sleep = (ms) => new Promise((r) => setTimeout(r, ms));\n';
const out = 'const out = {};\nconst R = (k, v) => { out[k] = v; };\n';
const done = 'console.log(JSON.stringify(out));\n';
const step = (key, body) => `try {\n${body}\n} catch (e) { R(${JSON.stringify(key)}, { error: String(e).slice(0, 160) }); }\n`;
const measure = (key, action, pre = '') => step(key, `${pre}
await page.eval(() => window.__bench.reset());
${action}
await page.eval(() => window.__bench.settle());
R(${JSON.stringify(key)}, await page.eval(() => window.__bench.result(${JSON.stringify(key)})));`);

let s = sleep + out;
if (phase === 'load') {
  s += `await page.eval(() => { document.cookie = "authjs.session-token=${token}; path=/"; return 1; });
await page.open("http://localhost:${PORT}${route}");
await sleep(${settle});
await page.eval(${METRICS});
R('load', await page.eval(() => window.__bench.load()));
R('heapMB', await page.eval(() => window.__bench.heap()));
await page.eval(${HELPERS});
R('imgsAtLoad', await page.eval(() => window.__bench.imgs()));
`;
} else if (phase === 'lib') {
  const type = (w) => [...w].map((c) => `await page.press(${JSON.stringify(c)});`).join('\n');
  const focus = (sel, text = '') => `if (!(await page.eval(() => window.__bench.focus(${JSON.stringify(sel)}, ${JSON.stringify(text)})))) throw new Error('no element ${sel.replace(/'/g, '')} ${text}');\nawait sleep(250);`;
  s += measure('search', type('kyoto'), focus('input[placeholder="Search your atlas…"]'));
  s += measure('clearSearch', `await page.press('Enter');`, focus('button[aria-label="Clear search"]'));
  s += measure('shelfBeen', `await page.press('Enter');`, focus('[aria-label="Shelves"] button', 'Been'));
  s += measure('shelfAll', `await page.press('Enter');`, focus('[aria-label="Shelves"] button', 'All'));
  s += measure('heart', `await page.press('Enter');`, focus('button[aria-label^="Heart "]'));
  s += measure('selectMode', `await page.press('s');`, `await page.eval(() => document.activeElement && document.activeElement.blur());`);
  s += measure('exitSelect', `await page.press('Escape');`);
  s += step('heapAfterInteractions', `R('heapAfterInteractions', await page.eval(() => window.__bench.heap()));`);
  s += measure('groupCity', `await page.press('Enter');`, `${focus('button[aria-label^="Group by"]')}\nawait page.press('Enter');\nawait sleep(500);\n${focus('[role^="menuitem"]', 'City')}`);
  s += step('heapCity', `R('heapCity', await page.eval(() => window.__bench.heap()));`);
} else if (phase === 'libm') {
  const type = (w) => [...w].map((c) => `await page.press(${JSON.stringify(c)});`).join('\n');
  const focus = (sel, text = '') => `if (!(await page.eval(() => window.__bench.focus(${JSON.stringify(sel)}, ${JSON.stringify(text)})))) throw new Error('no element ${sel.replace(/'/g, '')} ${text}');\nawait sleep(250);`;
  s += measure('searchOpen', `await page.press('Enter');`, focus('button[aria-label^="Search your library"]'));
  s += measure('search', type('kyoto'), `await sleep(500);`);
  s += step('closeSheet', `await page.press('Escape'); await sleep(800);`);
  s += measure('clearSearch', `await page.press('Enter');`, focus('button[aria-label="Clear search"]'));
  s += measure('shelfBeen', `await page.press('Enter');`, focus('[aria-label="Shelves"] button', 'Been'));
  s += measure('shelfAll', `await page.press('Enter');`, focus('[aria-label="Shelves"] button', 'All'));
  s += measure('heart', `await page.press('Enter');`, focus('button[aria-label^="Heart "]'));
} else if (phase === 'explore') {
  const focus = (sel, text = '') => `if (!(await page.eval(() => window.__bench.focus(${JSON.stringify(sel)}, ${JSON.stringify(text)})))) throw new Error('no element ${sel.replace(/'/g, '')} ${text}');\nawait sleep(250);`;
  s += measure('openSheet', `await page.press('Enter');`, focus('button[data-place-id]'));
  s += step('closeSheet', `await page.press('Escape'); await sleep(600);`);
  s += measure('navAtlas', `await page.press('Enter');`, focus('a[href="/explore/atlas"]'));
  s += step('heapAtlas', `R('heapAtlas', await page.eval(() => window.__bench.heap()));`);
} else if (phase === 'refresh') {
  const focus = (sel, text = '') => `if (!(await page.eval(() => window.__bench.focus(${JSON.stringify(sel)}, ${JSON.stringify(text)})))) throw new Error('no element ${sel.replace(/'/g, '')} ${text}');\nawait sleep(250);`;
  s += step('archiveRefresh', `${focus('button[aria-label^="More for "]')}
await page.press('Enter');
await sleep(500);
${focus('[role^="menuitem"]', 'Archive')}
await page.eval(() => { const B = window.__bench; B.reset(); B.before = B.live ? B.live.textContent : ''; return 1; });
await page.press('Enter');
R('archiveRefresh', await page.eval(() => new Promise((res) => { const B = window.__bench; const t0 = performance.now(); const tick = () => { const now = performance.now(); const txt = B.live ? B.live.textContent : ''; if (txt !== B.before || now - t0 > 15000) { requestAnimationFrame(() => setTimeout(() => res({ msToUpdated: Math.round(performance.now() - (B.keys[0] || t0)), inp: Math.round(Math.max(0, ...B.events.map((e) => e[2]))), blocking: Math.round(B.loaf.reduce((a, l) => a + (l[2] || 0), 0)), longestFrame: Math.round(Math.max(0, ...B.loaf.map((l) => l[1]))), status: txt, rscKB: Math.round(performance.getEntriesByType('resource').filter((r) => r.name.includes('_rsc') || r.initiatorType === 'fetch').reduce((a, r) => a + (r.transferSize || 0), 0) / 1024) }), 0)); } else setTimeout(tick, 20); }; tick(); })));`);
} else if (phase === 'archive') {
  const focus = (sel, text = '') => `if (!(await page.eval(() => window.__bench.focus(${JSON.stringify(sel)}, ${JSON.stringify(text)})))) throw new Error('no element ${sel.replace(/'/g, '')} ${text}');\nawait sleep(250);`;
  s += step('archive', `${focus('button[aria-label^="More for "]')}
await page.press('Enter');
await sleep(500);
${focus('[role^="menuitem"]', 'Archive')}
await page.eval(() => { const B = window.__bench; B.reset(); B.before = B.live ? B.live.textContent : ''; B.t0 = performance.now(); B.changedAt = 0; B.paintedAt = 0; B.liveObs && B.liveObs.disconnect(); B.liveObs = new MutationObserver(() => { const txt = B.live ? B.live.textContent : ''; if (txt !== B.before && !B.changedAt) { B.changedAt = performance.now(); requestAnimationFrame(() => setTimeout(() => { B.paintedAt = performance.now(); }, 0)); } }); B.liveObs.observe(B.live, { childList: true, subtree: true, characterData: true }); return 1; });
await page.press('Enter');
await sleep(2500);
R('archive', await page.eval(() => { const B = window.__bench; const start = B.keys[0] || B.t0; return { msToChanged: Math.round(B.changedAt - start), msToUpdated: Math.round((B.paintedAt || B.changedAt) - start), inp: Math.round(Math.max(0, ...B.events.map((e) => e[2]))), blocking: Math.round(B.loaf.reduce((a, l) => a + (l[2] || 0), 0)), longestFrame: Math.round(Math.max(0, ...B.loaf.map((l) => l[1]))), before: B.before, status: B.live ? B.live.textContent : null }; }));
await sleep(4000);
R('requests', await page.eval(() => { const B = window.__bench; const t0 = B.keys[0] || B.t0; return performance.getEntriesByType('resource').filter((r) => r.startTime >= t0 && r.initiatorType !== 'img' && !/\\.(js|css|woff2?)(\\?|$)/.test(r.name)).map((r) => ({ url: r.name.replace(location.origin, ''), kb: Math.round(r.transferSize / 102.4) / 10, decodedKB: Math.round(r.decodedBodySize / 102.4) / 10, at: Math.round(r.startTime - t0), ms: Math.round(r.duration) })); }));
R('afterStatus', await page.eval(() => { const B = window.__bench; return B.live ? B.live.textContent : null; }));
R('dom', await page.eval(() => document.getElementsByTagName('*').length));`);
} else if (phase === 'undo') {
  const focus = (sel, text = '') => `if (!(await page.eval(() => window.__bench.focus(${JSON.stringify(sel)}, ${JSON.stringify(text)})))) throw new Error('no element ${sel.replace(/'/g, '')} ${text}');\nawait sleep(250);`;
  const live = `page.eval(() => { const B = window.__bench; return B.live ? B.live.textContent : null; })`;
  s += step('undo', `${focus('button[aria-label^="More for "]')}
await page.press('Enter');
await sleep(500);
${focus('[role^="menuitem"]', 'Archive')}
await page.eval(() => { window.__bench.reset(); return 1; });
await page.press('Enter');
await sleep(900);
R('afterArchive', await ${live});
R('toast', await page.eval(() => [...document.querySelectorAll('[data-sonner-toast]')].map((t) => t.textContent.slice(0, 80))));
${focus('[data-sonner-toast] button', 'Undo')}
await page.press('Enter');
await sleep(900);
R('afterUndo', await ${live});
await sleep(3500);
R('settled', await ${live});
R('requests', await page.eval(() => performance.getEntriesByType('resource').filter((r) => r.initiatorType !== 'img' && /api\\/(library|places)|_rsc/.test(r.name)).map((r) => r.name.replace(location.origin, '').split('?')[0] + ' ' + Math.round(r.transferSize / 102.4) / 10 + 'kB')));`);
} else if (phase === 'scroll') {
  s += step('scroll', `R('scroll', await page.eval(() => window.__bench.scrollTest(${Number(token) || 60}, ${Number(route) || 2500})));
await sleep(1500);
R('heapAfterScroll', await page.eval(() => window.__bench.heap()));
R('imgsAfterScroll', await page.eval(() => window.__bench.imgs()));`);
}
s += done;
process.stdout.write(s);
