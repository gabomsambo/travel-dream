import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { InboxScreen } from '@/components/inbox/inbox-screen'
import { InboxUploadDetail } from '@/components/inbox/inbox-upload-detail'
import { notify } from '@/lib/notify'
import { buildInboxScreen } from '@/lib/inbox-page-model'
import type { InboxUploadBatch, InboxUploadPlace, InboxUploadScreenshot } from '@/types/inbox-uploads'

const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: mockRefresh,
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '',
}))

const NOW = new Date('2026-10-23T15:00:00.000Z')

function place(partial: Pick<InboxUploadPlace, 'id' | 'name' | 'status'>): InboxUploadPlace {
  return { city: null, country: null, sourceIds: [], createdAt: '', ...partial }
}

function shot(partial: Pick<InboxUploadScreenshot, 'sourceId'> & Partial<InboxUploadScreenshot>): InboxUploadScreenshot {
  return {
    name: partial.name ?? partial.sourceId,
    imageUrl: null,
    processingStatus: 'completed',
    outcome: 'places',
    createdPlaceIds: [],
    linkedPlaceIds: [],
    outcomeDerived: false,
    createdAt: '',
    handAdd: null,
    ...partial,
  }
}

function show(upload: InboxUploadBatch) {
  return buildInboxScreen({
    uploads: [upload],
    toReviewPlaceIds: upload.rows.toReview.placeIds,
    addedAnotherWay: [],
    now: NOW,
    uploadId: undefined,
  })
}

function batch(rows: Partial<InboxUploadBatch['rows']>, screenshots: InboxUploadScreenshot[]): InboxUploadBatch {
  return {
    sessionId: 'session_today',
    uploadedAt: '2026-10-23T13:13:00.000Z',
    screenshotCount: screenshots.length,
    dismissedCount: 0,
    placesRead: 0,
    newPlaces: 0,
    outcomeDerived: false,
    screenshots,
    rows: {
      toReview: { placeIds: [], sourceIds: [], places: [], checkCount: 0, lookRightPlaceIds: [] },
      added: { placeIds: [], sourceIds: [], places: [] },
      notAPlace: { placeIds: [], sourceIds: [], places: [] },
      alreadyInLibrary: { placeIds: [], sourceIds: [], places: [] },
      uploadedBefore: { items: [] },
      noPlaceFound: { sourceIds: [] },
      couldNotRead: { sourceIds: [], items: [] },
      stillReading: { sourceIds: [] },
      cancelled: { sourceIds: [] },
      ...rows,
    },
  }
}

beforeEach(() => {
  (global.fetch as jest.Mock).mockReset()
  ;(notify.success as jest.Mock).mockClear()
  ;(notify.error as jest.Mock).mockClear()
})

