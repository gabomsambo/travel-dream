'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload } from 'lucide-react'
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

/**
 * First visit is the drop zone, and the files go to the existing Mass Upload
 * page. The in-page upload sheet is a later change.
 */
export function InboxDropLink() {
  const router = useRouter()
  const [over, setOver] = useState(false)
  return (
    <a
      href="/mass-upload"
      onDragOver={(event) => {
        event.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setOver(false)
        router.push('/mass-upload')
      }}
      className={cn(
        'mx-auto mt-6 block max-w-xl rounded-2xl border-2 border-dashed px-6 py-8 text-muted-foreground',
        over ? 'border-primary bg-primary/5' : 'border-primary/40'
      )}
    >
      <Upload className="mx-auto mb-2 h-6 w-6" aria-hidden />
      <span>
        Drop screenshots here, or <span className="font-semibold text-primary">choose files</span>
      </span>
      <span className="mt-1 block text-xs">PNG, JPG, HEIC · up to 500 at a time</span>
    </a>
  )
}
