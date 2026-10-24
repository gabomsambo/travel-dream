"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Archive,
  ArrowLeft,
  Check,
  CheckCircle2,
  Inbox,
  Library,
  Loader2,
  SkipForward,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/adapters/button'
import { editorialFont } from '@/components/explore/fonts'
import { PlaceView, type PlaceViewHandles } from '@/components/places/place-view/place-view'
import { ReviewDuplicateNote, type MergedDuplicate } from '@/components/review/duplicate-note'
import { ScreenshotEvidence } from '@/components/review/screenshot-evidence'
import { placeClassicHref } from '@/lib/place-view/edit-link'
import { notify } from '@/lib/notify'
import type { ExploreCollection } from '@/lib/explore/types'
import type { ReviewPostcard, ReviewQueueEntry } from '@/lib/review-queue'

type ReviewOutcome = 'added' | 'archived' | 'skipped' | 'removed' | 'merged'
type PlaceStatus = 'inbox' | 'library' | 'archived'
type SessionEntry = ReviewQueueEntry & {
  postcard?: ReviewPostcard
  postcardError?: string
  postcardGeneration?: number
}

interface ReviewQueueProps {
  entries: ReviewQueueEntry[]
  postcard: ReviewPostcard | null
  trips: ExploreCollection[]
  initialPlaceId?: string
  uploadSessionId?: string
}

const OUTCOME_STATUS: Record<'added' | 'archived', 'library' | 'archived'> = {
  added: 'library',
  archived: 'archived',
}

const RESTORED_LABEL = {
  inbox: 'Inbox',
  library: 'Library',
  archived: 'Archive',
} as const

function zoomKeyBlocked(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.closest('input, textarea, select, [contenteditable="true"]')) return true
  if (target.closest('[role="combobox"], [role="listbox"], [role="menu"]')) return true
  const dialog = target.closest('[role="dialog"], [role="alertdialog"]')
  return Boolean(dialog && !dialog.hasAttribute('data-screenshot-zoom'))
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(
    target.closest('input, textarea, select, [contenteditable="true"], [role="combobox"], [role="dialog"], [role="alertdialog"], [role="menu"]')
  )
}

/** Enter on a focused button or link already activates it; don't also add the place. */
function isActivatable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('button, a'))
}

function reviewHref(placeId: string | null, uploadSessionId?: string): string {
  const params = new URLSearchParams()
  if (uploadSessionId) params.set('upload', uploadSessionId)
  if (!placeId) {
    const query = params.toString()
    return query ? `/review?${query}` : '/review'
  }
  params.set('placeId', placeId)
  params.set('from', 'queue')
  return `/review?${params.toString()}`
}

function installPostcard(
  postcard: ReviewPostcard,
  written: Readonly<Record<string, PlaceStatus>>,
): ReviewPostcard {
  const status = written[postcard.place.id]
  if (!status || postcard.place.status === status) return postcard
  return { ...postcard, place: { ...postcard.place, status } }
}

function refreshSuperseded(
  entry: SessionEntry,
  incoming: ReviewPostcard,
  refreshEpoch: number | null,
): boolean {
  if (!entry.postcard) return false
  const currentAt = entry.postcard.place.updatedAt
  const incomingAt = incoming.place.updatedAt
  if (currentAt && incomingAt && incomingAt > currentAt) return false
  if (
    entry.postcardGeneration !== undefined
    && (refreshEpoch === null || refreshEpoch <= entry.postcardGeneration)
  ) {
    return true
  }
  if (currentAt && incomingAt && incomingAt < currentAt) return true
  return false
}

function withInstalledPostcard(
  entry: SessionEntry,
  installed: ReviewPostcard | null,
  refreshEpoch: number | null = null,
): SessionEntry {
  if (!installed || entry.placeId !== installed.place.id) return entry
  if (refreshSuperseded(entry, installed, refreshEpoch)) return entry
  const next: SessionEntry = { ...entry, postcard: installed }
  delete next.postcardError
  if (refreshEpoch !== null) {
    next.postcardGeneration = Math.max(entry.postcardGeneration ?? 0, refreshEpoch)
  }
  return next
}

