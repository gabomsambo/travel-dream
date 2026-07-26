import { sql, type SQL } from 'drizzle-orm';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';

/**
 * "This row can be handed out right now."
 *
 * One definition shared by the claim query and by everything that counts how
 * much work is waiting. If counting used a looser rule than claiming, a queue
 * whose items are all backing off would report work nobody can take, and the
 * worker chain would keep spawning runs that claim nothing.
 *
 * `next_attempt_at` NULL means ready, so pre-existing rows and freshly queued
 * uploads are claimable immediately.
 */
export function isClaimableNow(nowIso: string): SQL {
  return sql`(${sourcesCurrentSchema.nextAttemptAt} IS NULL OR ${sourcesCurrentSchema.nextAttemptAt} <= ${nowIso})`;
}
