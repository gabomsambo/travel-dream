export interface MassUploadStatusCounts {
  uploaded: number
  queued: number
  extracting: number
  enriching: number
  completed: number
  failed: number
  /** Repeatedly interrupted before finishing — retryable, not a bad image. */
  stalled: number
  cancelled: number
}

export const emptyMassUploadCounts: MassUploadStatusCounts = {
  uploaded: 0,
  queued: 0,
  extracting: 0,
  enriching: 0,
  completed: 0,
  failed: 0,
  stalled: 0,
  cancelled: 0,
}

export interface MassUploadStatusPayload {
  counts?: Partial<MassUploadStatusCounts> | null
  total?: number | null
  placesCreated?: number | null
  failedErrors?: Array<{ sourceId: string; error: string }> | null
}

export interface EtaTiming {
  startMs: number | null
  initialCompleted: number
}

export function normalizeCounts(
  raw?: Partial<MassUploadStatusCounts> | null
): MassUploadStatusCounts {
  return {
    uploaded: raw?.uploaded || 0,
    queued: raw?.queued || 0,
    extracting: raw?.extracting || 0,
    enriching: raw?.enriching || 0,
    completed: raw?.completed || 0,
    failed: raw?.failed || 0,
    stalled: raw?.stalled || 0,
    cancelled: raw?.cancelled || 0,
  }
}

export function activeSourceCount(counts: MassUploadStatusCounts): number {
  return counts.queued + counts.extracting + counts.enriching
}

export function terminalSourceCount(counts: MassUploadStatusCounts): number {
  return counts.completed + counts.failed + counts.stalled + counts.cancelled
}

export function isSessionComplete(
  counts: MassUploadStatusCounts,
  total: number
): boolean {
  return activeSourceCount(counts) === 0 && terminalSourceCount(counts) > 0 && total > 0
}

export function computeEta(
  counts: MassUploadStatusCounts,
  total: number,
  timing: EtaTiming,
  nowMs: number
): { estimatedMinutesRemaining: number | null; processingRate: number; timing: EtaTiming } {
  const completedNow = terminalSourceCount(counts)
  const remaining = total - completedNow
  const isActive = activeSourceCount(counts) > 0

  let nextTiming = timing
  let estimatedMinutesRemaining: number | null = null
  let processingRate = 0

  if (isActive && completedNow > 0) {
    if (timing.startMs === null) {
      nextTiming = { startMs: nowMs, initialCompleted: completedNow }
    }

    const startMs = nextTiming.startMs ?? nowMs
    const elapsedMs = nowMs - startMs
    const processed = completedNow - nextTiming.initialCompleted

    if (elapsedMs > 10000 && processed > 0) {
      processingRate = processed / (elapsedMs / 60000)
      estimatedMinutesRemaining = Math.max(1, Math.ceil(remaining / processingRate))
    }
  }

  return { estimatedMinutesRemaining, processingRate, timing: nextTiming }
}
