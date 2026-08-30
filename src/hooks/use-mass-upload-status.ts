import { useState, useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import {
  computeEta,
  emptyMassUploadCounts,
  isSessionComplete,
  normalizeCounts,
  type EtaTiming,
  type MassUploadStatusCounts,
} from '@/lib/mass-upload/status-view'

const POLL_INTERVAL = 5000

interface UseMassUploadStatusState {
  counts: MassUploadStatusCounts
  total: number
  placesCreated: number
  isActive: boolean
  isComplete: boolean
  isLoading: boolean
  error: string | null
  estimatedMinutesRemaining: number | null
  processingRate: number
  failedErrors: Array<{ sourceId: string; error: string }>
}

interface UseMassUploadStatusActions {
  startPolling: (sessionId: string) => void
  stopPolling: () => void
  reset: () => void
}

const initialState: UseMassUploadStatusState = {
  counts: emptyMassUploadCounts,
  total: 0,
  placesCreated: 0,
  isActive: false,
  isComplete: false,
  isLoading: false,
  error: null,
  estimatedMinutesRemaining: null,
  processingRate: 0,
  failedErrors: [],
}

export type { MassUploadStatusCounts, UseMassUploadStatusState, UseMassUploadStatusActions }

export function useMassUploadStatus(): UseMassUploadStatusState & UseMassUploadStatusActions {
  const [state, setState] = useState<UseMassUploadStatusState>(initialState)
  const sessionIdRef = useRef<string | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const etaTimingRef = useRef<EtaTiming>({ startMs: null, initialCompleted: 0 })

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const fetchStatus = useCallback(async () => {
    if (!sessionIdRef.current) return

    try {
      setState(prev => ({ ...prev, isLoading: true }))

      const res = await fetch(`/api/mass-upload/status?sessionId=${sessionIdRef.current}`)
      if (!res.ok) {
        throw new Error(`Status request failed: ${res.status}`)
      }

      const data = await res.json()
      if (data.status !== 'success') {
        throw new Error(data.message || 'Failed to get status')
      }

      const counts = normalizeCounts(data.counts)
      const total = data.total || 0
      const isActive = counts.queued + counts.extracting + counts.enriching > 0
      const isComplete = isSessionComplete(counts, total)
      const eta = computeEta(counts, total, etaTimingRef.current, Date.now())
      etaTimingRef.current = eta.timing

      setState({
        counts,
        total,
        placesCreated: data.placesCreated || 0,
        isActive,
        isComplete,
        isLoading: false,
        error: null,
        estimatedMinutesRemaining: eta.estimatedMinutesRemaining,
        processingRate: eta.processingRate,
        failedErrors: data.failedErrors || [],
      })

      if (isComplete) {
        stopPolling()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch status'
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: message,
      }))
      toast.error('Could not refresh upload status. Retrying…', {
        id: 'mass-upload-poll-error',
        duration: 10000,
      })
    }
  }, [stopPolling])

  const startPolling = useCallback((sessionId: string) => {
    stopPolling()
    sessionIdRef.current = sessionId
    etaTimingRef.current = { startMs: null, initialCompleted: 0 }
    fetchStatus()
    intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL)
  }, [fetchStatus, stopPolling])

  const reset = useCallback(() => {
    stopPolling()
    sessionIdRef.current = null
    etaTimingRef.current = { startMs: null, initialCompleted: 0 }
    setState(initialState)
  }, [stopPolling])

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  return { ...state, startPolling, stopPolling, reset }
}
