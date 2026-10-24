import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { upload } from '@vercel/blob/client'
import { MassUploadSheet } from '@/components/mass-upload/mass-upload-page'

jest.mock('@vercel/blob/client', () => ({ upload: jest.fn() }))

const fetchMock = global.fetch as jest.Mock
const uploadMock = upload as jest.Mock

function callsTo(url: string, method: string) {
  return fetchMock.mock.calls.filter((call) => call[0] === url && (call[1]?.method ?? 'GET') === method)
}

function shot(): File {
  return new File(['pixels'], 'coast.jpg', { type: 'image/jpeg' })
}

describe('upload sheet dismiss', () => {
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
    uploadMock.mockResolvedValue({
      url: 'https://teststore.public.blob.vercel-storage.com/coast.jpg',
    })
  })

  it('aborts registration and cancels uploaded screenshots when closed before Start', async () => {
    const order: string[] = []
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (url === '/api/upload/sessions' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'success', session: { id: 'ses_abandon' } }),
        })
      }
      if (url === '/api/mass-upload/register' && method === 'POST') {
        const body = JSON.parse(String(init?.body)) as { blobUrl?: string; sessionId?: string }
        if (init?.signal) {
          order.push('register')
          return new Promise((_resolve, reject) => {
            const fail = () => {
              order.push('register-abort')
              reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
            }
            if (init.signal?.aborted) {
              fail()
              return
            }
            init.signal?.addEventListener('abort', fail, { once: true })
          })
        }
        order.push('register-closed')
        expect(body).toMatchObject({
          sessionId: 'ses_abandon',
          blobUrl: 'https://teststore.public.blob.vercel-storage.com/coast.jpg',
          originalName: 'coast.jpg',
        })
        return Promise.resolve({
          ok: false,
          status: 409,
          json: async () => ({ status: 'error', message: 'Upload session was closed' }),
        })
      }
      if (url === '/api/mass-upload/cancel' && method === 'POST') {
        order.push('cancel')
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'success', cancelled: 1 }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success' }) })
    })

    const files = [shot()]
    const onOpenChange = jest.fn()
    const { rerender } = render(
      <MassUploadSheet open onOpenChange={onOpenChange} initialFiles={files} />,
    )
    await waitFor(() => expect(order).toContain('register'))

    await userEvent.setup().click(screen.getByRole('button', { name: 'Close' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    rerender(<MassUploadSheet open={false} onOpenChange={onOpenChange} initialFiles={files} />)

    await waitFor(() => expect(order).toEqual(['register', 'register-abort', 'cancel', 'register-closed']))
    const cancel = callsTo('/api/mass-upload/cancel', 'POST')
    expect(JSON.parse(String(cancel[0][1].body))).toEqual({ sessionId: 'ses_abandon' })
    expect(callsTo('/api/mass-upload/start', 'POST')).toHaveLength(0)
  })

  it('registers a blob that finished uploading as the sheet closed', async () => {
    const blobUrl = 'https://teststore.public.blob.vercel-storage.com/late.jpg'
    let finishUpload: (value: { url: string }) => void = () => {}
    uploadMock.mockImplementation(() => new Promise((resolve) => {
      finishUpload = resolve
    }))
    const order: string[] = []
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (url === '/api/upload/sessions' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'success', session: { id: 'ses_late' } }),
        })
      }
      if (url === '/api/mass-upload/register' && method === 'POST') {
        order.push('register')
        const body = JSON.parse(String(init?.body)) as { blobUrl?: string; sessionId?: string }
        expect(init?.signal).toBeUndefined()
        expect(body).toMatchObject({ sessionId: 'ses_late', blobUrl })
        return Promise.resolve({
          ok: false,
          status: 409,
          json: async () => ({ status: 'error' }),
        })
      }
      if (url === '/api/mass-upload/cancel' && method === 'POST') {
        order.push('cancel')
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', cancelled: 0 }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success' }) })
    })

    const onOpenChange = jest.fn()
    const { rerender } = render(
      <MassUploadSheet open onOpenChange={onOpenChange} initialFiles={[shot()]} />,
    )
    await waitFor(() => expect(uploadMock).toHaveBeenCalled())
    await userEvent.setup().click(screen.getByRole('button', { name: 'Close' }))
    rerender(<MassUploadSheet open={false} onOpenChange={onOpenChange} initialFiles={[shot()]} />)
    finishUpload({ url: blobUrl })

    await waitFor(() => expect(order).toEqual(['cancel', 'register']))
    expect(callsTo('/api/mass-upload/start', 'POST')).toHaveLength(0)
  })

  it('does not register abandoned blobs when cancel does not succeed', async () => {
    const order: string[] = []
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (url === '/api/upload/sessions' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'success', session: { id: 'ses_cancel_failed' } }),
        })
      }
      if (url === '/api/mass-upload/register' && method === 'POST') {
        if (init?.signal) {
          order.push('register')
          return new Promise((_resolve, reject) => {
            const fail = () => {
              order.push('register-abort')
              reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
            }
            if (init.signal?.aborted) {
              fail()
              return
            }
            init.signal?.addEventListener('abort', fail, { once: true })
          })
        }
        order.push('register-closed')
        return Promise.resolve({
          ok: false,
          status: 409,
          json: async () => ({ status: 'error' }),
        })
      }
      if (url === '/api/mass-upload/cancel' && method === 'POST') {
        order.push('cancel')
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ status: 'error', message: 'Cancel failed' }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success' }) })
    })

    const files = [shot()]
    const onOpenChange = jest.fn()
    const { rerender } = render(
      <MassUploadSheet open onOpenChange={onOpenChange} initialFiles={files} />,
    )
    await waitFor(() => expect(order).toContain('register'))
    await userEvent.setup().click(screen.getByRole('button', { name: 'Close' }))
    rerender(<MassUploadSheet open={false} onOpenChange={onOpenChange} initialFiles={files} />)

    await waitFor(() => expect(order).toEqual(['register', 'register-abort', 'cancel']))
    await act(async () => {
      await Promise.resolve()
    })
    expect(order).toEqual(['register', 'register-abort', 'cancel'])
  })

  it('leaves the session alone after Start has queued it', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (url === '/api/upload/sessions' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'success', session: { id: 'ses_started' } }),
        })
      }
      if (url === '/api/mass-upload/register' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'success', sourceId: 'src_started' }),
        })
      }
      if (url === '/api/mass-upload/start' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'success', queued: 1 }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success' }) })
    })

    const files = [shot()]
    const onOpenChange = jest.fn()
    const { rerender } = render(
      <MassUploadSheet open onOpenChange={onOpenChange} initialFiles={files} />,
    )
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Continue to Review' }))
    await user.click(screen.getByRole('button', { name: /Start Processing/ }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))

    rerender(<MassUploadSheet open={false} onOpenChange={onOpenChange} initialFiles={files} />)
    await waitFor(() => expect(callsTo('/api/mass-upload/start', 'POST')).toHaveLength(1))
    expect(callsTo('/api/mass-upload/cancel', 'POST')).toHaveLength(0)
  })

  it('leaves a queued session and the sheet opened after that Start began', async () => {
    let finishStart: () => void = () => {}
    let sessions = 0
    const order: string[] = []
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (url === '/api/upload/sessions' && method === 'POST') {
        sessions += 1
        const id = sessions === 1 ? 'ses_first' : 'ses_second'
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'success', session: { id } }),
        })
      }
      if (url === '/api/mass-upload/register' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'success', sourceId: 'src_started' }),
        })
      }
      if (url === '/api/mass-upload/start' && method === 'POST') {
        return new Promise((resolve) => {
          finishStart = () => resolve({
            ok: true,
            json: async () => {
              order.push('start-ok')
              return { status: 'success', queued: 1 }
            },
          })
        })
      }
      if (url === '/api/mass-upload/cancel' && method === 'POST') {
        order.push('cancel')
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'success', cancelled: 0 }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success' }) })
    })

    const files = [shot()]
    const onOpenChange = jest.fn()
    const { rerender } = render(
      <MassUploadSheet open onOpenChange={onOpenChange} initialFiles={files} />,
    )
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Continue to Review' }))
    await user.click(screen.getByRole('button', { name: /Start Processing/ }))
    await waitFor(() => expect(callsTo('/api/mass-upload/start', 'POST')).toHaveLength(1))

    await user.click(screen.getByRole('button', { name: 'Close' }))
    onOpenChange.mockClear()
    rerender(<MassUploadSheet open={false} onOpenChange={onOpenChange} initialFiles={files} />)
    rerender(<MassUploadSheet open onOpenChange={onOpenChange} />)
    await waitFor(() => expect(callsTo('/api/upload/sessions', 'POST')).toHaveLength(2))
    expect(await screen.findByRole('heading', { name: 'Upload screenshots' })).toBeInTheDocument()

    await act(async () => {
      finishStart()
    })
    await waitFor(() => expect(order).toContain('start-ok'))
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(callsTo('/api/mass-upload/cancel', 'POST')).toHaveLength(0)
    expect(screen.getByRole('heading', { name: 'Upload screenshots' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    rerender(<MassUploadSheet open={false} onOpenChange={onOpenChange} />)
    await waitFor(() => expect(callsTo('/api/mass-upload/cancel', 'POST')).toHaveLength(1))
    expect(JSON.parse(String(callsTo('/api/mass-upload/cancel', 'POST')[0][1].body))).toEqual({
      sessionId: 'ses_second',
    })
    expect(JSON.parse(String(callsTo('/api/mass-upload/start', 'POST')[0][1].body))).toEqual({
      sessionId: 'ses_first',
    })
  })
})
