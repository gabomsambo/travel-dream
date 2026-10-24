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

function shot(): File {
  return new File(['pixels'], 'coast.jpg', { type: 'image/jpeg' })
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

    window.dispatchEvent(new Event('pagehide'))

    expect(callsTo('/api/mass-upload/cancel', 'POST')).toHaveLength(0)
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

    window.dispatchEvent(new Event('pagehide'))
    expect(callsTo('/api/mass-upload/cancel', 'POST')).toHaveLength(0)

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
    await clickSignOut()

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: '/' }))
    expect(callsTo('/api/mass-upload/cancel', 'POST')).toHaveLength(1)
  })
})
