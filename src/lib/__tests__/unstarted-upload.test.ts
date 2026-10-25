import {
  bindUnstartedUpload,
  cancelUnstartedUpload,
  createAbandonedUploadStore,
  discardUnstartedUpload,
  handOverPendingBlobs,
  parkUnstartedUpload,
  resetUnstartedUploadsForTests,
  type UnstartedUploadBinding,
} from '@/lib/unstarted-upload'

describe('unstarted-upload leave paths', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    resetUnstartedUploadsForTests()
  })

  function bindWithHold(sessionId: string): {
    binding: UnstartedUploadBinding
    holdOutcome: (outcome: Promise<boolean> | null) => void
    setLive: (started: boolean, promise: Promise<boolean> | null) => void
    release: () => void
  } {
    let heldOutcome: Promise<boolean> | null = null
    let started = false
    let startPromise: Promise<boolean> | null = null
    let cancelRequest: Promise<Response> | null = null
    const store = createAbandonedUploadStore()
    const binding: UnstartedUploadBinding = {
      sessionId: () => sessionId,
      whenStarted: () =>
        heldOutcome ?? (started ? Promise.resolve(true) : startPromise),
      store,
      cancel: () => {
        if (!cancelRequest) {
          cancelRequest = fetch('/api/mass-upload/cancel', {
            method: 'POST',
            keepalive: true,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId }),
          }).then(
            (response) => {
              if (!response.ok) cancelRequest = null
              return response
            },
            (error) => {
              cancelRequest = null
              throw error
            },
          )
        }
        return cancelRequest
      },
    }
    const release = bindUnstartedUpload(binding)
    return {
      binding,
      holdOutcome: (outcome) => {
        heldOutcome = outcome
      },
      setLive: (nextStarted, nextPromise) => {
        started = nextStarted
        startPromise = nextPromise
      },
      release,
    }
  }

  it('does not cancel after Start succeeded once live refs are cleared', async () => {
    const fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    const startPromise = Promise.resolve(true)
    const { holdOutcome, setLive, release } = bindWithHold('session-started')
    setLive(false, startPromise)

    holdOutcome(startPromise)
    setLive(false, null)

    discardUnstartedUpload()
    await cancelUnstartedUpload()

    expect(fetchMock).not.toHaveBeenCalled()
    release()
  })

  it('hands over pending blobs without cancelling when Start succeeded', async () => {
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
    const { binding, holdOutcome, setLive, release } = bindWithHold('session-started')
    setLive(false, startPromise)
    binding.store.add({
      blobUrl: 'https://blob.example/pending.jpg',
      originalName: 'pending.jpg',
      fileSize: 12,
      mimeType: 'image/jpeg',
    })

    holdOutcome(startPromise)
    setLive(false, null)

    discardUnstartedUpload()
    await cancelUnstartedUpload()

    const urls = fetchMock.mock.calls.map(([input]) => String(input))
    expect(urls.some((url) => url.includes('/api/mass-upload/cancel'))).toBe(false)
    expect(urls.filter((url) => url.includes('/api/mass-upload/register')).length).toBeGreaterThanOrEqual(1)
    expect(urls.some((url) => url.includes('/api/mass-upload/start'))).toBe(false)
    expect(binding.store.pending()).toHaveLength(0)
    release()
  })

  it('does not call the server when Start succeeded but nothing was pending', async () => {
    const fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    const startPromise = Promise.resolve(true)
    const { holdOutcome, setLive, release } = bindWithHold('session-empty')
    setLive(false, startPromise)
    holdOutcome(startPromise)
    setLive(false, null)

    discardUnstartedUpload()
    await cancelUnstartedUpload()

    expect(fetchMock).not.toHaveBeenCalled()
    release()
  })

  it('cancels after Start fails while leave is waiting on the outcome', async () => {
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

    let finishStart: (value: boolean) => void = () => {}
    const startPromise = new Promise<boolean>((resolve) => {
      finishStart = resolve
    })
    const { binding, setLive, release } = bindWithHold('session-start-fail')
    setLive(false, startPromise)
    binding.store.add({
      blobUrl: 'https://blob.example/pending.jpg',
      originalName: 'pending.jpg',
      fileSize: 12,
      mimeType: 'image/jpeg',
    })

    const leave = cancelUnstartedUpload()
    expect(fetchMock).not.toHaveBeenCalled()

    finishStart(false)
    await leave

    const urls = fetchMock.mock.calls.map(([input]) => String(input))
    expect(urls.some((url) => url.includes('/api/mass-upload/cancel'))).toBe(true)
    expect(urls.some((url) => url.includes('/api/mass-upload/register'))).toBe(true)
    expect(binding.store.pending()).toHaveLength(0)
    release()
  })

  it('pagehide cancels after an in-flight Start fails', async () => {
    let finishCancel: (value: Response) => void = () => {}
    let finishRegister: (value: Response) => void = () => {}
    const fetchMock = jest.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/mass-upload/cancel')) {
        return new Promise<Response>((resolve) => {
          finishCancel = resolve
        })
      }
      if (url.includes('/api/mass-upload/register')) {
        return new Promise<Response>((resolve) => {
          finishRegister = resolve
        })
      }
      return Promise.resolve({ ok: false, status: 500 } as Response)
    })
    global.fetch = fetchMock as unknown as typeof fetch

    let finishStart: (value: boolean) => void = () => {}
    const startPromise = new Promise<boolean>((resolve) => {
      finishStart = resolve
    })
    const { binding, holdOutcome, setLive, release } = bindWithHold('session-pagehide-fail')
    setLive(false, startPromise)
    binding.store.add({
      blobUrl: 'https://blob.example/orphan.jpg',
      originalName: 'orphan.jpg',
      fileSize: 8,
      mimeType: 'image/jpeg',
    })

    holdOutcome(startPromise)
    setLive(false, null)

    discardUnstartedUpload()
    expect(fetchMock).not.toHaveBeenCalled()

    finishStart(false)
    await Promise.resolve()
    await Promise.resolve()

    const urls = fetchMock.mock.calls.map(([input]) => String(input))
    expect(urls.some((url) => url.includes('/api/mass-upload/cancel'))).toBe(true)
    expect(urls.some((url) => url.includes('/api/mass-upload/register'))).toBe(false)

    finishCancel({ ok: true, status: 200 } as Response)
    await Promise.resolve()
    await Promise.resolve()
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes('/api/mass-upload/register')),
    ).toBe(true)

    finishRegister({ ok: true, status: 200 } as Response)
    await new Promise<void>((resolve, reject) => {
      const started = Date.now()
      const tick = () => {
        if (binding.store.pending().length === 0) {
          resolve()
          return
        }
        if (Date.now() - started > 1000) {
          reject(new Error('pending blobs were not cleared after successful hand-over'))
          return
        }
        queueMicrotask(tick)
      }
      queueMicrotask(tick)
    })
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

  it('keeps pending blobs in the store when hand-over fails', async () => {
    let finishRegister: (value: { ok: boolean; status: number }) => void = () => {}
    const fetchMock = jest.fn(
      (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          finishRegister = (value) => resolve(value as Response)
        }),
    )
    global.fetch = fetchMock as unknown as typeof fetch

    const { binding, release } = bindWithHold('session-retry')
    const blob = {
      blobUrl: 'https://blob.example/retry.jpg',
      originalName: 'retry.jpg',
      fileSize: 4,
      mimeType: 'image/jpeg',
    }
    binding.store.add(blob)

    const handOver = handOverPendingBlobs('session-retry', binding, { keepalive: true })
    expect(binding.store.pending()).toEqual([blob])

    finishRegister({ ok: false, status: 500 })
    await expect(handOver).resolves.toBe(0)
    expect(binding.store.pending()).toEqual([blob])
    release()
  })

  it('still hands over a parked batch after a later open replaces active', async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/mass-upload/cancel')) {
        return { ok: true, status: 200 } as Response
      }
      if (url.includes('/api/mass-upload/register')) {
        expect(init?.keepalive).toBe(true)
        return { ok: true, status: 200 } as Response
      }
      return { ok: false, status: 500 } as Response
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const closed = bindWithHold('session-closed')
    closed.setLive(false, null)
    closed.binding.store.add({
      blobUrl: 'https://blob.example/orphan.jpg',
      originalName: 'orphan.jpg',
      fileSize: 8,
      mimeType: 'image/jpeg',
    })
    const unpark = parkUnstartedUpload(closed.binding)
    closed.release()

    const next = bindWithHold('session-next')
    next.setLive(false, null)

    discardUnstartedUpload()
    await cancelUnstartedUpload()

    const bodies = fetchMock.mock.calls
      .filter(([input]) => String(input).includes('/api/mass-upload/register'))
      .map(([, init]) => JSON.parse(String(init?.body)) as { sessionId: string; blobUrl: string })
    expect(bodies).toContainEqual({
      sessionId: 'session-closed',
      blobUrl: 'https://blob.example/orphan.jpg',
      originalName: 'orphan.jpg',
      fileSize: 8,
      mimeType: 'image/jpeg',
    })
    expect(closed.binding.store.pending()).toHaveLength(0)
    unpark()
    next.release()
  })

  it('keeps a parked binding flushable when hand-over fails after cancel', async () => {
    let finishRegister: (value: { ok: boolean; status: number }) => void = () => {}
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/mass-upload/cancel')) {
        return { ok: true, status: 200 } as Response
      }
      if (url.includes('/api/mass-upload/register')) {
        return new Promise<Response>((resolve) => {
          finishRegister = (value) => resolve(value as Response)
        })
      }
      return { ok: false, status: 500 } as Response
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const closed = bindWithHold('session-parked-retry')
    closed.setLive(false, null)
    const blob = {
      blobUrl: 'https://blob.example/parked.jpg',
      originalName: 'parked.jpg',
      fileSize: 6,
      mimeType: 'image/jpeg',
    }
    closed.binding.store.add(blob)
    parkUnstartedUpload(closed.binding)
    closed.release()

    const leave = cancelUnstartedUpload()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/api/mass-upload/register'))).toBe(true)
    finishRegister({ ok: false, status: 500 })
    await leave
    expect(closed.binding.store.pending()).toEqual([blob])

    const retryFetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/mass-upload/cancel')) {
        return { ok: true, status: 200 } as Response
      }
      if (url.includes('/api/mass-upload/register')) {
        return { ok: true, status: 200 } as Response
      }
      return { ok: false, status: 500 } as Response
    })
    global.fetch = retryFetch as unknown as typeof fetch

    await cancelUnstartedUpload()
    expect(retryFetch.mock.calls.some(([input]) => String(input).includes('/api/mass-upload/register'))).toBe(true)
    expect(closed.binding.store.pending()).toHaveLength(0)
  })

  it('pagehide does not register pending blobs when cancel fails', async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/mass-upload/cancel')) {
        return { ok: false, status: 500 } as Response
      }
      if (url.includes('/api/mass-upload/register')) {
        return { ok: true, status: 200 } as Response
      }
      return { ok: false, status: 500 } as Response
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const closed = bindWithHold('session-parked-failed-cancel')
    closed.setLive(false, null)
    closed.binding.store.add({
      blobUrl: 'https://blob.example/orphan.jpg',
      originalName: 'orphan.jpg',
      fileSize: 8,
      mimeType: 'image/jpeg',
    })
    parkUnstartedUpload(closed.binding)
    closed.release()

    discardUnstartedUpload()
    await Promise.resolve()
    await Promise.resolve()

    const urls = fetchMock.mock.calls.map(([input]) => String(input))
    expect(urls.some((url) => url.includes('/api/mass-upload/cancel'))).toBe(true)
    expect(urls.some((url) => url.includes('/api/mass-upload/register'))).toBe(false)
    expect(closed.binding.store.pending()).toHaveLength(1)
  })

  it('re-issues cancel after a failed attempt so a later leave can recover', async () => {
    let cancelAttempts = 0
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/mass-upload/cancel')) {
        cancelAttempts += 1
        if (cancelAttempts === 1) return { ok: false, status: 500 } as Response
        return { ok: true, status: 200 } as Response
      }
      if (url.includes('/api/mass-upload/register')) {
        return { ok: true, status: 200 } as Response
      }
      return { ok: false, status: 500 } as Response
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const closed = bindWithHold('session-sticky-cancel')
    closed.setLive(false, null)
    closed.binding.store.add({
      blobUrl: 'https://blob.example/retry.jpg',
      originalName: 'retry.jpg',
      fileSize: 4,
      mimeType: 'image/jpeg',
    })
    parkUnstartedUpload(closed.binding)
    closed.release()

    await cancelUnstartedUpload()
    expect(cancelAttempts).toBe(1)
    expect(closed.binding.store.pending()).toHaveLength(1)
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes('/api/mass-upload/register')),
    ).toBe(false)

    await cancelUnstartedUpload()
    expect(cancelAttempts).toBe(2)
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes('/api/mass-upload/register')),
    ).toBe(true)
    expect(closed.binding.store.pending()).toHaveLength(0)
  })
})
