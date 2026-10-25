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
/** Closing batches that a later open may have replaced on `active`. */
const parked = new Set<UnstartedUploadBinding>()

export function bindUnstartedUpload(binding: UnstartedUploadBinding): () => void {
  active = binding
  return () => {
    if (active === binding) active = null
  }
}

/**
 * Keeps a closing batch visible to pagehide and sign-out after a later open
 * replaces `active`. Call the returned function once abandon has finished.
 */
export function parkUnstartedUpload(binding: UnstartedUploadBinding): () => void {
  parked.add(binding)
  return () => {
    parked.delete(binding)
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
 * `keepalive` belongs to pagehide, sign-out, and the synchronous sheet-close
 * hand-over of the small unregistered set. Live-page abandon follow-ups omit it.
 *
 * Returns the blobs that need another attempt and how many inserts landed:
 * a request that never landed, or a server error that left the blob without
 * a source row, stays in `retry`. A 409 means the session was closed and the
 * blob was deleted — handled, but not an insert.
 *
 * When Start has already run, register inserts those rows as `queued` and
 * dispatches processors itself — no second client hop after unload.
 */
export async function registerAbandonedUploads(
  sessionId: string,
  blobs: readonly AbandonedUpload[],
  options: { keepalive?: boolean } = {},
): Promise<{ retry: AbandonedUpload[]; registered: number }> {
  const unique = new Map<string, AbandonedUpload>()
  for (const blob of blobs) unique.set(blob.blobUrl, blob)
  const retry: AbandonedUpload[] = []
  let registered = 0
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
    if (response.ok) {
      registered += 1
      return
    }
    // A 409 means the session was closed and the blob was deleted with it.
    // Every other failure leaves the blob without a source row, so it stays
    // on the list for the next attempt.
    if (response.status !== 409) retry.push(blob)
  }))
  return { retry, registered }
}

function bindingsToFlush(): UnstartedUploadBinding[] {
  const out: UnstartedUploadBinding[] = []
  const seen = new Set<UnstartedUploadBinding>()
  if (active) {
    out.push(active)
    seen.add(active)
  }
  for (const binding of parked) {
    if (seen.has(binding)) continue
    out.push(binding)
    seen.add(binding)
  }
  return out
}

function withSession(
  binding: UnstartedUploadBinding,
): { sessionId: string; binding: UnstartedUploadBinding } | null {
  const sessionId = binding.sessionId()
  if (!sessionId) return null
  return { sessionId, binding }
}

/**
 * Hands blobs that have no source row to the server and drops the ones that
 * landed (or were deleted with a closed session) from the store.
 *
 * Returns how many blobs were inserted as source rows.
 */
export async function handOverPendingBlobs(
  sessionId: string,
  binding: UnstartedUploadBinding,
  options: { keepalive?: boolean } = {},
): Promise<number> {
  const blobs = binding.store.pending()
  if (blobs.length === 0) return 0
  for (const blob of blobs) binding.store.remove(blob.blobUrl)
  const { retry, registered } = await registerAbandonedUploads(sessionId, blobs, options)
  for (const blob of retry) binding.store.add(blob)
  return registered
}

async function flushBinding(
  binding: UnstartedUploadBinding,
  options: { keepalive: boolean; awaitCancel: boolean },
): Promise<void> {
  const current = withSession(binding)
  if (!current) return
  const { sessionId } = current
  if (binding.startRequested()) {
    if (options.awaitCancel) {
      await handOverPendingBlobs(sessionId, binding, { keepalive: options.keepalive })
    } else {
      void handOverPendingBlobs(sessionId, binding, { keepalive: options.keepalive })
    }
    return
  }
  if (options.awaitCancel) {
    const cancel = await binding.cancel()
    if (!cancel.ok) return
    await handOverPendingBlobs(sessionId, binding, { keepalive: options.keepalive })
    return
  }
  void binding.cancel().then(() => undefined, () => undefined)
  void handOverPendingBlobs(sessionId, binding, { keepalive: options.keepalive })
}

/**
 * Sign-out path. The caller awaits this before the cookie is cleared, so the
 * cancel has to land and the blobs have to be on their way first.
 *
 * A session whose Start was already requested is never cancelled — that would
 * race the queue — but pending blobs still have to be registered into it.
 * Register inserts those as `queued` when the session is already started.
 *
 * Also flushes batches parked while a later Upload open replaced `active`.
 */
export async function cancelUnstartedUpload(): Promise<void> {
  try {
    for (const binding of bindingsToFlush()) {
      await flushBinding(binding, { keepalive: true, awaitCancel: true })
    }
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
 * When Start was already requested, skip cancel and hand over pending blobs
 * into the still-open session. Register queues them server-side — do not chain
 * a second start hop after unload.
 *
 * Also flushes batches parked while a later Upload open replaced `active`.
 */
export function discardUnstartedUpload(): void {
  try {
    for (const binding of bindingsToFlush()) {
      void flushBinding(binding, { keepalive: true, awaitCancel: false })
    }
  } catch {
    return
  }
}
