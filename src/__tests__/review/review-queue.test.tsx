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
      onArchive,
      onDeleted,
      onRestored,
    }: {
      place: PlaceWithRelations
      onArchive?: () => void
      onDeleted?: () => void
      onRestored?: () => void
    }) => {
      const mountedId = React.useRef(place.id)
      return (
        <div data-testid="postcard" data-status={place.status} data-mounted-id={mountedId.current}>
          {place.name}
          <button type="button" onClick={() => onArchive?.()}>Archive from postcard</button>
          <button type="button" onClick={() => onDeleted?.()}>Deleted from postcard</button>
          <button type="button" onClick={() => onRestored?.()}>Restore from postcard</button>
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
    source: src,
    screenshotUrl: src.uri,
    screenshotName: `${src.id}.jpg`,
    uploadLabel: `${src.id}.jpg`,
  }
}

function postcardFor(row: PlaceWithRelations): ReviewPostcard {
  return { place: row, alsoIn: [] }
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
})
