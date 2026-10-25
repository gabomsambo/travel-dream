import {
  bindUnstartedUpload,
  cancelUnstartedUpload,
  createAbandonedUploadStore,
  discardUnstartedUpload,
  type UnstartedUploadBinding,
} from '@/lib/unstarted-upload'

describe('unstarted-upload leave paths', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  function bindWithHold(sessionId: string): {
    binding: UnstartedUploadBinding
    hold: (value: boolean) => void
    setLive: (started: boolean, promise: Promise<boolean> | null) => void
    release: () => void
  } {
    let held = false
    let started = false
    let startPromise: Promise<boolean> | null = null
    let cancelRequest: Promise<Response> | null = null
    const store = createAbandonedUploadStore()
    const binding: UnstartedUploadBinding = {
      sessionId: () => sessionId,
      startRequested: () => held || started || startPromise !== null,
      store,
      cancel: () => {
        if (!cancelRequest) {
          cancelRequest = fetch('/api/mass-upload/cancel', {
            method: 'POST',
            keepalive: true,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId }),
          })
        }
        return cancelRequest
      },
    }
    const release = bindUnstartedUpload(binding)
    return {
      binding,
      hold: (value) => {
        held = value
      },
      setLive: (nextStarted, nextPromise) => {
        started = nextStarted
        startPromise = nextPromise
      },
      release,
    }
  }

  it('does not cancel after Start was requested once live refs are cleared', async () => {
    const fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    const startPromise = Promise.resolve(true)
    const { hold, setLive, release } = bindWithHold('session-started')
    setLive(false, startPromise)

    hold(true)
    setLive(false, null)

    discardUnstartedUpload()
    await cancelUnstartedUpload()

    expect(fetchMock).not.toHaveBeenCalled()
    release()
  })

  it('hands over pending blobs without cancelling when Start was requested', async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/mass-upload/register')) {
        expect(init?.keepalive).toBe(true)
        return { ok: true, status: 200 } as Response
      }
      return { ok: false, status: 500 } as Response
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const startPromise = Promise.resolve(true)
    const { binding, hold, setLive, release } = bindWithHold('session-started')
    setLive(false, startPromise)
    binding.store.add({
      blobUrl: 'https://blob.example/pending.jpg',
      originalName: 'pending.jpg',
      fileSize: 12,
      mimeType: 'image/jpeg',
    })

    hold(true)
    setLive(false, null)

    discardUnstartedUpload()
    await cancelUnstartedUpload()

    const urls = fetchMock.mock.calls.map(([input]) => String(input))
    expect(urls.some((url) => url.includes('/api/mass-upload/cancel'))).toBe(false)
    expect(urls.filter((url) => url.includes('/api/mass-upload/register')).length).toBeGreaterThanOrEqual(1)
    expect(binding.store.pending()).toHaveLength(0)
    release()
  })

  it('cancels and hands over pending blobs when Start was never requested', async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/mass-upload/cancel')) {
        return { ok: true, status: 200 } as Response
      }
      if (url.includes('/api/mass-upload/register')) {
        return { ok: true, status: 200 } as Response
      }
      return { ok: false, status: 500 } as Response
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const { binding, setLive, release } = bindWithHold('session-open')
    setLive(false, null)
    binding.store.add({
      blobUrl: 'https://blob.example/a.jpg',
      originalName: 'a.jpg',
      fileSize: 10,
      mimeType: 'image/jpeg',
    })

    await cancelUnstartedUpload()

    expect(fetchMock).toHaveBeenCalled()
    const urls = fetchMock.mock.calls.map(([input]) => String(input))
    expect(urls.some((url) => url.includes('/api/mass-upload/cancel'))).toBe(true)
    expect(urls.some((url) => url.includes('/api/mass-upload/register'))).toBe(true)
    expect(binding.store.pending()).toHaveLength(0)
    release()
  })
})
