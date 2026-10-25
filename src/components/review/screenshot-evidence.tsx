'use client'

import Link from 'next/link'
import { Image as ImageIcon, ZoomIn } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { formatDateTime } from '@/lib/place-view/format'
import { cn } from '@/lib/utils'
import type { ReviewScreenshotSibling } from '@/lib/review-queue'

type SiblingOutcome = 'added' | 'archived' | 'skipped' | 'removed' | 'merged'

interface ScreenshotEvidenceProps {
  url: string | null
  name: string | null
  createdAt: string | null
  placeName: string
  siblings: ReviewScreenshotSibling[]
  currentPlaceId: string
  queuePlaceIds: ReadonlySet<string>
  outcomes: Record<string, SiblingOutcome>
  onOpenInQueue: (placeId: string) => void
  zoomOpen: boolean
  onZoomOpenChange: (open: boolean) => void
}

function siblingLabel(
  sibling: ReviewScreenshotSibling,
  currentPlaceId: string,
  outcome: SiblingOutcome | undefined,
): { text: string; done: boolean } {
  if (sibling.placeId === currentPlaceId) return { text: 'Now', done: false }
  if (outcome === 'added') return { text: 'Added', done: true }
  if (outcome === 'merged') return { text: 'Merged', done: true }
  if (outcome === 'archived' || sibling.status === 'archived') return { text: 'Not a place', done: true }
  if (outcome === 'skipped') return { text: 'Skipped', done: false }
  if (sibling.status === 'library') return { text: 'In Library', done: true }
  return { text: 'Next', done: false }
}

function ShotImage({ url, alt, className }: { url: string; alt: string; className?: string }) {
  return (
    // Persisted source URLs, already ownership-filtered. Same pattern as the place hero.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} className={className} />
  )
}

export function ScreenshotEvidence({
  url,
  name,
  createdAt,
  placeName,
  siblings,
  currentPlaceId,
  queuePlaceIds,
  outcomes,
  onOpenInQueue,
  zoomOpen,
  onZoomOpenChange,
}: ScreenshotEvidenceProps) {
  const available = Boolean(url) && !url?.startsWith('/uploads/')
  const shown = siblings.filter((sibling) => outcomes[sibling.placeId] !== 'removed')
  const several = shown.length > 1
  const position = shown.findIndex((sibling) => sibling.placeId === currentPlaceId)
  const countLabel = several && position >= 0
    ? `${position + 1} of ${shown.length} places in it`
    : 'Tap to zoom'
  const when = formatDateTime(createdAt)

  const openZoom = () => onZoomOpenChange(true)

  return (
    <aside className="order-first min-w-0 xl:order-none" aria-label="Screenshot evidence">
      <button
        type="button"
        onClick={openZoom}
        disabled={!available}
        className="flex w-full items-center gap-3 rounded-2xl border bg-card p-2.5 text-left shadow-sm disabled:cursor-default xl:hidden"
      >
        {available && url ? (
          <ShotImage url={url} alt="" className="h-16 w-12 shrink-0 rounded-lg border object-cover object-top" />
        ) : (
          <span className="grid h-16 w-12 shrink-0 place-items-center rounded-lg border bg-muted text-muted-foreground">
            <ImageIcon className="h-4 w-4" aria-hidden />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">From your screenshot</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {available ? countLabel : 'Screenshot unavailable'}
          </span>
        </span>
        {available && (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-foreground" aria-hidden>
            <ZoomIn className="h-4 w-4" />
          </span>
        )}
      </button>

      <div className="hidden overflow-hidden rounded-2xl border bg-card shadow-sm xl:sticky xl:top-24 xl:block">
        <div className="px-4 pb-4 pt-4">
          <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">From your screenshot</h2>
          {available && url ? (
            <button
              type="button"
              onClick={openZoom}
              className="relative mt-2.5 block w-full overflow-hidden rounded-2xl border bg-black text-left"
              aria-label="Zoom screenshot"
            >
              <ShotImage url={url} alt="" className="h-[420px] w-full object-cover object-top" />
              <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/45 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md">
                <ZoomIn className="h-3.5 w-3.5" aria-hidden /> Zoom
              </span>
            </button>
          ) : (
            <div className="mt-2.5 grid min-h-36 place-items-center rounded-2xl bg-muted/50 p-6 text-center text-sm text-muted-foreground">
              <span><ImageIcon className="mx-auto mb-2 h-7 w-7" aria-hidden />Screenshot unavailable</span>
            </div>
          )}
          {(name || when) && (
            <p className="mt-2.5 truncate text-xs text-muted-foreground">
              {[name, when].filter(Boolean).join(' · ')}
            </p>
          )}

          {several && (
            <div className="mt-4">
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                In this screenshot · {shown.length} places
              </h3>
              <ul className="mt-2.5 flex flex-col gap-1.5">
                {shown.map((sibling) => {
                  const label = siblingLabel(sibling, currentPlaceId, outcomes[sibling.placeId])
                  const current = sibling.placeId === currentPlaceId
                  const inQueue = queuePlaceIds.has(sibling.placeId)
                  const rowClass = cn(
                    'flex w-full items-center gap-2.5 rounded-xl border bg-background px-2.5 py-2 text-left text-sm',
                    current && 'border-foreground ring-1 ring-foreground',
                  )
                  const body = (
                    <>
                      <span className="min-w-0 flex-1 truncate font-medium">{sibling.name}</span>
                      <span className={cn('shrink-0 text-xs text-muted-foreground', label.done && 'text-emerald-700 dark:text-emerald-300')}>
                        {label.text}
                      </span>
                    </>
                  )
                  return (
                    <li key={sibling.placeId}>
                      {current ? (
                        <div className={rowClass} aria-current="true">{body}</div>
                      ) : inQueue ? (
                        <button type="button" className={cn(rowClass, 'transition hover:border-primary/40')} onClick={() => onOpenInQueue(sibling.placeId)}>
                          {body}
                        </button>
                      ) : (
                        <Link href={`/place/${sibling.placeId}`} className={cn(rowClass, 'transition hover:border-primary/40')}>
                          {body}
                        </Link>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      </div>

      {available && url && (
        <Dialog open={zoomOpen} onOpenChange={onZoomOpenChange}>
          <DialogContent data-screenshot-zoom="" className="max-w-5xl border-0 bg-black p-2 text-white sm:rounded-2xl">
            <DialogTitle className="sr-only">Screenshot</DialogTitle>
            <ShotImage url={url} alt={`Screenshot where ${placeName} was found`} className="max-h-[85vh] w-full rounded-xl object-contain" />
          </DialogContent>
        </Dialog>
      )}
    </aside>
  )
}
