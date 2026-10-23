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
import { placeClassicHref, placeEditHref } from '@/lib/place-view/edit-link'
import { notify } from '@/lib/notify'
import type { ExploreCollection } from '@/lib/explore/types'
import type { ReviewPostcard, ReviewQueueEntry } from '@/lib/review-queue'

type ReviewOutcome = 'added' | 'archived' | 'skipped' | 'removed'
type PlaceStatus = 'inbox' | 'library' | 'archived'
type SessionEntry = ReviewQueueEntry & { postcard?: ReviewPostcard; postcardError?: string }

interface ReviewQueueProps {
  entries: ReviewQueueEntry[]
  postcard: ReviewPostcard | null
  trips: ExploreCollection[]
  initialPlaceId?: string
}

const OUTCOME_STATUS: Record<Exclude<ReviewOutcome, 'skipped' | 'removed'>, 'library' | 'archived'> = {
  added: 'library',
  archived: 'archived',
}

const RESTORED_LABEL = {
  inbox: 'Inbox',
  library: 'Library',
  archived: 'Archive',
} as const

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(
    target.closest('input, textarea, select, [contenteditable="true"], [role="combobox"], [role="dialog"], [role="alertdialog"], [role="menu"]')
  )
}

/** Enter on a focused button or link already activates it; don't also add the place. */
function isActivatable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('button, a'))
}

function reviewHref(placeId: string | null): string {
  if (!placeId) return '/review'
  return `/review?placeId=${encodeURIComponent(placeId)}&from=queue`
}

function installPostcard(
  postcard: ReviewPostcard,
  written: Readonly<Record<string, PlaceStatus>>,
): ReviewPostcard {
  const status = written[postcard.place.id]
  if (!status || postcard.place.status === status) return postcard
  return { ...postcard, place: { ...postcard.place, status } }
}

function withInstalledPostcard(entry: SessionEntry, installed: ReviewPostcard | null): SessionEntry {
  if (!installed || entry.placeId !== installed.place.id) return entry
  const next: SessionEntry = { ...entry, postcard: installed }
  delete next.postcardError
  return next
}

function mergeSession(
  session: SessionEntry[],
  entries: ReviewQueueEntry[],
  postcard: ReviewPostcard | null,
  written: Readonly<Record<string, PlaceStatus>>,
): SessionEntry[] {
  const incoming = new Map(entries.map((entry) => [entry.placeId, entry]))
  const seen = new Set<string>()
  const merged: SessionEntry[] = []
  const installed = postcard ? installPostcard(postcard, written) : null
  for (const existing of session) {
    seen.add(existing.placeId)
    const update = incoming.get(existing.placeId)
    const next: SessionEntry = update ? { ...existing, ...update, postcard: existing.postcard } : existing
    merged.push(withInstalledPostcard(next, installed))
  }
  for (const entry of entries) {
    if (seen.has(entry.placeId)) continue
    merged.push(withInstalledPostcard({ ...entry }, installed))
  }
  return merged
}

