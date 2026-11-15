'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { isTikTokPhotoImportStale } from '@/lib/link-import/tiktok-photo-import'

export function TikTokPhotoImportButton({
  sourceId,
  status,
  requestedAt = null,
  count = 0,
}: {
  sourceId: string
  status: 'importing' | 'imported' | 'failed' | null
  requestedAt?: string | null
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

  // An import that never recorded an outcome would otherwise disable this
  // button for good; past the route's own staleness window it can be retried.
  const importing = pending || (status === 'importing' && !isTikTokPhotoImportStale(requestedAt, Date.now()))

  if (imported !== null) {
    return (
      <div className="mt-3 space-y-1 text-sm text-muted-foreground">
        <p>{`${imported} ${imported === 1 ? 'photo' : 'photos'} imported and queued to read.`}</p>
        <p>Each photo is read to find places, but a place keeps only one of them.</p>
      </div>
    )
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={importPhotos}
        disabled={importing}
        className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-semibold text-primary disabled:cursor-wait disabled:opacity-60"
      >
        {importing ? 'Importing photos…' : 'Import photos to find places'}
      </button>
      {error && <p role="status" className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  )
}
