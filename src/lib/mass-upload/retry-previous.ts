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

export function metaWithRetryPrevious(
  meta: SourceMeta | null | undefined,
  previous: SourceRetryPrevious
): SourceMeta {
  return {
    ...(meta ?? {}),
    retry: { ...(meta?.retry ?? {}), previous },
  };
}

/** A copy of `meta` without `retry.previous`, or null when there was nothing to drop. */
export function metaWithoutRetryPrevious(meta: SourceMeta | null | undefined): SourceMeta | null {
  if (!meta?.retry?.previous) return null;
  const next: SourceMeta = { ...meta };
  const retry = { ...(next.retry ?? {}) };
  delete retry.previous;
  if (Object.keys(retry).length === 0) delete next.retry;
  else next.retry = retry;
  return next;
}
