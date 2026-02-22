"use client"

import { useState, useEffect, useRef } from 'react'
import { Loader2, ArrowRight } from 'lucide-react'
import Link from 'next/link'

interface SessionMeta {
  uploadedFiles?: string[]
  processingQueue?: string[]
  errors?: Array<{ fileId: string; error: string }>
}

interface Session {
  id: string
  userId: string
  status: string
  meta: SessionMeta | null
}

interface StatusCounts {
  uploaded: number
  queued: number
  extracting: number
  enriching: number
  completed: number
  failed: number
}

const POLL_INTERVAL = 5000

export function ProcessingBanner() {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [counts, setCounts] = useState<StatusCounts | null>(null)
  const [placesCreated, setPlacesCreated] = useState(0)
  const [total, setTotal] = useState(0)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // On mount: check for active mass upload sessions
  useEffect(() => {
    const checkForActive = async () => {
      try {
        const res = await fetch('/api/upload/sessions?limit=5')
        if (!res.ok) return

        const data = await res.json()
        if (data.status !== 'success' || !data.sessions) return

        const active = (data.sessions as Session[]).find(s => {
          const uploadedFiles = s.meta?.uploadedFiles || []
          return s.status === 'active' && uploadedFiles.length > 0
        })

        if (active) {
          setActiveSessionId(active.id)
        }
      } catch {
        // Silently fail — banner is non-critical
      }
    }

    checkForActive()
  }, [])

  // Poll status for active session
  useEffect(() => {
    if (!activeSessionId) return

    const poll = async () => {
      try {
        const res = await fetch(`/api/mass-upload/status?sessionId=${activeSessionId}`)
        if (!res.ok) return

        const data = await res.json()
        if (data.status !== 'success') return

        setCounts(data.counts)
        setTotal(data.total)
        setPlacesCreated(data.placesCreated)

        // Stop polling if done
        const activeCount =
          (data.counts.queued || 0) +
          (data.counts.extracting || 0) +
          (data.counts.enriching || 0)

        if (activeCount === 0 && ((data.counts.completed || 0) > 0 || (data.counts.failed || 0) > 0)) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current)
            intervalRef.current = null
          }
        }
      } catch {
        // Silently fail
      }
    }

    poll()
    intervalRef.current = setInterval(poll, POLL_INTERVAL)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [activeSessionId])

  // Don't render if no active processing
  if (!counts) return null

  const activeCount =
    (counts.queued || 0) +
    (counts.extracting || 0) +
    (counts.enriching || 0)

  if (activeCount === 0) return null

  const processed = (counts.completed || 0) + (counts.failed || 0)

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
      <div className="flex items-center gap-2 min-w-0">
        <Loader2 className="h-4 w-4 animate-spin text-blue-600 flex-shrink-0" />
        <span className="text-sm text-blue-800 truncate">
          Processing {processed} of {total} screenshots... {placesCreated} places found
        </span>
      </div>
      <Link
        href="/mass-upload"
        className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 flex-shrink-0 ml-2"
      >
        Details <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  )
}
