import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event'
import { upload } from '@vercel/blob/client'
import { signOut } from 'next-auth/react'
import { Header } from '@/components/layout/header'
import { MassUploadSheet } from '@/components/mass-upload/mass-upload-page'

const mockPush = jest.fn()
const mockRefresh = jest.fn()
const mockObserveSession = jest.fn()
const mockSignOut = signOut as jest.Mock

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: mockRefresh,
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '',
}))

jest.mock('@/components/activity/activity-provider', () => ({
  useActivityJobs: () => ({
    jobs: [],
    connectionState: 'idle',
    observeSession: mockObserveSession,
    acknowledge: jest.fn(),
  }),
}))

jest.mock('@vercel/blob/client', () => ({ upload: jest.fn() }))

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { name: 'Ada Lovelace', email: 'ada@example.com' } },
    status: 'authenticated',
  }),
  signOut: jest.fn(() => Promise.resolve()),
}))

jest.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme: jest.fn() }),
}))

const fetchMock = global.fetch as jest.Mock
const uploadMock = upload as jest.Mock

function callsTo(url: string, method: string) {
  return fetchMock.mock.calls.filter((call) => call[0] === url && (call[1]?.method ?? 'GET') === method)
}

function shot(name = 'coast.jpg'): File {
  return new File(['pixels'], name, { type: 'image/jpeg' })
}

function mockSession(sessionId: string, start?: (init?: RequestInit) => Promise<unknown>) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/upload/sessions' && method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ status: 'success', session: { id: sessionId } }),
      })
    }
    if (url === '/api/mass-upload/register' && method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ status: 'success', sourceId: 'src_discard' }),
      })
    }
    if (url === '/api/mass-upload/start' && method === 'POST') {
      return start ? start(init) : Promise.resolve({
        ok: true,
        json: async () => ({ status: 'success', queued: 1 }),
      })
    }
    if (url === '/api/mass-upload/cancel' && method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ status: 'success', cancelled: 1 }),
      })
    }
    return Promise.resolve({ ok: true, json: async () => ({ status: 'success' }) })
  })
}

async function reachReview() {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Continue to Review' }))
  expect(screen.getByRole('button', { name: /Start Processing/ })).toBeInTheDocument()
  return user
}

async function clickSignOut() {
  const user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never })
  await user.click(screen.getByRole('button', { name: 'AL', hidden: true }))
  await user.click(await screen.findByRole('menuitem', { name: 'Sign out', hidden: true }))
}

