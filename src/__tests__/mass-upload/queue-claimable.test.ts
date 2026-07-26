/**
 * @jest-environment node
 *
 * "How much work is there" has to mean "how much work can anyone actually take".
 * When every queued source is serving its retry backoff, a run claims nothing —
 * so if the counters still reported that work, the process route would chain and
 * the dispatcher would spawn workers that do nothing, over and over, for the
 * whole backoff window.
 *
 * These run against a real in-memory libSQL database with the checked-in
 * migrations applied, so the backoff predicate is exercised as SQL rather than
 * asserted as a string.
 */

jest.mock('@/db', () => ({
  get db() {
    if (!testDb) throw new Error('test database not initialised');
    return testDb;
  },
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';
import { getQueueDepth, getQueueStats } from '@/lib/db-queries';
import { claimNextQueuedSource } from '@/lib/db-mutations';
import { dispatchProcessors } from '@/lib/mass-upload/dispatch';
import { QUEUE_CONFIG } from '@/lib/mass-upload/queue-config';

let testDb: ReturnType<typeof drizzle> | null = null;
let client: Client;

const MIGRATIONS_DIR = join(process.cwd(), 'src/db/migrations');

async function applyMigrations(): Promise<void> {
  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8')
  ) as { entries: Array<{ tag: string }> };

  for (const entry of journal.entries) {
    const file = readFileSync(join(MIGRATIONS_DIR, `${entry.tag}.sql`), 'utf8');
    for (const statement of file.split('--> statement-breakpoint')) {
      const trimmed = statement.trim();
      if (trimmed) await client.execute(trimmed);
    }
  }
}

async function queueSource(id: string, nextAttemptAt: string | null): Promise<void> {
  await testDb!.insert(sourcesCurrentSchema).values({
    id,
    type: 'screenshot',
    uri: `https://store.public.blob.vercel-storage.com/${id}.jpg`,
    processingStatus: 'queued',
    nextAttemptAt,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

const inTheFuture = () => new Date(Date.now() + 5 * 60_000).toISOString();
const inThePast = () => new Date(Date.now() - 1_000).toISOString();
const leaseCutoff = () => new Date(Date.now() - QUEUE_CONFIG.leaseTtlMs).toISOString();

beforeAll(async () => {
  client = createClient({ url: ':memory:' });
  await applyMigrations();
  testDb = drizzle(client, { schema });
});

afterAll(() => {
  client?.close();
});

beforeEach(async () => {
  await client.execute('DELETE FROM sources');
  jest.clearAllMocks();
  process.env.CRON_SECRET = 'test-cron-secret';
  process.env.MASS_UPLOAD_BASE_URL = 'https://example.test';
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 202,
    arrayBuffer: async () => new ArrayBuffer(0),
  }) as unknown as typeof fetch;
});

describe('a queue where everything is backing off', () => {
  it('reports no remaining work and spawns no workers', async () => {
    await queueSource('src_a', inTheFuture());
    await queueSource('src_b', inTheFuture());
    await queueSource('src_c', inTheFuture());

    expect(await getQueueDepth()).toBe(0);
    expect((await getQueueStats(leaseCutoff())).queued).toBe(0);

    const dispatch = await dispatchProcessors('worker-chain');

    expect(dispatch.desiredWorkers).toBe(0);
    expect(dispatch.spawned).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('hands nothing out, and does not mistake the wait for contention', async () => {
    await queueSource('src_a', inTheFuture());

    const attempt = await claimNextQueuedSource('w:lease');

    expect(attempt.source).toBeNull();
    expect(attempt.contended).toBe(false);
  });

  it('counts and claims the work again once the backoff has elapsed', async () => {
    await queueSource('src_a', inTheFuture());
    await queueSource('src_b', inTheFuture());
    expect(await getQueueDepth()).toBe(0);

    await testDb!
      .update(sourcesCurrentSchema)
      .set({ nextAttemptAt: inThePast() })
      .where(eq(sourcesCurrentSchema.id, 'src_a'));

    expect(await getQueueDepth()).toBe(1);
    expect((await getQueueStats(leaseCutoff())).queued).toBe(1);

    const attempt = await claimNextQueuedSource('w:lease');
    expect(attempt.source?.id).toBe('src_a');
    expect(attempt.source?.nextAttemptAt).toBeNull();

    const dispatch = await dispatchProcessors('worker-chain');
    expect(dispatch.spawned).toBe(0); // src_a is now claimed, nothing left ready
  });
});

describe('a queue with no backoff set', () => {
  it('treats NULL as ready everywhere', async () => {
    await queueSource('src_a', null);
    await queueSource('src_b', null);

    expect(await getQueueDepth()).toBe(2);
    expect((await getQueueStats(leaseCutoff())).queued).toBe(2);

    const dispatch = await dispatchProcessors('upload-start');
    expect(dispatch.desiredWorkers).toBe(1);
    expect(dispatch.spawned).toBe(1);

    const attempt = await claimNextQueuedSource('w:lease');
    expect(attempt.source?.id).toBe('src_a');
  });
});