function mergeSession(
  session: SessionEntry[],
  entries: ReviewQueueEntry[],
  postcard: ReviewPostcard | null,
  written: Readonly<Record<string, PlaceStatus>>,
  refreshEpoch: number | null,
): SessionEntry[] {
  const incoming = new Map(entries.map((entry) => [entry.placeId, entry]))
  const seen = new Set<string>()
  const merged: SessionEntry[] = []
  const installed = postcard ? installPostcard(postcard, written) : null
  for (const existing of session) {
    seen.add(existing.placeId)
    const update = incoming.get(existing.placeId)
    const next: SessionEntry = update ? { ...existing, ...update, postcard: existing.postcard } : existing
    merged.push(withInstalledPostcard(next, installed, refreshEpoch))
  }
  for (const entry of entries) {
    if (seen.has(entry.placeId)) continue
    merged.push(withInstalledPostcard({ ...entry }, installed, refreshEpoch))
  }
  return merged
}

function refreshEpochFor(
  postcard: ReviewPostcard | null,
  outstanding: { placeId: string, generation: number } | null,
): number | null {
  if (!postcard || !outstanding || outstanding.placeId !== postcard.place.id) return null
  return outstanding.generation
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

interface MergeResume {
  status: PlaceStatus
  outcome?: ReviewOutcome
}

function rememberedPlaceStatus(
  placeId: string,
  written: Readonly<Record<string, PlaceStatus>>,
  session: readonly SessionEntry[],
): PlaceStatus {
  const writtenStatus = written[placeId]
  if (writtenStatus) return writtenStatus
  const status = session.find((entry) => entry.placeId === placeId)?.postcard?.place.status
  if (status === 'inbox' || status === 'library' || status === 'archived') return status
  return 'inbox'
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

function EmptyReview({ scoped }: { scoped: boolean }) {
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
      <h1 className="mt-3 font-serif text-4xl font-semibold tracking-tight">
        {scoped ? 'This upload is reviewed.' : 'All caught up'}
      </h1>
      <p className="mt-3 text-lg text-muted-foreground">
        {scoped
          ? 'Nothing else from this upload is waiting.'
          : "Every place from your screenshots has a home. Drop more in and they'll wait here."}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {scoped ? (
          <Button asChild><Link href="/inbox"><Inbox className="mr-2 h-4 w-4" />Back to Inbox</Link></Button>
        ) : (
          <>
            <Button variant="outline" asChild><Link href="/library"><Library className="mr-2 h-4 w-4" />Open Library</Link></Button>
            <Button asChild><Link href="/mass-upload"><Upload className="mr-2 h-4 w-4" />Upload screenshots</Link></Button>
          </>
        )}
      </div>
    </div>
  )
}

function scopedFinishLine(added: number, skipped: number): string {
  if (added > 0) {
    return `${added} new ${added === 1 ? 'place from this upload is' : 'places from this upload are'} in your Library.`
  }
  if (skipped === 0) return 'Nothing else from this upload is waiting.'
  return `${skipped} ${skipped === 1 ? 'place from this upload is' : 'places from this upload are'} still waiting.`
}

function ReviewSummary({
  entries,
  outcomes,
  mergedInto,
  onReview,
  scoped,
}: {
  entries: ReviewQueueEntry[]
  outcomes: Record<string, ReviewOutcome>
  mergedInto: string[]
  onReview: (placeId: string) => void
  scoped: boolean
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
        <h1 className="mt-2 text-center font-serif text-4xl font-semibold tracking-tight">
          {scoped ? 'This upload is reviewed.' : "That's everything."}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-center text-lg text-muted-foreground">
          {scoped
            ? scopedFinishLine(grouped.added.length, grouped.skipped.length)
            : grouped.added.length === 0
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

        {mergedInto.length > 0 && (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {mergedInto.length === 1
              ? `1 merged into ${mergedInto[0]}.`
              : `${mergedInto.length} merged into places already in your Library.`}
          </p>
        )}

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
          {scoped && <Button variant="outline" asChild><Link href="/inbox"><Inbox className="mr-2 h-4 w-4" />Back to Inbox</Link></Button>}
          <Button asChild><Link href="/library">See them in your Library</Link></Button>
        </div>
      </div>
    </div>
  )
}

export function ReviewQueue({ entries, postcard, trips, initialPlaceId, uploadSessionId }: ReviewQueueProps) {
  const router = useRouter()
  const [session, setSession] = React.useState<SessionEntry[]>(() => mergeSession([], entries, postcard, {}, null))
  const [incoming, setIncoming] = React.useState({ entries, postcard })
  const writtenStatusRef = React.useRef<Record<string, PlaceStatus>>({})
  const [currentId, setCurrentId] = React.useState<string | null>(() => startingPlaceId(entries, initialPlaceId))
  const [pinnedId, setPinnedId] = React.useState<string | null>(null)
  const [outcomes, setOutcomes] = React.useState<Record<string, ReviewOutcome>>({})
  const outcomesRef = React.useRef(outcomes)
  outcomesRef.current = outcomes
  const sessionRef = React.useRef(session)
  sessionRef.current = session
  const mergeResumeRef = React.useRef<Record<string, MergeResume>>({})
  const undoingMergeRef = React.useRef<Set<string>>(new Set())
  const placeOpRef = React.useRef<Set<string>>(new Set())
  const [placeOps, setPlaceOps] = React.useState<ReadonlySet<string>>(() => new Set())
  const mergingRef = React.useRef<Set<string>>(new Set())
  const [mergingIds, setMergingIds] = React.useState<ReadonlySet<string>>(() => new Set())
  const decisionToastsRef = React.useRef<Record<string, Array<string | number>>>({})
  const [mergedByPlace, setMergedByPlace] = React.useState<Record<string, MergedDuplicate>>({})
  const mergedRef = React.useRef(mergedByPlace)
  mergedRef.current = mergedByPlace
  const [duplicateCheckEpoch, setDuplicateCheckEpoch] = React.useState<Record<string, number>>({})
  const invalidateDuplicateCheck = React.useCallback((placeId: string) => {
    setDuplicateCheckEpoch((existing) => ({
      ...existing,
      [placeId]: (existing[placeId] ?? 0) + 1,
    }))
  }, [])
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [zoomOpen, setZoomOpen] = React.useState(false)
  const viewHandlesRef = React.useRef<PlaceViewHandles | null>(null)
  const initialQueueRef = React.useRef({ entries, initialPlaceId })
  const didRedirectStaleLink = React.useRef(false)
  const historyPlaceId = React.useRef(currentId)
  const shownIdRef = React.useRef<string | null>(currentId)
  const reloadGenerationRef = React.useRef<Record<string, number>>({})
  const mountedRef = React.useRef(true)
  const refreshQueueRef = React.useRef({
    tail: Promise.resolve(),
    outstanding: null as { placeId: string, generation: number } | null,
    waiters: [] as Array<() => void>,
  })

  const releaseRefreshWaiter = () => {
    const queue = refreshQueueRef.current
    if (queue.waiters.length === 0) return
    queue.outstanding = null
    const waiters = queue.waiters.splice(0)
    waiters.forEach((resolve) => resolve())
  }

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
    const refreshEpoch = refreshEpochFor(postcard, refreshQueueRef.current.outstanding)
    setSession((prev) => mergeSession(prev, entries, postcard, writtenStatusRef.current, refreshEpoch))
  }

  React.useEffect(() => {
    return () => {
      if (!mountedRef.current) return
      releaseRefreshWaiter()
    }
  }, [postcard, entries])

  React.useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      releaseRefreshWaiter()
    }
  }, [])

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
            {
              place: body.place,
              alsoIn: body.alsoIn ?? [],
              screenshot: body.screenshot ?? null,
            },
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
    setZoomOpen(false)
    setEditingId(null)
  }, [derivedId])

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
    window.history.replaceState({}, '', reviewHref(derivedId, uploadSessionId))
    const appScroller = document.querySelector('main')
    if (appScroller instanceof HTMLElement && typeof appScroller.scrollTo === 'function') {
      appScroller.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [derivedId, uploadSessionId])

  const selectPlace = React.useCallback((placeId: string | null, pin = false) => {
    setPinnedId(pin ? placeId : null)
    setError(null)
    setCurrentId(placeId)
    historyPlaceId.current = placeId
    window.history.replaceState({}, '', reviewHref(placeId, uploadSessionId))
    const appScroller = document.querySelector('main')
    if (appScroller instanceof HTMLElement && typeof appScroller.scrollTo === 'function') {
      appScroller.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [uploadSessionId])

  const claimPlace = React.useCallback((placeId: string, op?: 'merge') => {
    if (placeOpRef.current.has(placeId)) return false
    if (outcomesRef.current[placeId] === 'merged' || mergedRef.current[placeId]) return false
    placeOpRef.current.add(placeId)
    if (op === 'merge') mergingRef.current.add(placeId)
    setPlaceOps(new Set(placeOpRef.current))
    if (op === 'merge') setMergingIds(new Set(mergingRef.current))
    return true
  }, [])

  const releasePlace = React.useCallback((placeId: string) => {
    const hadOp = placeOpRef.current.delete(placeId)
    const hadMerge = mergingRef.current.delete(placeId)
    if (hadOp) setPlaceOps(new Set(placeOpRef.current))
    if (hadMerge) setMergingIds(new Set(mergingRef.current))
  }, [])

  const beforeMerge = React.useCallback(async () => {
    const handles = viewHandlesRef.current
    if (!handles) return true
    const sectionsSaved = handles.flushSections()
    await handles.flushStatus()
    return sectionsSaved
  }, [])

  const undoDecision = React.useCallback(async (
    placeId: string,
    previousOutcome: ReviewOutcome | undefined,
  ) => {
    const entry = session.find((item) => item.placeId === placeId)
    if (!entry) return
    if (!claimPlace(placeId)) return
    const restoreStatus = previousOutcome === 'added' || previousOutcome === 'archived'
      ? OUTCOME_STATUS[previousOutcome]
      : 'inbox'
    try {
      await setPlaceStatus(entry.placeId, restoreStatus)
      if (outcomesRef.current[entry.placeId] === 'removed') return
      if (outcomesRef.current[entry.placeId] === 'merged' || mergedRef.current[entry.placeId]) return
      commitStatus(entry.placeId, restoreStatus)
      setOutcomes((existing) => {
        if (existing[entry.placeId] === 'removed') return existing
        if (existing[entry.placeId] === 'merged') return existing
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
    } finally {
      releasePlace(placeId)
    }
  }, [claimPlace, commitStatus, releasePlace, session, selectPlace])

  const decide = React.useCallback(async (outcome: 'added' | 'archived') => {
    if (!current || busy || outcomesRef.current[current.placeId] === 'removed') return
    if (mergedRef.current[current.placeId] || placeOpRef.current.has(current.placeId)) return
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
      const toastId = notify.success(
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
      if (typeof toastId === 'string' || typeof toastId === 'number') {
        const pending = decisionToastsRef.current[placeId] ?? []
        decisionToastsRef.current[placeId] = [...pending, toastId]
      }
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
    if (mergedRef.current[current.placeId] || placeOpRef.current.has(current.placeId)) return
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
    if (outcomesRef.current[placeId] === 'merged' || mergedRef.current[placeId]) return
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

  const undoMerge = React.useCallback(async (info: MergedDuplicate) => {
    if (undoingMergeRef.current.has(info.mergeLogId)) return
    const resume = mergeResumeRef.current[info.inboxPlaceId]
    if (!resume) return
    undoingMergeRef.current.add(info.mergeLogId)
    try {
      const response = await fetch('/api/places/undo-merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeId: info.libraryPlaceId, mergeLogId: info.mergeLogId }),
      })
      if (!response.ok && response.status !== 404) {
        const body = await response.json().catch(() => null) as { message?: string } | null
        throw new Error(body?.message || "Couldn't undo that merge.")
      }
      if (mergeResumeRef.current[info.inboxPlaceId] !== resume) return
      delete mergeResumeRef.current[info.inboxPlaceId]
      const restoreStatus = resume.status
      const restoreOutcome = resume.outcome
      setMergedByPlace((existing) => {
        if (!existing[info.inboxPlaceId]) return existing
        const next = { ...existing }
        delete next[info.inboxPlaceId]
        return next
      })
      setOutcomes((existing) => {
        if (existing[info.inboxPlaceId] !== 'merged') return existing
        if (!restoreOutcome) {
          const next = { ...existing }
          delete next[info.inboxPlaceId]
          return next
        }
        return withOutcome(existing, info.inboxPlaceId, restoreOutcome)
      })
      commitStatus(info.inboxPlaceId, restoreStatus)
      selectPlace(info.inboxPlaceId, true)
      notify.success('Merge undone')
    } catch (undoError) {
      notify.error(undoError instanceof Error ? undoError.message : "Couldn't undo that merge.")
    } finally {
      undoingMergeRef.current.delete(info.mergeLogId)
    }
  }, [commitStatus, selectPlace])

  const noteMerged = React.useCallback((info: MergedDuplicate) => {
    if (!mergeResumeRef.current[info.inboxPlaceId]) {
      const outcome = outcomesRef.current[info.inboxPlaceId]
      mergeResumeRef.current[info.inboxPlaceId] = {
        status: rememberedPlaceStatus(info.inboxPlaceId, writtenStatusRef.current, sessionRef.current),
        ...(outcome && outcome !== 'merged' ? { outcome } : {}),
      }
    }
    mergedRef.current = { ...mergedRef.current, [info.inboxPlaceId]: info }
    outcomesRef.current = withOutcome(outcomesRef.current, info.inboxPlaceId, 'merged')
    const pendingToasts = decisionToastsRef.current[info.inboxPlaceId]
    if (pendingToasts) {
      for (const id of pendingToasts) notify.dismiss(id)
      delete decisionToastsRef.current[info.inboxPlaceId]
    }
    setMergedByPlace((existing) => ({ ...existing, [info.inboxPlaceId]: info }))
    commitStatus(info.inboxPlaceId, 'archived')
    setOutcomes((existing) => withOutcome(existing, info.inboxPlaceId, 'merged'))
    setPinnedId((pin) => (pin === info.inboxPlaceId ? null : pin))
    setEditingId((id) => (id === info.inboxPlaceId ? null : id))
  }, [commitStatus])

  const reloadPostcard = React.useCallback(async (placeId: string) => {
    const generation = (reloadGenerationRef.current[placeId] ?? 0) + 1
    reloadGenerationRef.current[placeId] = generation
    let response: Response
    let body: (ReviewPostcard & { message?: string }) | null
    try {
      response = await fetch(`/api/review/postcard/${encodeURIComponent(placeId)}`)
      body = await response.json().catch(() => null) as (ReviewPostcard & { message?: string }) | null
    } catch (error) {
      if (reloadGenerationRef.current[placeId] !== generation) return
      throw error
    }
    if (reloadGenerationRef.current[placeId] !== generation) return
    if (!response.ok || !body?.place) {
      throw new Error(body?.message || "We couldn't refresh this place. Try again.")
    }
    const serverPostcard = installPostcard(
      { place: body.place, alsoIn: body.alsoIn ?? [], screenshot: body.screenshot ?? null },
      writtenStatusRef.current,
    )
    setSession((prev) => prev.map((entry) => (
      entry.placeId === placeId ? withInstalledPostcard(entry, serverPostcard, generation) : entry
    )))
    const queue = refreshQueueRef.current
    queue.tail = queue.tail.then(() => new Promise<void>((resolve) => {
      if (!mountedRef.current || reloadGenerationRef.current[placeId] !== generation) {
        resolve()
        return
      }
      queue.outstanding = { placeId, generation }
      queue.waiters.push(resolve)
      router.refresh()
    }))
  }, [router])

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
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key.toLowerCase() === 'z') {
        if (event.repeat || zoomKeyBlocked(event.target)) return
        event.preventDefault()
        setZoomOpen((open) => !open)
        return
      }
      if (isTypingTarget(event.target)) return
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

  const scoped = Boolean(uploadSessionId)
  if (session.length === 0) return <EmptyReview scoped={scoped} />
  if (!current) {
    const mergedInto = session
      .filter((entry) => outcomes[entry.placeId] === 'merged')
      .map((entry) => mergedByPlace[entry.placeId]?.libraryName)
      .filter((name): name is string => Boolean(name))
    return <ReviewSummary entries={session} outcomes={outcomes} mergedInto={mergedInto} onReview={resumeSkipped} scoped={scoped} />
  }

  const currentIndex = session.findIndex((entry) => entry.placeId === current.placeId)
  const previousPlaceId = previousSelectableId(session, outcomes, current.placeId)
  const progress = ((currentIndex + 1) / session.length) * 100
  const shot = current.postcard?.screenshot ?? null
  const queuePlaceIds = new Set(session.map((entry) => entry.placeId))
  const placeMerged = outcomes[current.placeId] === 'merged' || Boolean(mergedByPlace[current.placeId])
  const placeMerging = mergingIds.has(current.placeId)
  const placeBusy = placeOps.has(current.placeId)
  const decisionLocked = busy || placeMerged || placeBusy

  const openClassic = () => {
    const handles = viewHandlesRef.current
    const placeId = current.placeId
    if (outcomesRef.current[placeId] === 'merged' || mergedRef.current[placeId] || mergingRef.current.has(placeId)) return
    if (!handles) {
      router.push(placeClassicHref(placeId))
      return
    }
    void (async () => {
      const sectionsSaved = handles.flushSections()
      await handles.flushStatus()
      if (!(await sectionsSaved)) return
      router.push(placeClassicHref(placeId))
    })()
  }

  return (
    <div className={`${editorialFont.variable} -m-3 min-h-full bg-muted/20 pb-36 sm:-m-6 sm:pb-32`}>
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

      <div className="mx-auto grid max-w-[1560px] gap-5 px-3 py-5 sm:px-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 overflow-hidden rounded-[1.75rem] border bg-background shadow-sm">
          {current.postcard ? (
            <PlaceView
              key={current.postcard.place.id}
              place={current.postcard.place}
              trips={trips}
              alsoIn={current.postcard.alsoIn}
              editing={!placeMerged && !placeMerging && editingId === current.placeId}
              softCover={Boolean(shot?.softCover)}
              fitReviewBar
              handlesRef={viewHandlesRef}
              lead={(
                <ReviewDuplicateNote
                  placeId={current.placeId}
                  placeName={current.postcard.place.name}
                  currentPlace={current.postcard.place}
                  screenshotUrl={shot?.url ?? current.screenshotUrl}
                  merged={mergedByPlace[current.placeId] ?? null}
                  disabled={busy || placeBusy}
                  claimPlace={claimPlace}
                  releasePlace={releasePlace}
                  beforeMerge={beforeMerge}
                  onPending={setBusy}
                  onMerged={noteMerged}
                  onMergeUndone={undoMerge}
                  checkEpoch={duplicateCheckEpoch[current.placeId] ?? 0}
                  onDuplicateCheckInvalidated={invalidateDuplicateCheck}
                />
              )}
              onEdit={() => {
                if (placeMerged || placeMerging) return
                setEditingId(current.placeId)
              }}
              onDoneEditing={() => {
                setEditingId(null)
                void reloadPostcard(current.placeId).catch(() => {
                  router.refresh()
                })
              }}
              onOpenClassic={openClassic}
              onPrefetchEdit={() => { void import('@/components/places/place-full-view') }}
              onPhotoAttached={() => {
                if (placeMerged || placeMerging) return
                void reloadPostcard(current.placeId).catch(() => {
                  router.refresh()
                })
              }}
              blockWrites={placeMerged || placeMerging}
              onArchive={() => { void decide('archived') }}
              onDeleted={removeFromQueue}
              onRestored={() => noteRestored(current.placeId)}
              blockRestore={placeMerged}
              showMobileActionBar={false}
              showReviewChecks
              onReviewPlaceUpdated={() => reloadPostcard(current.placeId)}
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

        <ScreenshotEvidence
          url={shot?.url ?? current.screenshotUrl}
          name={shot?.name ?? current.screenshotName}
          createdAt={shot?.createdAt ?? null}
          placeName={current.name}
          siblings={shot?.siblings ?? []}
          currentPlaceId={current.placeId}
          queuePlaceIds={queuePlaceIds}
          outcomes={outcomes}
          onOpenInQueue={(placeId) => selectPlace(placeId, true)}
          zoomOpen={zoomOpen}
          onZoomOpenChange={setZoomOpen}
        />
      </div>

      {error && <p role="alert" className="fixed bottom-32 left-1/2 z-50 -translate-x-1/2 rounded-full bg-destructive px-4 py-2 text-sm text-destructive-foreground shadow-lg sm:bottom-24">{error}</p>}

      <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-10px_30px_-20px_rgba(0,0,0,0.4)] backdrop-blur md:left-64 sm:px-6">
        <div className="mx-auto max-w-[1560px]">
          <div className="grid grid-cols-2 gap-2 sm:hidden">
            <Button className="col-span-2 h-12 text-base" onClick={() => void decide('added')} disabled={decisionLocked}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Add to Library
            </Button>
            <Button variant="outline" className="h-11" onClick={() => void decide('archived')} disabled={decisionLocked}><Archive className="mr-2 h-4 w-4" />Not a place</Button>
            <Button variant="outline" className="h-11" onClick={() => void skip()} disabled={decisionLocked}><SkipForward className="mr-2 h-4 w-4" />Skip for now</Button>
          </div>
          <div className="hidden items-center gap-3 sm:flex">
            <Button variant="outline" onClick={() => void decide('archived')} disabled={decisionLocked}><Archive className="mr-2 h-4 w-4" />Not a place <kbd className="ml-2 text-xs opacity-60">N</kbd></Button>
            <Button variant="outline" onClick={() => void skip()} disabled={decisionLocked}><SkipForward className="mr-2 h-4 w-4" />Skip for now <kbd className="ml-2 text-xs opacity-60">S</kbd></Button>
            <span className="ml-auto text-xs text-muted-foreground"><kbd>←</kbd> previous</span>
            <Button className="min-w-48" onClick={() => void decide('added')} disabled={decisionLocked}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Add to Library <kbd className="ml-2 text-xs opacity-70">Enter</kbd>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
