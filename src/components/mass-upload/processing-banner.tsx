"use client"

import { Loader2, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { useActivityJobs } from '@/components/activity/activity-provider'

/**
 * In-flight mass-upload indicator on Inbox only.
 *
 * Completion, failure and stalled outcomes belong to the header activity bell
 * — this banner used to return null at `activeCount === 0`, which hid the
 * conclusion at the exact moment it had something to report. The bell persists
 * that terminal state until the user dismisses it.
 */
export function ProcessingBanner() {
  const { jobs } = useActivityJobs()
  const active = jobs.find(job => job.kind === 'mass-upload' && job.phase === 'active')

  if (!active) return null

  return (
    <div className="bg-muted/60 border border-border rounded-lg p-3 flex items-center justify-between">
      <div className="flex items-center gap-2 min-w-0">
        <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
        <span className="text-sm text-foreground truncate">
          {active.summary}
        </span>
      </div>
      <Link
        href="/mass-upload"
        className="text-sm text-primary hover:text-primary/80 flex items-center gap-1 flex-shrink-0 ml-2"
      >
        Details <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  )
}
