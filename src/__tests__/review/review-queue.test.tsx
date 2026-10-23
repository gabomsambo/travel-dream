import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReviewQueue } from '@/components/review/review-queue'
import { notify } from '@/lib/notify'
import type { ReviewPostcard, ReviewQueueEntry } from '@/lib/review-queue'
import type { PlaceWithRelations, Source } from '@/types/database'

const mockPush = jest.fn()
const mockRefresh = jest.fn()
const mockReplace = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh, replace: mockReplace }),
}))
jest.mock('@/components/places/place-view/place-view', () => {
  const React = require('react') as typeof import('react')
  return {
    PlaceView: ({
      place,
      editing,
      softCover,
      onArchive,
      onDeleted,
      onRestored,
      onOpenClassic,
      onEdit,
    }: {
      place: PlaceWithRelations
      editing?: boolean
      softCover?: boolean
      onArchive?: () => void
      onDeleted?: () => void
      onRestored?: () => void
      onOpenClassic?: () => void
      onEdit?: () => void
    }) => {
      const mountedId = React.useRef(place.id)
      return (
        <div
          data-testid="postcard"
          data-status={place.status}
          data-mounted-id={mountedId.current}
          data-editing={editing ? 'yes' : 'no'}
          data-soft-cover={softCover ? 'yes' : 'no'}
        >
          {place.name}
          <button type="button" onClick={() => onEdit?.()}>Edit postcard</button>
          <button type="button" onClick={() => onArchive?.()}>Archive from postcard</button>
          <button type="button" onClick={() => onDeleted?.()}>Deleted from postcard</button>
          <button type="button" onClick={() => onRestored?.()}>Restore from postcard</button>
          <button type="button" onClick={() => onOpenClassic?.()}>Open classic editor</button>
        </div>
      )
    },
  }
})
jest.mock('@/lib/notify', () => ({
  notify: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    loading: jest.fn(),
    dismiss: jest.fn(),
  },
}))

const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>
const notifySuccess = notify.success as jest.MockedFunction<typeof notify.success>
const notifyError = notify.error as jest.MockedFunction<typeof notify.error>

function source(id: string): Source {
  return {
    id,
    userId: 'user_review',
    type: 'screenshot',
    uri: `https://example.test/${id}.jpg`,
    hash: null,
    ocrText: null,
    lang: 'en',
    meta: { uploadInfo: { originalName: `${id}.jpg` } },
    createdAt: '2026-10-18T12:00:00.000Z',
    updatedAt: '2026-10-18T12:00:00.000Z',
    processingStatus: 'completed',
    processingAttempts: 0,
    processingInterruptions: 0,
    processingError: null,
    processingStartedAt: null,
    processingLeaseId: null,
    nextAttemptAt: null,
  }
}

function place(id: string, name: string, src: Source): PlaceWithRelations {
  return {
    id,
    userId: 'user_review',
    name,
    kind: 'cafe',
    city: 'London',
    country: 'United Kingdom',
    admin: null,
    coords: null,
    address: null,
    googlePlaceId: null,
    altNames: [],
    description: null,
    tags: [],
    vibes: [],
    ratingSelf: 0,
    notes: null,
    status: 'inbox',
    confidence: 0.9,
    price_level: null,
    best_time: null,
    activities: null,
    cuisine: null,
    amenities: null,
    createdAt: '2026-10-18T12:00:01.000Z',
    updatedAt: '2026-10-18T12:00:01.000Z',
    archivedAt: null,
    website: null,
    phone: null,
    email: null,
    hours: null,
    visitStatus: 'not_visited',
    priority: 0,
    lastVisited: null,
    plannedVisit: null,
    recommendedBy: null,
    companions: null,
    practicalInfo: null,
    attachments: [],
    links: [],
    reservations: [],
    sources: [src],
    collections: [],
  }
}

function entryFrom(row: PlaceWithRelations, src: Source): ReviewQueueEntry {
  return {
    placeId: row.id,
    name: row.name,
    createdAt: row.createdAt,
    userId: row.userId,
    sourceId: src.id,
    screenshotUrl: src.uri,
    screenshotName: `${src.id}.jpg`,
    screenshotCreatedAt: src.createdAt,
    uploadLabel: `${src.id}.jpg`,
    kind: row.kind,
    city: row.city,
    quote: row.description,
    hasPin: Boolean(row.coords && !(row.coords.lat === 0 && row.coords.lon === 0)),
  }
}

function postcardFor(row: PlaceWithRelations): ReviewPostcard {
  return { place: row, alsoIn: [], screenshot: null }
}

const firstSource = source('one')
const secondSource = source('two')
const placeOne = place('plc_one', 'One Cafe', firstSource)
const placeTwo = place('plc_two', 'Two Cafe', secondSource)
const entries: ReviewQueueEntry[] = [
  entryFrom(placeOne, firstSource),
  entryFrom(placeTwo, secondSource),
]
const placesById = new Map([
  [placeOne.id, placeOne],
  [placeTwo.id, placeTwo],
])

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function patchCalls() {
  return fetchMock.mock.calls.filter((call) => (call[1] as { method?: string } | undefined)?.method === 'PATCH')
}

function renderQueue(override: Partial<React.ComponentProps<typeof ReviewQueue>> = {}) {
  return render(
    <ReviewQueue
      entries={entries}
      postcard={postcardFor(placeOne)}
      trips={[]}
      {...override}
    />
  )
}

