import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddLookRight } from '@/components/inbox/inbox-behaviors'
import { notify } from '@/lib/notify'

const fetchMock = global.fetch as jest.Mock

function json(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })
}

function postedBodies() {
  return fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body)))
}

describe('Add the N that look right', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    ;(notify.success as jest.Mock).mockClear()
    ;(notify.error as jest.Mock).mockClear()
  })

  it('sends the whole list in one request and undoes every place that moved', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `place-${i}`)
    fetchMock.mockResolvedValue(json({
      status: 'success',
      result: { updatedCount: ids.length, updatedIds: ids, placeIds: ids },
    }))
    const user = userEvent.setup()
    render(<AddLookRight label="Add the 51 that look right" placeIds={ids} />)
    await user.click(screen.getByRole('button', { name: 'Add the 51 that look right' }))

    await waitFor(() => expect(notify.success).toHaveBeenCalledWith(
      'Added 51 places to your Library',
      expect.anything(),
    ))
    expect(postedBodies()).toEqual([{ action: 'confirm', placeIds: ids }])
    expect(notify.error).not.toHaveBeenCalled()

    const opts = (notify.success as jest.Mock).mock.calls[0][1]
    fetchMock.mockResolvedValue(json({
      status: 'success',
      result: { updatedCount: ids.length, updatedIds: ids },
    }))
    await opts.cancel.onClick()

    await waitFor(() => expect(postedBodies()).toHaveLength(2))
    expect(postedBodies()[1]).toEqual({ action: 'return-to-inbox', placeIds: ids })
  })

  it('offers Undo for the places that moved when the rest of the list did not', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `place-${i}`)
    const moved = ids.slice(0, 50)
    fetchMock.mockResolvedValue(json({
      status: 'partial_success',
      message: 'Successfully confirmed 50 of 51 places',
      result: { updatedCount: moved.length, updatedIds: moved, placeIds: ids },
    }))
    const user = userEvent.setup()
    render(<AddLookRight label="Add the 51 that look right" placeIds={ids} />)
    await user.click(screen.getByRole('button', { name: 'Add the 51 that look right' }))

    await waitFor(() => expect(notify.success).toHaveBeenCalledWith(
      'Added 50 places to your Library',
      expect.anything(),
    ))
    expect(notify.error).toHaveBeenCalledWith('Successfully confirmed 50 of 51 places')
    expect(postedBodies()).toEqual([{ action: 'confirm', placeIds: ids }])

    const opts = (notify.success as jest.Mock).mock.calls[0][1]
    fetchMock.mockResolvedValue(json({
      status: 'success',
      result: { updatedCount: moved.length, updatedIds: moved },
    }))
    await opts.cancel.onClick()

    await waitFor(() => expect(postedBodies()[1]).toEqual({
      action: 'return-to-inbox',
      placeIds: moved,
    }))
  })

  it('does not offer Undo when nothing moved', async () => {
    const ids = ['place-1', 'place-2']
    fetchMock.mockResolvedValue(json({
      status: 'error',
      message: 'Failed to confirm places',
      result: { updatedCount: 0, updatedIds: [], placeIds: ids },
    }, 500))
    const user = userEvent.setup()
    render(<AddLookRight label="Add the 2 that look right" placeIds={ids} />)
    await user.click(screen.getByRole('button', { name: 'Add the 2 that look right' }))

    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Failed to confirm places'))
    expect(notify.success).not.toHaveBeenCalled()
    expect(postedBodies()).toEqual([{ action: 'confirm', placeIds: ids }])
  })
})
