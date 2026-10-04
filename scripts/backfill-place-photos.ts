/**
 * One-off: give one user's places that show no working photo a real photo as
 * their primary. Logic lives in src/lib/photo-backfill/; this file is the CLI.
 *
 *   npx tsx scripts/backfill-place-photos.ts --env <file> --email <email> \
 *     --out <dir> [--mode dry-run|apply] [--confirm-db-host <host>] \
 *     [--from-plan <plan.jsonl>] [--max-places N] [--batch-size 100] [--concurrency 4] \
 *     [--previews 8] [--sample 25]
 *
 * --env is required and is the only env file read, so the target database is
 * always explicit. The database host is printed before anything runs; apply
 * mode refuses to start unless --confirm-db-host names that same host.
 * Dry-run blocks every non-SELECT statement at the client, on top of never
 * calling a write path.
 *
 * --from-plan writes the decisions of a reviewed dry run (its plan.jsonl)
 * instead of searching again, re-checking each place against its current rows
 * first, so what is written is what was reviewed and Google is not billed twice.
 *
 * Apply mode is resumable: finished places are appended (fsync'd) to
 * <out>/ledger.jsonl and skipped on the next run. Re-running after a crash is
 * the recovery procedure. Outputs, all in --out:
 *   plan.jsonl | applied.jsonl  one line per place processed this run
 *   summary.json, unmatched.csv, sample.md, preview.html (dry-run, --previews)
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

interface Args {
  env: string;
  email: string;
  out: string;
  mode: 'dry-run' | 'apply';
  confirmDbHost?: string;
  fromPlan?: string;
  maxPlaces?: number;
  batchSize: number;
  concurrency: number;
  previews: number;
  sample: number;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const num = (flag: string, fallback?: number) => {
    const v = get(flag);
    if (v === undefined) return fallback;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) throw new Error(`${flag} must be a non-negative integer`);
    return n;
  };
  const env = get('--env');
  const email = get('--email');
  const out = get('--out');
  const mode = (get('--mode') ?? 'dry-run') as Args['mode'];
  if (!env || !email || !out) {
    throw new Error('usage: --env <file> --email <email> --out <dir> [--mode dry-run|apply]');
  }
  if (mode !== 'dry-run' && mode !== 'apply') throw new Error('--mode must be dry-run or apply');
  return {
    env,
    email,
    out,
    mode,
    confirmDbHost: get('--confirm-db-host'),
    fromPlan: get('--from-plan'),
    maxPlaces: num('--max-places'),
    batchSize: num('--batch-size', 100)!,
    concurrency: num('--concurrency', 4)!,
    previews: num('--previews', 0)!,
    sample: num('--sample', 25)!,
  };
}

function dbHost(url: string): string {
  if (url.startsWith('file:')) return url;
  return new URL(url.replace(/^libsql:/, 'https:')).host;
}

/** fsync'd JSONL ledger; a torn last line from a power cut is ignored on load. */
function openLedger(file: string) {
  const done = new Set<string>();
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        done.add((JSON.parse(line) as { placeId: string }).placeId);
      } catch {
        // torn write; that place simply runs again
      }
    }
  }
  const fd = fs.openSync(file, 'a');
  return {
    size: () => done.size,
    done: (placeId: string) => done.has(placeId),
    append: async (entry: { placeId: string }) => {
      fs.writeSync(fd, `${JSON.stringify(entry)}\n`);
      fs.fsyncSync(fd);
      done.add(entry.placeId);
    },
  };
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function htmlEscape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // The only env file read. Loaded before any module that reads env at import.
  const loaded = dotenv.config({ path: args.env, override: true });
  if (loaded.error) throw loaded.error;
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error(`TURSO_DATABASE_URL missing from ${args.env}`);
  const host = dbHost(url);
  console.log(`[backfill] mode=${args.mode} database=${host}`);
  if (args.mode === 'apply' && args.confirmDbHost !== host) {
    throw new Error(`apply needs --confirm-db-host ${host} (got ${args.confirmDbHost ?? 'nothing'})`);
  }

  fs.mkdirSync(args.out, { recursive: true });
  const lockFile = path.join(args.out, '.lock');
  if (args.mode === 'apply') {
    // O_EXCL: two concurrent apply runs on one ledger would double the API calls.
    fs.writeFileSync(lockFile, `${process.pid}\n`, { flag: 'wx' });
  }

  try {
    const { client, db } = await import('@/db');
    const { users } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const google = await import('@/lib/photo-sources/google-places');
    const { getAdapter } = await import('@/lib/photo-sources');
    const { loadUserPlaces, withRetry, throttle } = await import('@/lib/photo-backfill/backfill');
    const { runBackfill } = await import('@/lib/photo-backfill/runner');
    type PlaceReport = import('@/lib/photo-backfill/runner').PlaceReport;
    type Liveness = import('@/lib/photo-backfill/backfill').Liveness;
    type Decision = import('@/lib/photo-backfill/backfill').Decision;

    if (args.mode === 'dry-run') {
      const readOnly = (sql: string) => {
        if (!/^\s*(select|with|pragma)\b/i.test(sql)) {
          throw new Error(`dry-run: blocked write statement: ${sql.slice(0, 60)}`);
        }
      };
      const execute = client.execute.bind(client);
      client.execute = ((stmt: string | { sql: string }) => {
        readOnly(typeof stmt === 'string' ? stmt : stmt.sql);
        return execute(stmt as never);
      }) as typeof client.execute;
      const blocked = () => {
        throw new Error('dry-run: blocked write path');
      };
      client.batch = blocked as never;
      client.transaction = blocked as never;
      client.executeMultiple = blocked as never;
    }

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, args.email))
      .limit(1);
    if (!user) throw new Error(`no user with email ${args.email}`);
    console.log(`[backfill] user=${user.id}`);

    const googleSlot = throttle(150); // ~6.6 req/s, far under Places' 600/min default
    const wikiSlot = throttle(500);
    const headSlot = throttle(25);
    const wikimedia = getAdapter('wikimedia');
    const liveness = new Map<string, Promise<Liveness>>();

    const deps = {
      fetchPlacePhotos: (id: string) => withRetry(() => googleSlot(() => google.fetchPlacePhotos(id))),
      searchPlacesWithPhotos: (q: string, near: { lat: number; lon: number } | null) =>
        withRetry(() => googleSlot(() => google.searchPlacesWithPhotos(q, near))),
      searchWikimedia: async (query: string) =>
        (await withRetry(() => wikiSlot(() => wikimedia.search({ query, placeId: 'backfill' })))).items,
      // Many places share one screenshot blob; check each URL once.
      checkUrl: (target: string): Promise<Liveness> => {
        let pending = liveness.get(target);
        if (!pending) {
          pending = headCheck(target);
          liveness.set(target, pending);
        }
        return pending;
      },
    };

    async function headCheck(target: string): Promise<Liveness> {
      try {
        const status = await withRetry(async () => {
          const res = await headSlot(() => fetch(target, { method: 'HEAD', redirect: 'follow' }));
          if (res.status >= 500 || res.status === 429) {
            throw Object.assign(new Error(`HEAD ${res.status}`), { status: res.status });
          }
          return res.status;
        }, { attempts: 4 });
        if (status < 400) return 'live';
        return status === 404 || status === 410 ? 'dead' : 'unknown';
      } catch {
        return 'unknown';
      }
    }

    const allPlaces = await loadUserPlaces(user.id);
    console.log(`[backfill] ${allPlaces.length} places loaded`);

    let plan: Map<string, Decision> | undefined;
    if (args.fromPlan) {
      plan = new Map();
      for (const line of fs.readFileSync(args.fromPlan, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        const r = JSON.parse(line) as PlaceReport;
        if (r.decision) plan.set(r.place.id, r.decision);
      }
      console.log(`[backfill] plan ${args.fromPlan}: ${plan.size} decisions`);
    }

    const ledger = args.mode === 'apply' ? openLedger(path.join(args.out, 'ledger.jsonl')) : undefined;
    if (ledger) console.log(`[backfill] ledger has ${ledger.size()} finished places`);

    const reportFile = path.join(args.out, args.mode === 'apply' ? 'applied.jsonl' : 'plan.jsonl');
    if (args.mode === 'dry-run') fs.writeFileSync(reportFile, '');
    const reports: PlaceReport[] = [];

    const summary = await runBackfill(allPlaces, {
      userId: user.id,
      mode: args.mode,
      deps,
      ledger,
      plan,
      concurrency: args.concurrency,
      batchSize: args.batchSize,
      maxPlaces: args.maxPlaces,
      onPlace: (r) => {
        reports.push(r);
        fs.appendFileSync(reportFile, `${JSON.stringify(r)}\n`);
        if (r.error) console.log(`[backfill] ERROR ${r.place.name}: ${r.error}`);
      },
      onBatch: (done, total) => console.log(`[backfill] ${done}/${total}`),
    });

    // ── Reports ──
    const unmatched = reports.filter((r) => r.decision?.action === 'unmatched');
    fs.writeFileSync(
      path.join(args.out, args.mode === 'apply' ? 'unmatched-applied.csv' : 'unmatched.csv'),
      [
        'place_id,name,kind,city,country,reason,best_candidate,similarity,distance_km',
        ...unmatched.map((r) => {
          const d = r.decision as Extract<NonNullable<PlaceReport['decision']>, { action: 'unmatched' }>;
          const best = [...d.tried].sort((a, b) => b.similarity - a.similarity)[0];
          return [
            r.place.id, r.place.name, r.place.kind, r.place.city, r.place.country, d.reason,
            best ? `${best.matchedName} (${best.via}: ${best.reason})` : '', best?.similarity,
            best?.distanceKm,
          ].map(csvCell).join(',');
        }),
      ].join('\n') + '\n',
    );

    const attaches = reports.filter((r) => r.decision?.action === 'attach');
    const step = Math.max(1, Math.floor(attaches.length / Math.max(1, args.sample)));
    const sample = attaches.filter((_, i) => i % step === 0).slice(0, args.sample);
    const row = (r: PlaceReport) => {
      const d = r.decision as Extract<NonNullable<PlaceReport['decision']>, { action: 'attach' }>;
      return `| ${r.place.name} (${r.place.kind}, ${r.place.city ?? r.place.country ?? '?'}) | ${d.match.matchedName} | ${d.photo.source} / ${d.match.via} | ${d.match.similarity} | ${d.match.distanceKm ?? 'n/a'} |`;
    };
    fs.writeFileSync(
      path.join(args.out, args.mode === 'apply' ? 'sample-applied.md' : 'sample.md'),
      [
        '| place | matched name | source / via | name sim | distance km |',
        '|---|---|---|---|---|',
        ...sample.map(row),
      ].join('\n') + '\n',
    );

    if (args.mode === 'dry-run' && args.previews > 0) {
      // Spread previews across sources and kinds; each Google preview is one Place Photos call.
      const picks: PlaceReport[] = [];
      const kinds = new Set<string>();
      for (const r of [...attaches.filter((a) => (a.decision as { photo: { source: string } }).photo.source !== 'google_places'), ...attaches]) {
        if (picks.length >= args.previews) break;
        if (picks.includes(r) || kinds.has(r.place.kind)) continue;
        kinds.add(r.place.kind);
        picks.push(r);
      }
      const cards: string[] = [];
      for (const r of picks) {
        const d = r.decision as Extract<NonNullable<PlaceReport['decision']>, { action: 'attach' }>;
        const src =
          d.photo.source === 'google_places'
            ? await google.resolvePhotoPreviewUri(d.photo.sourceId, 400)
            : d.photo.thumbnailUrl;
        cards.push(
          `<figure><img src="${htmlEscape(src ?? '')}" alt=""><figcaption><b>${htmlEscape(r.place.name)}</b> (${htmlEscape(r.place.kind)}, ${htmlEscape(r.place.city ?? r.place.country ?? '')})<br>→ ${htmlEscape(d.match.matchedName)}<br>${d.photo.source} via ${d.match.via} · sim ${d.match.similarity} · ${d.match.distanceKm ?? 'n/a'} km</figcaption></figure>`,
        );
      }
      fs.writeFileSync(
        path.join(args.out, 'preview.html'),
        `<!doctype html><meta charset="utf-8"><title>Backfill preview</title><style>body{font:14px system-ui;margin:16px;background:#fff}main{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}figure{margin:0;border:1px solid #ddd;border-radius:8px;overflow:hidden}img{width:100%;height:180px;object-fit:cover;display:block;background:#eee}figcaption{padding:8px}</style><main>${cards.join('')}</main>`,
      );
    }

    const final = { ...summary, mode: args.mode, database: host, userId: user.id, at: new Date().toISOString() };
    fs.writeFileSync(
      path.join(args.out, args.mode === 'apply' ? 'summary-applied.json' : 'summary.json'),
      JSON.stringify(final, null, 2),
    );
    console.log(JSON.stringify(final, null, 2));
    if (summary.aborted) process.exitCode = 2;
  } finally {
    if (args.mode === 'apply') fs.rmSync(lockFile, { force: true });
  }
}

main().catch((error) => {
  console.error('[backfill] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
