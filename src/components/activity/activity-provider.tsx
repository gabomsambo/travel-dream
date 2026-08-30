'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { toastWithNavigate } from '@/lib/toast-navigate'
import {
  readPersistedJobs,
  toActivityJob,
  writePersistedJobs,
  type ActivityConnectionState,
  type ActivityJob,
} from '@/lib/activity-jobs'
import {
  computeEta,
  isSessionComplete,
  normalizeCounts,
  type EtaTiming,
  type MassUploadStatusPayload,
} from '@/lib/mass-upload/status-view'

const POLL_INTERVAL_MS = 5000
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000
const DISCOVER_LIMIT = 5

interface SessionRow {
  id: string
  status: string
  startedAt?: string
  meta?: { uploadedFiles?: string[] } | null
}

interface ActivityJobsContextValue {
  jobs: ActivityJob[]
  connectionState: ActivityConnectionState
  observeSession: (sessionId: string) => void
  acknowledge: (sessionId: string) => void
}

const ActivityJobsContext = createContext<ActivityJobsContextValue>({
  jobs: [],
  connectionState: 'idle',
  observeSession: () => {},
  acknowledge: () => {},
})

export function useActivityJobs(): ActivityJobsContextValue {
  return useContext(ActivityJobsContext)
}

function isDiscoverableSession(session: SessionRow, nowMs: number): boolean {
  const uploadedFiles = session.meta?.uploadedFiles || []
  if (session.status !== 'active' || uploadedFiles.length === 0) return false
  if (session.startedAt) {
    const ageMs = nowMs - new Date(session.startedAt).getTime()
    if (ageMs > SESSION_MAX_AGE_MS) return false
  }
  return true
}

function completionToast(job: ActivityJob): void {
  const stalled = job.counts.stalled
  const failed = job.counts.failed
  if (stalled > 0) {
    toastWithNavigate(
      `Processing finished · ${job.counts.completed} processed · ${stalled} need retry.`,
      '/mass-upload',
      { type: 'warning', actionLabel: 'Review upload' }
    )
    return
  }
  if (failed > 0 && job.counts.completed === 0) {
    toastWithNavigate(
      `Processing finished · ${failed} screenshot${failed === 1 ? '' : 's'} failed.`,
      '/mass-upload',
      { type: 'error', actionLabel: 'Review upload' }
    )
    return
  }
  toastWithNavigate(
    `Processing complete! ${job.placesCreated} places found from ${job.counts.completed} screenshots.`,
    '/library',
    { actionLabel: 'View library' }
  )
}

function markSessionCompleted(sessionId: string): void {
  fetch(`/api/upload/sessions?sessionId=${sessionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'completed' }),
  }).catch(() => {})
}

export function ActivityProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<ActivityJob[]>([])
  const [connectionState, setConnectionState] = useState<ActivityConnectionState>('idle')
  const jobsRef = useRef<ActivityJob[]>([])
  const sessionIdsRef = useRef<Set<string>>(new Set())
  const etaRef = useRef<Map<string, EtaTiming>>(new Map())
  const announcedRef = useRef<Set<string>>(new Set())

  jobsRef.current = jobs

  const commitJobs = useCallback((next: ActivityJob[]) => {
    jobsRef.current = next
    setJobs(next)
    writePersistedJobs(next)
  }, [])

  const acknowledge = useCallback((sessionId: string) => {
    sessionIdsRef.current.delete(sessionId)
    etaRef.current.delete(sessionId)
    commitJobs(jobsRef.current.filter(job => job.id !== sessionId))
  }, [commitJobs])

  const pollOneRef = useRef<(sessionId: string) => Promise<void>>(async () => {})

  const observeSession = useCallback((sessionId: string) => {
    if (!sessionId) return
    sessionIdsRef.current.add(sessionId)
    void pollOneRef.current(sessionId)
  }, [])

  const applyPayload = useCallback((sessionId: string, data: MassUploadStatusPayload) => {
    const counts = normalizeCounts(data.counts)
    const total = data.total || 0
    const placesCreated = data.placesCreated || 0
    const previous = jobsRef.current.find(job => job.id === sessionId)
    const timing = etaRef.current.get(sessionId) ?? { startMs: null, initialCompleted: 0 }
    const eta = computeEta(counts, total, timing, Date.now())
    etaRef.current.set(sessionId, eta.timing)

    const complete = isSessionComplete(counts, total)
    const alreadyAnnounced = announcedRef.current.has(sessionId) || Boolean(previous?.announced)
    const nextJob = toActivityJob(
      sessionId,
      counts,
      total,
      placesCreated,
      eta.estimatedMinutesRemaining,
      complete ? true : alreadyAnnounced
    )

    const others = jobsRef.current.filter(job => job.id !== sessionId)
    commitJobs([...others, nextJob])

    if (complete) {
      sessionIdsRef.current.delete(sessionId)
      etaRef.current.delete(sessionId)
      if (!alreadyAnnounced) {
        announcedRef.current.add(sessionId)
        completionToast(nextJob)
        markSessionCompleted(sessionId)
      }
    }
  }, [commitJobs])

  useEffect(() => {
    const persisted = readPersistedJobs()
    if (persisted.length > 0) {
      for (const job of persisted) {
        if (job.announced) announcedRef.current.add(job.id)
      }
      jobsRef.current = persisted
      setJobs(persisted)
    }

    let stopped = false

    const discover = async () => {
      const res = await fetch(`/api/upload/sessions?limit=${DISCOVER_LIMIT}`)
      if (res.status === 401 || res.status === 403) {
        sessionIdsRef.current.clear()
        throw new Error('Authentication required')
      }
      if (!res.ok) throw new Error(`Session discovery failed: ${res.status}`)
      const data = await res.json() as { status?: string; sessions?: SessionRow[] }
      if (data.status !== 'success' || !data.sessions) return
      const nowMs = Date.now()
      for (const session of data.sessions) {
        if (isDiscoverableSession(session, nowMs) && !announcedRef.current.has(session.id)) {
          sessionIdsRef.current.add(session.id)
        }
      }
    }

    const pollSession = async (sessionId: string) => {
      const res = await fetch(`/api/mass-upload/status?sessionId=${sessionId}`)
      if (res.status === 401 || res.status === 403) {
        sessionIdsRef.current.delete(sessionId)
        return
      }
      if (!res.ok) throw new Error(`Status request failed: ${res.status}`)
      const data = await res.json() as MassUploadStatusPayload & { status?: string; message?: string }
      if (data.status !== 'success') {
        throw new Error(data.message || 'Failed to get status')
      }
      applyPayload(sessionId, data)
    }
    pollOneRef.current = pollSession

    const tick = async () => {
      try {
        await discover()
        const ids = Array.from(sessionIdsRef.current)
        await Promise.all(ids.map(pollSession))
        if (!stopped) setConnectionState('live')
      } catch {
        if (!stopped) setConnectionState('paused')
      }
    }

    void tick()
    const interval = setInterval(() => { void tick() }, POLL_INTERVAL_MS)
    return () => {
      stopped = true
      clearInterval(interval)
    }
  }, [applyPayload])

  return (
    <ActivityJobsContext.Provider value={{ jobs, connectionState, observeSession, acknowledge }}>
      {children}
    </ActivityJobsContext.Provider>
  )
}
