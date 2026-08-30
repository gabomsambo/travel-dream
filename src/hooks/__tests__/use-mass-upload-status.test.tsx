import { act, renderHook, waitFor } from '@testing-library/react'

jest.mock('sonner', () => ({ toast: { error: jest.fn() } }))
jest.mock('@/lib/toast-navigate', () => ({ toastWithNavigate: jest.fn() }))

import { toast } from 'sonner'
import { toastWithNavigate } from '@/lib/toast-navigate'
import { useMassUploadStatus } from '@/hooks/use-mass-upload-status'

const toastError = toast.error as jest.MockedFunction<typeof toast.error>
const mockedToastWithNavigate = toastWithNavigate as jest.MockedFunction<typeof toastWithNavigate>

describe('useMassUploadStatus notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(global.fetch as jest.Mock).mockReset()
  })

  it('offers navigation to the library when processing completes', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'success',
          counts: { completed: 3 },
          total: 3,
          placesCreated: 2,
          failedErrors: [],
        }),
      })
      .mockResolvedValueOnce({ ok: true })

    const { result } = renderHook(() => useMassUploadStatus())
    act(() => result.current.startPolling('session-1'))

    await waitFor(() => {
      expect(mockedToastWithNavigate).toHaveBeenCalledWith(
        'Processing complete! 2 places found from 3 screenshots.',
        '/library',
        { actionLabel: 'View library' }
      )
    })

    act(() => result.current.stopPolling())
  })

  it('surfaces a polling error with a stable deduplication id', async () => {
    ;(global.fetch as jest.Mock).mockRejectedValueOnce(new Error('network unavailable'))

    const { result } = renderHook(() => useMassUploadStatus())
    act(() => result.current.startPolling('session-2'))

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        'Could not refresh upload status. Retrying…',
        expect.objectContaining({ id: 'mass-upload-poll-error' })
      )
    })

    expect(result.current.error).toBe('network unavailable')
    act(() => result.current.stopPolling())
  })
})