describe('discarding an upload before Start', () => {
  beforeAll(() => {
    if (typeof URL.createObjectURL !== 'function') {
      URL.createObjectURL = jest.fn(() => 'blob:preview')
    }
    if (typeof URL.revokeObjectURL !== 'function') {
      URL.revokeObjectURL = jest.fn()
    }
  })

  beforeEach(() => {
    fetchMock.mockReset()
    uploadMock.mockReset()
    mockPush.mockReset()
    mockRefresh.mockReset()
    mockObserveSession.mockReset()
    mockSignOut.mockReset()
    mockSignOut.mockImplementation(() => Promise.resolve())
    uploadMock.mockResolvedValue({
      url: 'https://teststore.public.blob.vercel-storage.com/coast.jpg',
    })
  })

  it('keepalive-cancels the session when the page is discarded before Start', async () => {
    mockSession('ses_pagehide')
    render(<MassUploadSheet open onOpenChange={jest.fn()} initialFiles={[shot()]} />)
    await reachReview()
    const registers = callsTo('/api/mass-upload/register', 'POST').length
    expect(registers).toBeGreaterThan(0)

    window.dispatchEvent(new Event('pagehide'))

    const cancels = callsTo('/api/mass-upload/cancel', 'POST')
    expect(cancels).toHaveLength(1)
    expect(cancels[0][1].keepalive).toBe(true)
    expect(JSON.parse(String(cancels[0][1].body))).toEqual({ sessionId: 'ses_pagehide' })
    // The screenshot already has a source row, so there is nothing to hand
    // over. Re-sending it would spend the browser's keepalive budget on a
    // screenshot that is already registered.
    expect(callsTo('/api/mass-upload/register', 'POST')).toHaveLength(registers)
    expect(callsTo('/api/mass-upload/start', 'POST')).toHaveLength(0)
  })

  it('leaves the session alone when the page is discarded after Start has queued it', async () => {
    mockSession('ses_queued')
    const onOpenChange = jest.fn()
    render(<MassUploadSheet open onOpenChange={onOpenChange} initialFiles={[shot()]} />)
    const user = await reachReview()
    await user.click(screen.getByRole('button', { name: /Start Processing/ }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    const registers = callsTo('/api/mass-upload/register', 'POST').length

    window.dispatchEvent(new Event('pagehide'))

    expect(callsTo('/api/mass-upload/cancel', 'POST')).toHaveLength(0)
    expect(callsTo('/api/mass-upload/register', 'POST')).toHaveLength(registers)
    expect(callsTo('/api/mass-upload/start', 'POST')).toHaveLength(1)
  })

  it('leaves the session alone when the page is discarded while Start is still in flight', async () => {
    let finishStart: () => void = () => {}
    mockSession('ses_inflight', () => new Promise((resolve) => {
      finishStart = () => resolve({
        ok: true,
        json: async () => ({ status: 'success', queued: 1 }),
      })
    }))
    render(<MassUploadSheet open onOpenChange={jest.fn()} initialFiles={[shot()]} />)
    const user = await reachReview()
    await user.click(screen.getByRole('button', { name: /Start Processing/ }))
    await waitFor(() => expect(callsTo('/api/mass-upload/start', 'POST')).toHaveLength(1))
    const registers = callsTo('/api/mass-upload/register', 'POST').length

    window.dispatchEvent(new Event('pagehide'))
    expect(callsTo('/api/mass-upload/cancel', 'POST')).toHaveLength(0)
    expect(callsTo('/api/mass-upload/register', 'POST')).toHaveLength(registers)

    await act(async () => {
      finishStart()
    })
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/inbox'))
    expect(callsTo('/api/mass-upload/cancel', 'POST')).toHaveLength(0)
  })

  it('cancels the unstarted session before signing out', async () => {
    let finishCancel: () => void = () => {}
    const order: string[] = []
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (url === '/api/upload/sessions' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'success', session: { id: 'ses_signout' } }),
        })
      }
      if (url === '/api/mass-upload/register' && method === 'POST') {
        if (init?.keepalive) order.push('register-leave')
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'success', sourceId: 'src_signout' }),
        })
      }
      if (url === '/api/mass-upload/cancel' && method === 'POST') {
        order.push('cancel')
        return new Promise((resolve) => {
          finishCancel = () => {
            order.push('cancel-done')
            resolve({
              ok: true,
              json: async () => ({ status: 'success', cancelled: 1 }),
            })
          }
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success' }) })
    })
    mockSignOut.mockImplementation(() => {
      order.push('sign-out')
      return Promise.resolve()
    })

    render(
      <>
        <Header />
        <MassUploadSheet open onOpenChange={jest.fn()} initialFiles={[shot()]} />
      </>,
    )
    await reachReview()
    await clickSignOut()

    await waitFor(() => expect(order).toEqual(['cancel']))
    const cancel = callsTo('/api/mass-upload/cancel', 'POST')
    expect(cancel).toHaveLength(1)
    expect(cancel[0][1].keepalive).toBe(true)
    expect(JSON.parse(String(cancel[0][1].body))).toEqual({ sessionId: 'ses_signout' })
    expect(mockSignOut).not.toHaveBeenCalled()

    await act(async () => {
      finishCancel()
    })
    await waitFor(() => expect(order).toEqual(['cancel', 'cancel-done', 'sign-out']))
    expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: '/' })
    // The screenshot already has a source row, so the sign-out has nothing to
    // hand over.
    const leave = callsTo('/api/mass-upload/register', 'POST').filter((call) => call[1]?.keepalive)
    expect(leave).toHaveLength(0)
  })

  it('signs out without cancelling a session Start has already queued', async () => {
    mockSession('ses_started_signout')
    const onOpenChange = jest.fn()
    render(
      <>
        <Header />
        <MassUploadSheet open onOpenChange={onOpenChange} initialFiles={[shot()]} />
      </>,
    )
    const user = await reachReview()
    await user.click(screen.getByRole('button', { name: /Start Processing/ }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))

    await clickSignOut()

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: '/' }))
    expect(callsTo('/api/mass-upload/cancel', 'POST')).toHaveLength(0)
  })

  it('still signs out when cancelling the upload fails', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (url === '/api/upload/sessions' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'success', session: { id: 'ses_cancel_down' } }),
        })
      }
      if (url === '/api/mass-upload/register' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'success', sourceId: 'src_cancel_down' }),
        })
      }
      if (url === '/api/mass-upload/cancel' && method === 'POST') {
        return Promise.reject(new Error('offline'))
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success' }) })
    })

    render(
      <>
        <Header />
        <MassUploadSheet open onOpenChange={jest.fn()} initialFiles={[shot()]} />
      </>,
    )
    await reachReview()
    const registers = callsTo('/api/mass-upload/register', 'POST').length
    await clickSignOut()

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: '/' }))
    expect(callsTo('/api/mass-upload/cancel', 'POST')).toHaveLength(1)
    expect(callsTo('/api/mass-upload/register', 'POST')).toHaveLength(registers)
  })

  it('keepalive-cancels as soon as the sheet closes, before an upload finishes', async () => {
    let finishUpload: (value: { url: string }) => void = () => {}
    uploadMock.mockImplementation(() => new Promise((resolve) => {
      finishUpload = resolve
    }))
    mockSession('ses_closing')
    const onOpenChange = jest.fn()
    const { rerender } = render(
      <>
        <Header />
        <MassUploadSheet open onOpenChange={onOpenChange} initialFiles={[shot()]} />
      </>,
    )
    await waitFor(() => expect(uploadMock).toHaveBeenCalled())

    await userEvent.setup().click(screen.getByRole('button', { name: 'Close' }))
    rerender(
      <>
        <Header />
        <MassUploadSheet open={false} onOpenChange={onOpenChange} initialFiles={[shot()]} />
      </>,
    )

    const cancels = callsTo('/api/mass-upload/cancel', 'POST')
    expect(cancels).toHaveLength(1)
    expect(cancels[0][1].keepalive).toBe(true)
    expect(JSON.parse(String(cancels[0][1].body))).toEqual({ sessionId: 'ses_closing' })
    expect(callsTo('/api/mass-upload/register', 'POST')).toHaveLength(0)

    window.dispatchEvent(new Event('pagehide'))
    await clickSignOut()
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: '/' }))
    expect(callsTo('/api/mass-upload/cancel', 'POST')).toHaveLength(1)

    await act(async () => {
      finishUpload({ url: 'https://teststore.public.blob.vercel-storage.com/coast.jpg' })
    })
    await waitFor(() => expect(callsTo('/api/mass-upload/register', 'POST')).toHaveLength(1))
    const handover = callsTo('/api/mass-upload/register', 'POST')[0]
    // The sheet-close hand-over runs on a live page, so it must not spend the
    // browser's keepalive budget.
    expect(handover[1].keepalive).toBeFalsy()
    expect(handover[1].signal).toBeUndefined()
    expect(JSON.parse(String(handover[1].body))).toMatchObject({
      sessionId: 'ses_closing',
      blobUrl: 'https://teststore.public.blob.vercel-storage.com/coast.jpg',
    })
    expect(callsTo('/api/mass-upload/cancel', 'POST')).toHaveLength(1)
  })

  it('registers a stored blob when the page is discarded before register finishes', async () => {
    const blobUrl = 'https://teststore.public.blob.vercel-storage.com/coast.jpg'
    let finishRegister: () => void = () => {}
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (url === '/api/upload/sessions' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'success', session: { id: 'ses_blob' } }),
        })
      }
      if (url === '/api/mass-upload/register' && method === 'POST') {
        const body = JSON.parse(String(init?.body)) as { blobUrl?: string; sessionId?: string }
        if (init?.keepalive) {
          expect(body).toMatchObject({
            sessionId: 'ses_blob',
            blobUrl,
            originalName: 'coast.jpg',
          })
          return Promise.resolve({
            ok: false,
            status: 409,
            json: async () => ({ status: 'error', message: 'Upload session was closed' }),
          })
        }
        return new Promise((resolve) => {
          finishRegister = () => resolve({
            ok: true,
            json: async () => ({ status: 'success', sourceId: 'src_blob' }),
          })
        })
      }
      if (url === '/api/mass-upload/cancel' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'success', cancelled: 0 }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success' }) })
    })

    render(<MassUploadSheet open onOpenChange={jest.fn()} initialFiles={[shot()]} />)
    await waitFor(() => expect(callsTo('/api/mass-upload/register', 'POST')).toHaveLength(1))

    window.dispatchEvent(new Event('pagehide'))

    const registers = callsTo('/api/mass-upload/register', 'POST')
    expect(registers).toHaveLength(2)
    expect(registers[1][1].keepalive).toBe(true)
    expect(registers[1][1].signal).toBeUndefined()
    const cancels = callsTo('/api/mass-upload/cancel', 'POST')
    expect(cancels).toHaveLength(1)
    expect(cancels[0][1].keepalive).toBe(true)
    expect(JSON.parse(String(cancels[0][1].body))).toEqual({ sessionId: 'ses_blob' })

    await act(async () => {
      finishRegister()
    })
  })

  it('hands over only the screenshots that never got a source row when the page is discarded', async () => {
    const urls = [
      'https://teststore.public.blob.vercel-storage.com/one.jpg',
      'https://teststore.public.blob.vercel-storage.com/two.jpg',
    ]
    let uploaded = 0
    uploadMock.mockImplementation(() => Promise.resolve({ url: urls[uploaded++] }))
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (url === '/api/upload/sessions' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'success', session: { id: 'ses_mixed' } }),
        })
      }
      if (url === '/api/mass-upload/register' && method === 'POST') {
        const body = JSON.parse(String(init?.body)) as { blobUrl?: string }
        if (body.blobUrl === urls[1]) {
          return new Promise(() => {})
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'success', sourceId: 'src_one' }),
        })
      }
      if (url === '/api/mass-upload/cancel' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'success', cancelled: 1 }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success' }) })
    })

    render(
      <MassUploadSheet open onOpenChange={jest.fn()} initialFiles={[shot('one.jpg'), shot('two.jpg')]} />,
    )
    await waitFor(() => expect(callsTo('/api/mass-upload/register', 'POST')).toHaveLength(2))

    window.dispatchEvent(new Event('pagehide'))

    const registers = callsTo('/api/mass-upload/register', 'POST')
    // Only the screenshot whose register never landed is handed over. The one
    // that already has a source row is left alone.
    expect(registers).toHaveLength(3)
    const leave = registers[2]
    expect(leave[1].keepalive).toBe(true)
    expect(JSON.parse(String(leave[1].body))).toMatchObject({
      sessionId: 'ses_mixed',
      blobUrl: urls[1],
      originalName: 'two.jpg',
    })
  })

  it('hands the unregistered screenshot over when the page is discarded after the sheet closed', async () => {
    const blobUrl = 'https://teststore.public.blob.vercel-storage.com/coast.jpg'
    let finishRegister: () => void = () => {}
    let finishCancel: () => void = () => {}
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (url === '/api/upload/sessions' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'success', session: { id: 'ses_gap' } }),
        })
      }
      if (url === '/api/mass-upload/register' && method === 'POST') {
        if (init?.keepalive) {
          return Promise.resolve({
            ok: false,
            status: 409,
            json: async () => ({ status: 'error', message: 'Upload session was closed' }),
          })
        }
        return new Promise((resolve) => {
          finishRegister = () => resolve({
            ok: true,
            json: async () => ({ status: 'success', sourceId: 'src_gap' }),
          })
        })
      }
      if (url === '/api/mass-upload/cancel' && method === 'POST') {
        return new Promise((resolve) => {
          finishCancel = () => resolve({
            ok: true,
            json: async () => ({ status: 'success', cancelled: 0 }),
          })
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success' }) })
    })

    const onOpenChange = jest.fn()
    const { rerender } = render(
      <MassUploadSheet open onOpenChange={onOpenChange} initialFiles={[shot()]} />,
    )
    await waitFor(() => expect(callsTo('/api/mass-upload/register', 'POST')).toHaveLength(1))

    // The sheet closes while that register is still in flight.
    await userEvent.setup().click(screen.getByRole('button', { name: 'Close' }))
    rerender(<MassUploadSheet open={false} onOpenChange={onOpenChange} initialFiles={[shot()]} />)
    expect(callsTo('/api/mass-upload/cancel', 'POST')).toHaveLength(1)

    // The page is discarded before the cancel answers. The screenshot that
    // never got a source row still has to be handed over.
    window.dispatchEvent(new Event('pagehide'))

    const registers = callsTo('/api/mass-upload/register', 'POST')
    expect(registers).toHaveLength(2)
    expect(registers[1][1].keepalive).toBe(true)
    expect(registers[1][1].signal).toBeUndefined()
    expect(JSON.parse(String(registers[1][1].body))).toMatchObject({
      sessionId: 'ses_gap',
      blobUrl,
    })
    expect(callsTo('/api/mass-upload/cancel', 'POST')).toHaveLength(1)

    await act(async () => {
      finishCancel()
      finishRegister()
    })
  })

  it('hands the unregistered screenshot over when the user signs out after the sheet closed', async () => {
    const blobUrl = 'https://teststore.public.blob.vercel-storage.com/coast.jpg'
    let finishCancel: () => void = () => {}
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (url === '/api/upload/sessions' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'success', session: { id: 'ses_signout_gap' } }),
        })
      }
      if (url === '/api/mass-upload/register' && method === 'POST') {
        if (init?.keepalive) {
          return Promise.resolve({
            ok: false,
            status: 409,
            json: async () => ({ status: 'error', message: 'Upload session was closed' }),
          })
        }
        return new Promise(() => {})
      }
      if (url === '/api/mass-upload/cancel' && method === 'POST') {
        return new Promise((resolve) => {
          finishCancel = () => resolve({
            ok: true,
            json: async () => ({ status: 'success', cancelled: 0 }),
          })
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success' }) })
    })

    const onOpenChange = jest.fn()
    const { rerender } = render(
      <>
        <Header />
        <MassUploadSheet open onOpenChange={onOpenChange} initialFiles={[shot()]} />
      </>,
    )
    await waitFor(() => expect(callsTo('/api/mass-upload/register', 'POST')).toHaveLength(1))

    await userEvent.setup().click(screen.getByRole('button', { name: 'Close' }))
    rerender(
      <>
        <Header />
        <MassUploadSheet open={false} onOpenChange={onOpenChange} initialFiles={[shot()]} />
      </>,
    )
    expect(callsTo('/api/mass-upload/cancel', 'POST')).toHaveLength(1)

    await clickSignOut()

    // The sign-out waits for the cancel that is already on its way.
    expect(mockSignOut).not.toHaveBeenCalled()
    expect(callsTo('/api/mass-upload/cancel', 'POST')).toHaveLength(1)

    await act(async () => {
      finishCancel()
    })
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: '/' }))
    const leave = callsTo('/api/mass-upload/register', 'POST').filter((call) => call[1]?.keepalive)
    expect(leave).toHaveLength(1)
    expect(JSON.parse(String(leave[0][1].body))).toMatchObject({
      sessionId: 'ses_signout_gap',
      blobUrl,
    })
  })

  it('registers a stored blob on sign out after cancel and before sign-out', async () => {
    const blobUrl = 'https://teststore.public.blob.vercel-storage.com/coast.jpg'
    const order: string[] = []
    let finishCancel: () => void = () => {}
    let finishRegister: () => void = () => {}
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (url === '/api/upload/sessions' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'success', session: { id: 'ses_signout_blob' } }),
        })
      }
      if (url === '/api/mass-upload/register' && method === 'POST') {
        if (init?.keepalive) {
          order.push('register-leave')
          const body = JSON.parse(String(init?.body)) as { blobUrl?: string }
          expect(body.blobUrl).toBe(blobUrl)
          return Promise.resolve({
            ok: false,
            status: 409,
            json: async () => ({ status: 'error' }),
          })
        }
        order.push('register')
        return new Promise((resolve) => {
          finishRegister = () => resolve({
            ok: true,
            json: async () => ({ status: 'success', sourceId: 'src_signout_blob' }),
          })
        })
      }
      if (url === '/api/mass-upload/cancel' && method === 'POST') {
        order.push('cancel')
        return new Promise((resolve) => {
          finishCancel = () => {
            order.push('cancel-done')
            resolve({
              ok: true,
              json: async () => ({ status: 'success', cancelled: 0 }),
            })
          }
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success' }) })
    })
    mockSignOut.mockImplementation(() => {
      order.push('sign-out')
      return Promise.resolve()
    })

    render(
      <>
        <Header />
        <MassUploadSheet open onOpenChange={jest.fn()} initialFiles={[shot()]} />
      </>,
    )
    await waitFor(() => expect(order).toEqual(['register']))
    await clickSignOut()

    await waitFor(() => expect(order).toEqual(['register', 'cancel']))
    expect(mockSignOut).not.toHaveBeenCalled()

    await act(async () => {
      finishCancel()
    })
    await waitFor(() => expect(order).toEqual(['register', 'cancel', 'cancel-done', 'register-leave', 'sign-out']))
    expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: '/' })
    const leave = callsTo('/api/mass-upload/register', 'POST').filter((call) => call[1]?.keepalive)
    expect(leave).toHaveLength(1)
    expect(JSON.parse(String(leave[0][1].body))).toMatchObject({
      sessionId: 'ses_signout_blob',
      blobUrl,
      originalName: 'coast.jpg',
    })

    await act(async () => {
      finishRegister()
    })
  })
})
