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
import { BatchTripChevron, BatchTripChip } from '@/components/review/batch-trip-menu'
import { ReviewDuplicateNote, type MergedDuplicate } from '@/components/review/duplicate-note'
import { ReviewGroupView } from '@/components/review/review-group-view'
import { ScreenshotEvidence } from '@/components/review/screenshot-evidence'
import { placeClassicHref } from '@/lib/place-view/edit-link'
import { notify } from '@/lib/notify'
import { resolveBatchTripId, screenshotTitle, suggestBatchTrip } from '@/lib/review-group'
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
  trips: Array<ExploreCollection & { cities?: string[] }>
  initialPlaceId?: string
  uploadSessionId?: string
}

interface FiledTrip {
  id: string
  name: string
}

/** A membership this action created (`drop`), the ones it removed (`restore`, then `alsoRestore`), and the filings tracked before the move (`priorFilings`). */
interface TripMove {
  drop: FiledTrip | null
  restore: FiledTrip | null
  alsoRestore?: FiledTrip[]
  priorFilings?: FiledTrip[]
}

function sameFilings(left: readonly FiledTrip[], right: readonly FiledTrip[]): boolean {
  return left.length === right.length && left.every((trip, index) => trip.id === right[index]?.id)
}

function writeFilings(
  existing: Record<string, FiledTrip[]>,
  placeId: string,
  updated: readonly FiledTrip[],
): Record<string, FiledTrip[]> {
  const current = existing[placeId] ?? []
  if (sameFilings(current, updated)) return existing
  const next = { ...existing }
  if (updated.length === 0) delete next[placeId]
  else next[placeId] = [...updated]
  return next
}

function dropFiling(
  existing: Record<string, FiledTrip[]>,
  placeId: string,
  tripId: string,
): Record<string, FiledTrip[]> {
  const list = existing[placeId]
  if (!list?.some((trip) => trip.id === tripId)) return existing
  return writeFilings(existing, placeId, list.filter((trip) => trip.id !== tripId))
}

function putBackFilings(
  existing: readonly FiledTrip[],
  restored: readonly FiledTrip[],
  prior?: readonly FiledTrip[],
): FiledTrip[] {
  if (prior && prior.length > 0) {
    const back = new Set(restored.map((trip) => trip.id))
    const still = new Set(existing.map((trip) => trip.id))
    const seen = new Set<string>()
    const next: FiledTrip[] = []
    for (const trip of prior) {
      if (!back.has(trip.id) && !still.has(trip.id)) continue
      if (seen.has(trip.id)) continue
      seen.add(trip.id)
      next.push(trip)
    }
    for (const trip of [...existing, ...restored]) {
      if (seen.has(trip.id)) continue
      seen.add(trip.id)
      next.push(trip)
    }
    return next
  }
  const seen = new Set<string>()
  const next: FiledTrip[] = []
  for (const trip of [...restored, ...existing]) {
    if (seen.has(trip.id)) continue
    seen.add(trip.id)
    next.push(trip)
  }
  return next
}

function filingsAfterMove(
  existing: readonly FiledTrip[],
  nextTrip: FiledTrip,
  settled: { committed: boolean; move: TripMove },
): FiledTrip[] {
  const removedIds = new Set(restoredTrips(settled.move).map((trip) => trip.id))
  const survivors = existing.filter((trip) => !removedIds.has(trip.id))
  if (settled.committed) {
    return [nextTrip, ...survivors.filter((trip) => trip.id !== nextTrip.id)]
  }
  const dropped = settled.move.drop
  if (dropped && !survivors.some((trip) => trip.id === dropped.id)) {
    return [...survivors, dropped]
  }
  return survivors
}

function restoredTrips(move: TripMove | null | undefined): FiledTrip[] {
  if (!move) return []
  return [
    ...(move.restore ? [move.restore] : []),
    ...(move.alsoRestore ?? []),
  ]
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

async function readError(response: Response, fallback: string): Promise<never> {
  const body = await response.json().catch(() => null) as { message?: string } | null
  throw new Error(body?.message || fallback)
}

interface TripAddResult {
  successful: string[]
  failed: string[]
}

async function addPlacesToTrip(tripId: string, placeIds: string[]): Promise<TripAddResult> {
  const response = await fetch(`/api/collections/${encodeURIComponent(tripId)}/places`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ placeIds }),
  })
  const body = await response.json().catch(() => null) as {
    status?: string
    message?: string
    results?: { successful?: unknown }
  } | null
  if (!response.ok) {
    throw new Error(body?.message || "We couldn't add these places to the trip.")
  }
  if (body?.status === 'success') return { successful: [...placeIds], failed: [] }
  const successful = Array.isArray(body?.results?.successful)
    ? body.results.successful.filter((id): id is string => typeof id === 'string' && placeIds.includes(id))
    : []
  const joined = new Set(successful)
  return { successful, failed: placeIds.filter((id) => !joined.has(id)) }
}

function joinedNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

function didNotJoinMessage(names: readonly string[], tripName: string): string {
  const labels = names.map((name) => `“${name}”`)
  const list = labels.length === 0
    ? 'A place'
    : labels.length === 1
      ? labels[0]
      : labels.length === 2
        ? `${labels[0]} and ${labels[1]}`
        : `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`
  return `${list} did not join ${tripName}.`
}

function groupAddedMessage(
  lead: string,
  writtenCount: number,
  filed: FiledTrip | null,
  joinedCount: number,
): string {
  if (!filed || joinedCount === 0) return lead
  if (joinedCount === writtenCount) {
    return `${lead}${writtenCount === 1 ? ` and ${filed.name}` : ` to your Library and ${filed.name}`}`
  }
  const clause = joinedCount === 1 ? `1 also in ${filed.name}` : `${joinedCount} also in ${filed.name}`
  return `${lead}, and ${clause}`
}

async function removePlaceFromTrip(tripId: string, placeId: string): Promise<void> {
  const response = await fetch(
    `/api/collections/${encodeURIComponent(tripId)}/places/${encodeURIComponent(placeId)}`,
    { method: 'DELETE' },
  )
  if (response.ok) return
  return readError(response, "We couldn't remove this place from the trip.")
}

function moveFromRelease(
  drop: FiledTrip | null,
  removed: readonly FiledTrip[],
  prior: readonly FiledTrip[],
): TripMove {
  return {
    drop,
    restore: removed[0] ?? null,
    ...(removed.length > 1 ? { alsoRestore: removed.slice(1) } : {}),
    ...(prior.length > 0 ? { priorFilings: [...prior] } : {}),
  }
}

async function finishTripMove(
  placeId: string,
  nextTrip: FiledTrip,
  tracked: readonly FiledTrip[],
): Promise<{ move: TripMove; committed: boolean }> {
  const alreadyTracked = tracked.some((trip) => trip.id === nextTrip.id)
  const others = tracked.filter((trip) => trip.id !== nextTrip.id)
  if (others.length === 0) {
    return {
      move: { drop: alreadyTracked ? null : nextTrip, restore: null },
      committed: true,
    }
  }

  const removed: FiledTrip[] = []
  for (const trip of others) {
    try {
      await removePlaceFromTrip(trip.id, placeId)
      removed.push(trip)
    } catch (releaseError) {
      notify.error(releaseError instanceof Error ? releaseError.message : "Couldn't remove it from the trip.")
    }
  }

  const releasedAll = removed.length === others.length
  if (alreadyTracked || releasedAll) {
    return {
      move: moveFromRelease(alreadyTracked ? null : nextTrip, removed, tracked),
      committed: releasedAll,
    }
  }

  try {
    await removePlaceFromTrip(nextTrip.id, placeId)
  } catch (rollbackError) {
    notify.error(rollbackError instanceof Error ? rollbackError.message : "Couldn't remove it from the trip.")
    return { move: moveFromRelease(nextTrip, removed, tracked), committed: false }
  }
  return { move: moveFromRelease(null, removed, tracked), committed: false }
}

