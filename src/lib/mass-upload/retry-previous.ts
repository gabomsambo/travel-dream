import { sql, type SQL } from 'drizzle-orm';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';
import type { Source } from '@/types/database';

export type SourceMeta = NonNullable<Source['meta']>;
export type SourceRetryPrevious = NonNullable<NonNullable<SourceMeta['retry']>['previous']>;

function finite(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** The failed or stalled row stored on `meta.retry.previous`, or null when it is absent or unusable. */
export function retryPreviousOf(meta: SourceMeta | null | undefined): SourceRetryPrevious | null {
  const previous = meta?.retry?.previous;
  if (!previous) return null;
  if (previous.processingStatus !== 'failed' && previous.processingStatus !== 'stalled') return null;
  return {
    processingStatus: previous.processingStatus,
    processingAttempts: finite(previous.processingAttempts),
    processingInterruptions: finite(previous.processingInterruptions),
    processingError: typeof previous.processingError === 'string' ? previous.processingError : null,
  };
}

/** `meta.retry.previous` set from the row's current failed or stalled columns. */
export function metaStoringRetryPrevious(): SQL {
  const row = sourcesCurrentSchema;
  return sql`json_set(
    COALESCE(${row.meta}, '{}'),
    '$.retry.previous',
    json_object(
      'processingStatus', ${row.processingStatus},
      'processingAttempts', COALESCE(${row.processingAttempts}, 0),
      'processingInterruptions', COALESCE(${row.processingInterruptions}, 0),
      'processingError', ${row.processingError}
    )
  )`;
}

/** Drop `retry.previous` on the row being updated, and drop `retry` when that leaves it empty. */
export function metaDroppingRetryPrevious(): SQL {
  const meta = sourcesCurrentSchema.meta;
  const strip = () => sql`json_remove(${meta}, '$.retry.previous')`;
  return sql`CASE
    WHEN json_extract(${meta}, '$.retry.previous') IS NULL THEN ${meta}
    WHEN json_extract(${strip()}, '$.retry') = '{}'
    THEN json_remove(${strip()}, '$.retry')
    ELSE ${strip()}
  END`;
}
