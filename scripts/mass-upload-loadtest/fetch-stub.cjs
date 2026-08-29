/**
 * Load-test fetch interceptor.
 *
 * Preload with `node --require ./scripts/mass-upload-loadtest/fetch-stub.cjs` (or via
 * NODE_OPTIONS) to run the REAL mass-upload pipeline without touching Gemini, Google
 * Places or Vercel Blob. Every other request passes through untouched.
 *
 * Tunables (env):
 *   STUB_GEMINI_MS          latency of one Gemini extraction call   (default 3000)
 *   STUB_GOOGLE_MS          latency of one Google Places call       (default 150)
 *   STUB_PLACES_PER_IMAGE   places returned per screenshot          (default 3)
 *   STUB_GOOGLE_FAIL_RATE   fraction of Places calls returning 500  (default 0)
 *   STUB_COUNTER_FILE       file to append one line per upstream call (optional)
 *   STUB_SLOW_SOURCES       "src_a:150000,src_b:90000" per-source Gemini latency
 *   STUB_FAIL_SOURCES       "src_a:2" → first 2 Gemini calls for src_a return 503
 *
 * Per-source behaviour works under concurrency: each fake screenshot gets a unique
 * byte pattern, and the Gemini stub maps the inline image data back to its source.
 */
const fs = require('node:fs');
const crypto = require('node:crypto');

const GEMINI_MS = Number(process.env.STUB_GEMINI_MS ?? 3000);
const GOOGLE_MS = Number(process.env.STUB_GOOGLE_MS ?? 150);
const PLACES_PER_IMAGE = Number(process.env.STUB_PLACES_PER_IMAGE ?? 3);
const GOOGLE_FAIL_RATE = Number(process.env.STUB_GOOGLE_FAIL_RATE ?? 0);
const COUNTER_FILE = process.env.STUB_COUNTER_FILE;

const CITIES = ['Lisbon', 'Kyoto', 'Oaxaca', 'Reykjavik', 'Hanoi', 'Porto', 'Tbilisi', 'Split'];
const KINDS = ['restaurant', 'cafe', 'hotel', 'beach', 'museum', 'bar'];

function parseSourceMap(raw) {
  const out = new Map();
  for (const entry of (raw ?? '').split(',')) {
    const [id, value] = entry.split(':');
    if (id && value) out.set(id.trim(), Number(value));
  }
  return out;
}
const SLOW_SOURCES = parseSourceMap(process.env.STUB_SLOW_SOURCES);
const FAIL_SOURCES = parseSourceMap(process.env.STUB_FAIL_SOURCES);

/** sha1(image bytes) → sourceId, populated when the fake blob is served. */
const imageToSource = new Map();
/** sourceId → number of Gemini calls seen in THIS process. */
const geminiCallsBySource = new Map();

/**
 * With STUB_CORPUS_DIR set, the fake blob serves REAL screenshots straight off
 * disk (read-only, never copied). Without it, synthetic JPEGs are generated.
 */
const CORPUS_DIR = process.env.STUB_CORPUS_DIR;
let corpusFiles = null;
function corpusFileFor(sourceId) {
  if (!corpusFiles) {
    const path = require('node:path');
    const walk = (dir) =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? walk(path.join(dir, e.name))
          : // Skip macOS AppleDouble sidecars (._IMG_1234.PNG) — not images.
            /\.(png|jpe?g|webp)$/i.test(e.name) && !e.name.startsWith('._')
            ? [path.join(dir, e.name)]
            : []
      );
    corpusFiles = walk(CORPUS_DIR).sort();
    if (corpusFiles.length === 0) throw new Error(`No images found in STUB_CORPUS_DIR=${CORPUS_DIR}`);
  }
  const idx = Math.abs(hash32(sourceId)) % corpusFiles.length;
  return corpusFiles[idx];
}

const jpegCache = new Map();
function sampleJpeg(sourceId) {
  if (CORPUS_DIR) {
    // Read per request: 320 real screenshots at ~1.8MB each must not be cached.
    return Promise.resolve(fs.readFileSync(corpusFileFor(sourceId)));
  }
  if (!jpegCache.has(sourceId)) {
    const sharp = require('sharp');
    // Vary the image per source so the Gemini stub can attribute each call.
    const n = Math.abs(hash32(sourceId)) % 200;
    jpegCache.set(
      sourceId,
      sharp({
        create: { width: 700 + n, height: 1000, channels: 3, background: { r: 30, g: 90, b: 160 } },
      })
        .jpeg({ quality: 70 })
        .toBuffer()
        .then((buf) => {
          imageToSource.set(crypto.createHash('sha1').update(buf).digest('hex'), sourceId);
          return buf;
        })
    );
  }
  return jpegCache.get(sourceId);
}

function hash32(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

function sourceForGeminiRequest(init) {
  // Corpus mode reuses the same files across sources, so byte-level attribution
  // is meaningless there (and parsing multi-MB bodies would skew the timings).
  if (CORPUS_DIR) return null;
  try {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    const parts = body?.contents?.[0]?.parts ?? [];
    const inline = parts.find((p) => p?.inlineData?.data)?.inlineData?.data;
    if (!inline) return null;
    const sha = crypto.createHash('sha1').update(Buffer.from(inline, 'base64')).digest('hex');
    return imageToSource.get(sha) ?? null;
  } catch {
    return null;
  }
}

/**
 * Gemini call counts survive process restarts (the kill tests spawn a fresh
 * process per run), so they live in a small JSON file when one is configured.
 */
const STATE_FILE = process.env.STUB_STATE_FILE;
function bumpGeminiCalls(sourceId) {
  if (!STATE_FILE) {
    const next = (geminiCallsBySource.get(sourceId) ?? 0) + 1;
    geminiCallsBySource.set(sourceId, next);
    return next;
  }
  let state = {};
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    /* first write */
  }
  state[sourceId] = (state[sourceId] ?? 0) + 1;
  fs.writeFileSync(STATE_FILE, JSON.stringify(state));
  return state[sourceId];
}

