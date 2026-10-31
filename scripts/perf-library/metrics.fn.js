() => {
  if (window.__bench) return 'already';
  const B = (window.__bench = { lcp: null, lcpEl: null, cls: 0, longtasks: [], loaf: [], events: [], marks: [] });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) { B.lcp = e.startTime; B.lcpEl = (e.element && (e.element.tagName + (e.element.currentSrc ? ' ' + e.element.currentSrc.split('/').pop().split('?')[0] : ''))) || e.url; } }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) B.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) B.longtasks.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) B.loaf.push([e.startTime, e.duration, e.blockingDuration]); }).observe({ type: 'long-animation-frame', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.interactionId) B.events.push([e.name, e.startTime, e.duration, e.processingStart - e.startTime, e.processingEnd - e.processingStart]); }).observe({ type: 'event', durationThreshold: 16, buffered: true });
  B.load = () => {
    const n = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const imgs = performance.getEntriesByType('resource').filter((r) => r.initiatorType === 'img');
    const tbt = B.longtasks.filter(([s]) => s > (fcp ? fcp.startTime : 0)).reduce((a, [, d]) => a + Math.max(0, d - 50), 0);
    return {
      ttfb: Math.round(n.responseStart), dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd),
      docKB: Math.round(n.transferSize / 1024), docDecodedKB: Math.round(n.decodedBodySize / 1024),
      fcp: fcp && Math.round(fcp.startTime), lcp: B.lcp && Math.round(B.lcp), lcpEl: B.lcpEl, cls: +B.cls.toFixed(4),
      longTasks: B.longtasks.length, longestTask: Math.round(Math.max(0, ...B.longtasks.map(([, d]) => d))), tbt: Math.round(tbt),
      dom: document.getElementsByTagName('*').length, imgEls: document.images.length,
      imgReq: imgs.length, imgKB: Math.round(imgs.reduce((a, r) => a + r.transferSize, 0) / 1024),
    };
  };
  B.heap = () => { if (window.gc) window.gc(); return Math.round(performance.memory.usedJSHeapSize / 1048576 * 10) / 10; };
  return 'installed';
}
