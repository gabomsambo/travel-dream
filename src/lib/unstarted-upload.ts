type UnstartedUploadBinding = {
  sessionId: () => string | null
  startRequested: () => boolean
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

export function cancelUnstartedUpload(): Promise<void> {
  try {
    const binding = active
    if (!binding || binding.startRequested()) return Promise.resolve()
    const sessionId = binding.sessionId()
    if (!sessionId) return Promise.resolve()
    return cancelUploadSession(sessionId).then(
      () => undefined,
      () => undefined,
    )
  } catch {
    return Promise.resolve()
  }
}
