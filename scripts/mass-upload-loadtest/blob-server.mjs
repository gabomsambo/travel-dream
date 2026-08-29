/**
 * Local stand-in for Vercel Blob.
 *
 * `@vercel/blob` does not go through the patched global fetch, so the only way
 * to keep thumbnail uploads off the owner's production store is to point the SDK
 * somewhere else entirely: VERCEL_BLOB_API_URL=http://127.0.0.1:<port>/api/blob.
 *
 * It also serves the screenshots the pipeline downloads, from the real corpus
 * when STUB_CORPUS_DIR is set (read-only, never copied) or synthetic JPEGs
 * otherwise — so the download path is real HTTP too.
 *
 * Usage: node scripts/mass-upload-loadtest/blob-server.mjs [port]
 */
import { createServer } from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PORT = Number(process.argv[2] ?? process.env.LOADTEST_BLOB_PORT ?? 8090);
const CORPUS_DIR = process.env.STUB_CORPUS_DIR;

const stored = new Map(); // pathname → { body, contentType }
let uploads = 0;

let corpusFiles = null;
function corpusFor(key) {
  if (!corpusFiles) {
    const walk = (dir) =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? walk(join(dir, e.name))
          : /\.(png|jpe?g|webp)$/i.test(e.name) && !e.name.startsWith('._')
            ? [join(dir, e.name)]
            : []
      );
    corpusFiles = walk(CORPUS_DIR).sort();
    if (!corpusFiles.length) throw new Error(`no images in ${CORPUS_DIR}`);
  }
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return corpusFiles[Math.abs(h | 0) % corpusFiles.length];
}

let syntheticJpeg = null;
async function synthetic() {
  if (!syntheticJpeg) {
    const sharp = (await import('sharp')).default;
    syntheticJpeg = await sharp({
      create: { width: 900, height: 1400, channels: 3, background: { r: 30, g: 90, b: 160 } },
    })
      .jpeg({ quality: 70 })
      .toBuffer();
  }
  return syntheticJpeg;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  // ── Vercel Blob API: uploads ──────────────────────────────────────────
  if (url.pathname.startsWith('/api/blob')) {
    const body = await readBody(req);
    const pathname = url.searchParams.get('pathname') ?? `blob-${++uploads}`;
    stored.set(pathname, { body, contentType: req.headers['x-content-type'] ?? 'image/jpeg' });
    uploads++;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        url: `http://127.0.0.1:${PORT}/blobs/${pathname}`,
        downloadUrl: `http://127.0.0.1:${PORT}/blobs/${pathname}?download=1`,
        pathname,
        contentType: 'image/jpeg',
        contentDisposition: `inline; filename="${pathname.split('/').pop()}"`,
      })
    );
    return;
  }

  // ── Stored blobs ──────────────────────────────────────────────────────
  if (url.pathname.startsWith('/blobs/')) {
    const entry = stored.get(url.pathname.slice('/blobs/'.length));
    if (!entry) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': entry.contentType, 'content-length': entry.body.length });
    res.end(entry.body);
    return;
  }

  // ── The uploaded screenshots the pipeline downloads ───────────────────
  if (url.pathname.startsWith('/screenshots/')) {
    const key = url.pathname.slice('/screenshots/'.length);
    const body = CORPUS_DIR ? readFileSync(corpusFor(key)) : await synthetic();
    res.writeHead(200, { 'content-type': 'image/png', 'content-length': body.length });
    res.end(body);
    return;
  }

  if (url.pathname === '/stats') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ uploads, stored: stored.size }));
    return;
  }

  res.writeHead(404).end('not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`loadtest blob server on http://127.0.0.1:${PORT} (corpus: ${CORPUS_DIR ?? 'synthetic'})`);
});