function rangeLabel(entries: ReviewQueueEntry[], members: ReviewQueueEntry[]): string {
  const indexes = members
    .map((member) => entries.findIndex((entry) => entry.placeId === member.placeId))
    .filter((index) => index >= 0)
  if (indexes.length === 0) return '0'
  const first = Math.min(...indexes) + 1
  const last = Math.max(...indexes) + 1
  return first === last ? String(first) : `${first}–${last}`
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

function tripSentence(
  added: ReviewQueueEntry[],
  assignments: Record<string, FiledTrip[]>,
): { text: string; primary: FiledTrip | null } {
  const counts = new Map<string, FiledTrip & { count: number }>()
  for (const entry of added) {
    const seen = new Set<string>()
    for (const trip of assignments[entry.placeId] ?? []) {
      if (seen.has(trip.id)) continue
      seen.add(trip.id)
      const row = counts.get(trip.id) ?? { ...trip, count: 0 }
      row.count += 1
      counts.set(trip.id, row)
    }
  }
  const parts = [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  if (parts.length === 0) return { text: '', primary: null }
  const primary = { id: parts[0].id, name: parts[0].name }
  if (added.length === 1) {
    const seen = new Set<string>()
    const names: string[] = []
    for (const trip of assignments[added[0].placeId] ?? []) {
      if (seen.has(trip.id)) continue
      seen.add(trip.id)
      names.push(trip.name)
    }
    return { text: `, and it is in ${joinedNames(names)}`, primary }
  }
  const text = parts.length === 1
    ? `, ${parts[0].count} of them in ${parts[0].name}`
    : `, ${parts.map((part) => `${part.count} in ${part.name}`).join(' and ')}`
  return { text, primary }
}

function ReviewSummary({
  entries,
  outcomes,
  tripAssignments,
  mergedInto,
  onReview,
  scoped,
}: {
  entries: ReviewQueueEntry[]
  outcomes: Record<string, ReviewOutcome>
  tripAssignments: Record<string, FiledTrip[]>
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
  const filed = tripSentence(grouped.added, tripAssignments)

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
          {grouped.added.length === 0
            ? (scoped ? scopedFinishLine(0, grouped.skipped.length) : 'Your Inbox is sorted for now.')
            : scoped
              ? `${grouped.added.length} new ${grouped.added.length === 1 ? 'place from this upload is' : 'places from this upload are'} in your Library${filed.text}.`
              : `${grouped.added.length} new ${grouped.added.length === 1 ? 'place is' : 'places are'} in your Library${filed.text}.`}
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
          {filed.primary && (
            <Button variant="outline" asChild>
              <Link href={`/collections/${filed.primary.id}`}>Open {filed.primary.name}</Link>
            </Button>
          )}
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
  const [tripChoice, setTripChoice] = React.useState<string | 'none' | null>(null)
  const [tripAssignments, setTripAssignments] = React.useState<Record<string, FiledTrip[]>>({})
  const tripAssignmentsRef = React.useRef(tripAssignments)
  tripAssignmentsRef.current = tripAssignments
  const [soloId, setSoloId] = React.useState<string | null>(null)
  const [excluded, setExcluded] = React.useState<Record<string, boolean>>({})
  const viewRef = React.useRef({
    groupMode: false,
    memberIds: [] as string[],
    selectedIds: [] as string[],
    tripId: null as string | null,
    tripName: null as string | null,
    title: '',
  })
  const groupApiRef = React.useRef({
    add: async () => {},
    archive: async () => {},
    skip: async () => {},
  })
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

  const releasePreviousFilings = React.useCallback(async (
    placeIds: readonly string[],
    keepTripId: string | null,
  ): Promise<{ failed: string[]; removed: Record<string, FiledTrip[]>; prior: Record<string, FiledTrip[]> }> => {
    const failed: string[] = []
    const removed: Record<string, FiledTrip[]> = {}
    const prior: Record<string, FiledTrip[]> = {}
    const failedTrips = new Map<string, string>()
    let singleMessage: string | null = null
    for (const placeId of placeIds) {
      const filings = [...(tripAssignmentsRef.current[placeId] ?? [])]
      if (filings.length > 0) prior[placeId] = filings
      for (const filed of filings) {
        if (keepTripId !== null && filed.id === keepTripId) continue
        try {
          await removePlaceFromTrip(filed.id, placeId)
          removed[placeId] = [...(removed[placeId] ?? []), filed]
          const tripId = filed.id
          setTripAssignments((existing) => dropFiling(existing, placeId, tripId))
        } catch (error) {
          if (!failed.includes(placeId)) failed.push(placeId)
          if (!failedTrips.has(filed.id)) failedTrips.set(filed.id, filed.name)
          singleMessage = error instanceof Error ? error.message : "Couldn't remove it from the trip."
        }
      }
    }
    const tripNames = [...failedTrips.values()]
    if (failed.length === 1 && tripNames.length > 1) {
      notify.error(`Couldn't remove it from ${joinedNames(tripNames)}.`)
    } else if (failed.length === 1 && singleMessage) {
      notify.error(singleMessage)
    } else if (failed.length > 1 && tripNames.length === 1) {
      notify.error(`Couldn't remove ${failed.length} places from ${tripNames[0]}.`)
    } else if (failed.length > 1) {
      notify.error(`Couldn't remove ${failed.length} places from their trips.`)
    }
    return { failed, removed, prior }
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
    setSoloId((solo) => (solo && solo !== derivedId ? null : solo))
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
    move?: TripMove | null,
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
      let tripUndoFailed = false
      if (move?.drop) {
        try {
          await removePlaceFromTrip(move.drop.id, placeId)
          const droppedId = move.drop.id
          setTripAssignments((existing) => dropFiling(existing, placeId, droppedId))
        } catch (tripError) {
          tripUndoFailed = true
          notify.error(tripError instanceof Error ? tripError.message : "Couldn't remove it from the trip.")
        }
      }
      const restoring = restoredTrips(move)
      if (restoring.length > 0) {
        const kept: FiledTrip[] = []
        for (const trip of restoring) {
          try {
            const added = await addPlacesToTrip(trip.id, [placeId])
            if (!added.successful.includes(placeId)) {
              tripUndoFailed = true
              notify.error(didNotJoinMessage([entry.name], trip.name))
            } else {
              kept.push(trip)
            }
          } catch (tripError) {
            tripUndoFailed = true
            notify.error(tripError instanceof Error ? tripError.message : "Couldn't add it back to the trip.")
          }
        }
        if (kept.length > 0) {
          const prior = move?.priorFilings
          setTripAssignments((existing) => writeFilings(
            existing,
            placeId,
            putBackFilings(existing[placeId] ?? [], kept, prior),
          ))
        }
      }
      setSoloId(placeId)
      selectPlace(placeId, true)
      if (!tripUndoFailed) {
        notify.success(`Restored “${entry.name}” to your ${RESTORED_LABEL[restoreStatus]}`)
      }
    } catch (undoError) {
      notify.error(undoError instanceof Error ? undoError.message : "Couldn't undo that change.")
    } finally {
      releasePlace(placeId)
    }
  }, [claimPlace, commitStatus, releasePlace, session, selectPlace])

  const members = current?.sourceId
    ? session.filter((entry) => entry.sourceId === current.sourceId && !outcomes[entry.placeId])
    : []
  const groupMode = Boolean(
    current
    && !outcomes[current.placeId]
    && soloId !== current.placeId
    && members.length >= 2,
  )
  const suggestionPool = groupMode
    ? members.filter((entry) => !excluded[entry.placeId])
    : current ? [current] : []
  const suggestedTripId = suggestBatchTrip(
    trips.map((trip) => ({ id: trip.id, name: trip.name, cities: trip.cities ?? [] })),
    suggestionPool.map((entry) => entry.city),
  )
  const effectiveTripId = resolveBatchTripId(tripChoice, suggestedTripId, trips.map((trip) => trip.id))
  const effectiveTrip = trips.find((trip) => trip.id === effectiveTripId) ?? null
  viewRef.current = {
    groupMode,
    memberIds: members.map((entry) => entry.placeId),
    selectedIds: members.filter((entry) => !excluded[entry.placeId]).map((entry) => entry.placeId),
    tripId: effectiveTrip?.id ?? null,
    tripName: effectiveTrip?.name ?? null,
    title: screenshotTitle(current?.screenshotName),
  }

  const decide = React.useCallback(async (outcome: 'added' | 'archived') => {
    if (viewRef.current.groupMode) {
      if (busy) return
      if (outcome === 'added') await groupApiRef.current.add()
      else await groupApiRef.current.archive()
      return
    }
    if (!current || busy || outcomesRef.current[current.placeId] === 'removed') return
    if (mergedRef.current[current.placeId] || placeOpRef.current.has(current.placeId)) return
    const placeId = current.placeId
    const placeName = current.name
    const previousOutcome = outcomesRef.current[placeId]
    const tripAtDecision = outcome === 'added' && viewRef.current.tripId && viewRef.current.tripName
      ? { id: viewRef.current.tripId, name: viewRef.current.tripName }
      : null
    const tracked = [...(tripAssignmentsRef.current[placeId] ?? [])]
    const previousFiling = tracked[0] ?? null
    const onDestination = Boolean(tripAtDecision && tracked.some((trip) => trip.id === tripAtDecision.id))
    const onlyThisTrip = Boolean(
      tripAtDecision && tracked.length > 0 && tracked.every((trip) => trip.id === tripAtDecision.id),
    )
    setBusy(true)
    setError(null)
    try {
      const written = OUTCOME_STATUS[outcome]
      await setPlaceStatus(placeId, written)
      if (outcomesRef.current[placeId] === 'removed') return
      let move: TripMove = { drop: null, restore: null }
      let committedFiling = false
      let moveReverted = false
      let settledMove: { move: TripMove; committed: boolean } | null = null
      if (outcome === 'added' && tripAtDecision && !onlyThisTrip) {
        try {
          let joined = onDestination
          if (!onDestination) {
            const added = await addPlacesToTrip(tripAtDecision.id, [placeId])
            joined = added.successful.includes(placeId)
            if (!joined) notify.error(didNotJoinMessage([placeName], tripAtDecision.name))
          }
          if (joined) {
            const settled = await finishTripMove(placeId, tripAtDecision, tracked)
            move = settled.move
            committedFiling = settled.committed
            moveReverted = !settled.committed && !settled.move.drop && restoredTrips(settled.move).length === 0
            settledMove = settled
          }
        } catch (tripError) {
          const rollback = previousOutcome === 'added' || previousOutcome === 'archived'
            ? OUTCOME_STATUS[previousOutcome]
            : 'inbox'
          await setPlaceStatus(placeId, rollback).catch(() => undefined)
          throw tripError
        }
      } else if (!onlyThisTrip && previousFiling) {
        const released = await releasePreviousFilings([placeId], null)
        const restored = released.removed[placeId] ?? []
        if (restored[0]) move.restore = restored[0]
        if (restored.length > 1) move.alsoRestore = restored.slice(1)
        if (released.prior[placeId]) move.priorFilings = released.prior[placeId]
      }
      commitStatus(placeId, written)
      setOutcomes((existing) => withOutcome(existing, placeId, outcome))
      setPinnedId((pin) => (pin === placeId ? null : pin))
      if (settledMove && tripAtDecision) {
        const nextTrip = tripAtDecision
        const settled = settledMove
        setTripAssignments((existing) => writeFilings(
          existing,
          placeId,
          filingsAfterMove(existing[placeId] ?? [], nextTrip, settled),
        ))
        if (committedFiling) {
          setTripChoice((choice) => (choice === null ? nextTrip.id : choice))
        }
      }
      const releaseFailed = outcome === 'added' && !tripAtDecision && Boolean(previousFiling) && !move.restore
      if (releaseFailed || (moveReverted && previousOutcome === 'added')) return
      const mentioned = committedFiling ? (move.drop ?? tripAtDecision) : (onlyThisTrip ? tripAtDecision : null)
      const addedLine = mentioned
        ? `Added “${placeName}” to your Library and ${mentioned.name}`
        : `Added “${placeName}” to your Library`
      const reversible = move.drop || move.restore ? move : null
      const toastId = notify.success(
        outcome === 'added' ? addedLine : `Moved “${placeName}” to Archive`,
        {
          duration: 8_000,
          cancel: {
            label: 'Undo',
            onClick: () => void undoDecision(placeId, previousOutcome, reversible),
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
  }, [busy, commitStatus, current, releasePreviousFilings, undoDecision])

  const skip = React.useCallback(async () => {
    if (viewRef.current.groupMode) {
      if (!busy) await groupApiRef.current.skip()
      return
    }
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
      await releasePreviousFilings([placeId], null)
      setOutcomes((existing) => withOutcome(existing, placeId, 'skipped'))
      setPinnedId((pin) => (pin === placeId ? null : pin))
    } catch (skipError) {
      const message = skipError instanceof Error ? skipError.message : "We couldn't skip this place."
      setError(message)
      notify.error(message)
    } finally {
      setBusy(false)
    }
  }, [busy, commitStatus, current, releasePreviousFilings])

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

  const undoGroup = async (placeIds: string[], moves: Readonly<Record<string, TripMove>>) => {
    const restored: string[] = []
    try {
      for (const placeId of placeIds) {
        if (outcomesRef.current[placeId] === 'removed') continue
        await setPlaceStatus(placeId, 'inbox')
        commitStatus(placeId, 'inbox')
        restored.push(placeId)
      }
      setOutcomes((existing) => {
        const next = { ...existing }
        for (const placeId of restored) {
          if (next[placeId] !== 'removed') delete next[placeId]
        }
        return next
      })
      let removalError: string | null = null
      const removedFromTrip: string[] = []
      const stuck: Array<{ placeId: string; trip: FiledTrip }> = []
      for (const placeId of restored) {
        const drop = moves[placeId]?.drop
        if (!drop) continue
        try {
          await removePlaceFromTrip(drop.id, placeId)
          removedFromTrip.push(placeId)
        } catch (error) {
          stuck.push({ placeId, trip: drop })
          removalError = error instanceof Error ? error.message : "Couldn't remove it from the trip."
        }
      }
      if (removedFromTrip.length > 0) {
        setTripAssignments((existing) => {
          let next = existing
          for (const placeId of removedFromTrip) {
            const dropId = moves[placeId]?.drop?.id
            if (!dropId) continue
            next = dropFiling(next, placeId, dropId)
          }
          return next
        })
      }
      if (stuck.length > 1) {
        const sameTrip = stuck.every((row) => row.trip.id === stuck[0]?.trip.id)
        removalError = sameTrip
          ? `Couldn't remove ${stuck.length} places from ${stuck[0]?.trip.name}.`
          : `Couldn't remove ${stuck.length} places from their trips.`
      }
      const putBack = new Map<string, FiledTrip[]>()
      for (const placeId of restored) {
        const trips = restoredTrips(moves[placeId])
        if (trips.length === 0) continue
        const kept: FiledTrip[] = []
        for (const trip of trips) {
          try {
            const added = await addPlacesToTrip(trip.id, [placeId])
            if (!added.successful.includes(placeId)) {
              const name = session.find((entry) => entry.placeId === placeId)?.name || 'A place'
              removalError = didNotJoinMessage([name], trip.name)
            } else {
              kept.push(trip)
            }
          } catch (error) {
            removalError = error instanceof Error ? error.message : "Couldn't add it back to the trip."
          }
        }
        if (kept.length > 0) putBack.set(placeId, kept)
      }
      if (putBack.size > 0) {
        setTripAssignments((existing) => {
          let next = existing
          for (const [placeId, trips] of putBack) {
            next = writeFilings(
              next,
              placeId,
              putBackFilings(next[placeId] ?? [], trips, moves[placeId]?.priorFilings),
            )
          }
          return next
        })
      }
      setSoloId(null)
      setPinnedId(null)
      if (restored[0]) selectPlace(restored[0], false)
      if (removalError) {
        notify.error(removalError)
        return
      }
      notify.success(
        restored.length === 1
          ? `Restored “${session.find((entry) => entry.placeId === restored[0])?.name ?? 'the place'}” to your Inbox`
          : `Restored ${restored.length} places to your Inbox`,
      )
    } catch (undoError) {
      notify.error(undoError instanceof Error ? undoError.message : "Couldn't undo that change.")
    }
  }

  groupApiRef.current = {
    add: async () => {
      const { selectedIds, memberIds, tripId, tripName, title } = viewRef.current
      if (busy || selectedIds.length === 0) return
      const ids = [...selectedIds]
      const filed = tripId && tripName ? { id: tripId, name: tripName } : null
      const written: string[] = []
      setBusy(true)
      setError(null)
      try {
        for (const placeId of ids) {
          if (outcomesRef.current[placeId] === 'removed') continue
          await setPlaceStatus(placeId, 'library')
          written.push(placeId)
        }
        if (written.length === 0) return
        const moves: Record<string, TripMove> = {}
        let joinedIds: string[] = []
        let unreleased = 0
        let removedCount = 0
        const moveRows: Array<{ placeId: string; settled: { move: TripMove; committed: boolean } }> = []
        if (filed) {
          const toPost: string[] = []
          const toSettle: string[] = []
          for (const placeId of written) {
            const tracked = tripAssignmentsRef.current[placeId] ?? []
            const onDestination = tracked.some((trip) => trip.id === filed.id)
            const onlyDestination = onDestination && tracked.every((trip) => trip.id === filed.id)
            if (onlyDestination) {
              moves[placeId] = { drop: null, restore: null }
              joinedIds = [...joinedIds, placeId]
              continue
            }
            if (onDestination) toSettle.push(placeId)
            else toPost.push(placeId)
          }
          if (toPost.length > 0) {
            const added = await addPlacesToTrip(filed.id, toPost)
            if (added.failed.length > 0) {
              const names = added.failed.map((id) => session.find((entry) => entry.placeId === id)?.name || 'A place')
              notify.error(didNotJoinMessage(names, filed.name))
            }
            toSettle.push(...added.successful)
          }
          for (const placeId of toSettle) {
            const tracked = [...(tripAssignmentsRef.current[placeId] ?? [])]
            const settled = await finishTripMove(placeId, filed, tracked)
            moveRows.push({ placeId, settled })
            if (settled.move.drop || settled.move.restore) moves[placeId] = settled.move
            if (settled.committed) joinedIds = [...joinedIds, placeId]
          }
        } else {
          const released = await releasePreviousFilings(written, null)
          unreleased = released.failed.length
          removedCount = Object.keys(released.removed).length
          for (const [placeId, trips] of Object.entries(released.removed)) {
            if (!trips[0]) continue
            moves[placeId] = {
              drop: null,
              restore: trips[0],
              ...(trips.length > 1 ? { alsoRestore: trips.slice(1) } : {}),
              ...(released.prior[placeId] ? { priorFilings: released.prior[placeId] } : {}),
            }
          }
        }
        for (const placeId of written) commitStatus(placeId, 'library')
        setOutcomes((existing) => {
          let next = existing
          for (const placeId of written) next = withOutcome(next, placeId, 'added')
          return next
        })
        if (filed && moveRows.length > 0) {
          const trip = filed
          setTripAssignments((existing) => {
            let next = existing
            for (const row of moveRows) {
              next = writeFilings(
                next,
                row.placeId,
                filingsAfterMove(next[row.placeId] ?? [], trip, row.settled),
              )
            }
            return next
          })
        }
        if (filed && joinedIds.length > 0) {
          setTripChoice((choice) => (choice === null ? filed.id : choice))
        }
        const earliest = memberIds.find((id) => !written.includes(id) && !outcomesRef.current[id]) ?? null
        setPinnedId(earliest)
        setSoloId(null)
        const lead = written.length === 1
          ? `Added “${session.find((entry) => entry.placeId === written[0])?.name ?? 'the place'}” to your Library`
          : `Added ${written.length} places from ${title}`
        if (!filed && unreleased > 0 && removedCount === 0) return
        notify.success(groupAddedMessage(lead, written.length, filed, joinedIds.length), {
          duration: 8_000,
          cancel: {
            label: 'Undo',
            onClick: () => void undoGroup(written, moves),
          },
        })
      } catch (addError) {
        for (const placeId of written) await setPlaceStatus(placeId, 'inbox').catch(() => undefined)
        const message = addError instanceof Error ? addError.message : "We couldn't update these places."
        setError(message)
        notify.error(message)
      } finally {
        setBusy(false)
      }
    },
    archive: async () => {
      const ids = [...viewRef.current.memberIds]
      if (busy || ids.length === 0) return
      const written: string[] = []
      setBusy(true)
      setError(null)
      try {
        for (const placeId of ids) {
          if (outcomesRef.current[placeId] === 'removed') continue
          await setPlaceStatus(placeId, 'archived')
          written.push(placeId)
        }
        const released = await releasePreviousFilings(written, null)
        const moves: Record<string, TripMove> = {}
        for (const [placeId, trips] of Object.entries(released.removed)) {
          if (!trips[0]) continue
          moves[placeId] = {
            drop: null,
            restore: trips[0],
            ...(trips.length > 1 ? { alsoRestore: trips.slice(1) } : {}),
            ...(released.prior[placeId] ? { priorFilings: released.prior[placeId] } : {}),
          }
        }
        for (const placeId of written) commitStatus(placeId, 'archived')
        setOutcomes((existing) => {
          let next = existing
          for (const placeId of written) next = withOutcome(next, placeId, 'archived')
          return next
        })
        setPinnedId(null)
        setSoloId(null)
        notify.success(
          `Moved ${written.length} ${written.length === 1 ? 'place' : 'places'} to Archive`,
          { duration: 8_000, cancel: { label: 'Undo', onClick: () => void undoGroup(written, moves) } },
        )
      } catch (archiveError) {
        for (const placeId of written) await setPlaceStatus(placeId, 'inbox').catch(() => undefined)
        const message = archiveError instanceof Error ? archiveError.message : "We couldn't update these places."
        setError(message)
        notify.error(message)
      } finally {
        setBusy(false)
      }
    },
    skip: async () => {
      const ids = [...viewRef.current.memberIds]
      if (busy || ids.length === 0) return
      setBusy(true)
      setError(null)
      try {
        const live: string[] = []
        for (const placeId of ids) {
          const previous = outcomesRef.current[placeId]
          if (previous === 'removed') continue
          if (previous === 'added' || previous === 'archived') {
            await setPlaceStatus(placeId, 'inbox')
            commitStatus(placeId, 'inbox')
          }
          live.push(placeId)
        }
        await releasePreviousFilings(live, null)
        setOutcomes((existing) => {
          let next = existing
          for (const placeId of ids) {
            if (next[placeId] === 'removed') continue
            next = withOutcome(next, placeId, 'skipped')
          }
          return next
        })
        setPinnedId(null)
        setSoloId(null)
      } catch (skipError) {
        const message = skipError instanceof Error ? skipError.message : "We couldn't skip these places."
        setError(message)
        notify.error(message)
      } finally {
        setBusy(false)
      }
    },
  }

  const scoped = Boolean(uploadSessionId)
  if (session.length === 0) return <EmptyReview scoped={scoped} />
  if (!current) {
    const mergedInto = session
      .filter((entry) => outcomes[entry.placeId] === 'merged')
      .map((entry) => mergedByPlace[entry.placeId]?.libraryName)
      .filter((name): name is string => Boolean(name))
    return <ReviewSummary entries={session} outcomes={outcomes} tripAssignments={tripAssignments} mergedInto={mergedInto} onReview={resumeSkipped} scoped={scoped} />
  }

  const currentIndex = session.findIndex((entry) => entry.placeId === current.placeId)
  const groupEndIndex = groupMode
    ? Math.max(...members.map((member) => session.findIndex((entry) => entry.placeId === member.placeId)))
    : currentIndex
  const previousPlaceId = previousSelectableId(session, outcomes, current.placeId)
  const progress = ((Math.max(groupEndIndex, 0) + 1) / session.length) * 100
  const shot = current.postcard?.screenshot ?? null
  const queuePlaceIds = new Set(session.map((entry) => entry.placeId))
  const withTrip = Boolean(effectiveTrip)
  const includedCount = members.filter((member) => !excluded[member.placeId]).length
  const addLabel = groupMode
    ? `Add ${includedCount} to Library${withTrip ? ' + trip' : ''}`
    : `Add to Library${withTrip ? ' + trip' : ''}`
  const archiveLabel = groupMode ? 'None of these' : 'Not a place'
  const placeMerged = outcomes[current.placeId] === 'merged' || Boolean(mergedByPlace[current.placeId])
  const placeMerging = mergingIds.has(current.placeId)
  const placeBusy = placeOps.has(current.placeId)
  const decisionLocked = busy || placeMerged || placeBusy
  const addDisabled = decisionLocked || (groupMode && includedCount === 0)
  const positionLabel = groupMode ? rangeLabel(session, members) : String(currentIndex + 1)
  const tripHint = !effectiveTrip
    ? 'Adds go to your Library only.'
    : tripChoice === null
      ? `You already have “${effectiveTrip?.name ?? 'a trip'}”, so we suggest it.`
      : `Every place you add in this batch also goes into ${effectiveTrip?.name ?? 'that trip'}.`
  const chooseTrip = (choice: string | 'none') => setTripChoice(choice === 'none' ? 'none' : choice)
  const openMember = (placeId: string) => {
    setSoloId(placeId)
    selectPlace(placeId, true)
  }

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
              <p className="truncate text-sm font-semibold">{positionLabel} of {session.length} from {current.uploadLabel}</p>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {groupMode
                  ? `One screenshot, ${members.length} places. Decide them together or one by one.`
                  : (current.screenshotName ?? 'Screenshot')}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={session.length} aria-valuenow={groupEndIndex + 1}>
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className="hidden sm:block">
            <BatchTripChip
              trips={trips}
              selectedId={effectiveTrip?.id ?? null}
              selectedName={effectiveTrip?.name ?? null}
              onSelect={chooseTrip}
            />
          </div>
          <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
            <Link href="/inbox"><Inbox className="mr-1.5 h-4 w-4" />Back to Inbox</Link>
          </Button>
        </div>
      </header>

      {groupMode ? (
        <div className="mx-auto max-w-[1560px] px-3 py-5 sm:px-6">
          <ReviewGroupView
            members={members}
            excluded={excluded}
            onToggle={(placeId) => setExcluded((existing) => ({ ...existing, [placeId]: !existing[placeId] }))}
            onOpen={openMember}
            trips={trips}
            selectedTripId={effectiveTrip?.id ?? null}
            selectedTripName={effectiveTrip?.name ?? null}
            tripHint={tripHint}
            onSelectTrip={chooseTrip}
            zoomOpen={zoomOpen}
            onZoomOpenChange={setZoomOpen}
          />
        </div>
      ) : (
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
                const placeId = current.placeId
                void reloadPostcard(placeId).catch(() => {
                  void reloadPostcard(placeId).catch(() => undefined)
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
          onOpenInQueue={openMember}
          zoomOpen={zoomOpen}
          onZoomOpenChange={setZoomOpen}
        />
      </div>
      )}

      {error && <p role="alert" className="fixed bottom-32 left-1/2 z-50 -translate-x-1/2 rounded-full bg-destructive px-4 py-2 text-sm text-destructive-foreground shadow-lg sm:bottom-24">{error}</p>}

      <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-10px_30px_-20px_rgba(0,0,0,0.4)] backdrop-blur md:left-64 sm:px-6">
        <div className="mx-auto max-w-[1560px]">
          {!groupMode && (
            <div className="mb-2 sm:hidden">
              <BatchTripChip
                trips={trips}
                selectedId={effectiveTrip?.id ?? null}
                selectedName={effectiveTrip?.name ?? null}
                onSelect={chooseTrip}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 sm:hidden">
            <Button className="col-span-2 h-12 text-base" onClick={() => void decide('added')} disabled={addDisabled}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} {addLabel}
            </Button>
            <Button variant="outline" className="h-11" onClick={() => void decide('archived')} disabled={decisionLocked}><Archive className="mr-2 h-4 w-4" />{archiveLabel}</Button>
            <Button variant="outline" className="h-11" onClick={() => void skip()} disabled={decisionLocked}><SkipForward className="mr-2 h-4 w-4" />Skip for now</Button>
          </div>
          <div className="hidden items-center gap-3 sm:flex">
            <Button variant="outline" onClick={() => void decide('archived')} disabled={decisionLocked}><Archive className="mr-2 h-4 w-4" />{archiveLabel} <kbd className="ml-2 text-xs opacity-60">N</kbd></Button>
            <Button variant="outline" onClick={() => void skip()} disabled={decisionLocked}><SkipForward className="mr-2 h-4 w-4" />Skip for now <kbd className="ml-2 text-xs opacity-60">S</kbd></Button>
            <span className="ml-auto text-xs text-muted-foreground"><kbd>←</kbd> previous</span>
            <div className="flex">
              <Button className="min-w-48 rounded-r-none" onClick={() => void decide('added')} disabled={addDisabled}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} {addLabel} <kbd className="ml-2 text-xs opacity-70">Enter</kbd>
              </Button>
              <BatchTripChevron trips={trips} selectedId={effectiveTrip?.id ?? null} onSelect={chooseTrip} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
