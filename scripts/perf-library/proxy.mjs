// Compressing front for `next start` (UPSTREAM -> PORT). `next start` compresses pages but not
// route-handler JSON; Vercel compresses both (brotli/gzip), so the harness adds that layer to
// measure what a user would get. Ports come from PERF_PORT (front) and PERF_UPSTREAM_PORT.
import http from 'http';
import zlib from 'zlib';
const PORT = Number(process.env.PERF_PORT || 3417);
const UP = Number(process.env.PERF_UPSTREAM_PORT || PORT + 1);
const compressible = (t = '') => /^(text\/|application\/(json|javascript|xml)|image\/svg)/.test(t);
// INDEX_DELAY_MS holds the Library index back, to capture the first screen before it arrives.
const delay = Number(process.env.INDEX_DELAY_MS || 0);
http.createServer((req, res) => {
  if (delay && req.url.startsWith('/api/library/index')) { setTimeout(() => forward(req, res), delay); return; }
  forward(req, res);
}).listen(PORT, '127.0.0.1');
function forward(req, res) {
  const up = http.request({ host: '127.0.0.1', port: UP, path: req.url, method: req.method, headers: req.headers }, (r) => {
    const headers = { ...r.headers };
    const accept = String(req.headers['accept-encoding'] || '');
    const encoding = accept.includes('br') ? 'br' : accept.includes('gzip') ? 'gzip' : null;
    const cc = String(headers['cache-control'] || '');
    if (encoding && !headers['content-encoding'] && compressible(String(headers['content-type'])) && !/no-transform/.test(cc) && r.statusCode === 200) {
      delete headers['content-length'];
      headers['content-encoding'] = encoding;
      headers['vary'] = headers['vary'] ? `${headers['vary']}, Accept-Encoding` : 'Accept-Encoding';
      res.writeHead(r.statusCode, headers);
      const z = encoding === 'br' ? zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }) : zlib.createGzip({ level: 6 });
      r.pipe(z).pipe(res);
    } else {
      res.writeHead(r.statusCode, headers);
      r.pipe(res);
    }
  });
  up.on('error', () => { res.writeHead(502); res.end(); });
  req.pipe(up);
}