describe('ReviewQueue decisions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.startsWith('/api/review/postcard/')) {
        const id = decodeURIComponent(url.slice('/api/review/postcard/'.length))
        const row = placesById.get(id)
        if (!row) return jsonResponse({ message: 'Place not found' }, 404)
        return jsonResponse(postcardFor(row))
      }
      return jsonResponse({ status: 'success' })
    })
    window.history.replaceState({}, '', '/review')
  })

  it('shows a failed postcard in the place pane instead of leaving the spinner', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.startsWith('/api/review/postcard/')) {
        return jsonResponse({ message: 'Place exploded' }, 500)
      }
      return jsonResponse({ status: 'success' })
    })
    renderQueue()

    fireEvent.keyDown(window, { key: 's' })

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Place exploded'))
    expect(screen.queryByLabelText('Loading place')).not.toBeInTheDocument()
    expect(screen.queryByTestId('postcard')).not.toBeInTheDocument()
    const postcardGets = fetchMock.mock.calls.filter((call) => String(call[0]).startsWith('/api/review/postcard/'))
    expect(postcardGets).toHaveLength(1)
  })

  it('opens the classic editor for the card on screen', async () => {
    const user = userEvent.setup()
    renderQueue()

    await user.click(screen.getByRole('button', { name: 'Open classic editor' }))

    expect(mockPush).toHaveBeenCalledWith('/place/plc_one?editor=classic')
  })

  it('adds, advances, and offers an Undo that restores Inbox and the original card', async () => {
    const user = userEvent.setup()
    window.history.replaceState({ __NA: true }, '', '/review?placeId=plc_one')
    const replaceSpy = jest.spyOn(window.history, 'replaceState')
    renderQueue()

    expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe')
    await user.click(screen.getAllByRole('button', { name: /Add to Library/i })[0])

    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    expect(patchCalls()[0]?.[0]).toBe('/api/places/plc_one')
    expect(patchCalls()[0]?.[1]).toEqual(expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ status: 'library' }),
    }))
    expect(replaceSpy).toHaveBeenCalledWith({}, '', '/review?placeId=plc_two&from=queue')
    expect(replaceSpy.mock.calls.some((call) => (call[0] as { __NA?: boolean } | null)?.__NA)).toBe(false)

    await waitFor(() => expect(notifySuccess).toHaveBeenCalled())
    const toastOptions = notifySuccess.mock.calls[0][1]
    const cancel = toastOptions?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined
    const undo = cancel?.onClick
    expect(undo).toBeInstanceOf(Function)
    await act(async () => { undo?.({} as React.MouseEvent<HTMLButtonElement>) })

    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe'))
    expect(patchCalls().at(-1)?.[1]).toEqual(expect.objectContaining({
      body: JSON.stringify({ status: 'inbox' }),
    }))
    expect(notifySuccess).toHaveBeenLastCalledWith(expect.stringContaining('Inbox'))
    replaceSpy.mockRestore()
  })

  it('keeps the session when a refresh drops places that already left the inbox', async () => {
    const user = userEvent.setup()
    const view = renderQueue({ initialPlaceId: 'plc_one' })

    await user.click(screen.getAllByRole('button', { name: /Add to Library/i })[0])
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))

    const refreshed = { ...placeTwo, name: 'Two Cafe Planned' }
    view.rerender(
      <ReviewQueue
        entries={[entries[1]]}
        postcard={postcardFor(refreshed)}
        trips={[]}
        initialPlaceId="plc_one"
      />
    )

    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe Planned'))
    expect(screen.queryByText("That's everything.")).not.toBeInTheDocument()

    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(screen.getByText("That's everything.")).toBeInTheDocument())
    expect(screen.getByText('added to Library').previousElementSibling).toHaveTextContent('1')
  })

  it('uses keyboard decisions, never confirms archive, and summarizes skipped places', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false)
    renderQueue()

    fireEvent.keyDown(window, { key: 'n' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(patchCalls()[0]?.[1]).toEqual(expect.objectContaining({
      body: JSON.stringify({ status: 'archived' }),
    }))

    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(screen.getByText("That's everything.")).toBeInTheDocument())
    expect(screen.getAllByText('1', { selector: 'strong' })).toHaveLength(2)
    expect(screen.getByText('Two Cafe')).toBeInTheDocument()
    expect(patchCalls()).toHaveLength(1)
    confirmSpy.mockRestore()
  })

  it('walks every skipped place when review resumes', async () => {
    const user = userEvent.setup()
    renderQueue()

    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(screen.getByText("That's everything.")).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /Review the skipped/i }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe'))

    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    expect(screen.queryByText("That's everything.")).not.toBeInTheDocument()
  })

  it('says Library when Undo puts an added place back in the Library', async () => {
    const user = userEvent.setup()
    renderQueue()

    await user.click(screen.getAllByRole('button', { name: /Add to Library/i })[0])
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    await user.click(screen.getByRole('button', { name: /Previous/i }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe'))

    await user.click(screen.getAllByRole('button', { name: /Not a place/i })[0])
    await waitFor(() => expect(notifySuccess.mock.calls.some((call) => String(call[0]).includes('Archive'))).toBe(true))
    const archiveToast = notifySuccess.mock.calls.find((call) => String(call[0]).includes('Archive'))
    const undo = (archiveToast?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
    await act(async () => { undo?.({} as React.MouseEvent<HTMLButtonElement>) })

    await waitFor(() => expect(notifySuccess).toHaveBeenLastCalledWith(expect.stringContaining('Library')))
    expect(patchCalls().at(-1)?.[1]).toEqual(expect.objectContaining({
      body: JSON.stringify({ status: 'library' }),
    }))
    expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe')
    expect(screen.getByTestId('postcard')).toHaveAttribute('data-status', 'library')
  })

  it('keeps letter shortcuts working after a mouse click leaves focus on a button', async () => {
    const user = userEvent.setup()
    renderQueue()

    const skipButton = screen.getAllByRole('button', { name: /Skip for now/i })[0]
    await user.click(skipButton)
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    skipButton.focus()

    fireEvent.keyDown(skipButton, { key: 'n' })
    await waitFor(() => expect(patchCalls().some((call) =>
      call[0] === '/api/places/plc_two' &&
      (call[1] as { body?: string }).body === JSON.stringify({ status: 'archived' })
    )).toBe(true))
    const patchesBeforeEnter = patchCalls().length

    // Enter on a focused button is the button's own click, not a second "Add".
    fireEvent.keyDown(skipButton, { key: 'Enter' })
    expect(patchCalls()).toHaveLength(patchesBeforeEnter)
  })

  it('ignores review shortcuts while a confirmation dialog or menu is open', () => {
    renderQueue()
    const patchesBefore = () => patchCalls().length

    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'alertdialog')
    const confirm = document.createElement('button')
    confirm.textContent = 'Delete place'
    dialog.append(confirm)
    document.body.append(dialog)

    fireEvent.keyDown(confirm, { key: 'n' })
    expect(patchesBefore()).toBe(0)

    const menu = document.createElement('div')
    menu.setAttribute('role', 'menu')
    const item = document.createElement('button')
    item.textContent = 'Rename'
    menu.append(item)
    document.body.append(menu)
    fireEvent.keyDown(item, { key: 'n' })
    expect(patchesBefore()).toBe(0)

    const add = screen.getAllByRole('button', { name: /Add to Library/i })[0]
    add.addEventListener('keydown', (event) => event.preventDefault())
    fireEvent.keyDown(add, { key: 'n' })
    expect(patchesBefore()).toBe(0)

    dialog.remove()
    menu.remove()
  })

  it('mounts a fresh postcard once the next place is already cached', async () => {
    renderQueue()

    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveAttribute('data-mounted-id', 'plc_one'))

    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    expect(screen.getByTestId('postcard')).toHaveAttribute('data-mounted-id', 'plc_two')
  })

  it('shows the status just written when returning to a cached postcard', async () => {
    const user = userEvent.setup()
    renderQueue()

    await user.click(screen.getAllByRole('button', { name: /Add to Library/i })[0])
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    await user.click(screen.getByRole('button', { name: /Previous/i }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveAttribute('data-status', 'library'))

    await user.click(screen.getAllByRole('button', { name: /Not a place/i })[0])
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    await user.click(screen.getByRole('button', { name: /Previous/i }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveAttribute('data-status', 'archived'))

    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    await user.click(screen.getByRole('button', { name: /Previous/i }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveAttribute('data-status', 'inbox'))
  })

  it('reviews a place that joins the inbox while the last decision is saving', async () => {
    const thirdSource = source('three')
    const placeThree = place('plc_three', 'Three Cafe', thirdSource)
    placesById.set(placeThree.id, placeThree)
    let releasePatch: (() => void) | undefined
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.startsWith('/api/review/postcard/')) {
        const id = decodeURIComponent(url.slice('/api/review/postcard/'.length))
        const row = placesById.get(id)
        if (!row) return jsonResponse({ message: 'Place not found' }, 404)
        return jsonResponse(postcardFor(row))
      }
      if ((init as { method?: string } | undefined)?.method === 'PATCH') {
        await new Promise<void>((resolve) => {
          releasePatch = resolve
        })
      }
      return jsonResponse({ status: 'success' })
    })

    try {
      const view = renderQueue()
      fireEvent.keyDown(window, { key: 's' })
      await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))

      fireEvent.click(screen.getAllByRole('button', { name: /Add to Library/i })[0])
      await waitFor(() => expect(releasePatch).toEqual(expect.any(Function)))

      view.rerender(
        <ReviewQueue
          entries={[...entries, entryFrom(placeThree, thirdSource)]}
          postcard={postcardFor(placeTwo)}
          trips={[]}
        />
      )
      await act(async () => {})

      await act(async () => {
        releasePatch?.()
      })

      await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Three Cafe'))
      expect(screen.queryByText("That's everything.")).not.toBeInTheDocument()
    } finally {
      placesById.delete(placeThree.id)
    }
  })

  it('leaves the loaded review url in place so a refresh stays in the queue', () => {
    window.history.replaceState({ __NA: true }, '', '/review?placeId=plc_one')
    const replaceSpy = jest.spyOn(window.history, 'replaceState')
    const view = renderQueue({ initialPlaceId: 'plc_one' })

    expect(replaceSpy).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
    expect(`${window.location.pathname}${window.location.search}`).toBe('/review?placeId=plc_one')

    view.rerender(
      <ReviewQueue
        entries={[entries[1]]}
        postcard={postcardFor(placeTwo)}
        trips={[]}
        initialPlaceId="plc_one"
      />
    )

    expect(mockReplace).not.toHaveBeenCalled()
    expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe')
    expect(screen.queryByText("That's everything.")).not.toBeInTheDocument()
    replaceSpy.mockRestore()
  })

  it('keeps a status this session wrote when a later postcard still says inbox', async () => {
    const user = userEvent.setup()
    const view = renderQueue()

    await user.click(screen.getAllByRole('button', { name: /Add to Library/i })[0])
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    await user.click(screen.getByRole('button', { name: /Previous/i }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveAttribute('data-status', 'library'))

    view.rerender(
      <ReviewQueue
        entries={[entries[1]]}
        postcard={postcardFor({ ...placeOne, status: 'inbox' })}
        trips={[]}
        initialPlaceId="plc_one"
      />
    )

    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveAttribute('data-status', 'library'))
    expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe')
  })

  it('keeps library when the postcard response arrives after Add', async () => {
    const pending: Array<(response: Response) => void> = []
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.startsWith('/api/review/postcard/')) {
        return await new Promise<Response>((resolve, reject) => {
          const signal = (init as RequestInit | undefined)?.signal
          const fail = () => reject(new DOMException('Aborted', 'AbortError'))
          if (signal?.aborted) {
            fail()
            return
          }
          signal?.addEventListener('abort', fail, { once: true })
          pending.push((response) => {
            signal?.removeEventListener('abort', fail)
            resolve(response)
          })
        })
      }
      return jsonResponse({ status: 'success' })
    })

    renderQueue()
    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(pending).toHaveLength(1))

    fireEvent.click(screen.getAllByRole('button', { name: /Add to Library/i })[0])
    await waitFor(() => expect(screen.getByText("That's everything.")).toBeInTheDocument())

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    await waitFor(() => expect(pending.length).toBeGreaterThan(1))
    await act(async () => {
      pending[pending.length - 1](jsonResponse(postcardFor(placeTwo)))
    })

    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveAttribute('data-status', 'library'))
    expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe')
  })

  it('reviews a place that arrives after the summary is already open', async () => {
    const view = renderQueue({ entries: [entries[0]] })
    fireEvent.click(screen.getAllByRole('button', { name: /Add to Library/i })[0])
    await waitFor(() => expect(screen.getByText("That's everything.")).toBeInTheDocument())

    view.rerender(
      <ReviewQueue
        entries={entries}
        postcard={postcardFor(placeOne)}
        trips={[]}
      />
    )

    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    expect(screen.queryByText("That's everything.")).not.toBeInTheDocument()
  })

  it('sends a deep link that is not in the opening queue to the place page once', async () => {
    const gone = { ...place('plc_gone', 'Gone Cafe', source('gone')), status: 'library' as const }
    const view = renderQueue({
      postcard: postcardFor(gone),
      initialPlaceId: 'plc_gone',
    })

    expect(mockReplace).toHaveBeenCalledTimes(1)
    expect(mockReplace).toHaveBeenCalledWith('/place/plc_gone')
    expect(screen.queryByText('Gone Cafe')).not.toBeInTheDocument()
    expect(screen.queryByText('Screenshot unavailable')).not.toBeInTheDocument()

    const refreshed = { ...placeTwo, name: 'Two Cafe Updated' }
    view.rerender(
      <ReviewQueue
        entries={entries}
        postcard={postcardFor(refreshed)}
        trips={[]}
        initialPlaceId="plc_gone"
      />
    )
    expect(mockReplace).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe Updated'))
    expect(screen.queryByText('Gone Cafe')).not.toBeInTheDocument()
  })

  it('archives from the postcard menu like Not a place, with undo, and stays in the queue', async () => {
    const user = userEvent.setup()
    renderQueue()

    await user.click(screen.getByRole('button', { name: 'Archive from postcard' }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    expect(patchCalls()[0]?.[0]).toBe('/api/places/plc_one')
    expect(patchCalls()[0]?.[1]).toEqual(expect.objectContaining({
      body: JSON.stringify({ status: 'archived' }),
    }))
    expect(notifySuccess).toHaveBeenCalledWith(
      expect.stringContaining('Archive'),
      expect.objectContaining({ cancel: expect.objectContaining({ label: 'Undo' }) }),
    )
    expect(mockPush).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(screen.getByText("That's everything.")).toBeInTheDocument())
    expect(screen.getByText('not a place').previousElementSibling).toHaveTextContent('1')

    const archiveToast = notifySuccess.mock.calls.find((call) => String(call[0]).includes('Archive'))
    const undo = (archiveToast?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
    await act(async () => { undo?.({} as React.MouseEvent<HTMLButtonElement>) })

    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe'))
    expect(screen.getByTestId('postcard')).toHaveAttribute('data-status', 'inbox')
    expect(mockPush).not.toHaveBeenCalled()
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('counts a postcard delete as removed and advances without leaving review', async () => {
    const user = userEvent.setup()
    renderQueue()

    await user.click(screen.getByRole('button', { name: 'Deleted from postcard' }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    expect(patchCalls()).toHaveLength(0)
    expect(mockPush).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(screen.getByText("That's everything.")).toBeInTheDocument())
    expect(screen.getByText('removed').previousElementSibling).toHaveTextContent('1')
    expect(mockPush).not.toHaveBeenCalled()
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('keeps a restored place in the library when a later postcard still says inbox', async () => {
    const user = userEvent.setup()
    const view = renderQueue()

    await user.click(screen.getAllByRole('button', { name: /Not a place/i })[0])
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    await user.click(screen.getByRole('button', { name: /Previous/i }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveAttribute('data-status', 'archived'))

    await user.click(screen.getByRole('button', { name: 'Restore from postcard' }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveAttribute('data-status', 'library'))

    view.rerender(
      <ReviewQueue
        entries={[entries[1]]}
        postcard={postcardFor({ ...placeOne, status: 'inbox' })}
        trips={[]}
        initialPlaceId="plc_one"
      />
    )

    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveAttribute('data-status', 'library'))
    expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe')
    expect(mockReplace).not.toHaveBeenCalled()

    await user.click(screen.getAllByRole('button', { name: /Not a place/i })[0])
    await waitFor(() => expect(notifySuccess.mock.calls.filter((call) => String(call[0]).includes('Archive')).length).toBeGreaterThan(1))
    const archiveToasts = notifySuccess.mock.calls.filter((call) => String(call[0]).includes('Archive'))
    const undo = (archiveToasts.at(-1)?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
    await act(async () => { undo?.({} as React.MouseEvent<HTMLButtonElement>) })

    await waitFor(() => expect(notifySuccess).toHaveBeenLastCalledWith(expect.stringContaining('Library')))
    expect(screen.getByTestId('postcard')).toHaveAttribute('data-status', 'library')
    expect(patchCalls().at(-1)?.[1]).toEqual(expect.objectContaining({
      body: JSON.stringify({ status: 'library' }),
    }))
  })

  it('skips a deleted place on Previous and does not count it as skipped', async () => {
    const user = userEvent.setup()
    renderQueue()

    await user.click(screen.getByRole('button', { name: 'Deleted from postcard' }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    expect(screen.getByRole('button', { name: /Previous/i })).toBeDisabled()

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe')

    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(screen.getByText("That's everything.")).toBeInTheDocument())
    expect(screen.getByText('removed').previousElementSibling).toHaveTextContent('1')
    expect(screen.getByText('skipped for later').previousElementSibling).toHaveTextContent('1')
    expect(screen.queryByRole('button', { name: 'One Cafe' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Two Cafe' })).toBeInTheDocument()
  })

  it('returns from the summary to the earlier place when the last card was deleted', async () => {
    const user = userEvent.setup()
    renderQueue()

    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    await user.click(screen.getByRole('button', { name: 'Deleted from postcard' }))
    await waitFor(() => expect(screen.getByText("That's everything.")).toBeInTheDocument())

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe'))

    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(screen.getByText("That's everything.")).toBeInTheDocument())
    expect(screen.getByText('removed').previousElementSibling).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: 'One Cafe' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Two Cafe' })).not.toBeInTheDocument()
  })

  it('shows a place that joins the inbox while the last card is still being saved', async () => {
    const thirdSource = source('late')
    const placeLate = place('plc_late', 'Late Cafe', thirdSource)
    placesById.set(placeLate.id, placeLate)
    let releasePatch: (() => void) | undefined
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.startsWith('/api/review/postcard/')) {
        const id = decodeURIComponent(url.slice('/api/review/postcard/'.length))
        const row = placesById.get(id)
        if (!row) return jsonResponse({ message: 'Place not found' }, 404)
        return jsonResponse(postcardFor(row))
      }
      if ((init as { method?: string } | undefined)?.method === 'PATCH') {
        await new Promise<void>((resolve) => {
          releasePatch = resolve
        })
      }
      return jsonResponse({ status: 'success' })
    })

    try {
      const view = renderQueue({ entries: [entries[0]], postcard: postcardFor(placeOne) })
      fireEvent.click(screen.getAllByRole('button', { name: /Add to Library/i })[0])
      await waitFor(() => expect(releasePatch).toEqual(expect.any(Function)))

      view.rerender(
        <ReviewQueue
          entries={[entries[0], entryFrom(placeLate, thirdSource)]}
          postcard={postcardFor(placeOne)}
          trips={[]}
        />
      )

      await act(async () => {
        releasePatch?.()
      })

      await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Late Cafe'))
      expect(screen.queryByText("That's everything.")).not.toBeInTheDocument()
    } finally {
      placesById.delete(placeLate.id)
    }
  })

  it('keeps an undone place out of the summary when a later add finishes after it', async () => {
    let releaseSecond: (() => void) | undefined
    let patches = 0
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.startsWith('/api/review/postcard/')) {
        const id = decodeURIComponent(url.slice('/api/review/postcard/'.length))
        const row = placesById.get(id)
        if (!row) return jsonResponse({ message: 'Place not found' }, 404)
        return jsonResponse(postcardFor(row))
      }
      if ((init as { method?: string } | undefined)?.method === 'PATCH') {
        patches += 1
        if (patches === 2) {
          await new Promise<void>((resolve) => {
            releaseSecond = resolve
          })
        }
      }
      return jsonResponse({ status: 'success' })
    })

    renderQueue()
    fireEvent.click(screen.getAllByRole('button', { name: /Add to Library/i })[0])
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))

    fireEvent.click(screen.getAllByRole('button', { name: /Add to Library/i })[0])
    await waitFor(() => expect(releaseSecond).toEqual(expect.any(Function)))

    const undo = (notifySuccess.mock.calls[0]?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
    await act(async () => {
      undo?.({} as React.MouseEvent<HTMLButtonElement>)
    })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe'))

    await act(async () => {
      releaseSecond?.()
    })

    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe'))
    expect(screen.queryByText("That's everything.")).not.toBeInTheDocument()

    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(screen.getByText("That's everything.")).toBeInTheDocument())
    expect(screen.getByText('added to Library').previousElementSibling).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: 'One Cafe' })).toBeInTheDocument()
  })

  it('fetches a postcard again after leaving the card that failed', async () => {
    let postcardGets = 0
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.startsWith('/api/review/postcard/')) {
        postcardGets += 1
        return jsonResponse({ message: 'Place exploded' }, 500)
      }
      return jsonResponse({ status: 'success' })
    })
    renderQueue()

    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Place exploded'))
    expect(postcardGets).toBe(1)

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe'))

    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Place exploded'))
    expect(postcardGets).toBe(2)
  })

  it('retries a failed postcard without leaving the card', async () => {
    const user = userEvent.setup()
    let postcardGets = 0
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.startsWith('/api/review/postcard/')) {
        postcardGets += 1
        if (postcardGets === 1) return jsonResponse({ message: 'Place exploded' }, 500)
        const id = decodeURIComponent(url.slice('/api/review/postcard/'.length))
        const row = placesById.get(id)
        if (!row) return jsonResponse({ message: 'Place not found' }, 404)
        return jsonResponse(postcardFor(row))
      }
      return jsonResponse({ status: 'success' })
    })
    renderQueue()

    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Place exploded'))

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    expect(postcardGets).toBe(2)
  })

  it('edits the postcard in place and opens places from the same screenshot', async () => {
    const user = userEvent.setup()
    renderQueue({
      postcard: {
        ...postcardFor(placeOne),
        screenshot: {
          sourceId: 'src_one',
          url: firstSource.uri,
          name: 'one.jpg',
          createdAt: '2026-10-18T12:00:00.000Z',
          softCover: true,
          siblings: [
            { placeId: 'plc_one', name: 'One Cafe', status: 'inbox', createdAt: '2026-10-18T12:00:01.000Z' },
            { placeId: 'plc_two', name: 'Two Cafe', status: 'inbox', createdAt: '2026-10-18T12:00:02.000Z' },
            { placeId: 'plc_saved', name: 'Saved Library', status: 'library', createdAt: '2026-10-18T12:00:03.000Z' },
          ],
        },
      },
    })

    expect(screen.getByTestId('postcard')).toHaveAttribute('data-soft-cover', 'yes')
    expect(screen.getByRole('link', { name: /Saved Library/ })).toHaveAttribute('href', '/place/plc_saved')
    expect(screen.getByText(/In this screenshot/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit postcard' }))
    expect(screen.getByTestId('postcard')).toHaveAttribute('data-editing', 'yes')
    expect(mockPush).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'z', repeat: true })
    expect(screen.queryByRole('dialog', { name: 'Screenshot' })).not.toBeInTheDocument()

    const menu = document.createElement('div')
    menu.setAttribute('role', 'menu')
    document.body.appendChild(menu)
    const otherDialog = document.createElement('div')
    otherDialog.setAttribute('role', 'dialog')
    document.body.appendChild(otherDialog)
    const combo = document.createElement('button')
    combo.setAttribute('role', 'combobox')
    document.body.appendChild(combo)
    fireEvent.keyDown(menu, { key: 'z' })
    fireEvent.keyDown(otherDialog, { key: 'z' })
    fireEvent.keyDown(combo, { key: 'z' })
    expect(screen.queryByRole('dialog', { name: 'Screenshot' })).not.toBeInTheDocument()
    menu.remove()
    otherDialog.remove()
    combo.remove()

    fireEvent.keyDown(window, { key: 'z' })
    const shot = screen.getByRole('dialog', { name: 'Screenshot' })
    fireEvent.keyDown(shot, { key: 'z', repeat: true })
    expect(screen.getByRole('dialog', { name: 'Screenshot' })).toBeInTheDocument()
    fireEvent.keyDown(shot, { key: 'z' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Screenshot' })).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /Two Cafe/ }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    expect(screen.getByTestId('postcard')).toHaveAttribute('data-editing', 'no')
  })

  it('counts a scoped upload on its own and keeps that upload in the address', async () => {
    const user = userEvent.setup()
    const replaceSpy = jest.spyOn(window.history, 'replaceState')
    renderQueue({ entries: [entries[0]], uploadSessionId: 'session_newest', initialPlaceId: 'plc_one' })

    expect(screen.getByText('1 of 1 from one.jpg')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: /Add to Library/i })[0])

    await waitFor(() => expect(screen.getByRole('heading', { name: 'This upload is reviewed.' })).toBeInTheDocument())
    expect(screen.getByText('1 new place from this upload is in your Library.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: "That's everything." })).not.toBeInTheDocument()
    expect(screen.queryByText('Your Inbox is sorted for now.')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Inbox' })).toHaveAttribute('href', '/inbox')
    expect(replaceSpy).toHaveBeenCalledWith({}, '', '/review?upload=session_newest')
  })

  it('does not call the inbox sorted when a scoped upload finishes with nothing added', async () => {
    const user = userEvent.setup()
    renderQueue({ entries: [entries[0]], uploadSessionId: 'session_newest', initialPlaceId: 'plc_one' })

    await user.click(screen.getAllByRole('button', { name: /Not a place/i })[0])

    await waitFor(() => expect(screen.getByRole('heading', { name: 'This upload is reviewed.' })).toBeInTheDocument())
    expect(screen.getByText('Nothing else from this upload is waiting.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: "That's everything." })).not.toBeInTheDocument()
    expect(screen.queryByText('Your Inbox is sorted for now.')).not.toBeInTheDocument()
    expect(screen.queryByText(/Every place from your screenshots has a home/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Inbox' })).toHaveAttribute('href', '/inbox')
  })

  it('does not say a scoped upload has nothing waiting when the finish was a skip', async () => {
    const user = userEvent.setup()
    renderQueue({ entries: [entries[0]], uploadSessionId: 'session_newest', initialPlaceId: 'plc_one' })

    await user.click(screen.getAllByRole('button', { name: /Skip for now/i })[0])

    await waitFor(() => expect(screen.getByRole('heading', { name: 'This upload is reviewed.' })).toBeInTheDocument())
    expect(screen.getByText('1 place from this upload is still waiting.')).toBeInTheDocument()
    expect(screen.queryByText('Nothing else from this upload is waiting.')).not.toBeInTheDocument()
    expect(screen.getByText('Still waiting:')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review the skipped one' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Inbox' })).toHaveAttribute('href', '/inbox')
  })

  it('says an empty scoped queue is done with this upload and links back to the Inbox', () => {
    renderQueue({ entries: [], postcard: null, uploadSessionId: 'session_newest' })

    expect(screen.getByRole('heading', { name: 'This upload is reviewed.' })).toBeInTheDocument()
    expect(screen.getByText('Nothing else from this upload is waiting.')).toBeInTheDocument()
    expect(screen.queryByText(/Every place from your screenshots has a home/)).not.toBeInTheDocument()
    expect(screen.queryByText('Your Inbox is sorted for now.')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'All caught up' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Inbox' })).toHaveAttribute('href', '/inbox')
  })
})

function postCalls() {
  return fetchMock.mock.calls.filter((call) => (call[1] as { method?: string } | undefined)?.method === 'POST')
}

function deleteCalls() {
  return fetchMock.mock.calls.filter((call) => (call[1] as { method?: string } | undefined)?.method === 'DELETE')
}

describe('Review group and batch trip', () => {
  beforeAll(() => {
    Element.prototype.hasPointerCapture ??= () => false
    Element.prototype.setPointerCapture ??= () => {}
    Element.prototype.releasePointerCapture ??= () => {}
  })

  beforeEach(() => {
    jest.clearAllMocks()
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.startsWith('/api/review/postcard/')) {
        const id = decodeURIComponent(url.slice('/api/review/postcard/'.length))
        const row = placesById.get(id)
        if (!row) return jsonResponse({ message: 'Place not found' }, 404)
        return jsonResponse(postcardFor(row))
      }
      return jsonResponse({ status: 'success' })
    })
    window.history.replaceState({}, '', '/review')
  })

  function sharedShot() {
    const src = source('shot')
    const dutch = place('plc_dutch', 'My Old Dutch', src)
    dutch.kind = 'restaurant'
    dutch.description = "King's Road"
    dutch.coords = { lat: 51.48, lon: -0.16 }
    const gails = place('plc_gails', "Gail's Bakery", src)
    gails.createdAt = '2026-10-18T12:00:02.000Z'
    gails.coords = null
    placesById.set(dutch.id, dutch)
    placesById.set(gails.id, gails)
    return {
      src,
      dutch,
      gails,
      entries: [entryFrom(dutch, src), entryFrom(gails, src)],
    }
  }

  it('reviews every inbox place from one screenshot together, in list order', async () => {
    const { entries: groupEntries, dutch } = sharedShot()
    render(
      <ReviewQueue entries={groupEntries} postcard={postcardFor(dutch)} trips={[]} />
    )

    expect(screen.getByTestId('review-group')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'shot' })).toBeInTheDocument()
    expect(screen.getByText('2 places · London')).toBeInTheDocument()
    expect(screen.getByText('1–2 of 2 from shot.jpg')).toBeInTheDocument()
    expect(screen.getByText(/King.s Road/)).toBeInTheDocument()
    expect(screen.getByText('Pinned')).toBeInTheDocument()
    expect(screen.getByText('No pin yet')).toBeInTheDocument()
    expect(screen.queryByTestId('postcard')).not.toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText("That's everything.")).toBeInTheDocument())
    expect(patchCalls().map((call) => call[0])).toEqual(['/api/places/plc_dutch', '/api/places/plc_gails'])
    expect(patchCalls().every((call) => (call[1] as { body?: string }).body === JSON.stringify({ status: 'library' }))).toBe(true)
    expect(postCalls()).toHaveLength(0)

    const toast = notifySuccess.mock.calls.find((call) => String(call[0]).includes('Added 2 places'))
    const undo = (toast?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
    await act(async () => { undo?.({} as React.MouseEvent<HTMLButtonElement>) })
    await waitFor(() => expect(screen.getByTestId('review-group')).toBeInTheDocument())
    expect(patchCalls().at(-1)?.[1]).toEqual(expect.objectContaining({
      body: JSON.stringify({ status: 'inbox' }),
    }))
  })

  it('adds only the ticked rows, then reviews the one left on its own', async () => {
    const user = userEvent.setup()
    const { entries: groupEntries, dutch } = sharedShot()
    const view = render(
      <ReviewQueue entries={groupEntries} postcard={postcardFor(dutch)} trips={[]} />
    )

    await user.click(screen.getByRole('button', { name: "Leave Gail's Bakery out" }))
    await user.click(screen.getAllByRole('button', { name: /Add 1 to Library/i })[0])
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent("Gail's Bakery"))
    expect(patchCalls().map((call) => call[0])).toEqual(['/api/places/plc_dutch'])

    view.rerender(
      <ReviewQueue entries={groupEntries} postcard={postcardFor(dutch)} trips={[]} />
    )
    fireEvent.keyDown(window, { key: 'n' })
    await waitFor(() => expect(patchCalls().some((call) =>
      call[0] === '/api/places/plc_gails' &&
      (call[1] as { body?: string }).body === JSON.stringify({ status: 'archived' })
    )).toBe(true))
  })

  it('archives every place with None of these, and Skip leaves them all for later', async () => {
    const { entries: groupEntries, dutch } = sharedShot()
    const view = render(
      <ReviewQueue entries={groupEntries} postcard={postcardFor(dutch)} trips={[]} />
    )

    expect(screen.getAllByRole('button', { name: /None of these/i }).length).toBeGreaterThan(0)
    fireEvent.keyDown(window, { key: 'n' })
    await waitFor(() => expect(patchCalls()).toHaveLength(2))
    expect(patchCalls().every((call) => (call[1] as { body?: string }).body === JSON.stringify({ status: 'archived' }))).toBe(true)
    await waitFor(() => expect(screen.getByText("That's everything.")).toBeInTheDocument())
    expect(screen.getByText('not a place').previousElementSibling).toHaveTextContent('2')

    view.unmount()
    fetchMock.mockClear()
    render(
      <ReviewQueue entries={groupEntries} postcard={postcardFor(dutch)} trips={[]} />
    )
    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(screen.getByText("That's everything.")).toBeInTheDocument())
    expect(patchCalls()).toHaveLength(0)
    expect(screen.getByText('skipped for later').previousElementSibling).toHaveTextContent('2')
  })

  it('opens one place from the group and keeps Add, Not a place, and Skip on that place', async () => {
    const user = userEvent.setup()
    const { entries: groupEntries, dutch, gails } = sharedShot()
    render(
      <ReviewQueue entries={groupEntries} postcard={postcardFor(dutch)} trips={[]} />
    )

    await user.click(screen.getAllByRole('button', { name: 'Open' })[1])
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent("Gail's Bakery"))

    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('My Old Dutch'))
    expect(patchCalls().map((call) => call[0])).toEqual(['/api/places/plc_gails'])
    expect(placesById.get(gails.id)?.name).toBe("Gail's Bakery")
  })

  it('files every Add into the suggested trip and keeps that choice for the batch', async () => {
    const user = userEvent.setup()
    const london = { id: 'col_london', name: 'London long weekend', placeIds: ['plc_saved'], cities: ['London'] }
    renderQueue({ trips: [london] })

    expect(screen.getAllByRole('button', { name: 'Also add to London long weekend' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /Add to Library \+ trip/i }).length).toBeGreaterThan(0)

    await user.click(screen.getAllByRole('button', { name: /Add to Library \+ trip/i })[0])
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    expect(postCalls()[0]?.[0]).toBe('/api/collections/col_london/places')
    expect(postCalls()[0]?.[1]).toEqual(expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ placeIds: ['plc_one'] }),
    }))

    const toast = notifySuccess.mock.calls.find((call) => String(call[0]).includes('London long weekend'))
    const undo = (toast?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
    await act(async () => { undo?.({} as React.MouseEvent<HTMLButtonElement>) })
    await waitFor(() => expect(deleteCalls().some((call) => call[0] === '/api/collections/col_london/places/plc_one')).toBe(true))

    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(postCalls().some((call) =>
      String(call[0]).includes('col_london') &&
      (call[1] as { body?: string }).body === JSON.stringify({ placeIds: ['plc_one'] })
    )).toBe(true))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    expect(screen.getAllByRole('button', { name: 'Also add to London long weekend' }).length).toBeGreaterThan(0)
  })

  it('turns the batch trip off, so later adds stay in the Library only', async () => {
    const user = userEvent.setup()
    const london = { id: 'col_london', name: 'London long weekend', placeIds: [], cities: ['London'] }
    renderQueue({ trips: [london] })

    await user.click(screen.getAllByRole('button', { name: 'Also add to London long weekend' })[0])
    await user.click(await screen.findByRole('menuitemradio', { name: 'No trip' }))
    expect(screen.getAllByRole('button', { name: 'No trip' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Add to Library \+ trip/i })).not.toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    expect(postCalls()).toHaveLength(0)
    expect(screen.getAllByRole('button', { name: 'No trip' }).length).toBeGreaterThan(0)
  })

  it('leaves the chip off when no trip already holds that city', () => {
    const namedOnly = { id: 'col_london', name: 'London long weekend', placeIds: [], cities: [] }
    renderQueue({ trips: [namedOnly] })

    expect(screen.getAllByRole('button', { name: 'No trip' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Also add to/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add to Library \+ trip/i })).not.toBeInTheDocument()
  })

  it('says the one filed place is in the trip, and keeps the plural for several', async () => {
    const london = { id: 'col_london', name: 'London long weekend', placeIds: ['plc_saved'], cities: ['London'] }
    const one = renderQueue({
      entries: [entries[0]],
      postcard: postcardFor(placeOne),
      trips: [london],
    })

    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText(/1 new place is in your Library, and it is in London long weekend/)).toBeInTheDocument())

    one.unmount()
    renderQueue({ trips: [london] })
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText(/2 new places are in your Library, 2 of them in London long weekend/)).toBeInTheDocument())
  })

  it('returns to an unticked earlier place instead of skipping ahead', async () => {
    const user = userEvent.setup()
    const { src, dutch, gails } = sharedShot()
    const other = source('later')
    const next = place('plc_next', 'Next Cafe', other)
    next.city = 'Paris'
    placesById.set(next.id, next)
    const groupEntries = [entryFrom(dutch, src), entryFrom(gails, src), entryFrom(next, other)]
    render(
      <ReviewQueue
        entries={groupEntries}
        postcard={postcardFor(gails)}
        trips={[]}
        initialPlaceId={gails.id}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Leave My Old Dutch out' }))
    await user.click(screen.getAllByRole('button', { name: /Add 1 to Library/i })[0])

    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('My Old Dutch'))
    expect(screen.queryByText('Next Cafe')).not.toBeInTheDocument()
  })

  it('puts earlier places back in the Inbox when a later group add fails', async () => {
    const { entries: groupEntries, dutch } = sharedShot()
    let attempts = 0
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.startsWith('/api/review/postcard/')) {
        const id = decodeURIComponent(url.slice('/api/review/postcard/'.length))
        const row = placesById.get(id)
        if (!row) return jsonResponse({ message: 'Place not found' }, 404)
        return jsonResponse(postcardFor(row))
      }
      attempts += 1
      if (attempts === 2) return jsonResponse({ message: 'Library is busy' }, 500)
      return jsonResponse({ status: 'success' })
    })
    render(<ReviewQueue entries={groupEntries} postcard={postcardFor(dutch)} trips={[]} />)

    fireEvent.keyDown(window, { key: 'Enter' })

    await waitFor(() => expect(notifyError).toHaveBeenCalledWith('Library is busy'))
    expect(screen.getByTestId('review-group')).toBeInTheDocument()
    expect(patchCalls().map((call) => ({
      url: call[0],
      body: (call[1] as { body?: string }).body,
    }))).toEqual([
      { url: '/api/places/plc_dutch', body: JSON.stringify({ status: 'library' }) },
      { url: '/api/places/plc_gails', body: JSON.stringify({ status: 'library' }) },
      { url: '/api/places/plc_dutch', body: JSON.stringify({ status: 'inbox' }) },
    ])
    expect(notifySuccess).not.toHaveBeenCalled()
  })

  it('records only the places a partial trip add actually filed', async () => {
    const user = userEvent.setup()
    const { entries: groupEntries, dutch } = sharedShot()
    const london = { id: 'col_london', name: 'London long weekend', placeIds: ['plc_saved'], cities: ['London', 'London'] }
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const method = (init as { method?: string } | undefined)?.method
      if (url.startsWith('/api/review/postcard/')) {
        const id = decodeURIComponent(url.slice('/api/review/postcard/'.length))
        const row = placesById.get(id)
        if (!row) return jsonResponse({ message: 'Place not found' }, 404)
        return jsonResponse(postcardFor(row))
      }
      if (method === 'POST' && url.includes('/api/collections/')) {
        return jsonResponse({
          status: 'partial',
          results: {
            successful: ['plc_dutch'],
            failed: [{ placeId: 'plc_gails', error: 'not added' }],
          },
        }, 207)
      }
      return jsonResponse({ status: 'success' })
    })
    render(<ReviewQueue entries={groupEntries} postcard={postcardFor(dutch)} trips={[london]} />)

    await user.click(screen.getAllByRole('button', { name: /Add 2 to Library \+ trip/i })[0])

    await waitFor(() => expect(screen.getByText("That's everything.")).toBeInTheDocument())
    expect(screen.getByText(/2 new places are in your Library, 1 of them in London long weekend/)).toBeInTheDocument()
    expect(screen.queryByText(/and it is in/)).not.toBeInTheDocument()
    expect(notifyError).toHaveBeenCalledWith(expect.stringContaining("Gail's Bakery"))
    const added = notifySuccess.mock.calls.map((call) => String(call[0])).join('\n')
    expect(added).toContain('1 also in London long weekend')
    expect(added).not.toContain('to your Library and London long weekend')

    const toast = notifySuccess.mock.calls.find((call) => String(call[0]).includes('London long weekend'))
    const undo = (toast?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
    await act(async () => { undo?.({} as React.MouseEvent<HTMLButtonElement>) })
    await waitFor(() => expect(deleteCalls()).toHaveLength(1))
    expect(deleteCalls()[0]?.[0]).toBe('/api/collections/col_london/places/plc_dutch')
  })

  it('does not treat a refused solo trip add as filed', async () => {
    const user = userEvent.setup()
    const london = { id: 'col_london', name: 'London long weekend', placeIds: ['plc_saved'], cities: ['London'] }
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const method = (init as { method?: string } | undefined)?.method
      if (url.startsWith('/api/review/postcard/')) {
        const id = decodeURIComponent(url.slice('/api/review/postcard/'.length))
        const row = placesById.get(id)
        if (!row) return jsonResponse({ message: 'Place not found' }, 404)
        return jsonResponse(postcardFor(row))
      }
      if (method === 'POST' && url.includes('/api/collections/')) {
        return jsonResponse({
          status: 'partial',
          results: { successful: [], failed: [{ placeId: 'plc_one', error: 'not added' }] },
        }, 207)
      }
      return jsonResponse({ status: 'success' })
    })
    renderQueue({ trips: [london] })

    await user.click(screen.getAllByRole('button', { name: /Add to Library \+ trip/i })[0])

    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    expect(notifyError).toHaveBeenCalledWith(expect.stringContaining('One Cafe'))
    expect(notifySuccess.mock.calls.map((call) => String(call[0])).join('\n')).not.toContain('London long weekend')

    const toast = notifySuccess.mock.calls.find((call) => String(call[0]).includes('One Cafe'))
    const undo = (toast?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
    await act(async () => { undo?.({} as React.MouseEvent<HTMLButtonElement>) })
    await waitFor(() => expect(patchCalls().some((call) =>
      (call[1] as { body?: string }).body === JSON.stringify({ status: 'inbox' })
    )).toBe(true))
    expect(deleteCalls()).toHaveLength(0)
  })

  it('reports a failed trip removal instead of saying the undo finished', async () => {
    const user = userEvent.setup()
    const london = { id: 'col_london', name: 'London long weekend', placeIds: ['plc_saved'], cities: ['London'] }
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const method = (init as { method?: string } | undefined)?.method
      if (url.startsWith('/api/review/postcard/')) {
        const id = decodeURIComponent(url.slice('/api/review/postcard/'.length))
        const row = placesById.get(id)
        if (!row) return jsonResponse({ message: 'Place not found' }, 404)
        return jsonResponse(postcardFor(row))
      }
      if (method === 'DELETE') return jsonResponse({ message: 'Trip busy' }, 500)
      return jsonResponse({ status: 'success' })
    })
    renderQueue({ trips: [london] })

    await user.click(screen.getAllByRole('button', { name: /Add to Library \+ trip/i })[0])
    await waitFor(() => expect(notifySuccess).toHaveBeenCalled())
    const toast = notifySuccess.mock.calls.find((call) => String(call[0]).includes('London long weekend'))
    const undo = (toast?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
    await act(async () => { undo?.({} as React.MouseEvent<HTMLButtonElement>) })

    await waitFor(() => expect(notifyError).toHaveBeenCalledWith('Trip busy'))
    expect(notifySuccess.mock.calls.some((call) => String(call[0]).includes('Restored'))).toBe(false)
    expect(deleteCalls().some((call) => call[0] === '/api/collections/col_london/places/plc_one')).toBe(true)
  })

  it('keeps the group trip filing when removal fails', async () => {
    const { entries: groupEntries, dutch } = sharedShot()
    const london = { id: 'col_london', name: 'London long weekend', placeIds: ['plc_saved'], cities: ['London', 'London'] }
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const method = (init as { method?: string } | undefined)?.method
      if (url.startsWith('/api/review/postcard/')) {
        const id = decodeURIComponent(url.slice('/api/review/postcard/'.length))
        const row = placesById.get(id)
        if (!row) return jsonResponse({ message: 'Place not found' }, 404)
        return jsonResponse(postcardFor(row))
      }
      if (method === 'DELETE') return jsonResponse({ message: 'Trip busy' }, 500)
      return jsonResponse({ status: 'success' })
    })
    render(<ReviewQueue entries={groupEntries} postcard={postcardFor(dutch)} trips={[london]} />)

    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(notifySuccess).toHaveBeenCalled())
    const toast = notifySuccess.mock.calls.find((call) => String(call[0]).includes('London long weekend'))
    const undo = (toast?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
    await act(async () => { undo?.({} as React.MouseEvent<HTMLButtonElement>) })

    await waitFor(() => expect(notifyError).toHaveBeenCalledWith("Couldn't remove 2 places from London long weekend."))
    expect(notifySuccess.mock.calls.some((call) => String(call[0]).includes('Restored'))).toBe(false)
    expect(deleteCalls()).toHaveLength(2)
    expect(screen.getByTestId('review-group')).toBeInTheDocument()
  })

  async function fileOneCafe(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getAllByRole('button', { name: /Add to Library \+ trip/i })[0])
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    await user.click(screen.getByRole('button', { name: /Previous/i }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe'))
  }

  async function chooseBatchTrip(user: ReturnType<typeof userEvent.setup>, name: string) {
    const triggerName = screen.queryAllByRole('button', { name: /Also add to/i })[0]
      ? 'Also add to'
      : 'No trip'
    const trigger = screen.getAllByRole('button', { name: new RegExp(triggerName, 'i') })[0]
    await user.click(trigger)
    await user.click(await screen.findByRole('menuitemradio', { name }))
  }

  it('drops the trip when Skip, Archive, or a Library-only Add revisits a filing', async () => {
    const user = userEvent.setup()
    const london = { id: 'col_london', name: 'London long weekend', placeIds: ['plc_saved'], cities: ['London'] }

    const skipped = renderQueue({ trips: [london] })
    await fileOneCafe(user)
    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(deleteCalls().some((call) => call[0] === '/api/collections/col_london/places/plc_one')).toBe(true))
    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(screen.getByText("That's everything.")).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Review the skipped/i }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe'))
    await chooseBatchTrip(user, 'No trip')
    const deletesAfterSkip = deleteCalls().length
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    expect(deleteCalls()).toHaveLength(deletesAfterSkip)
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText(/2 new places are in your Library\./)).toBeInTheDocument())
    expect(screen.queryByText(/London long weekend/)).not.toBeInTheDocument()
    skipped.unmount()

    fetchMock.mockClear()
    notifySuccess.mockClear()
    const archived = renderQueue({ trips: [london] })
    await fileOneCafe(user)
    fireEvent.keyDown(window, { key: 'n' })
    await waitFor(() => expect(deleteCalls().some((call) => call[0] === '/api/collections/col_london/places/plc_one')).toBe(true))
    await user.click(screen.getByRole('button', { name: /Previous/i }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe'))
    await chooseBatchTrip(user, 'No trip')
    const deletesAfterArchive = deleteCalls().length
    const postsAfterArchive = postCalls().length
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    expect(deleteCalls()).toHaveLength(deletesAfterArchive)
    expect(postCalls()).toHaveLength(postsAfterArchive)
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText(/2 new places are in your Library\./)).toBeInTheDocument())
    expect(screen.queryByText(/London long weekend/)).not.toBeInTheDocument()
    archived.unmount()

    fetchMock.mockClear()
    const libraryOnly = renderQueue({ trips: [london] })
    await fileOneCafe(user)
    await chooseBatchTrip(user, 'No trip')
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(deleteCalls().some((call) => call[0] === '/api/collections/col_london/places/plc_one')).toBe(true))
    expect(postCalls()).toHaveLength(1)
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText(/2 new places are in your Library\./)).toBeInTheDocument())
    expect(screen.queryByText(/London long weekend/)).not.toBeInTheDocument()
    libraryOnly.unmount()
  })

  it('moves a filing when Add revisits the place into a different trip', async () => {
    const user = userEvent.setup()
    const london = { id: 'col_london', name: 'London long weekend', placeIds: ['plc_saved'], cities: ['London'] }
    const paris = { id: 'col_paris', name: 'Paris weekend', placeIds: ['plc_paris'], cities: ['Paris'] }
    renderQueue({ trips: [london, paris] })

    await fileOneCafe(user)
    await chooseBatchTrip(user, 'Paris weekend')
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(deleteCalls().some((call) => call[0] === '/api/collections/col_london/places/plc_one')).toBe(true))
    await waitFor(() => expect(postCalls().some((call) =>
      call[0] === '/api/collections/col_paris/places' &&
      (call[1] as { body?: string }).body === JSON.stringify({ placeIds: ['plc_one'] })
    )).toBe(true))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText(/2 new places are in your Library, 2 of them in Paris weekend/)).toBeInTheDocument())
    expect(screen.queryByText(/London long weekend/)).not.toBeInTheDocument()
  })

  it('keeps the filing when Add revisits the place into the same trip', async () => {
    const user = userEvent.setup()
    const london = { id: 'col_london', name: 'London long weekend', placeIds: ['plc_saved'], cities: ['London'] }
    renderQueue({ trips: [london] })

    await fileOneCafe(user)
    const postsAfterFirst = postCalls().length
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    expect(deleteCalls()).toHaveLength(0)
    expect(postCalls()).toHaveLength(postsAfterFirst)
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText(/2 new places are in your Library, 2 of them in London long weekend/)).toBeInTheDocument())
  })

  it('keeps the assignment when a later Skip cannot remove the trip', async () => {
    const user = userEvent.setup()
    const london = { id: 'col_london', name: 'London long weekend', placeIds: ['plc_saved'], cities: ['London'] }
    let deleteFails = true
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const method = (init as { method?: string } | undefined)?.method
      if (url.startsWith('/api/review/postcard/')) {
        const id = decodeURIComponent(url.slice('/api/review/postcard/'.length))
        const row = placesById.get(id)
        if (!row) return jsonResponse({ message: 'Place not found' }, 404)
        return jsonResponse(postcardFor(row))
      }
      if (method === 'DELETE' && deleteFails) return jsonResponse({ message: 'Trip busy' }, 500)
      return jsonResponse({ status: 'success' })
    })
    renderQueue({ trips: [london] })

    await fileOneCafe(user)
    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(notifyError).toHaveBeenCalledWith('Trip busy'))
    expect(deleteCalls().some((call) => call[0] === '/api/collections/col_london/places/plc_one')).toBe(true)
    expect(notifySuccess.mock.calls.some((call) => String(call[0]).includes('Library only'))).toBe(false)

    deleteFails = false
    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(screen.getByText("That's everything.")).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Review the skipped/i }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe'))
    await chooseBatchTrip(user, 'No trip')
    const deletesBeforeRetry = deleteCalls().length
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(deleteCalls().length).toBeGreaterThan(deletesBeforeRetry))
    expect(deleteCalls().at(-1)?.[0]).toBe('/api/collections/col_london/places/plc_one')
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText(/2 new places are in your Library\./)).toBeInTheDocument())
    expect(screen.queryByText(/London long weekend/)).not.toBeInTheDocument()
  })
})
