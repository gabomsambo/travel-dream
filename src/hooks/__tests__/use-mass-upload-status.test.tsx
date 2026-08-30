import { act, renderHook, waitFor } from '@testing-library/react'

jest.mock('sonner', () => ({ toast: { error: jest.fn() } }))

import { toast } from 'sonner'
import { useMassUploadStatus } from '@/hooks/use-mass-upload-status'

const toastError = toast.error as jest.MockedFunction<typeof toast.error>

describe('useMassUploadStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(global.fetch as jest.Mock).mockReset()
  })

  it('marks the run complete without announcing — the app-shell provider owns that toast', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'success',
        counts: { completed: 3 },
        total: 3,
        placesCreated: 2,
        failedErrors: [],
      }),
    })

    const { result } = renderHook(() => useMassUploadStatus())
    act(() => result.current.startPolling('session-1'))

    await waitFor(() => {
      expect(result.current.isComplete).toBe(true)
    })
    expect(result.current.placesCreated).toBe(2)
    expect(result.current.counts.completed).toBe(3)

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