describe('inbox try again and dismiss', () => {
  const empty = shot({
    sourceId: 'src_empty',
    name: 'IMG_3024.jpg',
    outcome: 'noPlaceFound',
    handAdd: {
      name: 'Tea Terrace',
      kind: 'cafe',
      city: 'Istanbul',
      country: 'Turkey',
      admin: null,
      description: 'Tea on a terrace',
    },
  })
  const failed = shot({
    sourceId: 'src_fail',
    name: 'IMG_3017.jpg',
    outcome: 'couldNotRead',
    processingStatus: 'failed',
    imageUrl: 'https://store.public.blob.vercel-storage.com/img_3017.jpg',
  })

  function renderCard() {
    render(<InboxScreen model={show(batch({
      noPlaceFound: { sourceIds: ['src_empty'] },
      couldNotRead: {
        sourceIds: ['src_fail'],
        items: [{ sourceId: 'src_fail', status: 'failed', error: 'the reader got confused', attempts: 3 }],
      },
    }, [empty, failed]))} />)
  }

  it('opens the couldn\'t-read sheet and confirms a retry with undo', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', sourceIds: ['src_fail'] }),
    })
    renderCard()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    const dialog = await screen.findByRole('dialog', { name: /couldn't read this one/i })
    expect(within(dialog).getByText(/We tried 3 times/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Still trying/)).toBeInTheDocument()
    expect(within(dialog).getByText(/retries on its own/)).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: /One more read/ }))
    await waitFor(() => {
      expect(notify.success).toHaveBeenCalledWith(
        'Queued IMG_3017.jpg for another read.',
        expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) })
      )
    })
    expect(global.fetch).toHaveBeenCalledWith('/api/mass-upload/retry', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ sourceIds: ['src_fail'] }),
    }))

    const queued = (notify.success as jest.Mock).mock.calls.find((call) => String(call[0]).startsWith('Queued'))
    queued?.[1]?.action.onClick()
    await waitFor(() => {
      expect(notify.success).toHaveBeenCalledWith('Put IMG_3017.jpg back.')
    })
    expect(global.fetch).toHaveBeenCalledWith('/api/mass-upload/retry', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ sourceIds: ['src_fail'], undo: true }),
    }))
  })

  it('names and undoes only the screenshots the server requeued', async () => {
    const failedA = shot({
      sourceId: 'src_fail_a',
      name: 'IMG_a.jpg',
      outcome: 'couldNotRead',
      processingStatus: 'failed',
    })
    const failedB = shot({
      sourceId: 'src_fail_b',
      name: 'IMG_b.jpg',
      outcome: 'couldNotRead',
      processingStatus: 'failed',
    })
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', sourceIds: ['src_fail_b'] }),
    })
    render(<InboxScreen model={show(batch({
      couldNotRead: {
        sourceIds: ['src_fail_a', 'src_fail_b'],
        items: [
          { sourceId: 'src_fail_a', status: 'failed', error: 'confused', attempts: 2 },
          { sourceId: 'src_fail_b', status: 'failed', error: 'confused', attempts: 2 },
        ],
      },
    }, [failedA, failedB]))} />)

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    const dialog = await screen.findByRole('dialog', { name: /couldn't read these/i })
    fireEvent.click(within(dialog).getByRole('button', { name: /One more read/ }))
    await waitFor(() => {
      expect(notify.success).toHaveBeenCalledWith(
        'Queued IMG_b.jpg for another read.',
        expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) })
      )
    })
    expect(notify.success).not.toHaveBeenCalledWith(
      'Queued 2 screenshots for another read.',
      expect.anything()
    )
    expect(global.fetch).toHaveBeenCalledWith('/api/mass-upload/retry', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ sourceIds: ['src_fail_a', 'src_fail_b'] }),
    }))

    const queued = (notify.success as jest.Mock).mock.calls.find((call) => String(call[0]).startsWith('Queued'))
    queued?.[1]?.action.onClick()
    await waitFor(() => {
      expect(notify.success).toHaveBeenCalledWith('Put IMG_b.jpg back.')
    })
    expect(global.fetch).toHaveBeenCalledWith('/api/mass-upload/retry', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ sourceIds: ['src_fail_b'], undo: true }),
    }))
    expect(global.fetch).not.toHaveBeenCalledWith('/api/mass-upload/retry', expect.objectContaining({
      body: JSON.stringify({ sourceIds: ['src_fail_a', 'src_fail_b'], undo: true }),
    }))
  })

  it('says processing already started when undo can no longer put the screenshot back', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'success', sourceIds: ['src_fail'] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ status: 'error', message: 'Processing already started.' }),
      })
    renderCard()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    const dialog = await screen.findByRole('dialog', { name: /couldn't read this one/i })
    fireEvent.click(within(dialog).getByRole('button', { name: /One more read/ }))
    await waitFor(() => {
      expect(notify.success).toHaveBeenCalledWith(
        'Queued IMG_3017.jpg for another read.',
        expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) })
      )
    })

    const queued = (notify.success as jest.Mock).mock.calls.find((call) => String(call[0]).startsWith('Queued'))
    queued?.[1]?.action.onClick()
    await waitFor(() => {
      expect(notify.error).toHaveBeenCalledWith('Processing already started.')
    })
    expect(notify.success).not.toHaveBeenCalledWith('Put IMG_3017.jpg back.')
  })

  it('names and undoes only the screenshots this dismiss hid', async () => {
    const emptyA = shot({ sourceId: 'src_empty_a', name: 'terrace.jpg', outcome: 'noPlaceFound' })
    const emptyB = shot({ sourceId: 'src_empty_b', name: 'harbor.jpg', outcome: 'noPlaceFound' })
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', sourceIds: ['src_empty_b'], dismissed: true }),
    })
    render(<InboxScreen model={show(batch({
      noPlaceFound: { sourceIds: ['src_empty_a', 'src_empty_b'] },
    }, [emptyA, emptyB]))} />)

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => {
      expect(notify.success).toHaveBeenCalledWith(
        'Dismissed harbor.jpg. The screenshot is kept.',
        expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) })
      )
    })
    expect(notify.success).not.toHaveBeenCalledWith(
      'Dismissed 2 screenshots. The files are kept.',
      expect.anything()
    )
    expect(global.fetch).toHaveBeenCalledWith('/api/inbox/dismiss', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ sourceIds: ['src_empty_a', 'src_empty_b'], dismissed: true }),
    }))

    const hidden = (notify.success as jest.Mock).mock.calls.find((call) => String(call[0]).startsWith('Dismissed'))
    hidden?.[1]?.action.onClick()
    await waitFor(() => {
      expect(notify.success).toHaveBeenCalledWith('Put harbor.jpg back.')
    })
    expect(global.fetch).toHaveBeenCalledWith('/api/inbox/dismiss', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ sourceIds: ['src_empty_b'], dismissed: false }),
    }))
    expect(global.fetch).not.toHaveBeenCalledWith('/api/inbox/dismiss', expect.objectContaining({
      body: JSON.stringify({ sourceIds: ['src_empty_a', 'src_empty_b'], dismissed: false }),
    }))
  })

  it('dismisses a no-place screenshot and offers undo', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', sourceIds: ['src_empty'], dismissed: true }),
    })
    renderCard()

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => {
      expect(notify.success).toHaveBeenCalledWith(
        'Dismissed IMG_3024.jpg. The screenshot is kept.',
        expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) })
      )
    })
    expect(global.fetch).toHaveBeenCalledWith('/api/inbox/dismiss', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ sourceIds: ['src_empty'], dismissed: true }),
    }))
  })

  it('opens add-by-hand prefilled from the cached read', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ places: [] }),
    })
    renderCard()

    fireEvent.click(screen.getByRole('button', { name: 'Add by hand' }))
    const dialog = await screen.findByRole('dialog', { name: /add new place/i })
    expect(within(dialog).getByText(/From IMG_3024.jpg/)).toBeInTheDocument()
    expect(await within(dialog).findByDisplayValue('Tea Terrace')).toBeInTheDocument()
    expect(await within(dialog).findByDisplayValue('Tea on a terrace')).toBeInTheDocument()
    expect(within(dialog).getByText('Istanbul, Turkey')).toBeInTheDocument()
  })

  it('uses the screenshot error when a failed read never counted an attempt', async () => {
    const clockedOut = shot({
      sourceId: 'src_clock',
      name: 'IMG_clock.jpg',
      outcome: 'couldNotRead',
      processingStatus: 'failed',
    })
    render(<InboxScreen model={show(batch({
      couldNotRead: {
        sourceIds: ['src_clock'],
        items: [{
          sourceId: 'src_clock',
          status: 'failed',
          error: 'AI service was unavailable after multiple attempts',
          attempts: 0,
        }],
      },
    }, [clockedOut]))} />)

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    const dialog = await screen.findByRole('dialog', { name: /couldn't read this one/i })
    expect(within(dialog).getByText(/AI service was unavailable after multiple attempts/)).toBeInTheDocument()
    expect(within(dialog).queryByText(/didn't make sense/)).not.toBeInTheDocument()
  })

  it('uses each error when every screenshot in the sheet has no counted attempts', async () => {
    const first = shot({
      sourceId: 'src_clock_a',
      name: 'IMG_a.jpg',
      outcome: 'couldNotRead',
      processingStatus: 'failed',
    })
    const second = shot({
      sourceId: 'src_clock_b',
      name: 'IMG_b.jpg',
      outcome: 'couldNotRead',
      processingStatus: 'failed',
    })
    render(<InboxScreen model={show(batch({
      couldNotRead: {
        sourceIds: ['src_clock_a', 'src_clock_b'],
        items: [
          { sourceId: 'src_clock_a', status: 'failed', error: 'AI service was unavailable after multiple attempts', attempts: 0 },
          { sourceId: 'src_clock_b', status: 'failed', error: 'Processing timed out after multiple attempts', attempts: 0 },
        ],
      },
    }, [first, second]))} />)

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    const dialog = await screen.findByRole('dialog', { name: /couldn't read these/i })
    expect(within(dialog).getByText(/AI service was unavailable after multiple attempts/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Processing timed out after multiple attempts/)).toBeInTheDocument()
    expect(within(dialog).queryByText(/didn't make sense/)).not.toBeInTheDocument()
  })

  it('leaves a stalled screenshot as still trying, with no try again', () => {
    const stalled = shot({
      sourceId: 'src_stalled',
      name: 'IMG_hold.jpg',
      outcome: 'couldNotRead',
      processingStatus: 'stalled',
    })
    render(<InboxScreen model={show(batch({
      couldNotRead: {
        sourceIds: ['src_stalled'],
        items: [{ sourceId: 'src_stalled', status: 'stalled', error: 'hold', attempts: 0 }],
      },
    }, [stalled]))} />)

    expect(screen.getByText('still trying')).toBeInTheDocument()
    expect(screen.getByText(/retries on its own/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('keeps refreshing the inbox while a screenshot is still trying', () => {
    const stalled = shot({
      sourceId: 'src_stalled',
      name: 'IMG_hold.jpg',
      outcome: 'couldNotRead',
      processingStatus: 'stalled',
    })
    const upload = batch({
      couldNotRead: {
        sourceIds: ['src_stalled'],
        items: [{ sourceId: 'src_stalled', status: 'stalled', error: 'hold', attempts: 0 }],
      },
    }, [stalled])
    jest.useFakeTimers()
    try {
      mockRefresh.mockClear()
      const home = show(upload)
      expect(home.live).toBe(true)
      const homeView = render(<InboxScreen model={home} />)
      jest.advanceTimersByTime(5000)
      expect(mockRefresh).toHaveBeenCalled()
      homeView.unmount()
      mockRefresh.mockClear()

      const detail = buildInboxScreen({
        uploads: [upload],
        toReviewPlaceIds: [],
        addedAnotherWay: [],
        now: NOW,
        uploadId: upload.sessionId,
      })
      expect(detail.live).toBe(true)
      const detailView = render(<InboxScreen model={detail} />)
      jest.advanceTimersByTime(5000)
      expect(mockRefresh).toHaveBeenCalled()
      detailView.unmount()
      mockRefresh.mockClear()

      const failed = shot({
        sourceId: 'src_fail_done',
        name: 'IMG_done.jpg',
        outcome: 'couldNotRead',
        processingStatus: 'failed',
      })
      const settled = show(batch({
        couldNotRead: {
          sourceIds: ['src_fail_done'],
          items: [{ sourceId: 'src_fail_done', status: 'failed', error: 'the reader got confused', attempts: 3 }],
        },
      }, [failed]))
      expect(settled.live).toBe(false)
      render(<InboxScreen model={settled} />)
      jest.advanceTimersByTime(5000)
      expect(mockRefresh).not.toHaveBeenCalled()
    } finally {
      jest.useRealTimers()
    }
  })

  it('counts dismissed screenshots on a finished upload without a row for them', () => {
    const saved = place({ id: 'p1', name: 'Plaza', status: 'library' })
    render(<InboxScreen model={show({
      ...batch({
        added: { placeIds: ['p1'], sourceIds: ['src_saved'], places: [saved] },
      }, [shot({ sourceId: 'src_saved', name: 'saved.jpg', createdPlaceIds: ['p1'] })]),
      dismissedCount: 2,
      screenshotCount: 3,
    })} />)

    expect(screen.getByText(/2 dismissed/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument()
  })

  it('names add-by-hand the same way for couldn\'t-read and no-place screenshots', async () => {
    const failedA = shot({
      sourceId: 'src_fail_a',
      name: 'IMG_a.jpg',
      outcome: 'couldNotRead',
      processingStatus: 'failed',
    })
    const failedB = shot({
      sourceId: 'src_fail_b',
      name: 'IMG_b.jpg',
      outcome: 'couldNotRead',
      processingStatus: 'failed',
    })
    const { unmount } = render(<InboxScreen model={show(batch({
      couldNotRead: {
        sourceIds: ['src_fail_a', 'src_fail_b'],
        items: [
          { sourceId: 'src_fail_a', status: 'failed', error: 'confused', attempts: 2 },
          { sourceId: 'src_fail_b', status: 'failed', error: 'confused', attempts: 2 },
        ],
      },
    }, [failedA, failedB]))} />)

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    const sheet = await screen.findByRole('dialog', { name: /couldn't read these/i })
    fireEvent.click(within(sheet).getByRole('button', { name: /Add the place by hand/ }))
    const fromFailed = await screen.findByRole('dialog', { name: 'Add the place by hand' })
    expect(within(fromFailed).getByText('Pick the screenshot to add by hand.')).toBeInTheDocument()
    expect(within(fromFailed).getByText('IMG_a.jpg')).toBeInTheDocument()
    expect(within(fromFailed).getByText('IMG_b.jpg')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'No place found' })).not.toBeInTheDocument()
    unmount()

    const emptyA = shot({ sourceId: 'src_empty_a', name: 'terrace.jpg', outcome: 'noPlaceFound' })
    const emptyB = shot({ sourceId: 'src_empty_b', name: 'harbor.jpg', outcome: 'noPlaceFound' })
    render(<InboxScreen model={show(batch({
      noPlaceFound: { sourceIds: ['src_empty_a', 'src_empty_b'] },
    }, [emptyA, emptyB]))} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add by hand' }))
    const fromEmpty = await screen.findByRole('dialog', { name: 'Add the place by hand' })
    expect(within(fromEmpty).getByText('Pick the screenshot to add by hand.')).toBeInTheDocument()
    expect(within(fromEmpty).getByText('terrace.jpg')).toBeInTheDocument()
    expect(within(fromEmpty).getByText('harbor.jpg')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'No place found' })).not.toBeInTheDocument()
  })

  it('says the screenshots were dismissed when that is the whole upload', () => {
    function detail(count: number) {
      return buildInboxScreen({
        uploads: [{
          ...batch({}, []),
          dismissedCount: count,
          screenshotCount: count,
        }],
        toReviewPlaceIds: [],
        addedAnotherWay: [],
        now: NOW,
        uploadId: 'session_today',
      })
    }

    const { unmount } = render(<InboxScreen model={detail(1)} />)
    expect(screen.getByText('1 screenshot · 1 dismissed')).toBeInTheDocument()
    expect(screen.getByText('1 screenshot was dismissed.')).toBeInTheDocument()
    expect(screen.queryByText('No screenshots in this filter.')).not.toBeInTheDocument()
    unmount()

    render(<InboxScreen model={detail(2)} />)
    expect(screen.getByText('2 screenshots · 2 dismissed')).toBeInTheDocument()
    expect(screen.getByText('2 screenshots were dismissed.')).toBeInTheDocument()
    expect(screen.queryByText('No screenshots in this filter.')).not.toBeInTheDocument()
  })

  it('still says a filter excluded screenshots when a chip matches none', () => {
    render(
      <InboxUploadDetail
        chips={[
          { id: 'all', label: 'All 1', count: 1 },
          { id: 'new', label: 'Found new places 0', count: 0 },
        ]}
        rows={[{
          id: 'src',
          kind: 'added',
          kinds: ['added'],
          imageUrl: null,
          alt: 'saved.jpg',
          title: 'Plaza',
          line: '1 place added',
          places: [],
          actions: [],
        }]}
        dismissedCount={0}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Found new places 0' }))
    expect(screen.getByText('No screenshots in this filter.')).toBeInTheDocument()
    expect(screen.queryByText(/was dismissed/)).not.toBeInTheDocument()
  })
})
