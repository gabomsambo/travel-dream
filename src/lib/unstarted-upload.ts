export type AbandonedUpload = {
  blobUrl: string
  originalName: string
  fileSize: number
  mimeType: string
}

/**
 * Blobs that reached the blob store but have no source row yet.
 *
 * There is one store per upload batch. A blob leaves the store as soon as the
 * server has either given it a source row or deleted it because the session
 * was closed, so every path that can lose the page (sheet close, pagehide,
 * sign-out) still knows exactly which blobs it has to hand over.
 */
export type AbandonedUploadStore = {
  add: (upload: AbandonedUpload) => void
  remove: (blobUrl: string) => void
  pending: () => AbandonedUpload[]
}

export function createAbandonedUploadStore(): AbandonedUploadStore {
  const pending = new Map<string, AbandonedUpload>()
  return {
    add(upload) {
      pending.set(upload.blobUrl, upload)
    },
    remove(blobUrl) {
      pending.delete(blobUrl)
    },
    pending() {
      return Array.from(pending.values())
    },
  }
}

export type UnstartedUploadBinding = {
  sessionId: () => string | null
  startRequested: () => boolean
  /** Blobs of this batch that have no source row yet. */
  store: AbandonedUploadStore
  /** Sends the cancel for this session once; later calls share that request. */
  cancel: () => Promise<Response>
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

/**
 * Hands blobs that have no source row to the server.
 *
 * Only blobs without a source row are sent. A batch of 500 screenshots would
 * otherwise spend the browser's 64KiB keepalive budget on 500 requests, and
 * the newest URLs - the ones whose register never reached the server - would
 * be the ones the browser drops.
 *
 * `keepalive` belongs to the paths that run while the document is being
 * discarded (pagehide, sign-out). The sheet-close path still has a live page
 * and must not spend that budget.
 *
 * Returns the blobs that need another attempt: a request that never landed,
 * or a server error that left the blob without a source row.
 */
export async function registerAbandonedUploads(
  sessionId: string,
  blobs: readonly AbandonedUpload[],
  options: { keepalive?: boolean } = {},
): Promise<AbandonedUpload[]> {
  const unique = new Map<string, AbandonedUpload>()
  for (const blob of blobs) unique.set(blob.blobUrl, blob)
  const retry: AbandonedUpload[] = []
  await Promise.all(Array.from(unique.values()).map(async (blob) => {
    let response: Response
    try {
      response = await fetch('/api/mass-upload/register', {
        method: 'POST',
        keepalive: options.keepalive === true,
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
      retry.push(blob)
      return
    }
    // A 409 means the session was closed and the blob was deleted with it.
    // Every other failure leaves the blob without a source row, so it stays
    // on the list for the next attempt.
    if (!response.ok && response.status !== 409) retry.push(blob)
  }))
  return retry
}

function currentBinding(): { sessionId: string; binding: UnstartedUploadBinding } | null {
  const binding = active
  if (!binding) return null
  const sessionId = binding.sessionId()
  if (!sessionId) return null
  return { sessionId, binding }
}

/**
 * Hands blobs that have no source row to the server and drops the ones that
 * landed (or were deleted with a closed session) from the store.
 */
export async function handOverPendingBlobs(
  sessionId: string,
  binding: UnstartedUploadBinding,
  options: { keepalive?: boolean } = {},
): Promise<void> {
  const blobs = binding.store.pending()
  if (blobs.length === 0) return
  const retry = await registerAbandonedUploads(sessionId, blobs, options)
  const retried = new Set(retry.map((blob) => blob.blobUrl))
  for (const blob of blobs) {
    if (!retried.has(blob.blobUrl)) binding.store.remove(blob.blobUrl)
  }
}

/**
 * Sign-out path. The caller awaits this before the cookie is cleared, so the
 * cancel has to land and the blobs have to be on their way first.
 *
 * A session whose Start was already requested is left alone — cancel would
 * race the queue — but pending blobs still have to be registered into it.
 */
export async function cancelUnstartedUpload(): Promise<void> {
  try {
    const current = currentBinding()
    if (!current) return
    const { sessionId, binding } = current
    if (!binding.startRequested()) {
      const cancel = await binding.cancel()
      if (!cancel.ok) return
    }
    await handOverPendingBlobs(sessionId, binding, { keepalive: true })
  } catch {
    return
  }
}

/**
 * Pagehide path. The document is going away, so the cancel and the hand-over
 * go out together and both use keepalive. A register that lands before the
 * cancel creates a source that the cancel then cancels; one that lands after
 * takes the closed-session path and deletes the blob.
 *
 * When Start was already requested, skip cancel and only hand over pending
 * blobs into the still-open (or already-queued) session.
 */
export function discardUnstartedUpload(): void {
  try {
    const current = currentBinding()
    if (!current) return
    const { sessionId, binding } = current
    if (!binding.startRequested()) {
      void binding.cancel().then(() => undefined, () => undefined)
    }
    void handOverPendingBlobs(sessionId, binding, { keepalive: true })
  } catch {
    return
  }
}
