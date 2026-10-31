() => {
  const B = window.__bench;
  if (B.helpers) return 'helpers-already';
  B.helpers = true;
  B.keys = []; B.lastMut = 0;
  addEventListener('keydown', (e) => B.keys.push(e.timeStamp), true);
  addEventListener('pointerdown', (e) => B.keys.push(e.timeStamp), true);
  B.live = document.querySelector('p[aria-live="polite"]');
  new MutationObserver(() => { B.lastMut = performance.now(); }).observe(document.body, { childList: true, subtree: true, characterData: true });
  B.reset = () => { B.keys = []; B.events = []; B.lastMut = 0; B.loaf = []; B.longtasks = []; return 1; };
  B.settle = () => new Promise((res) => {
    const t0 = performance.now();
    const tick = () => { const now = performance.now(); if (now - Math.max(B.lastMut || 0, t0) > 600) res(1); else setTimeout(tick, 100); };
    setTimeout(tick, 100);
  });
  B.result = (label) => {
    const start = B.keys[0] ?? 0;
    const inp = Math.max(0, ...B.events.map((e) => e[2]));
    const worst = B.events.reduce((w, e) => (e[2] > (w ? w[2] : -1) ? e : w), null);
    return {
      label, inp: Math.round(inp), inpEvent: worst ? worst[0] : null,
      inputDelay: worst ? Math.round(worst[3]) : null, processing: worst ? Math.round(worst[4]) : null,
      settleMs: B.lastMut ? Math.round(B.lastMut - start) : 0,
      sinceLastInput: B.lastMut && B.keys.length ? Math.round(B.lastMut - B.keys[B.keys.length - 1]) : 0,
      inputs: B.keys.length,
      blocking: Math.round(B.loaf.reduce((a, l) => a + (l[2] || 0), 0)),
      longestFrame: Math.round(Math.max(0, ...B.loaf.map((l) => l[1]))),
      dom: document.getElementsByTagName('*').length, status: B.live ? B.live.textContent : null,
    };
  };
  B.tag = (sel, text, name) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.offsetParent !== null && (!text || e.textContent.trim().startsWith(text)));
    if (el) el.setAttribute('data-bench', name);
    return !!el;
  };
  B.focus = (sel, text) => {
    const el = [...document.querySelectorAll(sel)].find((e) => (e.offsetParent !== null || e.getClientRects().length) && (!text || e.textContent.trim().startsWith(text)));
    if (!el) return false;
    el.scrollIntoView({ block: 'center' }); el.focus(); return document.activeElement === el;
  };
  B.imgs = () => {
    const all = [...document.images];
    const full = all.filter((i) => /full-\d+/.test(i.currentSrc || i.src));
    const loaded = all.filter((i) => i.complete && i.naturalWidth);
    const px = loaded.reduce((a, i) => a + i.naturalWidth * i.naturalHeight, 0);
    return { total: all.length, fullSize: full.length, loaded: loaded.length, fullLoaded: full.filter((i) => i.complete && i.naturalWidth).length, decodedMBest: Math.round(px * 4 / 1048576) };
  };
  B.scrollTest = (step, maxFrames = 2500) => new Promise((res) => {
    const main = document.querySelector('main');
    main.scrollTop = 0;
    B.loaf = []; B.longtasks = [];
    const frames = []; let last = performance.now(); const t0 = last;
    const tick = (t) => {
      frames.push(t - last); last = t;
      const before = main.scrollTop; main.scrollTop += step;
      if (main.scrollTop === before || frames.length > maxFrames) res({ frames: frames.slice(1), ms: t - t0 }); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }).then(({ frames, ms }) => {
    const s = [...frames].sort((a, b) => a - b);
    const pct = (p) => Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))] || 0);
    const imgs = performance.getEntriesByType('resource').filter((r) => r.initiatorType === 'img');
    return {
      frames: frames.length, scrollPx: document.querySelector('main').scrollHeight, durationMs: Math.round(ms),
      p50: pct(0.5), p95: pct(0.95), max: Math.round(s[s.length - 1] || 0),
      over50ms: frames.filter((f) => f > 50).length,
      dropped: frames.reduce((a, f) => a + Math.max(0, Math.round(f / 16.67) - 1), 0),
      blocking: Math.round(B.loaf.reduce((a, l) => a + (l[2] || 0), 0)),
      dom: document.getElementsByTagName('*').length, imgEls: document.images.length, imgReq: imgs.length,
      imgMB: Math.round(imgs.reduce((a, r) => a + r.transferSize, 0) / 104857.6) / 10,
    };
  });
  return 'helpers';
}
