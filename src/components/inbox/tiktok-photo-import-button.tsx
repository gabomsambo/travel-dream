'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function TikTokPhotoImportButton({
  sourceId,
  status,
  count = 0,
}: {
  sourceId: string
  status: 'importing' | 'imported' | 'failed' | null
  count?: number
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imported, setImported] = useState<number | null>(status === 'imported' ? count : null)

  async function importPhotos() {
    setPending(true)
    setError(null)
    try {
      const response = await fetch(`/api/inbox/links/${encodeURIComponent(sourceId)}/import-photos`, {
        method: 'POST',
      })
      const payload = await response.json() as { error?: string; imported?: number }
      if (!response.ok) throw new Error(payload.error || 'Could not import these photos.')
      setImported(payload.imported ?? 0)
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not import these photos.')
    } finally {
      setPending(false)
    }
  }

  if (imported !== null) {
    return <p className="mt-3 text-sm text-muted-foreground">{imported} photos imported and queued to read.</p>
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={importPhotos}
        disabled={pending || status === 'importing'}
        className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-semibold text-primary disabled:cursor-wait disabled:opacity-60"
      >
        {pending || status === 'importing' ? 'Importing photos…' : 'Import these photos'}
      </button>
      {error && <p role="status" className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  )
}
