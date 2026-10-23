/**
 * Processing and completion screens retired with the Mass Upload page.
 * A stalled screenshot is still distinct from a failed one on the Inbox card
 * ("still trying" versus "couldn't be read"); this file only guards that the
 * drop sheet does not bring those screens back.
 */
import { render, screen } from '@testing-library/react'

jest.mock('@vercel/blob/client', () => ({ upload: jest.fn() }))

import { MassUploadSheet } from '@/components/mass-upload/mass-upload-page'

describe('upload drop sheet', () => {
  beforeEach(() => {
    ;(global.fetch as jest.Mock).mockReset()
    ;(global.fetch as jest.Mock).mockImplementation((url: string, init?: RequestInit) => {
      if (String(url) === '/api/upload/sessions' && (init?.method || 'GET') === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'success', session: { id: 'ses_new' } }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', sessions: [] }) })
    })
  })

  it('opens the drop sheet and does not resume a processing or complete screen', async () => {
    render(<MassUploadSheet open onOpenChange={() => {}} />)
    expect(await screen.findByRole('heading', { name: 'Upload screenshots' })).toBeInTheDocument()
    expect(screen.queryByText('Processing Complete!')).not.toBeInTheDocument()
    expect(screen.queryByText(/needs retry/i)).not.toBeInTheDocument()
  })
})
