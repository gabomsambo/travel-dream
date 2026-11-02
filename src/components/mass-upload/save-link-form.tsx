'use client'

import { useState, type FormEvent } from 'react'
import { Link2, Loader2 } from 'lucide-react'
import { Button } from '@/components/adapters/button'

export function SaveLinkForm({ onSaved }: { onSaved: () => void }) {
  const [url, setUrl] = useState('')
  const [caption, setCaption] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)
    try {
      const response = await fetch('/api/inbox/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), ...(caption.trim() ? { caption: caption.trim() } : {}) }),
      })
      const payload: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string'
          ? payload.message
          : 'Could not save this link. Check it and try again.'
        setError(message)
        return
      }
      onSaved()
    } catch {
      setError('Could not reach Travel Dream. Check your connection and try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-2xl space-y-5 pt-5">
      <div>
        <label htmlFor="inbox-link-url" className="mb-2 block text-sm font-semibold">TikTok or Instagram link</label>
        <input
          id="inbox-link-url"
          type="text"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          required
          maxLength={2048}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="Paste a post, reel, place, or share link"
          className="h-14 w-full rounded-xl border border-input bg-background px-4 text-base outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div>
        <label htmlFor="inbox-link-caption" className="mb-2 block text-sm font-semibold">Caption <span className="font-normal text-muted-foreground">(optional)</span></label>
        <textarea
          id="inbox-link-caption"
          rows={4}
          maxLength={8000}
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          placeholder="Paste the caption too. Place names are often mentioned there."
          className="min-h-28 w-full resize-y rounded-xl border border-input bg-background px-4 py-3 text-base outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <p className="text-sm text-muted-foreground">
        A caption helps find places when the link itself has no destination details.
      </p>
      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
      <Button type="submit" size="lg" disabled={pending || !url.trim()} className="h-12 w-full rounded-xl text-base">
        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Link2 className="mr-2 h-4 w-4" aria-hidden />}
        {pending ? 'Saving link…' : 'Save to Inbox'}
      </Button>
    </form>
  )
}
