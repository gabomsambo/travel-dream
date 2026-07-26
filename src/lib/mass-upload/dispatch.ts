import { getQueueStats } from '@/lib/db-queries';
import { QUEUE_CONFIG } from './queue-config';

/**
 * Event-driven fan-out for the mass-upload queue.
 *
 * Uploading starts processing immediately instead of waiting for the next cron
 * tick, and the cron becomes a safety net that tops the worker pool back up if a
 * trigger was ever missed. The two paths share this function, so a missed
 * trigger and a duplicated trigger both converge on the same worker count.
 */

export interface DispatchResult {
  queued: number;
  activeWorkers: number;
  desiredWorkers: number;
  spawned: number;
  skippedReason?: string;
}

function resolveBaseUrl(): string | null {
  const explicit =
    process.env.MASS_UPLOAD_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return null;
}

/**
 * Make sure enough processing functions are running for the current queue depth.
 * Returns without spawning when the queue is empty or already covered.
 *
 * `maxWorkers` bounds ONE dispatcher's spawn decision, not the global number of
 * concurrent processing functions: `activeWorkers` only counts runs that have
 * already claimed an item, so dispatchers deciding at the same moment (the
 * worker chain, the safety-net cron, upload-start) can each spawn up to that
 * many. Correctness is unaffected — leases mean no item is processed twice —
 * and the owner accepted the loose ceiling as a deliberate cost tradeoff rather
 * than paying for a durable worker-slot record.
 */
export async function dispatchProcessors(reason: string): Promise<DispatchResult> {
  const cutoff = new Date(Date.now() - QUEUE_CONFIG.leaseTtlMs).toISOString();
  const { queued, activeWorkers } = await getQueueStats(cutoff);

  const desiredWorkers =
    queued === 0
      ? 0
      : Math.min(QUEUE_CONFIG.maxWorkers, Math.ceil(queued / QUEUE_CONFIG.itemsPerWorker));
  const spawnCount = Math.max(0, desiredWorkers - activeWorkers);

  const result: DispatchResult = { queued, activeWorkers, desiredWorkers, spawned: 0 };
  if (spawnCount === 0) return result;

  const baseUrl = resolveBaseUrl();
  const cronSecret = process.env.CRON_SECRET;
  if (!baseUrl || !cronSecret) {
    // The cron safety net still drains the queue, just less promptly.
    result.skippedReason = !baseUrl ? 'no base url configured' : 'CRON_SECRET not configured';
    console.warn(`[MassUpload dispatch] cannot trigger workers (${result.skippedReason})`);
    return result;
  }

  const triggers = Array.from({ length: spawnCount }, async (_, i) => {
    try {
      // The worker answers 202 immediately and drains in after(), so a trigger
      // that hangs is a broken trigger — never something the caller's own run
      // budget should be spent on.
      const res = await fetch(`${baseUrl}/api/mass-upload/process`, {
        method: 'POST',
        headers: { authorization: `Bearer ${cronSecret}`, 'content-type': 'application/json' },
        body: JSON.stringify({ reason: `${reason}#${i}` }),
        signal: AbortSignal.timeout(QUEUE_CONFIG.workerTriggerTimeoutMs),
      });
      try {
        await res.arrayBuffer();
      } catch {
        // Nothing in the acknowledgement is used; releasing it is best effort.
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    } catch (err) {
      console.warn(`[MassUpload dispatch] worker trigger failed:`, err);
      return false;
    }
  });

  result.spawned = (await Promise.all(triggers)).filter(Boolean).length;
  console.log(
    `[MassUpload dispatch] reason=${reason} queued=${queued} active=${activeWorkers} desired=${desiredWorkers} spawned=${result.spawned}`
  );
  return result;
}