function startingPlaceId(entries: ReviewQueueEntry[], initialPlaceId: string | undefined): string | null {
  if (initialPlaceId && entries.some((entry) => entry.placeId === initialPlaceId)) return initialPlaceId
  return entries[0]?.placeId ?? null
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

function withPostcardStatus(
  entries: SessionEntry[],
  placeId: string,
  status: 'inbox' | 'library' | 'archived',
): SessionEntry[] {
  return entries.map((entry) => {
    if (entry.placeId !== placeId || !entry.postcard || entry.postcard.place.status === status) return entry
    return {
      ...entry,
      postcard: {
        ...entry.postcard,
        place: { ...entry.postcard.place, status },
      },
    }
  })
}

function nextUnhandled(entries: ReviewQueueEntry[], outcomes: Record<string, ReviewOutcome>, currentId: string): string | null {
  const current = entries.findIndex((entry) => entry.placeId === currentId)
  const start = current < 0 ? entries.length : current
  for (let index = start + 1; index < entries.length; index += 1) {
    if (!outcomes[entries[index].placeId]) return entries[index].placeId
  }
  for (let index = 0; index < start; index += 1) {
    if (!outcomes[entries[index].placeId]) return entries[index].placeId
  }
  return null
}

function withOutcome(
  existing: Record<string, ReviewOutcome>,
  placeId: string,
  outcome: ReviewOutcome,
): Record<string, ReviewOutcome> {
  if (outcome !== 'removed' && existing[placeId] === 'removed') return existing
  if (existing[placeId] === outcome) return existing
  return { ...existing, [placeId]: outcome }
}

function deriveReviewCursor(
  session: SessionEntry[],
  outcomes: Record<string, ReviewOutcome>,
  currentId: string | null,
  pinnedId: string | null,
): string | null {
  if (session.length === 0) return null
  if (pinnedId && session.some((entry) => entry.placeId === pinnedId)) return pinnedId
  if (
    currentId
    && session.some((entry) => entry.placeId === currentId)
    && !outcomes[currentId]
  ) {
    return currentId
  }
  if (currentId && session.some((entry) => entry.placeId === currentId)) {
    return nextUnhandled(session, outcomes, currentId)
  }
  return session.find((entry) => !outcomes[entry.placeId])?.placeId ?? null
}

function previousSelectableId(
  entries: ReviewQueueEntry[],
  outcomes: Record<string, ReviewOutcome>,
  currentId: string | null,
): string | null {
  const selectable = (placeId: string) => outcomes[placeId] !== 'removed'
  if (currentId === null) {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      if (selectable(entries[index].placeId)) return entries[index].placeId
    }
    return null
  }
  const index = entries.findIndex((entry) => entry.placeId === currentId)
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (selectable(entries[cursor].placeId)) return entries[cursor].placeId
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
  entries,
  outcomes,
  onReview,
}: {
  entries: ReviewQueueEntry[]
  outcomes: Record<string, ReviewOutcome>
  onReview: (placeId: string) => void
}) {
  const grouped = {
    added: entries.filter((entry) => outcomes[entry.placeId] === 'added'),
    archived: entries.filter((entry) => outcomes[entry.placeId] === 'archived'),
    skipped: entries.filter((entry) => outcomes[entry.placeId] === 'skipped'),
    removed: entries.filter((entry) => outcomes[entry.placeId] === 'removed'),
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
            onClick={() => firstSkipped && onReview(firstSkipped.placeId)}
            className="rounded-2xl border bg-background p-5 text-left transition enabled:hover:border-primary/40 enabled:hover:bg-primary/[0.02] disabled:cursor-default"
          >
            <strong className="block font-serif text-3xl">{grouped.skipped.length}</strong>
            <span className="mt-1 block text-sm text-muted-foreground">skipped for later</span>
          </button>
          {grouped.removed.length > 0 && (
            <div className="rounded-2xl border bg-background p-5">
              <strong className="block font-serif text-3xl">{grouped.removed.length}</strong>
              <span className="mt-1 block text-sm text-muted-foreground">removed</span>
            </div>
          )}
        </div>

        {grouped.skipped.length > 0 && (
          <div className="mt-6 rounded-2xl bg-amber-500/10 p-4 text-sm text-foreground">
            <span className="font-semibold">Still waiting:</span>{' '}
            {grouped.skipped.map((entry, index) => (
              <React.Fragment key={entry.placeId}>
                {index > 0 && ', '}
                <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => onReview(entry.placeId)}>
                  {entry.name}
                </button>
              </React.Fragment>
            ))}
          </div>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {firstSkipped && <Button variant="outline" onClick={() => onReview(firstSkipped.placeId)}>Review the skipped {grouped.skipped.length === 1 ? 'one' : 'places'}</Button>}
          <Button asChild><Link href="/library">See them in your Library</Link></Button>
        </div>
      </div>
    </div>
  )
}

export function ReviewQueue({ entries, postcard, trips, initialPlaceId }: ReviewQueueProps) {
  const router = useRouter()
  const [session, setSession] = React.useState<SessionEntry[]>(() => mergeSession([], entries, postcard, {}))
  const [incoming, setIncoming] = React.useState({ entries, postcard })
  const writtenStatusRef = React.useRef<Record<string, PlaceStatus>>({})
  const [currentId, setCurrentId] = React.useState<string | null>(() => startingPlaceId(entries, initialPlaceId))
  const [pinnedId, setPinnedId] = React.useState<string | null>(null)
  const [outcomes, setOutcomes] = React.useState<Record<string, ReviewOutcome>>({})
  const outcomesRef = React.useRef(outcomes)
  outcomesRef.current = outcomes
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const initialQueueRef = React.useRef({ entries, initialPlaceId })
  const didRedirectStaleLink = React.useRef(false)
  const historyPlaceId = React.useRef(currentId)
  const shownIdRef = React.useRef<string | null>(currentId)

  const commitStatus = React.useCallback((placeId: string, status: PlaceStatus) => {
    writtenStatusRef.current = { ...writtenStatusRef.current, [placeId]: status }
    setSession((prev) => withPostcardStatus(prev, placeId, status))
  }, [])

  React.useEffect(() => {
    if (didRedirectStaleLink.current) return
    const { entries: initialEntries, initialPlaceId: requested } = initialQueueRef.current
    if (!requested || initialEntries.some((entry) => entry.placeId === requested)) return
    didRedirectStaleLink.current = true
    router.replace(`/place/${encodeURIComponent(requested)}`)
  }, [router])

  if (incoming.entries !== entries || incoming.postcard !== postcard) {
    setIncoming({ entries, postcard })
    setSession((prev) => mergeSession(prev, entries, postcard, writtenStatusRef.current))
  }

  const derivedId = deriveReviewCursor(session, outcomes, currentId, pinnedId)
  if (derivedId !== currentId) setCurrentId(derivedId)
  shownIdRef.current = derivedId

  const current = derivedId === null ? null : session.find((entry) => entry.placeId === derivedId) ?? null
  const postcardMissing = Boolean(current && !current.postcard && !current.postcardError)

  React.useEffect(() => {
    if (!derivedId || !postcardMissing) return
    const placeId = derivedId
    const controller = new AbortController()
    let cancelled = false
    ;(async () => {
      try {
        const response = await fetch(`/api/review/postcard/${encodeURIComponent(placeId)}`, { signal: controller.signal })
        const body = await response.json().catch(() => null) as (ReviewPostcard & { message?: string }) | null
        if (cancelled) return
        if (!response.ok || !body?.place) {
          throw new Error(body?.message || "We couldn't open this place. Try again.")
        }
        setSession((prev) => prev.map((entry) => {
          if (entry.placeId !== placeId) return entry
          const serverPostcard = installPostcard(
            { place: body.place, alsoIn: body.alsoIn ?? [] },
            writtenStatusRef.current,
          )
          if (!entry.postcard) return withInstalledPostcard(entry, serverPostcard)
          if (!writtenStatusRef.current[placeId] || entry.postcard.place.status === serverPostcard.place.status) return entry
          return withInstalledPostcard(entry, serverPostcard)
        }))
      } catch (loadError) {
        if (cancelled || (loadError instanceof DOMException && loadError.name === 'AbortError')) return
        const message = loadError instanceof Error ? loadError.message : "We couldn't open this place."
        setSession((prev) => prev.map((entry) => {
          if (entry.placeId !== placeId || entry.postcard) return entry
          return { ...entry, postcardError: message }
        }))
      }
    })()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [derivedId, postcardMissing])

  React.useEffect(() => {
    setSession((prev) => {
      let changed = false
      const next = prev.map((entry) => {
        if (!entry.postcardError || entry.placeId === derivedId) return entry
        changed = true
        const cleared: SessionEntry = { ...entry }
        delete cleared.postcardError
        return cleared
      })
      return changed ? next : prev
    })
    if (historyPlaceId.current === derivedId) return
    historyPlaceId.current = derivedId
    window.history.replaceState({}, '', reviewHref(derivedId))
    const appScroller = document.querySelector('main')
    if (appScroller instanceof HTMLElement && typeof appScroller.scrollTo === 'function') {
      appScroller.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [derivedId])

  const selectPlace = React.useCallback((placeId: string | null, pin = false) => {
    setPinnedId(pin ? placeId : null)
    setError(null)
    setCurrentId(placeId)
    historyPlaceId.current = placeId
    window.history.replaceState({}, '', reviewHref(placeId))
    const appScroller = document.querySelector('main')
    if (appScroller instanceof HTMLElement && typeof appScroller.scrollTo === 'function') {
      appScroller.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [])

  const undoDecision = React.useCallback(async (
    placeId: string,
    previousOutcome: ReviewOutcome | undefined,
  ) => {
    const entry = session.find((item) => item.placeId === placeId)
    if (!entry) return
    const restoreStatus = previousOutcome === 'added' || previousOutcome === 'archived'
      ? OUTCOME_STATUS[previousOutcome]
      : 'inbox'
    try {
      await setPlaceStatus(entry.placeId, restoreStatus)
      if (outcomesRef.current[entry.placeId] === 'removed') return
      commitStatus(entry.placeId, restoreStatus)
      setOutcomes((existing) => {
        if (existing[entry.placeId] === 'removed') return existing
        if (!previousOutcome) {
          if (!(entry.placeId in existing)) return existing
          const next = { ...existing }
          delete next[entry.placeId]
          return next
        }
        return withOutcome(existing, entry.placeId, previousOutcome)
      })
      selectPlace(placeId, true)
      notify.success(`Restored “${entry.name}” to your ${RESTORED_LABEL[restoreStatus]}`)
    } catch (undoError) {
      notify.error(undoError instanceof Error ? undoError.message : "Couldn't undo that change.")
    }
  }, [commitStatus, session, selectPlace])

  const decide = React.useCallback(async (outcome: 'added' | 'archived') => {
    if (!current || busy || outcomesRef.current[current.placeId] === 'removed') return
    const placeId = current.placeId
    const previousOutcome = outcomesRef.current[placeId]
    setBusy(true)
    setError(null)
    try {
      const written = OUTCOME_STATUS[outcome]
      await setPlaceStatus(placeId, written)
      if (outcomesRef.current[placeId] === 'removed') return
      commitStatus(placeId, written)
      setOutcomes((existing) => withOutcome(existing, placeId, outcome))
      setPinnedId((pin) => (pin === placeId ? null : pin))
      notify.success(
        outcome === 'added'
          ? `Added “${current.name}” to your Library`
          : `Moved “${current.name}” to Archive`,
        {
          duration: 8_000,
          cancel: {
            label: 'Undo',
            onClick: () => void undoDecision(placeId, previousOutcome),
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
  }, [busy, commitStatus, current, undoDecision])

  const skip = React.useCallback(async () => {
    if (!current || busy || outcomesRef.current[current.placeId] === 'removed') return
    const placeId = current.placeId
    const previousOutcome = outcomesRef.current[placeId]
    setBusy(true)
    setError(null)
    try {
      if (previousOutcome === 'added' || previousOutcome === 'archived') {
        await setPlaceStatus(placeId, 'inbox')
        if (outcomesRef.current[placeId] === 'removed') return
        commitStatus(placeId, 'inbox')
      }
      if (outcomesRef.current[placeId] === 'removed') return
      setOutcomes((existing) => withOutcome(existing, placeId, 'skipped'))
      setPinnedId((pin) => (pin === placeId ? null : pin))
    } catch (skipError) {
      const message = skipError instanceof Error ? skipError.message : "We couldn't skip this place."
      setError(message)
      notify.error(message)
    } finally {
      setBusy(false)
    }
  }, [busy, commitStatus, current])

  const previous = React.useCallback(() => {
    const target = previousSelectableId(session, outcomes, shownIdRef.current)
    if (target) selectPlace(target, true)
  }, [outcomes, session, selectPlace])

  const resumeSkipped = React.useCallback((placeId: string) => {
    setOutcomes((existing) => {
      let changed = false
      const next = { ...existing }
      for (const [id, outcome] of Object.entries(existing)) {
        if (outcome !== 'skipped') continue
        delete next[id]
        changed = true
      }
      return changed ? next : existing
    })
    selectPlace(placeId, true)
  }, [selectPlace])

  const noteRestored = React.useCallback((placeId: string) => {
    if (outcomesRef.current[placeId] === 'removed') return
    commitStatus(placeId, 'library')
    setOutcomes((existing) => withOutcome(existing, placeId, 'added'))
    setPinnedId(placeId)
  }, [commitStatus])

  const removeFromQueue = React.useCallback(() => {
    if (!current || outcomesRef.current[current.placeId] === 'removed') return
    const placeId = current.placeId
    setOutcomes((existing) => withOutcome(existing, placeId, 'removed'))
    setPinnedId((pin) => (pin === placeId ? null : pin))
  }, [current])

  const retryPostcard = () => {
    if (!derivedId) return
    setSession((prev) => prev.map((entry) => {
      if (entry.placeId !== derivedId || !entry.postcardError) return entry
      const cleared: SessionEntry = { ...entry }
      delete cleared.postcardError
      return cleared
    }))
  }

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return
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

  if (session.length === 0) return <EmptyReview />
  if (!current) {
    return <ReviewSummary entries={session} outcomes={outcomes} onReview={resumeSkipped} />
  }

  const currentIndex = session.findIndex((entry) => entry.placeId === current.placeId)
  const previousPlaceId = previousSelectableId(session, outcomes, current.placeId)
  const progress = ((currentIndex + 1) / session.length) * 100
  const screenshotIsBrokenLegacyPath = current.screenshotUrl?.startsWith('/uploads/')

  return (
    <div className="-m-3 min-h-full bg-muted/20 pb-36 sm:-m-6 sm:pb-32">
      <header className="sticky top-0 z-40 border-b bg-background/95 px-3 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[1560px] items-center gap-3">
          <Button type="button" variant="ghost" size="sm" onClick={previous} disabled={busy || previousPlaceId === null}>
            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden /> Previous
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate text-sm font-semibold">{currentIndex + 1} of {session.length} from {current.uploadLabel}</p>
              <span className="hidden text-xs text-muted-foreground sm:inline">{current.screenshotName ?? 'Screenshot'}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={session.length} aria-valuenow={currentIndex + 1}>
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
          {current.postcard ? (
            <PlaceView
              key={current.postcard.place.id}
              place={current.postcard.place}
              trips={trips}
              alsoIn={current.postcard.alsoIn}
              onEdit={() => router.push(placeEditHref(current.placeId))}
              onOpenClassic={() => router.push(placeClassicHref(current.placeId))}
              onPhotoAttached={() => router.refresh()}
              onArchive={() => { void decide('archived') }}
              onDeleted={removeFromQueue}
              onRestored={() => noteRestored(current.placeId)}
              showMobileActionBar={false}
            />
          ) : current.postcardError ? (
            <div className="grid min-h-64 place-items-center gap-3 px-6 text-center text-sm text-muted-foreground">
              <p role="alert">{current.postcardError}</p>
              <Button type="button" variant="outline" onClick={retryPostcard}>Try again</Button>
            </div>
          ) : (
            <div className="grid min-h-64 place-items-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading place" />
            </div>
          )}
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
              <img src={current.screenshotUrl} alt={`Screenshot where ${current.name} was found`} className="max-h-[420px] w-full bg-muted object-contain xl:max-h-[70vh]" />
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
