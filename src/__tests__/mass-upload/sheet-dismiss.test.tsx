import { render, screen, waitFor } from '@testing-library/react'
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
        order.push('register')
        return new Promise((_resolve, reject) => {
          const fail = () => {
            order.push('register-abort')
            reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
          }
          if (init?.signal?.aborted) {
            fail()
            return
          }
          init?.signal?.addEventListener('abort', fail, { once: true })
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

    await waitFor(() => expect(order).toEqual(['register', 'register-abort', 'cancel']))
    const cancel = callsTo('/api/mass-upload/cancel', 'POST')
    expect(JSON.parse(String(cancel[0][1].body))).toEqual({ sessionId: 'ses_abandon' })
    expect(callsTo('/api/mass-upload/start', 'POST')).toHaveLength(0)
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
})
