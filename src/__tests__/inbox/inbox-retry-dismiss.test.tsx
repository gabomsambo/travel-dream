import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { InboxScreen } from '@/components/inbox/inbox-screen'
import { notify } from '@/lib/notify'
import { buildInboxScreen } from '@/lib/inbox-page-model'
import type { InboxUploadBatch, InboxUploadPlace, InboxUploadScreenshot } from '@/types/inbox-uploads'

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
      toReview: { placeIds: [], sourceIds: [], places: [], checkCount: null },
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

  it('opens the couldn\'t-read sheet and confirms a retry with no undo', async () => {
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
      expect(notify.success).toHaveBeenCalledWith('Queued IMG_3017.jpg for another read.')
    })
    expect(global.fetch).toHaveBeenCalledWith('/api/mass-upload/retry', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ sourceIds: ['src_fail'] }),
    }))
    const queued = (notify.success as jest.Mock).mock.calls.find((call) => String(call[0]).startsWith('Queued'))
    expect(queued?.[1]?.action).toBeUndefined()
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
})
