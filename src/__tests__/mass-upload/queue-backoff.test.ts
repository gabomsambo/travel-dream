/**
 * @jest-environment node
 *
 * A requeued source must wait before it is claimable again. Without a backoff a
 * sustained upstream outage burns the whole interruption budget in seconds and
 * parks perfectly good screenshots as `stalled` — exactly the "drop 500 images
 * and walk away" promise the queue exists to keep.
 */

jest.mock('@/db', () => ({
  db: {
    select: (...args: unknown[]) => dbSelect(...args),
    update: (...args: unknown[]) => dbUpdate(...args),
  },
}));
jest.mock('@/lib/db-utils', () => ({
  withErrorHandling: (op: () => Promise<unknown>) => op(),
  withTransaction: (op: (tx: unknown) => Promise<unknown>) => op({}),
  generateSourceId: () => 'src_generated',
  generatePlaceId: () => 'plc_generated',
  generateCollectionId: () => 'col_generated',
}));
jest.mock('@vercel/blob', () => ({ del: jest.fn() }));

import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';
import type { SQL } from 'drizzle-orm';
import {
  claimNextQueuedSource,
  recordSourceInterruption,
  recordSourceFailure,
} from '@/lib/db-mutations';
import { QUEUE_CONFIG, retryBackoffMs } from '@/lib/mass-upload/queue-config';

// ── Minimal drizzle-shaped db: records what the queries ask for ────────
let selectRows: unknown[] = [];
let updateRows: unknown[] = [];
const selectWheres: unknown[] = [];
const updateSets: Record<string, unknown>[] = [];

type Chain = Record<string, unknown>;

function dbSelect(..._args: unknown[]): Chain {
  const chain: Chain = {};
  chain.from = () => chain;
  chain.where = (clause: unknown) => {
    selectWheres.push(clause);
    return chain;
  };
  chain.orderBy = () => chain;
  chain.limit = () => Promise.resolve(selectRows);
  chain.then = (onOk: (v: unknown) => unknown, onErr: (e: unknown) => unknown) =>
    Promise.resolve(selectRows).then(onOk, onErr);
  return chain;
}

function dbUpdate(..._args: unknown[]): Chain {
  const chain: Chain = {};
  chain.set = (values: Record<string, unknown>) => {
    updateSets.push(values);
    return chain;
  };
  chain.where = () => chain;
  chain.returning = () => Promise.resolve(updateRows);
  return chain;
}

function renderSql(clause: unknown): { sql: string; params: unknown[] } {
  const { sql, params } = new SQLiteSyncDialect().sqlToQuery(clause as SQL);
  return { sql, params };
}

beforeEach(() => {
  selectRows = [];
  updateRows = [];
  selectWheres.length = 0;
  updateSets.length = 0;
});

describe('retry backoff', () => {
  it('grows the wait exponentially and caps it', () => {
    expect(retryBackoffMs(1)).toBe(QUEUE_CONFIG.retryBackoffBaseMs);
    expect(retryBackoffMs(2)).toBe(QUEUE_CONFIG.retryBackoffBaseMs * 2);
    expect(retryBackoffMs(3)).toBeGreaterThan(retryBackoffMs(2));
    expect(retryBackoffMs(50)).toBe(QUEUE_CONFIG.retryBackoffMaxMs);
  });

  it('makes an interrupted source wait before it can be claimed again', async () => {
    selectRows = [{ interruptions: 0 }];
    updateRows = [{ id: 'src_1' }];
    const before = Date.now();

    const outcome = await recordSourceInterruption('src_1', 'w:lease', 'Gemini 503', 5);

    expect(outcome).toBe('queued');
    const nextAttemptAt = updateSets[0].nextAttemptAt as string;
    expect(new Date(nextAttemptAt).getTime()).toBeGreaterThan(before);
    expect(new Date(nextAttemptAt).getTime()).toBeLessThanOrEqual(
      before + QUEUE_CONFIG.retryBackoffMaxMs + 1_000
    );
  });

  it('waits longer after each interruption', async () => {
    updateRows = [{ id: 'src_1' }];
    const reference = Date.now();

    selectRows = [{ interruptions: 0 }];
    await recordSourceInterruption('src_1', 'w:lease', 'Gemini 503', 5);
    selectRows = [{ interruptions: 3 }];
    await recordSourceInterruption('src_1', 'w:lease', 'Gemini 503', 5);

    const first = new Date(updateSets[0].nextAttemptAt as string).getTime() - reference;
    const fourth = new Date(updateSets[1].nextAttemptAt as string).getTime() - reference;
    expect(fourth).toBeGreaterThan(first);
  });

  it('does not schedule a retry for a source it parks as stalled', async () => {
    selectRows = [{ interruptions: 4 }];
    updateRows = [{ id: 'src_1' }];

    const outcome = await recordSourceInterruption('src_1', 'w:lease', 'Gemini 503', 5);

    expect(outcome).toBe('stalled');
    expect(updateSets[0].nextAttemptAt).toBeNull();
  });

  it('backs a genuine failure off before its retry, but not once it is failed', async () => {
    updateRows = [{ id: 'src_1' }];

    selectRows = [{ attempts: 0 }];
    await recordSourceFailure('src_1', 'w:lease', 'bad response', 3);
    expect(typeof updateSets[0].nextAttemptAt).toBe('string');

    selectRows = [{ attempts: 2 }];
    await recordSourceFailure('src_1', 'w:lease', 'bad response', 3);
    expect(updateSets[1].nextAttemptAt).toBeNull();
  });
});

describe('claimNextQueuedSource', () => {
  it('only considers rows whose backoff has elapsed, treating NULL as ready', async () => {
    selectRows = [];

    await claimNextQueuedSource('w:lease');

    const { sql, params } = renderSql(selectWheres[0]);
    expect(sql).toMatch(/next_attempt_at.*is null/i);
    expect(sql).toMatch(/next_attempt_at.*<=/i);
    // The cutoff is "now", bound as a parameter rather than baked into the SQL.
    expect(params.some((p) => typeof p === 'string' && !Number.isNaN(Date.parse(p)))).toBe(true);
  });

  it('clears the backoff on the row it claims', async () => {
    selectRows = [{ id: 'src_1' }];
    updateRows = [{ id: 'src_1', processingStatus: 'extracting' }];

    const attempt = await claimNextQueuedSource('w:lease');

    expect(attempt.source).not.toBeNull();
    expect(attempt.contended).toBe(false);
    expect(updateSets[0].nextAttemptAt).toBeNull();
    expect(updateSets[0].processingLeaseId).toBe('w:lease');
  });

  it('reports contention when candidates existed but every claim lost', async () => {
    selectRows = [{ id: 'src_1' }, { id: 'src_2' }];
    updateRows = [];

    const attempt = await claimNextQueuedSource('w:lease');

    expect(attempt.source).toBeNull();
    expect(attempt.contended).toBe(true);
  });

  it('reports an empty queue when there were no candidates at all', async () => {
    selectRows = [];

    const attempt = await claimNextQueuedSource('w:lease');

    expect(attempt.source).toBeNull();
    expect(attempt.contended).toBe(false);
  });
});
