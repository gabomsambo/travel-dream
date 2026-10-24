'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload } from 'lucide-react'
import { notify } from '@/lib/notify'
import { openUploadSheet } from '@/lib/upload-sheet'
import { cn } from '@/lib/utils'

/** Re-reads the server page while a batch is still being read. */
export function InboxLiveRefresh({ active }: { active: boolean }) {
  const router = useRouter()
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => router.refresh(), 5000)
    return () => window.clearInterval(id)
  }, [active, router])
  return null
}

/** Enter starts Review when the user is not already in a control. */
export function ReviewEnterKey({ href }: { href: string | null }) {
  const router = useRouter()
  useEffect(() => {
    if (!href) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      const tag = target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A' || target.isContentEditable) return
      event.preventDefault()
      router.push(href)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [href, router])
  return null
}

/** Stops screenshots that have not started reading. Uses the existing cancel route. */
export function CancelRemaining({ sessionId }: { sessionId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onClick() {
    setPending(true)
    setError(null)
    try {
      const response = await fetch('/api/mass-upload/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      if (!response.ok) {
        setError('Could not cancel the rest')
        return
      }
      router.refresh()
    } catch {
      setError('Could not cancel the rest')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={pending}
        className="text-sm text-white/85 underline decoration-white/40 underline-offset-4 hover:text-white disabled:opacity-60"
      >
        {pending ? 'Cancelling…' : 'Cancel the rest'}
      </button>
      {error && <p className="mt-1 text-sm text-white/90">{error}</p>}
    </div>
  )
}

type BulkOutcome = {
  updatedIds: string[]
  complete: boolean
  message: string
}

async function bulkPlaces(action: 'confirm' | 'return-to-inbox', placeIds: string[]): Promise<BulkOutcome> {
  const response = await fetch('/api/places/bulk-actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, placeIds }),
  })
  const body = await response.json().catch(() => null) as {
    message?: string
    status?: string
    result?: { updatedIds?: unknown }
  } | null
  const reported = Array.isArray(body?.result?.updatedIds)
    ? body.result.updatedIds.filter((id): id is string => typeof id === 'string' && placeIds.includes(id))
    : []
  const fullSuccess = response.ok && body?.status === 'success'
  const updatedIds = reported.length > 0 ? reported : (fullSuccess ? placeIds : [])
  return {
    updatedIds,
    complete: fullSuccess && updatedIds.length === placeIds.length,
    message: body?.message || 'Could not update those places',
  }
}

/** Adds the places in this upload that have nothing to check, with Undo. */
export function AddLookRight({ label, placeIds }: { label: string; placeIds: string[] }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function add() {
    setPending(true)
    try {
      const result = await bulkPlaces('confirm', placeIds)
      if (result.updatedIds.length > 0) {
        const moved = result.updatedIds
        const noun = moved.length === 1 ? 'place' : 'places'
        notify.success(`Added ${moved.length} ${noun} to your Library`, {
          cancel: {
            label: 'Undo',
            onClick: () => {
              void bulkPlaces('return-to-inbox', moved)
                .then((undone) => {
                  if (undone.updatedIds.length === 0) {
                    notify.error('Could not undo that')
                    return
                  }
                  const undoNoun = undone.updatedIds.length === 1 ? 'place' : 'places'
                  notify.success(`Brought ${undone.updatedIds.length} ${undoNoun} back to your Inbox`)
                  router.refresh()
                })
                .catch(() => notify.error('Could not undo that'))
            },
          },
        })
        router.refresh()
      }
      if (!result.complete) notify.error(result.message)
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Could not add those places')
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void add()}
      disabled={pending}
      className="ml-auto text-sm font-medium text-primary underline-offset-4 hover:underline disabled:opacity-60"
    >
      {pending ? 'Adding…' : label}
    </button>
  )
}

/** First visit is the drop zone. Files open the same sheet as the header Upload button. */
export function InboxFirstDrop() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  function take(list: FileList | null) {
    const files = Array.from(list ?? [])
    if (files.length > 0) openUploadSheet(files)
  }

  return (
    <div className="mt-6">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        className="hidden"
        onChange={(event) => {
          take(event.target.files)
          event.target.value = ''
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault()
          setOver(false)
          take(event.dataTransfer.files)
        }}
        className={cn(
          'mx-auto flex w-full max-w-lg flex-col items-center gap-1 rounded-2xl border border-dashed px-4 py-8 text-sm text-muted-foreground',
          over ? 'border-primary bg-primary/5' : 'border-border bg-background'
        )}
      >
        <Upload className="mb-1 h-5 w-5" aria-hidden />
        <span>Drop screenshots here, or <span className="font-semibold text-primary">choose files</span></span>
        <span className="text-xs">PNG, JPG, HEIC · up to 500 at a time</span>
      </button>
    </div>
  )
}
