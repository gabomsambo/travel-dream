"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Archive,
  ArrowLeft,
  Check,
  CheckCircle2,
  Image as ImageIcon,
  Inbox,
  Library,
  Loader2,
  SkipForward,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/adapters/button'
import { PlaceView } from '@/components/places/place-view/place-view'
import { placeEditHref } from '@/lib/place-view/edit-link'
import { notify } from '@/lib/notify'
import type { ExploreCollection } from '@/lib/explore/types'
import type { ReviewQueueItem } from '@/lib/review-queue'

type ReviewOutcome = 'added' | 'archived' | 'skipped'

interface ReviewQueueProps {
  items: ReviewQueueItem[]
  trips: ExploreCollection[]
  initialPlaceId?: string
}

const OUTCOME_STATUS: Record<Exclude<ReviewOutcome, 'skipped'>, 'library' | 'archived'> = {
  added: 'library',
  archived: 'archived',
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(
    target.closest('input, textarea, select, [contenteditable="true"], [role="combobox"], [role="dialog"]')
  )
}

/** Enter on a focused button or link already activates it; don't also add the place. */
function isActivatable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('button, a'))
}

async function setPlaceStatus(placeId: string, status: 'inbox' | 'library' | 'archived'): Promise<void> {
  const response = await fetch(`/api/places/${placeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  if (response.ok) return
  const body = await response.json().catch(() => null) as { message?: string } | null
  throw new Error(body?.message || "We couldn't update this place. Try again.")
}

function nextUnhandled(items: ReviewQueueItem[], outcomes: Record<string, ReviewOutcome>, current: number): number | null {
  for (let index = current + 1; index < items.length; index += 1) {
    if (!outcomes[items[index].place.id]) return index
  }
  for (let index = 0; index < current; index += 1) {
    if (!outcomes[items[index].place.id]) return index
  }
  return null
}

function EmptyReview() {
  return (
    <div className="mx-auto flex min-h-[65vh] max-w-xl flex-col items-center justify-center px-6 text-center">
      <div className="relative mb-6 h-28 w-28" aria-hidden>
        <div className="absolute inset-0 rounded-full bg-primary/10" />
        <div className="absolute left-7 top-5 h-16 w-12 -rotate-6 rounded-xl border bg-card shadow-sm" />
        <div className="absolute left-11 top-4 grid h-16 w-12 place-items-center rounded-xl border-2 border-primary bg-card shadow-sm">
          <Check className="h-7 w-7 text-primary" />
        </div>
      </div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Inbox</p>
      <h1 className="mt-3 font-serif text-4xl font-semibold tracking-tight">All caught up</h1>
      <p className="mt-3 text-lg text-muted-foreground">
        Every place from your screenshots has a home. Drop more in and they&apos;ll wait here.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button variant="outline" asChild><Link href="/library"><Library className="mr-2 h-4 w-4" />Open Library</Link></Button>
        <Button asChild><Link href="/mass-upload"><Upload className="mr-2 h-4 w-4" />Upload screenshots</Link></Button>
      </div>
    </div>
  )
}

function ReviewSummary({
  items,
  outcomes,
  onReview,
}: {
  items: ReviewQueueItem[]
  outcomes: Record<string, ReviewOutcome>
  onReview: (index: number) => void
}) {
  const grouped = {
    added: items.filter((item) => outcomes[item.place.id] === 'added'),
    archived: items.filter((item) => outcomes[item.place.id] === 'archived'),
    skipped: items.filter((item) => outcomes[item.place.id] === 'skipped'),
  }
  const firstSkipped = grouped.skipped[0]

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-4xl flex-col justify-center py-10">
      <div className="rounded-[2rem] border bg-card p-6 shadow-sm sm:p-10">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
          <CheckCircle2 className="h-7 w-7" aria-hidden />
        </div>
        <p className="mt-5 text-center text-xs font-semibold uppercase tracking-[0.2em] text-primary">Review complete</p>
        <h1 className="mt-2 text-center font-serif text-4xl font-semibold tracking-tight">That&apos;s everything.</h1>
        <p className="mx-auto mt-3 max-w-xl text-center text-lg text-muted-foreground">
          {grouped.added.length === 0
            ? 'Your Inbox is sorted for now.'
            : `${grouped.added.length} new ${grouped.added.length === 1 ? 'place is' : 'places are'} in your Library.`}
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <Link href="/library" className="rounded-2xl border bg-background p-5 transition hover:border-primary/40 hover:bg-primary/[0.02]">
            <strong className="block font-serif text-3xl">{grouped.added.length}</strong>
            <span className="mt-1 block text-sm text-muted-foreground">added to Library</span>
          </Link>
          <Link href="/archive" className="rounded-2xl border bg-background p-5 transition hover:border-primary/40 hover:bg-primary/[0.02]">
            <strong className="block font-serif text-3xl">{grouped.archived.length}</strong>
            <span className="mt-1 block text-sm text-muted-foreground">not a place</span>
          </Link>
          <button
            type="button"
            disabled={!firstSkipped}
            onClick={() => firstSkipped && onReview(items.indexOf(firstSkipped))}
            className="rounded-2xl border bg-background p-5 text-left transition enabled:hover:border-primary/40 enabled:hover:bg-primary/[0.02] disabled:cursor-default"
          >
            <strong className="block font-serif text-3xl">{grouped.skipped.length}</strong>
            <span className="mt-1 block text-sm text-muted-foreground">skipped for later</span>
          </button>
        </div>

        {grouped.skipped.length > 0 && (
          <div className="mt-6 rounded-2xl bg-amber-500/10 p-4 text-sm text-foreground">
            <span className="font-semibold">Still waiting:</span>{' '}
            {grouped.skipped.map((item, index) => (
              <React.Fragment key={item.place.id}>
                {index > 0 && ', '}
                <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => onReview(items.indexOf(item))}>
                  {item.place.name}
                </button>
              </React.Fragment>
            ))}
          </div>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {firstSkipped && <Button variant="outline" onClick={() => onReview(items.indexOf(firstSkipped))}>Review the skipped {grouped.skipped.length === 1 ? 'one' : 'places'}</Button>}
          <Button asChild><Link href="/library">See them in your Library</Link></Button>
        </div>
      </div>
    </div>
  )
}

export function ReviewQueue({ items, trips, initialPlaceId }: ReviewQueueProps) {
  const router = useRouter()
  const initialIndex = initialPlaceId ? items.findIndex((item) => item.place.id === initialPlaceId) : 0
  const [currentIndex, setCurrentIndex] = React.useState<number | null>(items.length ? Math.max(0, initialIndex) : null)
  const [outcomes, setOutcomes] = React.useState<Record<string, ReviewOutcome>>({})
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const current = currentIndex === null ? null : items[currentIndex]

  const selectIndex = React.useCallback((index: number | null) => {
    setError(null)
    setCurrentIndex(index)
    const href = index === null ? '/review' : `/review?placeId=${encodeURIComponent(items[index].place.id)}`
    window.history.replaceState(window.history.state, '', href)
    const appScroller = document.querySelector('main')
    if (appScroller instanceof HTMLElement && typeof appScroller.scrollTo === 'function') {
      appScroller.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [items])

  const advance = React.useCallback((index: number, nextOutcomes: Record<string, ReviewOutcome>) => {
    selectIndex(nextUnhandled(items, nextOutcomes, index))
  }, [items, selectIndex])

  const undoDecision = React.useCallback(async (
    index: number,
    previousOutcome: ReviewOutcome | undefined,
  ) => {
    const item = items[index]
    const restoreStatus = previousOutcome && previousOutcome !== 'skipped'
      ? OUTCOME_STATUS[previousOutcome]
      : 'inbox'
    try {
      await setPlaceStatus(item.place.id, restoreStatus)
      setOutcomes((existing) => {
        const next = { ...existing }
        if (previousOutcome) next[item.place.id] = previousOutcome
        else delete next[item.place.id]
        return next
      })
      selectIndex(index)
      notify.success(`Restored “${item.place.name}” to your Inbox`)
    } catch (undoError) {
      notify.error(undoError instanceof Error ? undoError.message : "Couldn't undo that change.")
    }
  }, [items, selectIndex])

  const decide = React.useCallback(async (outcome: 'added' | 'archived') => {
    if (!current || currentIndex === null || busy) return
    const index = currentIndex
    const previousOutcome = outcomes[current.place.id]
    setBusy(true)
    setError(null)
    try {
      await setPlaceStatus(current.place.id, OUTCOME_STATUS[outcome])
      const nextOutcomes = { ...outcomes, [current.place.id]: outcome }
      setOutcomes(nextOutcomes)
      advance(index, nextOutcomes)
      notify.success(
        outcome === 'added'
          ? `Added “${current.place.name}” to your Library`
          : `Moved “${current.place.name}” to Archive`,
        {
          duration: 8_000,
          cancel: {
            label: 'Undo',
            onClick: () => void undoDecision(index, previousOutcome),
          },
        }
      )
    } catch (decisionError) {
      const message = decisionError instanceof Error ? decisionError.message : "We couldn't update this place."
      setError(message)
      notify.error(message)
    } finally {
      setBusy(false)
    }
  }, [advance, busy, current, currentIndex, outcomes, undoDecision])

  const skip = React.useCallback(async () => {
    if (!current || currentIndex === null || busy) return
    const index = currentIndex
    const previousOutcome = outcomes[current.place.id]
    setBusy(true)
    setError(null)
    try {
      if (previousOutcome === 'added' || previousOutcome === 'archived') {
        await setPlaceStatus(current.place.id, 'inbox')
      }
      const nextOutcomes = { ...outcomes, [current.place.id]: 'skipped' as const }
      setOutcomes(nextOutcomes)
      advance(index, nextOutcomes)
    } catch (skipError) {
      const message = skipError instanceof Error ? skipError.message : "We couldn't skip this place."
      setError(message)
      notify.error(message)
    } finally {
      setBusy(false)
    }
  }, [advance, busy, current, currentIndex, outcomes])

  const previous = React.useCallback(() => {
    if (currentIndex === null) {
      selectIndex(items.length - 1)
    } else if (currentIndex > 0) {
      selectIndex(currentIndex - 1)
    }
  }, [currentIndex, items.length, selectIndex])

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return
      if (event.key === 'Enter') {
        if (isActivatable(event.target)) return
        event.preventDefault()
        void decide('added')
      } else if (event.key.toLowerCase() === 'n') {
        event.preventDefault()
        void decide('archived')
      } else if (event.key.toLowerCase() === 's') {
        event.preventDefault()
        void skip()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        previous()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [decide, previous, skip])

  if (items.length === 0) return <EmptyReview />
  if (!current || currentIndex === null) {
    return <ReviewSummary items={items} outcomes={outcomes} onReview={selectIndex} />
  }

  const progress = ((currentIndex + 1) / items.length) * 100
  const screenshotIsBrokenLegacyPath = current.screenshotUrl?.startsWith('/uploads/')

  return (
    <div className="-m-3 min-h-full bg-muted/20 pb-36 sm:-m-6 sm:pb-32">
      <header className="sticky top-0 z-40 border-b bg-background/95 px-3 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[1560px] items-center gap-3">
          <Button type="button" variant="ghost" size="sm" onClick={previous} disabled={busy || currentIndex === 0}>
            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden /> Previous
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate text-sm font-semibold">{currentIndex + 1} of {items.length} from {current.uploadLabel}</p>
              <span className="hidden text-xs text-muted-foreground sm:inline">{current.screenshotName ?? 'Screenshot'}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={currentIndex + 1}>
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
            <Link href="/inbox"><Inbox className="mr-1.5 h-4 w-4" />Back to Inbox</Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1560px] gap-5 px-3 py-5 sm:px-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 overflow-hidden rounded-[1.75rem] border bg-background shadow-sm">
          <PlaceView
            place={current.place}
            trips={trips}
            alsoIn={current.alsoIn}
            onEdit={() => router.push(placeEditHref(current.place.id))}
            onPhotoAttached={() => router.refresh()}
            showMobileActionBar={false}
          />
        </div>

        <aside className="order-first min-w-0 xl:order-none" aria-label="Screenshot evidence">
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm xl:sticky xl:top-24">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <p className="text-sm font-semibold">From your screenshot</p>
                {current.screenshotName && <p className="mt-0.5 truncate text-xs text-muted-foreground">{current.screenshotName}</p>}
              </div>
              <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
            </div>
            {current.screenshotUrl && !screenshotIsBrokenLegacyPath ? (
              // Source URLs are already persisted and ownership-filtered. The later evidence PR adds zoom.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={current.screenshotUrl} alt={`Screenshot where ${current.place.name} was found`} className="max-h-[420px] w-full bg-muted object-contain xl:max-h-[70vh]" />
            ) : (
              <div className="grid min-h-36 place-items-center bg-muted/50 p-6 text-center text-sm text-muted-foreground">
                <span><ImageIcon className="mx-auto mb-2 h-7 w-7" />Screenshot unavailable</span>
              </div>
            )}
          </div>
        </aside>
      </div>

      {error && <p role="alert" className="fixed bottom-32 left-1/2 z-50 -translate-x-1/2 rounded-full bg-destructive px-4 py-2 text-sm text-destructive-foreground shadow-lg sm:bottom-24">{error}</p>}

      <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-10px_30px_-20px_rgba(0,0,0,0.4)] backdrop-blur md:left-64 sm:px-6">
        <div className="mx-auto max-w-[1560px]">
          <div className="grid grid-cols-2 gap-2 sm:hidden">
            <Button className="col-span-2 h-12 text-base" onClick={() => void decide('added')} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Add to Library
            </Button>
            <Button variant="outline" className="h-11" onClick={() => void decide('archived')} disabled={busy}><Archive className="mr-2 h-4 w-4" />Not a place</Button>
            <Button variant="outline" className="h-11" onClick={() => void skip()} disabled={busy}><SkipForward className="mr-2 h-4 w-4" />Skip for now</Button>
          </div>
          <div className="hidden items-center gap-3 sm:flex">
            <Button variant="outline" onClick={() => void decide('archived')} disabled={busy}><Archive className="mr-2 h-4 w-4" />Not a place <kbd className="ml-2 text-xs opacity-60">N</kbd></Button>
            <Button variant="outline" onClick={() => void skip()} disabled={busy}><SkipForward className="mr-2 h-4 w-4" />Skip for now <kbd className="ml-2 text-xs opacity-60">S</kbd></Button>
            <span className="ml-auto text-xs text-muted-foreground"><kbd>←</kbd> previous</span>
            <Button className="min-w-48" onClick={() => void decide('added')} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Add to Library <kbd className="ml-2 text-xs opacity-70">Enter</kbd>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
