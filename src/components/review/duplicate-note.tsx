'use client'

import * as React from 'react'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/adapters/button'
import { CERTAINTY_WORD_CLASS } from '@/components/duplicates/certainty-word-class'
import { DuplicateComparisonPanel } from '@/components/duplicates/duplicate-comparison-panel'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { CertaintyWord } from '@/lib/duplicate-certainty'
import { notify } from '@/lib/notify'
import { cn } from '@/lib/utils'
import type { Place, PlaceWithRelations } from '@/types/database'

export interface ReviewDuplicateMatch {
  placeId: string
  name: string
  city: string | null
  kind: string
  createdAt: string
  photoUrl: string | null
  confidence: number
  certainty: CertaintyWord
  label: string
  summary: string
}

export interface MergedDuplicate {
  inboxPlaceId: string
  libraryPlaceId: string
  libraryName: string
  mergeLogId: string
}

function initial(name: string): string {
  return (name.trim().charAt(0) || '?').toUpperCase()
}

function Thumb({ url, name }: { url: string | null; name: string }) {
  return (
    <span className="inline-flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border-2 border-card bg-muted text-sm font-semibold text-muted-foreground">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        initial(name)
      )}
    </span>
  )
}

async function readError(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null) as { message?: string } | null
  return body?.message || fallback
}