function record(kind, key) {
  if (!COUNTER_FILE) return;
  try {
    fs.appendFileSync(COUNTER_FILE, `${kind}\t${key}\n`);
  } catch {
    /* best effort */
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Deterministic pseudo-random in [0,1) derived from a string. */
function hash01(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function geminiPayload(seed) {
  const places = Array.from({ length: PLACES_PER_IMAGE }, (_, i) => ({
    name: `Place ${seed}-${i}`,
    kind: KINDS[(Math.floor(hash01(`${seed}${i}`) * KINDS.length)) % KINDS.length],
    city: CITIES[(Math.floor(hash01(`c${seed}${i}`) * CITIES.length)) % CITIES.length],
    country: 'Portugal',
    admin: null,
    description: 'A load-test place.',
    tags: ['food'],
    vibes: ['cozy'],
    confidence: 0.9,
    price_level: '$$',
    best_time: null,
    activities: null,
    cuisine: null,
    amenities: null,
    practicalInfo: null,
    recommendedBy: null,
  }));
  const text = JSON.stringify({
    places,
    imageContext: { platform: 'instagram', contentType: 'post', language: 'en', hasMap: false, hasPhoto: true, textDensity: 'low' },
  });
  return {
    candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP', index: 0 }],
    usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 200, totalTokenCount: 300 },
  };
}

function install() {
  if (globalThis.__massUploadFetchStubInstalled) return;
  globalThis.__massUploadFetchStubInstalled = true;
  const realFetch = globalThis.fetch.bind(globalThis);
  let geminiSeed = 0;

  globalThis.fetch = async function stubbedFetch(input, init) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url ?? '';

    // ── Vercel Blob API (thumbnail uploads) ───────────────────────────────
    // Point the SDK here with VERCEL_BLOB_API_URL=https://fake-blob.local/api/blob
    // so no request can reach the real store.
    if (url.includes('/api/blob') || url.includes('blob.vercel-storage.com') || url.includes('vercel.com/api/blob')) {
      record('blob-put', url);
      const pathname = new URL(url).searchParams.get('pathname') ?? 'thumbnails/stub.jpg';
      return json({
        url: `https://fake-blob.local/${pathname}`,
        downloadUrl: `https://fake-blob.local/${pathname}?download=1`,
        pathname,
        contentType: 'image/jpeg',
        contentDisposition: 'inline; filename="thumb.jpg"',
      });
    }

    // ── Fake blob storage: the screenshot the pipeline downloads ──────────
    if (url.startsWith('https://fake-blob.local/')) {
      record('blob-get', url);
      const sourceId = (url.match(/screenshots\/(src_[^/.]+)/) ?? [])[1] ?? 'unknown';
      const buf = await sampleJpeg(sourceId);
      return new Response(buf, { status: 200, headers: { 'content-type': 'image/jpeg' } });
    }

    // ── Gemini vision extraction ──────────────────────────────────────────
    if (url.includes('generativelanguage.googleapis.com')) {
      const sourceId = sourceForGeminiRequest(init);
      const seed = sourceId ?? `anon_${++geminiSeed}`;
      const calls = bumpGeminiCalls(seed);
      record('gemini', seed);

      const failFirst = FAIL_SOURCES.get(seed) ?? 0;
      if (calls <= failFirst) {
        await sleep(Math.min(GEMINI_MS, 1000));
        return json({ error: { code: 503, status: 'UNAVAILABLE', message: 'The model is overloaded.' } }, 503);
      }

      await sleep(SLOW_SOURCES.get(seed) ?? GEMINI_MS);
      return json(geminiPayload(seed));
    }

    // ── Google Places (autocomplete + details) ────────────────────────────
    if (url.includes('maps.googleapis.com/maps/api/place/')) {
      const parsed = new URL(url);
      const isAutocomplete = url.includes('/autocomplete/');
      const key = isAutocomplete ? parsed.searchParams.get('input') : parsed.searchParams.get('place_id');
      record(isAutocomplete ? 'places-autocomplete' : 'places-details', key ?? '');
      await sleep(GOOGLE_MS);

      if (GOOGLE_FAIL_RATE > 0 && hash01(`${key}${isAutocomplete}`) < GOOGLE_FAIL_RATE) {
        return new Response('upstream error', { status: 500 });
      }
      if (isAutocomplete) {
        return json({ status: 'OK', predictions: [{ place_id: `gplace_${Buffer.from(key ?? '').toString('base64url').slice(0, 20)}` }] });
      }
      return json({
        status: 'OK',
        result: {
          place_id: key,
          formatted_address: '1 Load Test Street, Lisbon, Portugal',
          geometry: { location: { lat: 38.7 + hash01(key ?? ''), lng: -9.1 + hash01(`${key}x`) } },
          address_components: [
            { long_name: 'Lisbon', short_name: 'Lisbon', types: ['locality'] },
            { long_name: 'Portugal', short_name: 'PT', types: ['country'] },
          ],
        },
      });
    }

    return realFetch(input, init);
  };
}

install();
module.exports = { install };
