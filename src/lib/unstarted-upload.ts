export type AbandonedUpload = {
  blobUrl: string
  originalName: string
  fileSize: number
  mimeType: string
}

type UnstartedUploadBinding = {
  sessionId: () => string | null
  startRequested: () => boolean
  abandonedUploads: () => readonly AbandonedUpload[]
}

let active: UnstartedUploadBinding | null = null

export function bindUnstartedUpload(binding: UnstartedUploadBinding): () => void {
  active = binding
  return () => {
    if (active === binding) active = null
  }
}

export function cancelUploadSession(sessionId: string): Promise<Response> {
  return fetch('/api/mass-upload/cancel', {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  })
}

export function registerAbandonedUploads(
  sessionId: string,
  blobs: readonly AbandonedUpload[],
): Promise<void> {
  const unique = new Map<string, AbandonedUpload>()
  for (const blob of blobs) unique.set(blob.blobUrl, blob)
  return Promise.all(Array.from(unique.values()).map(async (blob) => {
    try {
      await fetch('/api/mass-upload/register', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          blobUrl: blob.blobUrl,
          originalName: blob.originalName,
          fileSize: blob.fileSize,
          mimeType: blob.mimeType,
        }),
      })
    } catch {
      return
    }
  })).then(() => undefined)
}

function currentUnstarted(): { sessionId: string; binding: UnstartedUploadBinding } | null {
  const binding = active
  if (!binding || binding.startRequested()) return null
  const sessionId = binding.sessionId()
  if (!sessionId) return null
  return { sessionId, binding }
}

export function cancelUnstartedUpload(): Promise<void> {
  try {
    const current = currentUnstarted()
    if (!current) return Promise.resolve()
    const { sessionId, binding } = current
    return cancelUploadSession(sessionId).then(
      (cancel) => {
        if (!cancel.ok) return undefined
        return registerAbandonedUploads(sessionId, binding.abandonedUploads())
      },
      () => undefined,
    )
  } catch {
    return Promise.resolve()
  }
}

export function discardUnstartedUpload(): void {
  try {
    const current = currentUnstarted()
    if (!current) return
    const { sessionId, binding } = current
    const abandoned = binding.abandonedUploads().slice()
    void cancelUploadSession(sessionId).then(() => undefined, () => undefined)
    void registerAbandonedUploads(sessionId, abandoned)
  } catch {
    return
  }
}