export function ReviewDuplicateNote({
  placeId,
  placeName,
  currentPlace,
  screenshotUrl,
  merged,
  disabled,
  onPending,
  onMerged,
  onMergeUndone,
}: {
  placeId: string
  placeName: string
  currentPlace: PlaceWithRelations
  screenshotUrl: string | null
  merged: MergedDuplicate | null
  disabled?: boolean
  onPending: (pending: boolean) => void
  onMerged: (merged: MergedDuplicate) => void
  onMergeUndone: (merged: MergedDuplicate) => Promise<void>
}) {
  const [match, setMatch] = React.useState<ReviewDuplicateMatch | null>(null)
  const [kept, setKept] = React.useState<{ name: string; pairs: Array<{ placeId1: string; placeId2: string }> } | null>(null)
  const [pending, setPending] = React.useState<'merge' | 'keep' | null>(null)
  const [compareOpen, setCompareOpen] = React.useState(false)
  const [comparePlace, setComparePlace] = React.useState<Place | null>(null)
  const [compareError, setCompareError] = React.useState<string | null>(null)
  const [compareLoading, setCompareLoading] = React.useState(false)

  React.useEffect(() => {
    if (merged) return
    const controller = new AbortController()
    setMatch(null)
    setKept(null)
    ;(async () => {
      try {
        const response = await fetch(`/api/places/${encodeURIComponent(placeId)}/duplicate-check`, {
          signal: controller.signal,
        })
        const body = await response.json().catch(() => null) as { match?: ReviewDuplicateMatch | null } | null
        if (controller.signal.aborted || !response.ok || !body?.match) return
        setMatch(body.match)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    })()
    return () => controller.abort()
  }, [placeId, merged])

  const undoKeep = React.useCallback(async (pairs: Array<{ placeId1: string; placeId2: string }>) => {
    const response = await fetch('/api/places/dismiss-duplicate', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairs }),
    })
    if (!response.ok && response.status !== 404) {
      notify.error(await readError(response, "Couldn't undo that."))
      return
    }
    setKept(null)
    notify.success('Put back')
  }, [])

  const keepBoth = async () => {
    if (!match || pending || disabled || currentPlace.status === 'archived') return
    const pairs = [{ placeId1: placeId, placeId2: match.placeId }]
    setPending('keep')
    onPending(true)
    try {
      const response = await fetch('/api/places/dismiss-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairs }),
      })
      if (!response.ok) throw new Error(await readError(response, "Couldn't keep both."))
      const body = await response.json().catch(() => null) as { inserted?: Array<{ placeId1: string; placeId2: string }> } | null
      const inserted = body?.inserted?.length ? body.inserted : pairs
      setKept({ name: match.name, pairs: inserted })
      notify.success(`Keeping ${placeName} and ${match.name} separate`, {
        duration: 8_000,
        cancel: { label: 'Undo', onClick: () => void undoKeep(inserted) },
      })
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Couldn't keep both.")
    } finally {
      setPending(null)
      onPending(false)
    }
  }

  const merge = async () => {
    if (!match || pending || disabled || currentPlace.status === 'archived') return
    setPending('merge')
    onPending(true)
    try {
      const response = await fetch('/api/places/bulk-merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clusters: [{
            targetId: match.placeId,
            sourceIds: [placeId],
            confidence: match.confidence,
          }],
        }),
      })
      const body = await response.json().catch(() => null) as {
        message?: string
        results?: Array<{ status?: string; mergeLogId?: string }>
      } | null
      const logged = body?.results?.find((entry) => entry.status === 'success' && entry.mergeLogId)
      if (!response.ok || !logged?.mergeLogId) {
        throw new Error(body?.message || "Couldn't merge these places.")
      }
      const info: MergedDuplicate = {
        inboxPlaceId: placeId,
        libraryPlaceId: match.placeId,
        libraryName: match.name,
        mergeLogId: logged.mergeLogId,
      }
      notify.success(`Merged into ${match.name}. This screenshot was added to the place you already have.`, {
        duration: 8_000,
        cancel: { label: 'Undo', onClick: () => void onMergeUndone(info) },
      })
      onMerged(info)
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Couldn't merge these places.")
    } finally {
      setPending(null)
      onPending(false)
    }
  }

  const openCompare = async () => {
    if (!match) return
    setCompareOpen(true)
    setCompareError(null)
    setComparePlace(null)
    setCompareLoading(true)
    try {
      const response = await fetch(`/api/places/${encodeURIComponent(match.placeId)}`)
      const body = await response.json().catch(() => null) as (Place & { message?: string }) | null
      if (!response.ok || !body || typeof body.name !== 'string') {
        throw new Error(body?.message || "Couldn't open that place.")
      }
      setComparePlace(body)
    } catch (error) {
      setCompareError(error instanceof Error ? error.message : "Couldn't open that place.")
    } finally {
      setCompareLoading(false)
    }
  }

  if (merged) {
    return (
      <div className="mx-4 mt-4 flex flex-wrap items-center gap-2 rounded-2xl border bg-card px-4 py-3 text-sm sm:mx-8" data-testid="duplicate-note">
        <Check className="h-4 w-4 text-primary" aria-hidden />
        <p className="min-w-0 flex-1">
          <span className="font-semibold">Merged.</span> This screenshot now belongs to {merged.libraryName} in your Library.
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={() => void onMergeUndone(merged)} disabled={disabled}>
          Undo
        </Button>
      </div>
    )
  }

  if (currentPlace.status === 'archived') {
    if (!match) return null
    return (
      <p className="mx-4 mt-4 text-sm text-muted-foreground sm:mx-8" data-testid="duplicate-note">
        Looks like {match.name}, already in your Library
      </p>
    )
  }

  if (kept) {
    return (
      <div className="mx-4 mt-4 flex flex-wrap items-center gap-2 rounded-2xl border bg-card px-4 py-3 text-sm sm:mx-8" data-testid="duplicate-note">
        <Check className="h-4 w-4 text-primary" aria-hidden />
        <p className="min-w-0 flex-1">
          <span className="font-semibold">Kept both.</span> {kept.name} and {placeName} stay separate.
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={() => void undoKeep(kept.pairs)} disabled={disabled || pending !== null}>
          Undo
        </Button>
      </div>
    )
  }

  if (!match) return null

  const busy = pending !== null || disabled

  return (
    <section aria-label="Possible duplicate" className="mx-4 mt-4 rounded-2xl border bg-card p-3.5 sm:mx-8" data-testid="duplicate-note">
      <div className="grid items-center gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
        <div className="flex items-center" aria-hidden>
          <Thumb url={match.photoUrl} name={match.name} />
          <span className="-ml-3.5"><Thumb url={screenshotUrl} name={placeName} /></span>
        </div>
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold leading-snug">
            Looks like <span className="underline decoration-foreground/30 underline-offset-2">{match.name}</span>, already in your Library
            <span className={cn('ml-2 inline-flex rounded-full px-2 py-0.5 align-middle text-[11px] font-bold', CERTAINTY_WORD_CLASS[match.certainty])}>
              {match.label}
            </span>
          </h3>
          {match.summary && <p className="mt-1 text-[13px] text-muted-foreground">{match.summary}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={() => void merge()} disabled={busy}>
          {pending === 'merge' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
          Merge into {match.name}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void keepBoth()} disabled={busy}>
          {pending === 'keep' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
          Keep both
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => void openCompare()} disabled={busy}>
          Compare
        </Button>
        <p className="text-xs text-muted-foreground">Merge keeps everything: this screenshot is added to the place you already have.</p>
      </div>

      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogTitle>Compare with {match.name}</DialogTitle>
          <DialogDescription>
            {match.name} stays. Merging adds this screenshot and anything {placeName} has that {match.name} does not.
          </DialogDescription>
          {compareLoading && <p className="text-sm text-muted-foreground">Opening both places…</p>}
          {compareError && <p role="alert" className="text-sm text-destructive">{compareError}</p>}
          {comparePlace && (
            <DuplicateComparisonPanel target={comparePlace} compareTo={currentPlace} />
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
