/**
 * Batch runner for the place-photo backfill: plans (and, in apply mode, writes)
 * each place, with a checkpoint ledger so an interrupted run resumes where it
 * stopped instead of starting over.
 *
 * Idempotency does not rest on the ledger alone. A place whose write landed but
 * whose ledger line did not (power cut between the two) is re-classified from
 * the database on the next run: its new photo now loads, so it is either kept
 * or merely re-pointed, never given a second photo.
 */
import {
  applyDecision,
  decideFromPlan,
  planPlace,
  type ApplyOutcome,
  type BackfillDeps,
  type Decision,
  type PlaceWithPhotos,
} from './backfill';

export interface LedgerEntry {
  placeId: string;
  name: string;
  action: Decision['action'];
  outcome?: ApplyOutcome['applied'];
  attachmentId?: string;
  source?: string;
  at: string;
}

/** Durable record of finished places. Implementations must persist `append` before returning. */
export interface Ledger {
  done(placeId: string): boolean;
  append(entry: LedgerEntry): Promise<void>;
}

export interface PlaceReport {
  place: Pick<PlaceWithPhotos, 'id' | 'name' | 'kind' | 'city' | 'country'>;
  decision?: Decision;
  outcome?: ApplyOutcome;
  error?: string;
}

export interface RunOptions {
  userId: string;
  mode: 'dry-run' | 'apply';
  deps: BackfillDeps;
  /** Required in apply mode; ignored in dry-run. */
  ledger?: Ledger;
  /**
   * Decisions from a reviewed dry run, by place id. When given, only these
   * places run, and each writes its planned decision (re-checked against the
   * current rows) instead of searching again.
   */
  plan?: Map<string, Decision>;
  concurrency?: number;
  batchSize?: number;
  /** Stop after this many places have been processed (ledgered places are not counted). */
  maxPlaces?: number;
  /** Abort the run after this many consecutive place errors (outage, exhausted quota). */
  maxConsecutiveErrors?: number;
  onPlace?: (report: PlaceReport) => void | Promise<void>;
  onBatch?: (done: number, total: number) => void | Promise<void>;
}

export interface RunSummary {
  total: number;
  skippedFromLedger: number;
  processed: number;
  byAction: Record<string, number>;
  bySource: Record<string, number>;
  errors: number;
  aborted: string | null;
}

/** Plan every given place and, in apply mode, write and ledger each decision. */
export async function runBackfill(
  placesToRun: PlaceWithPhotos[],
  opts: RunOptions,
): Promise<RunSummary> {
  if (opts.mode === 'apply' && !opts.ledger) {
    throw new Error('apply mode needs a ledger');
  }
  const concurrency = opts.concurrency ?? 4;
  const batchSize = opts.batchSize ?? 100;
  const maxConsecutive = opts.maxConsecutiveErrors ?? 10;

  const summary: RunSummary = {
    total: opts.plan ? placesToRun.filter((p) => opts.plan!.has(p.id)).length : placesToRun.length,
    skippedFromLedger: 0,
    processed: 0,
    byAction: {},
    bySource: {},
    errors: 0,
    aborted: null,
  };

  let queue = placesToRun;
  if (opts.plan) queue = queue.filter((p) => opts.plan!.has(p.id));
  if (opts.mode === 'apply') {
    const before = queue.length;
    queue = queue.filter((p) => !opts.ledger!.done(p.id));
    summary.skippedFromLedger = before - queue.length;
  }
  if (opts.maxPlaces !== undefined) queue = queue.slice(0, opts.maxPlaces);

  let consecutiveErrors = 0;
  // Lookups run `concurrency` wide; writes go one at a time, since overlapping
  // write transactions on one database fail with SQLITE_BUSY.
  let writeChain: Promise<unknown> = Promise.resolve();
  const serialized = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = writeChain.then(fn, fn);
    writeChain = run.catch(() => undefined);
    return run;
  };

  const runOne = async (place: PlaceWithPhotos): Promise<void> => {
    const report: PlaceReport = {
      place: { id: place.id, name: place.name, kind: place.kind, city: place.city, country: place.country },
    };
    try {
      const planned = opts.plan?.get(place.id);
      const decision = planned
        ? await decideFromPlan(place, planned, opts.deps)
        : await planPlace(place, opts.deps);
      report.decision = decision;

      if (opts.mode === 'apply' && decision.action !== 'retry-later') {
        const outcome = await serialized(() => applyDecision(opts.userId, place.id, decision));
        report.outcome = outcome;
        await opts.ledger!.append({
          placeId: place.id,
          name: place.name,
          action: decision.action,
          outcome: outcome.applied,
          attachmentId: outcome.applied === 'none' ? undefined : outcome.attachmentId,
          source:
            decision.action === 'attach'
              ? decision.photo.source
              : decision.action === 'repoint'
                ? decision.source
                : undefined,
          at: new Date().toISOString(),
        });
      }

      summary.byAction[decision.action] = (summary.byAction[decision.action] ?? 0) + 1;
      if (decision.action === 'attach') {
        summary.bySource[decision.photo.source] = (summary.bySource[decision.photo.source] ?? 0) + 1;
      }
      consecutiveErrors = 0;
    } catch (error) {
      report.error = error instanceof Error ? error.message : String(error);
      summary.errors++;
      consecutiveErrors++;
      if (consecutiveErrors >= maxConsecutive && !summary.aborted) {
        summary.aborted = `${consecutiveErrors} consecutive errors; last: ${report.error}`;
      }
    }
    summary.processed++;
    await opts.onPlace?.(report);
  };

  for (let start = 0; start < queue.length && !summary.aborted; start += batchSize) {
    const batch = queue.slice(start, start + batchSize);
    let cursor = 0;
    const lane = async () => {
      while (cursor < batch.length && !summary.aborted) {
        await runOne(batch[cursor++]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, batch.length) }, lane));
    await opts.onBatch?.(Math.min(start + batch.length, queue.length), queue.length);
  }

  return summary;
}
