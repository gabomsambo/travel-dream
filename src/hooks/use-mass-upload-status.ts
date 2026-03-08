"use client"

import { useState, useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'

const POLL_INTERVAL = 5000

interface MassUploadStatusCounts {
  uploaded: number
  queued: number
  extracting: number
  enriching: number
  completed: number
  failed: number
  cancelled: number
}

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
}

interface UseMassUploadStatusActions {
  startPolling: (sessionId: string) => void
  stopPolling: () => void
  reset: () => void
}

const initialCounts: MassUploadStatusCounts = {
  uploaded: 0,
  queued: 0,
  extracting: 0,
  enriching: 0,
  completed: 0,
  failed: 0,
  cancelled: 0,
}

const initialState: UseMassUploadStatusState = {
  counts: initialCounts,
  total: 0,
  placesCreated: 0,
  isActive: false,
  isComplete: false,
  isLoading: false,
  error: null,
  estimatedMinutesRemaining: null,
  processingRate: 0,
}

export type { MassUploadStatusCounts, UseMassUploadStatusState, UseMassUploadStatusActions }

export function useMassUploadStatus(): UseMassUploadStatusState & UseMassUploadStatusActions {
  const [state, setState] = useState<UseMassUploadStatusState>(initialState)
  const sessionIdRef = useRef<string | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const hasCompletedRef = useRef(false)
  const processingStartTimeRef = useRef<number | null>(null)
  const initialCompletedRef = useRef<number>(0)

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

      const counts: MassUploadStatusCounts = {
        uploaded: data.counts.uploaded || 0,
        queued: data.counts.queued || 0,
        extracting: data.counts.extracting || 0,
        enriching: data.counts.enriching || 0,
        completed: data.counts.completed || 0,
        failed: data.counts.failed || 0,
        cancelled: data.counts.cancelled || 0,
      }

      const activeCount = counts.queued + counts.extracting + counts.enriching
      const isActive = activeCount > 0
      const hasTerminalSources = counts.completed > 0 || counts.failed > 0 || counts.cancelled > 0
      const isComplete = !isActive && hasTerminalSources && (data.total || 0) > 0

      // ETA calculation
      let estimatedMinutesRemaining: number | null = null
      let processingRate = 0

      const completedNow = counts.completed + counts.failed + counts.cancelled
      const remaining = (data.total || 0) - completedNow

      if (isActive && completedNow > 0) {
        if (processingStartTimeRef.current === null) {
          processingStartTimeRef.current = Date.now()
          initialCompletedRef.current = completedNow
        }

        const elapsedMs = Date.now() - processingStartTimeRef.current
        const processed = completedNow - initialCompletedRef.current

        if (elapsedMs > 10000 && processed > 0) {
          processingRate = processed / (elapsedMs / 60000)
          estimatedMinutesRemaining = Math.max(1, Math.ceil(remaining / processingRate))
        }
      }

      setState({
        counts,
        total: data.total || 0,
        placesCreated: data.placesCreated || 0,
        isActive,
        isComplete,
        isLoading: false,
        error: null,
        estimatedMinutesRemaining,
        processingRate,
      })

      if (isComplete && !hasCompletedRef.current) {
        hasCompletedRef.current = true
        stopPolling()
        toast.success(
          `Processing complete! ${data.placesCreated || 0} places found from ${counts.completed} screenshots.`
        )
        // Mark session as completed so revisit detection skips it
        if (sessionIdRef.current) {
          fetch(`/api/upload/sessions?sessionId=${sessionIdRef.current}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'completed' }),
          }).catch(() => {})
        }
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch status',
      }))
    }
  }, [stopPolling])

  const startPolling = useCallback((sessionId: string) => {
    stopPolling()
    sessionIdRef.current = sessionId
    hasCompletedRef.current = false
    processingStartTimeRef.current = null
    initialCompletedRef.current = 0
    fetchStatus()
    intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL)
  }, [fetchStatus, stopPolling])

  const reset = useCallback(() => {
    stopPolling()
    sessionIdRef.current = null
    hasCompletedRef.current = false
    processingStartTimeRef.current = null
    initialCompletedRef.current = 0
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
