'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PenLine, Repeat2, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/adapters/dialog'
import { AddPlaceDialog, type AddPlaceSeed } from '@/components/places/add-place-dialog'
import { NOTIFY_DURATION, notify } from '@/lib/notify'
import { cn } from '@/lib/utils'
import type { InboxAction, InboxShotRef, InboxThumb } from '@/lib/inbox-page-model'

function retryMessage(names: string[]): string {
  if (names.length === 1) return `Queued ${names[0]} for another read.`
  return `Queued ${names.length} screenshots for another read.`
}

function dismissMessage(names: string[]): string {
  if (names.length === 1) return `Dismissed ${names[0]}. The screenshot is kept.`
  return `Dismissed ${names.length} screenshots. The files are kept.`
}

function triedSentence(attempts: number | undefined): string {
  if (!attempts || attempts < 1) return "The reader's answer didn't make sense."
  return `We tried ${attempts} ${attempts === 1 ? 'time' : 'times'} and the reader's answer didn't make sense.`
}

function seedFrom(shot: InboxShotRef): AddPlaceSeed {
  return {
    name: shot.handAdd?.name,
    kind: shot.handAdd?.kind,
    city: shot.handAdd?.city,
    country: shot.handAdd?.country,
    admin: shot.handAdd?.admin,
    description: shot.handAdd?.description,
    sourceLabel: shot.name,
  }
}

function sourceIdsOf(payload: { sourceIds?: unknown } | null): string[] {
  if (!payload || !Array.isArray(payload.sourceIds)) return []
  return payload.sourceIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
}

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; message?: string; sourceIds: string[] }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => null) as { message?: string; sourceIds?: unknown } | null
  return { ok: response.ok, message: payload?.message, sourceIds: sourceIdsOf(payload) }
}

