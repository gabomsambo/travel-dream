'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/adapters/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/adapters/popover'
import { useActivityJobs } from '@/components/activity/activity-provider'
import type { ActivityJob } from '@/lib/activity-jobs'

function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M6.3 9.2a5.7 5.7 0 1 1 11.4 0c0 3.4.9 5.3 1.8 6.6.4.5 0 1.2-.6 1.2H5.1c-.6 0-1-.7-.6-1.2.9-1.3 1.8-3.2 1.8-6.6Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M9.6 19.2a2.4 2.4 0 0 0 4.8 0"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

function JobActions({
  job,
  onAcknowledge,
  onNavigate,
}: {
  job: ActivityJob
  onAcknowledge: (id: string) => void
  onNavigate: (href: string) => void
}) {
  if (job.phase !== 'complete') return null

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 px-2 text-xs"
        onClick={event => {
          event.stopPropagation()
          onNavigate(job.href)
          onAcknowledge(job.id)
        }}
      >
        View results
      </Button>
      {job.counts.stalled > 0 && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          onClick={event => {
            event.stopPropagation()
            onNavigate('/mass-upload')
          }}
        >
          Retry stalled
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs"
        onClick={event => {
          event.stopPropagation()
          onAcknowledge(job.id)
        }}
      >
        Dismiss
      </Button>
    </div>
  )
}

export function ActivityBell() {
  const router = useRouter()
  const { jobs, connectionState, acknowledge } = useActivityJobs()
  const activeJobs = jobs.filter(job => job.phase === 'active')
  const completeJobs = jobs.filter(job => job.phase === 'complete')
  const hasItems = jobs.length > 0
  const hasUnread = completeJobs.length > 0
  const hasActive = activeJobs.length > 0

  const label = hasUnread
    ? `Activity, ${completeJobs.length} finished`
    : hasActive
      ? `Activity, ${activeJobs.length} in progress`
      : 'Activity'

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative hover:bg-muted data-[state=open]:bg-muted"
          aria-label={label}
        >
          <BellIcon className="h-[1.2rem] w-[1.2rem] text-foreground" />
          {hasItems && (
            <span
              data-testid="activity-bell-indicator"
              className={`absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background ${
                hasActive && !hasUnread ? 'animate-pulse' : ''
              }`}
            />
          )}
          <span className="sr-only">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80 p-0 sm:w-96">
        <div className="border-b px-3 py-2">
          <p className="text-sm font-medium">Activity</p>
        </div>
        {connectionState === 'paused' && (
          <div
            role="status"
            className="border-b bg-muted/60 px-3 py-2 text-xs text-muted-foreground"
          >
            Updates paused — retrying. Figures below may be out of date.
          </div>
        )}
        <div className="max-h-80 overflow-y-auto p-2">
          {!hasItems && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              No background activity
            </p>
          )}
          {activeJobs.map(job => (
            <button
              key={job.id}
              type="button"
              className="w-full rounded-md px-2 py-2 text-left hover:bg-accent hover:text-accent-foreground"
              onClick={() => router.push(job.href)}
            >
              <p className="text-sm font-medium">Mass upload</p>
              <p className="text-xs text-muted-foreground">{job.summary}</p>
            </button>
          ))}
          {completeJobs.map(job => (
            <div key={job.id} className="rounded-md px-2 py-2">
              <button
                type="button"
                className="w-full text-left"
                onClick={() => {
                  router.push(job.href)
                  acknowledge(job.id)
                }}
              >
                <p className="text-sm font-medium">Mass upload</p>
                <p className="text-xs text-muted-foreground">{job.summary}</p>
              </button>
              <JobActions
                job={job}
                onAcknowledge={acknowledge}
                onNavigate={href => router.push(href)}
              />
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
