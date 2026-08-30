jest.unmock('@/lib/notify')

import { toast } from 'sonner'
import { NOTIFY_DURATION, notify } from '@/lib/notify'

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    loading: jest.fn(),
    dismiss: jest.fn(),
  },
}))

describe('notify facade', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('applies standard success duration', () => {
    notify.success('Saved')
    expect(toast.success).toHaveBeenCalledWith('Saved', { duration: NOTIFY_DURATION.success })
  })

  it('applies persistent error duration with close button', () => {
    notify.errorPersistent('Failed permanently')
    expect(toast.error).toHaveBeenCalledWith('Failed permanently', {
      duration: NOTIFY_DURATION.persistent,
      closeButton: true,
    })
  })
})