export function InboxActions({ actions }: { actions: InboxAction[] }) {
  const router = useRouter()
  const busy = useRef(false)
  const [pending, setPending] = useState(false)
  const [sheet, setSheet] = useState<InboxAction | null>(null)
  const [chooser, setChooser] = useState<InboxShotRef[] | null>(null)
  const [addShot, setAddShot] = useState<InboxShotRef | null>(null)

  if (actions.length === 0) return null

  async function run(task: () => Promise<void>) {
    if (busy.current) return
    busy.current = true
    setPending(true)
    try {
      await task()
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  function namesOf(shots: InboxShotRef[]): string[] {
    return shots.map((shot) => shot.name)
  }

  function retry(shots: InboxShotRef[]) {
    const ids = shots.map((shot) => shot.id)
    void run(async () => {
      const result = await postJson('/api/mass-upload/retry', { sourceIds: ids })
      if (!result.ok) {
        notify.error(result.message || "Couldn't try that again.")
        return
      }
      const queuedIds = new Set(result.sourceIds)
      const queued = shots.filter((shot) => queuedIds.has(shot.id))
      if (queued.length === 0) {
        notify.error("Couldn't try that again.")
        return
      }
      const names = namesOf(queued)
      setSheet(null)
      notify.success(retryMessage(names), {
        duration: NOTIFY_DURATION.warning,
        action: {
          label: 'Undo',
          onClick: () => {
            void postJson('/api/mass-upload/retry', {
              sourceIds: queued.map((shot) => shot.id),
              undo: true,
            }).then((undone) => {
              if (!undone.ok) {
                notify.error(undone.message || "Couldn't put that screenshot back.")
                return
              }
              notify.success(names.length === 1 ? `Put ${names[0]} back.` : `Put ${names.length} screenshots back.`)
              router.refresh()
            })
          },
        },
      })
      router.refresh()
    })
  }

  function dismiss(shots: InboxShotRef[]) {
    const ids = shots.map((shot) => shot.id)
    void run(async () => {
      const result = await postJson('/api/inbox/dismiss', { sourceIds: ids, dismissed: true })
      if (!result.ok) {
        notify.error(result.message || "Couldn't dismiss that screenshot.")
        return
      }
      const hiddenIds = new Set(result.sourceIds)
      const hidden = shots.filter((shot) => hiddenIds.has(shot.id))
      if (hidden.length === 0) {
        notify.error("Couldn't dismiss that screenshot.")
        return
      }
      const names = namesOf(hidden)
      setSheet(null)
      notify.success(dismissMessage(names), {
        duration: NOTIFY_DURATION.warning,
        action: {
          label: 'Undo',
          onClick: () => {
            void postJson('/api/inbox/dismiss', {
              sourceIds: hidden.map((shot) => shot.id),
              dismissed: false,
            }).then((undone) => {
              if (!undone.ok) {
                notify.error(undone.message || "Couldn't put that screenshot back.")
                return
              }
              notify.success(names.length === 1 ? `Put ${names[0]} back.` : `Put ${names.length} screenshots back.`)
              router.refresh()
            })
          },
        },
      })
      router.refresh()
    })
  }

  function addByHand(shots: InboxShotRef[]) {
    if (shots.length === 0) return
    if (shots.length === 1) {
      setChooser(null)
      setSheet(null)
      setAddShot(shots[0])
      return
    }
    setSheet(null)
    setChooser(shots)
  }

  function onAction(action: InboxAction) {
    const shots = action.shots ?? []
    if (action.intent === 'retry') setSheet(action)
    else if (action.intent === 'dismiss') dismiss(shots)
    else if (action.intent === 'add-by-hand') addByHand(shots)
  }

  const sheetShots = sheet?.shots ?? []
  const one = sheetShots.length === 1 ? sheetShots[0] : null

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {actions.map((action) => {
          const className = cn(
            'inline-flex h-8 items-center justify-center gap-1 rounded-lg border px-2.5 text-xs font-medium',
            action.warn
              ? 'border-amber-300 bg-background text-amber-800 dark:border-amber-700 dark:text-amber-200'
              : 'border-border bg-background text-foreground',
            (action.disabled || pending) && 'cursor-not-allowed opacity-60'
          )
          if (action.href && !action.disabled) {
            return (
              <Link key={action.label} href={action.href} className={className}>
                {action.label}
              </Link>
            )
          }
          if (action.intent && !action.disabled) {
            return (
              <button
                key={`${action.intent}-${action.label}`}
                type="button"
                className={className}
                disabled={pending}
                aria-haspopup={action.intent === 'retry' || action.intent === 'add-by-hand' ? 'dialog' : undefined}
                onClick={() => onAction(action)}
              >
                {action.intent === 'add-by-hand' && <PenLine className="h-3.5 w-3.5" aria-hidden />}
                {action.label}
              </button>
            )
          }
          return (
            <button key={action.label} type="button" className={className} disabled>
              {action.label}
            </button>
          )
        })}
      </div>

      <Dialog open={sheet !== null} onOpenChange={(open) => { if (!open) setSheet(null) }}>
        <DialogContent
          className="max-h-[90vh] max-w-[560px] gap-4 overflow-y-auto p-5 sm:max-w-[560px] max-md:top-auto max-md:bottom-0 max-md:translate-y-0 max-md:rounded-b-none"
          aria-describedby={undefined}
        >
          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[120px_minmax(0,1fr)]">
            {one?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={one.imageUrl}
                alt=""
                className="h-[150px] w-full rounded-lg border border-border object-cover object-top md:h-[200px] md:w-[120px]"
              />
            ) : (
              <div className="grid h-[150px] place-items-center rounded-lg border border-dashed border-border text-xs text-muted-foreground md:h-[200px]">
                {sheetShots.length > 1 ? `${sheetShots.length} screenshots` : 'No photo'}
              </div>
            )}
            <div className="min-w-0 text-left">
              <p className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                {sheet?.uploadLabel ?? 'This upload'}
              </p>
              <DialogTitle className="mt-1 text-lg font-semibold">
                {one ? "We couldn't read this one" : `We couldn't read these ${sheetShots.length}`}
              </DialogTitle>
              <DialogDescription className="mt-1.5 text-sm text-muted-foreground">
                {triedSentence(one?.attempts ?? sheetShots.find((shot) => (shot.attempts ?? 0) > 0)?.attempts)}
                {' '}A second read often works; if not, add the place yourself.
              </DialogDescription>
              {sheetShots.length > 1 && (
                <p className="mt-2 text-sm text-muted-foreground">{sheetShots.map((shot) => shot.name).join(' · ')}</p>
              )}
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => retry(sheetShots)}
                  className="flex items-center gap-2.5 rounded-xl border border-primary bg-primary/10 px-3 py-2.5 text-left disabled:opacity-60"
                >
                  <Repeat2 className="h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    <span className="block text-sm font-semibold">Try again</span>
                    <span className="block text-xs text-muted-foreground">One more read. Usually fixes a one-off hiccup.</span>
                  </span>
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => addByHand(sheetShots)}
                  className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2.5 text-left disabled:opacity-60"
                >
                  <PenLine className="h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    <span className="block text-sm font-semibold">Add the place by hand</span>
                    <span className="block text-xs text-muted-foreground">Type the name; we&apos;ll find it on the map.</span>
                  </span>
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => dismiss(sheetShots)}
                  className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2.5 text-left disabled:opacity-60"
                >
                  <X className="h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    <span className="block text-sm font-semibold">Dismiss</span>
                    <span className="block text-xs text-muted-foreground">Hide it from the Inbox. The screenshot is kept.</span>
                  </span>
                </button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                If the reader was only busy or timed out, that row says <span className="font-semibold text-foreground">Still trying</span> instead and retries on its own.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={chooser !== null} onOpenChange={(open) => { if (!open) setChooser(null) }}>
        <DialogContent className="max-w-md">
          <DialogTitle>Add the place by hand</DialogTitle>
          <DialogDescription>Pick the screenshot to add by hand.</DialogDescription>
          <ul className="flex flex-col gap-2">
            {(chooser ?? []).map((shot) => (
              <li key={shot.id}>
                <button
                  type="button"
                  onClick={() => addByHand([shot])}
                  className="flex w-full items-center justify-between rounded-xl border border-border px-3 py-2 text-left text-sm"
                >
                  <span className="font-medium">{shot.name}</span>
                  <span className="text-xs font-medium text-primary">Add by hand</span>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      {addShot && (
        <AddPlaceDialog
          open
          seed={seedFrom(addShot)}
          onOpenChange={(open) => { if (!open) setAddShot(null) }}
          onPlaceCreated={() => {
            setAddShot(null)
            router.refresh()
          }}
        />
      )}
    </>
  )
}

export function ThumbStrip({
  thumbs,
  variant,
}: {
  thumbs: InboxThumb[]
  variant: 'hero' | 'card' | 'mini'
}) {
  if (thumbs.length === 0) return null
  return (
    <div className={cn('flex', variant === 'mini' && 'hidden md:flex')}>
      {thumbs.map((thumb, index) => (
        // Screenshots are the user's own blob URLs, same as the review postcard.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${thumb.src}-${index}`}
          src={thumb.src}
          alt={thumb.alt}
          className={cn(
            'rounded-md border-2 object-cover object-top',
            variant === 'hero'
              ? 'h-[76px] w-11 border-white shadow-md md:h-[100px] md:w-[58px]'
              : 'h-10 w-6 border-card md:h-14 md:w-[34px]',
            index > 0 && (variant === 'hero' ? '-ml-4' : '-ml-3'),
            variant === 'card' && index >= 3 && 'hidden md:block'
          )}
        />
      ))}
    </div>
  )
}
