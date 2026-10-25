import {
  isSessionComplete,
  normalizeCounts,
  processedSourceCount,
  type MassUploadStatusCounts,
} from '@/lib/mass-upload/status-view'
import { uploadResultsHref } from '@/lib/upload-sheet'

export const ACTIVITY_JOBS_STORAGE_KEY = 'td:activity-jobs:v1'

export function activityJobsStorageKey(ownerUserId: string): string {
  return `${ACTIVITY_JOBS_STORAGE_KEY}:${ownerUserId}`
}

export type ActivityJobKind = 'mass-upload'
export type ActivityJobPhase = 'active' | 'complete'
export type ActivityConnectionState = 'idle' | 'live' | 'paused'

export interface ActivityJob {
  id: string
  kind: ActivityJobKind
  phase: ActivityJobPhase
  summary: string
  href: string
  counts: MassUploadStatusCounts
  total: number
  placesCreated: number
  estimatedMinutesRemaining: number | null
  announced: boolean
  /** False only when the finished upload has nothing left for the Inbox. */
  anythingLeft: boolean
  updatedAt: string
}

export interface PersistedActivityJob {
  id: string
  ownerUserId: string
  kind: ActivityJobKind
  counts: MassUploadStatusCounts
  total: number
  placesCreated: number
  announced: boolean
  anythingLeft?: boolean
  updatedAt: string
}

function placeWord(n: number): string {
  return n === 1 ? 'place' : 'places'
}

export function formatActiveSummary(job: {
  counts: MassUploadStatusCounts
  total: number
  placesCreated: number
  estimatedMinutesRemaining: number | null
}): string {
  const cancelled = job.counts.cancelled || 0
  const adjustedTotal = Math.max(0, job.total - cancelled)
  const processed = processedSourceCount(job.counts)
  const parts = [`Processing ${processed} of ${adjustedTotal}`]
  if (job.counts.stalled > 0) {
    parts.push(`${job.counts.stalled} still trying`)
  }
  parts.push(`${job.placesCreated} ${placeWord(job.placesCreated)} found`)
  if (job.estimatedMinutesRemaining != null) {
    parts.push(`~${job.estimatedMinutesRemaining} min`)
  }
  return parts.join(' · ')
}

export function formatCompleteSummary(job: {
  counts: MassUploadStatusCounts
  placesCreated: number
}): string {
  const parts = [`${job.counts.completed} processed`]
  if (job.counts.failed > 0) {
    parts.push(`${job.counts.failed} failed`)
  }
  if (job.counts.stalled > 0) {
    parts.push(`${job.counts.stalled} still trying`)
  }
  parts.push(`${job.placesCreated} ${placeWord(job.placesCreated)} found`)
  return parts.join(' · ')
}

export function jobHref(phase: ActivityJobPhase, sessionId: string, anythingLeft: boolean): string {
  if (phase === 'active') return '/inbox'
  return uploadResultsHref(sessionId, anythingLeft)
}

export function toActivityJob(
  sessionId: string,
  counts: MassUploadStatusCounts,
  total: number,
  placesCreated: number,
  estimatedMinutesRemaining: number | null,
  announced: boolean,
  updatedAt: string = new Date().toISOString(),
  anythingLeft = true,
  phaseOverride?: ActivityJobPhase,
): ActivityJob {
  const phase: ActivityJobPhase =
    phaseOverride ?? (isSessionComplete(counts, total) ? 'complete' : 'active')
  const snapshot = { counts, total, placesCreated, estimatedMinutesRemaining }
  const left = phase === 'active' ? true : anythingLeft
  return {
    id: sessionId,
    kind: 'mass-upload',
    phase,
    summary: phase === 'complete' ? formatCompleteSummary(snapshot) : formatActiveSummary(snapshot),
    href: jobHref(phase, sessionId, left),
    counts,
    total,
    placesCreated,
    estimatedMinutesRemaining: phase === 'complete' ? null : estimatedMinutesRemaining,
    announced,
    anythingLeft: left,
    updatedAt,
  }
}

export function persistableJobs(jobs: ActivityJob[], ownerUserId: string): PersistedActivityJob[] {
  return jobs
    .filter(job => job.phase === 'complete')
    .map(job => ({
      id: job.id,
      ownerUserId,
      kind: job.kind,
      counts: job.counts,
      total: job.total,
      placesCreated: job.placesCreated,
      announced: job.announced,
      anythingLeft: job.anythingLeft,
      updatedAt: job.updatedAt,
    }))
}

function isPersistedJob(value: unknown): value is PersistedActivityJob {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<PersistedActivityJob>
  return typeof row.id === 'string' && typeof row.ownerUserId === 'string' && row.kind === 'mass-upload' && typeof row.total === 'number'
}

export function parsePersistedJobs(raw: string | null, ownerUserId: string): ActivityJob[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    const rows = Array.isArray(parsed) ? parsed : []
    return rows.filter(isPersistedJob).filter(row => row.ownerUserId === ownerUserId).map(row =>
      toActivityJob(
        row.id,
        normalizeCounts(row.counts),
        row.total,
        row.placesCreated || 0,
        null,
        Boolean(row.announced),
        row.updatedAt || new Date().toISOString(),
        row.anythingLeft !== false,
        'complete',
      )
    )
  } catch {
    return []
  }
}

export function readPersistedJobs(ownerUserId: string): ActivityJob[] {
  if (typeof window === 'undefined') return []
  try {
    return parsePersistedJobs(
      window.localStorage.getItem(activityJobsStorageKey(ownerUserId)),
      ownerUserId
    )
  } catch {
    return []
  }
}

export function writePersistedJobs(jobs: ActivityJob[], ownerUserId: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      activityJobsStorageKey(ownerUserId),
      JSON.stringify(persistableJobs(jobs, ownerUserId))
    )
  } catch {
    // Private mode / quota — in-memory state still works for this session.
  }
}

export { normalizeCounts }
export type { MassUploadStatusCounts } from '@/lib/mass-upload/status-view'
