'use client'

import { Check, Image as ImageIcon, MapPin, ZoomIn } from 'lucide-react'
import { Button } from '@/components/adapters/button'
import { BatchTripChip } from '@/components/review/batch-trip-menu'
import { kindLabel } from '@/components/explore/kind-icon'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { formatDateTime } from '@/lib/place-view/format'
import { groupCountLabel, screenshotTitle } from '@/lib/review-group'
import type { ExploreCollection } from '@/lib/explore/types'
import type { ReviewQueueEntry } from '@/lib/review-queue'
import { cn } from '@/lib/utils'

interface ReviewGroupViewProps {
  members: ReviewQueueEntry[]
  excluded: Readonly<Record<string, boolean>>
  onToggle: (placeId: string) => void
  onOpen: (placeId: string) => void
  trips: ExploreCollection[]
  selectedTripId: string | null
  selectedTripName: string | null
  tripHint: string
  onSelectTrip: (choice: string | 'none') => void
  zoomOpen: boolean
  onZoomOpenChange: (open: boolean) => void
}

function shotAvailable(url: string | null): url is string {
  return Boolean(url) && !url?.startsWith('/uploads/')
}

export function ReviewGroupView({
  members,
  excluded,
  onToggle,
  onOpen,
  trips,
  selectedTripId,
  selectedTripName,
  tripHint,
  onSelectTrip,
  zoomOpen,
  onZoomOpenChange,
}: ReviewGroupViewProps) {
  const first = members[0]
  const url = first?.screenshotUrl ?? null
  const available = shotAvailable(url)
  const title = screenshotTitle(first?.screenshotName)
  const countLabel = groupCountLabel(members.length, members.map((member) => member.city))
  const included = members.filter((member) => !excluded[member.placeId]).length
  const when = formatDateTime(first?.screenshotCreatedAt)

  return (
    <div className="grid gap-6 xl:grid-cols-[330px_minmax(0,1fr)] xl:gap-7" data-testid="review-group">
      <div className="hidden xl:block">
        {available ? (
          <button
            type="button"
            onClick={() => onZoomOpenChange(true)}
            className="relative block w-full overflow-hidden rounded-2xl border bg-black text-left"
            aria-label="Zoom screenshot"
          >
            {/* Persisted source URL, already ownership-filtered. Same pattern as the place hero. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="h-[640px] w-full object-cover object-top" />
            <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/45 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md">
              <ZoomIn className="h-3.5 w-3.5" aria-hidden /> Zoom
            </span>
          </button>
        ) : (
          <div className="grid min-h-48 place-items-center rounded-2xl border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
            <span><ImageIcon className="mx-auto mb-2 h-7 w-7" aria-hidden />Screenshot unavailable</span>
          </div>
        )}
        {(first?.screenshotName || when) && (
          <p className="mt-2.5 truncate text-xs text-muted-foreground">
            {[first?.screenshotName, when].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>

      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">From one screenshot</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-3">
          <h2 className="font-serif text-4xl font-semibold leading-none tracking-tight">{title}</h2>
          <span className="text-muted-foreground">{countLabel}</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          We found {members.length} places in this post. Untick any you don&apos;t want.
        </p>

        <ul className="mt-4 flex flex-col gap-2.5">
          {members.map((member) => {
            const off = Boolean(excluded[member.placeId])
            const initial = member.name.trim().charAt(0).toUpperCase() || '?'
            return (
              <li
                key={member.placeId}
                className={cn(
                  'grid grid-cols-[auto_60px_minmax(0,1fr)] items-center gap-3 rounded-2xl border bg-card px-3 py-2.5 xl:grid-cols-[auto_84px_minmax(0,1fr)_auto] xl:gap-3.5 xl:px-3.5',
                  off && 'opacity-55',
                )}
              >
                <button
                  type="button"
                  aria-pressed={!off}
                  aria-label={off ? `Include ${member.name}` : `Leave ${member.name} out`}
                  onClick={() => onToggle(member.placeId)}
                  className={cn(
                    'grid h-7 w-7 place-items-center rounded-lg border-2',
                    off ? 'border-border bg-background' : 'border-primary bg-primary text-primary-foreground',
                  )}
                >
                  {!off && <Check className="h-4 w-4" aria-hidden />}
                </button>
                <span className="relative h-[60px] w-[60px] overflow-hidden rounded-xl border bg-muted xl:h-[84px] xl:w-[84px]">
                  {available ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="" className="h-full w-full object-cover object-top" />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-lg font-semibold text-muted-foreground">{initial}</span>
                  )}
                  <span className="absolute bottom-1 right-1 grid h-6 w-6 place-items-center rounded-md bg-background/90 text-xs font-semibold shadow-sm">
                    {initial}
                  </span>
                </span>
                <div className="min-w-0">
                  <h3 className="truncate font-serif text-xl leading-tight xl:text-2xl">{member.name}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>{kindLabel(member.kind)}{member.city ? ` · ${member.city}` : ''}</span>
                    {member.hasPin ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                        <Check className="h-3.5 w-3.5" aria-hidden /> Pinned
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-800 dark:text-amber-200">
                        <MapPin className="h-3.5 w-3.5" aria-hidden /> No pin yet
                      </span>
                    )}
                  </div>
                  {member.quote && (
                    <p className="mt-1 truncate text-sm text-muted-foreground">“{member.quote}”</p>
                  )}
                </div>
                <div className="col-start-2 col-end-[-1] flex justify-end xl:col-auto">
                  <Button type="button" variant="outline" size="sm" onClick={() => onOpen(member.placeId)}>
                    Open
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>

        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">For all {included}</span>
          <BatchTripChip
            trips={trips}
            selectedId={selectedTripId}
            selectedName={selectedTripName}
            onSelect={onSelectTrip}
          />
          <span className="text-xs text-muted-foreground">{tripHint}</span>
        </div>
      </div>

      {available && (
        <Dialog open={zoomOpen} onOpenChange={onZoomOpenChange}>
          <DialogContent data-screenshot-zoom="" className="max-w-5xl border-0 bg-black p-2 text-white sm:rounded-2xl">
            <DialogTitle className="sr-only">{title}</DialogTitle>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`Screenshot ${title}`} className="max-h-[85vh] w-full rounded-xl object-contain" />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
