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
const mockPostcardFlush = {
  status: (): Promise<void> => Promise.resolve(),
  sections: (): Promise<boolean> => Promise.resolve(true),
}
function resetPostcardFlush() {
  mockPostcardFlush.status = () => Promise.resolve()
  mockPostcardFlush.sections = () => Promise.resolve(true)
}
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
      lead,
      onArchive,
      onDeleted,
      onRestored,
      blockRestore,
      onOpenClassic,
      onEdit,
      onPhotoAttached,
      blockWrites,
      handlesRef,
    }: {
      place: PlaceWithRelations
      editing?: boolean
      softCover?: boolean
      lead?: React.ReactNode
      onArchive?: () => void
      onDeleted?: () => void
      onRestored?: () => void
      blockRestore?: boolean
      onOpenClassic?: () => void
      onEdit?: () => void
      onPhotoAttached?: () => void
      blockWrites?: boolean
      handlesRef?: React.MutableRefObject<{
        flushStatus: () => Promise<void>
        flushSections: () => Promise<boolean>
        displayPlace: () => PlaceWithRelations
      } | null>
    }) => {
      const mountedId = React.useRef(place.id)
      React.useEffect(() => {
        if (!handlesRef) return
        handlesRef.current = {
          flushStatus: () => mockPostcardFlush.status(),
          flushSections: () => mockPostcardFlush.sections(),
          displayPlace: () => place,
        }
        return () => {
          handlesRef.current = null
        }
      }, [handlesRef, place])
      return (
        <div
          data-testid="postcard"
          data-status={place.status}
          data-mounted-id={mountedId.current}
          data-editing={editing ? 'yes' : 'no'}
          data-soft-cover={softCover ? 'yes' : 'no'}
        >
          {place.name}
          {lead}
          {!blockWrites && <button type="button" onClick={() => onEdit?.()}>Edit postcard</button>}
          {!blockWrites && <button type="button" onClick={() => onPhotoAttached?.()}>Attach photo</button>}
          <button type="button" onClick={() => onArchive?.()}>Archive from postcard</button>
          <button type="button" onClick={() => onDeleted?.()}>Deleted from postcard</button>
          {!blockRestore && (
            <button type="button" onClick={() => onRestored?.()}>Restore from postcard</button>
          )}
          <button type="button" onClick={() => onOpenClassic?.()}>Open classic editor</button>
        </div>
      )
    },
  }
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

  it('suggests the batch trip from ticked cities only, not unticked rows', async () => {
    const user = userEvent.setup()
    const src = source('mixed')
    const dutch = place('plc_dutch_mix', 'My Old Dutch', src)
    dutch.kind = 'restaurant'
    const gails = place('plc_gails_mix', "Gail's Bakery", src)
    gails.createdAt = '2026-10-18T12:00:02.000Z'
    const next = place('plc_next_mix', 'Next Cafe', src)
    next.city = 'Paris'
    next.createdAt = '2026-10-18T12:00:03.000Z'
    placesById.set(dutch.id, dutch)
    placesById.set(gails.id, gails)
    placesById.set(next.id, next)
    const london = { id: 'col_london', name: 'London long weekend', placeIds: ['plc_saved'], cities: ['London'] }
    const paris = { id: 'col_paris', name: 'Paris weekend', placeIds: ['plc_paris'], cities: ['Paris'] }
    const groupEntries = [entryFrom(dutch, src), entryFrom(gails, src), entryFrom(next, src)]
    render(
      <ReviewQueue
        entries={groupEntries}
        postcard={postcardFor(dutch)}
        trips={[london, paris]}
      />
    )

    expect(screen.getAllByRole('button', { name: 'Also add to London long weekend' }).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Leave My Old Dutch out' }))
    await user.click(screen.getByRole('button', { name: "Leave Gail's Bakery out" }))
    expect(screen.getAllByRole('button', { name: 'Also add to Paris weekend' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Also add to London long weekend/i })).not.toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: /Add 1 to Library \+ trip/i })[0])
    await waitFor(() => expect(postCalls().some((call) =>
      call[0] === '/api/collections/col_paris/places' &&
      (call[1] as { body?: string }).body === JSON.stringify({ placeIds: ['plc_next_mix'] })
    )).toBe(true))
    expect(postCalls().some((call) => call[0] === '/api/collections/col_london/places')).toBe(false)

    placesById.delete(dutch.id)
    placesById.delete(gails.id)
    placesById.delete(next.id)
  })

  it('suggests a matching trip once unticking breaks a city tie', async () => {
    const user = userEvent.setup()
    const src = source('tie')
    const dutch = place('plc_dutch_tie', 'My Old Dutch', src)
    dutch.kind = 'restaurant'
    const next = place('plc_next_tie', 'Next Cafe', src)
    next.city = 'Paris'
    next.createdAt = '2026-10-18T12:00:02.000Z'
    placesById.set(dutch.id, dutch)
    placesById.set(next.id, next)
    const london = { id: 'col_london', name: 'London long weekend', placeIds: ['plc_saved'], cities: ['London'] }
    const paris = { id: 'col_paris', name: 'Paris weekend', placeIds: ['plc_paris'], cities: ['Paris'] }
    const groupEntries = [entryFrom(dutch, src), entryFrom(next, src)]
    render(
      <ReviewQueue
        entries={groupEntries}
        postcard={postcardFor(dutch)}
        trips={[london, paris]}
      />
    )

    expect(screen.getAllByRole('button', { name: 'No trip' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Also add to/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Leave Next Cafe out' }))
    expect(screen.getAllByRole('button', { name: 'Also add to London long weekend' }).length).toBeGreaterThan(0)

    await user.click(screen.getAllByRole('button', { name: /Add 1 to Library \+ trip/i })[0])
    await waitFor(() => expect(postCalls().some((call) =>
      call[0] === '/api/collections/col_london/places' &&
      (call[1] as { body?: string }).body === JSON.stringify({ placeIds: ['plc_dutch_tie'] })
    )).toBe(true))

    placesById.delete(dutch.id)
    placesById.delete(next.id)
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

  it('leaves the membership in place when Undo follows a same-trip re-add', async () => {
    const user = userEvent.setup()
    const london = { id: 'col_london', name: 'London long weekend', placeIds: ['plc_saved'], cities: ['London'] }
    renderQueue({ trips: [london] })

    await fileOneCafe(user)
    const deletesAfterFirst = deleteCalls().length
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    const toast = [...notifySuccess.mock.calls].reverse().find((call) => String(call[0]).includes('London long weekend'))
    const undo = (toast?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
    await act(async () => { undo?.({} as React.MouseEvent<HTMLButtonElement>) })

    await waitFor(() => expect(notifySuccess.mock.calls.some((call) => String(call[0]).includes('Restored'))).toBe(true))
    expect(deleteCalls()).toHaveLength(deletesAfterFirst)
    expect(postCalls().filter((call) => call[0] === '/api/collections/col_london/places')).toHaveLength(1)
  })

  it('keeps the previous trip when moving to a new one fails', async () => {
    const user = userEvent.setup()
    const london = { id: 'col_london', name: 'London long weekend', placeIds: ['plc_saved'], cities: ['London'] }
    const paris = { id: 'col_paris', name: 'Paris weekend', placeIds: ['plc_paris'], cities: ['Paris'] }
    let rejectParis = false
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const method = (init as { method?: string } | undefined)?.method
      if (url.startsWith('/api/review/postcard/')) {
        const id = decodeURIComponent(url.slice('/api/review/postcard/'.length))
        const row = placesById.get(id)
        if (!row) return jsonResponse({ message: 'Place not found' }, 404)
        return jsonResponse(postcardFor(row))
      }
      if (rejectParis && method === 'POST' && url === '/api/collections/col_paris/places') {
        return jsonResponse({ message: 'Trip busy' }, 500)
      }
      return jsonResponse({ status: 'success' })
    })
    renderQueue({ trips: [london, paris] })

    await fileOneCafe(user)
    rejectParis = true
    await chooseBatchTrip(user, 'Paris weekend')
    const deletesBeforeMove = deleteCalls().length
    fireEvent.keyDown(window, { key: 'Enter' })

    await waitFor(() => expect(notifyError).toHaveBeenCalledWith('Trip busy'))
    expect(deleteCalls()).toHaveLength(deletesBeforeMove)
    expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe')
    expect(postCalls().some((call) => call[0] === '/api/collections/col_paris/places')).toBe(true)
  })

  it('puts a moved place back in the trip this add removed', async () => {
    const user = userEvent.setup()
    const london = { id: 'col_london', name: 'London long weekend', placeIds: ['plc_saved'], cities: ['London'] }
    const paris = { id: 'col_paris', name: 'Paris weekend', placeIds: ['plc_paris'], cities: ['Paris'] }
    renderQueue({ trips: [london, paris] })

    await fileOneCafe(user)
    await chooseBatchTrip(user, 'Paris weekend')
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))

    const toast = notifySuccess.mock.calls.find((call) => String(call[0]).includes('Paris weekend'))
    const undo = (toast?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
    await act(async () => { undo?.({} as React.MouseEvent<HTMLButtonElement>) })

    await waitFor(() => expect(notifySuccess.mock.calls.some((call) => String(call[0]).includes('Restored'))).toBe(true))
    const tripCalls = fetchMock.mock.calls.filter((call) => {
      const url = String(call[0])
      const method = (call[1] as { method?: string } | undefined)?.method
      return (method === 'POST' || method === 'DELETE') && url.includes('/api/collections/')
    })
    const parisDelete = tripCalls.findIndex((call) => call[0] === '/api/collections/col_paris/places/plc_one')
    const londonRestores = tripCalls.flatMap((call, index) => (
      call[0] === '/api/collections/col_london/places' &&
      (call[1] as { method?: string }).method === 'POST' &&
      (call[1] as { body?: string }).body === JSON.stringify({ placeIds: ['plc_one'] })
        ? [index]
        : []
    ))
    expect(parisDelete).toBeGreaterThan(-1)
    expect(londonRestores).toHaveLength(2)
    expect(londonRestores[1]).toBeGreaterThan(parisDelete)
  })

  it('does not remove a trip membership this group add did not create', async () => {
    const { entries: groupEntries, dutch } = sharedShot()
    const london = { id: 'col_london', name: 'London long weekend', placeIds: ['plc_saved'], cities: ['London', 'London'] }
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
    render(<ReviewQueue entries={groupEntries} postcard={postcardFor(dutch)} trips={[london]} />)

    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(notifySuccess).toHaveBeenCalled())
    const firstUndo = (notifySuccess.mock.calls.find((call) => String(call[0]).includes('London long weekend'))?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
    await act(async () => { firstUndo?.({} as React.MouseEvent<HTMLButtonElement>) })
    await waitFor(() => expect(notifyError).toHaveBeenCalledWith("Couldn't remove 2 places from London long weekend."))

    deleteFails = false
    fetchMock.mockClear()
    notifySuccess.mockClear()
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(notifySuccess).toHaveBeenCalled())
    expect(postCalls()).toHaveLength(0)

    const secondUndo = (notifySuccess.mock.calls.find((call) => String(call[0]).includes('London long weekend'))?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
    await act(async () => { secondUndo?.({} as React.MouseEvent<HTMLButtonElement>) })
    await waitFor(() => expect(notifySuccess.mock.calls.some((call) => String(call[0]).includes('Restored'))).toBe(true))
    expect(deleteCalls()).toHaveLength(0)
  })

  it('rolls a new trip back when the previous one cannot be removed', async () => {
    const user = userEvent.setup()
    const london = { id: 'col_london', name: 'London long weekend', placeIds: ['plc_saved'], cities: ['London'] }
    const paris = { id: 'col_paris', name: 'Paris weekend', placeIds: ['plc_paris'], cities: ['Paris'] }
    renderQueue({ trips: [london, paris] })

    await fileOneCafe(user)
    await chooseBatchTrip(user, 'Paris weekend')
    const successBefore = notifySuccess.mock.calls.length
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const method = (init as { method?: string } | undefined)?.method
      if (url.startsWith('/api/review/postcard/')) {
        const id = decodeURIComponent(url.slice('/api/review/postcard/'.length))
        const row = placesById.get(id)
        if (!row) return jsonResponse({ message: 'Place not found' }, 404)
        return jsonResponse(postcardFor(row))
      }
      if (method === 'DELETE' && url.includes('/col_london/')) return jsonResponse({ message: 'Trip busy' }, 500)
      return jsonResponse({ status: 'success' })
    })

    fireEvent.keyDown(window, { key: 'Enter' })

    await waitFor(() => expect(notifyError).toHaveBeenCalledWith('Trip busy'))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    const moveDeletes = deleteCalls().map((call) => call[0])
    expect(moveDeletes).toEqual([
      '/api/collections/col_london/places/plc_one',
      '/api/collections/col_paris/places/plc_one',
    ])
    expect(postCalls().some((call) => call[0] === '/api/collections/col_paris/places')).toBe(true)
    expect(notifySuccess.mock.calls.slice(successBefore)).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: /Previous/i }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe'))
    const deletesBeforeSkip = deleteCalls().length
    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(deleteCalls().length).toBeGreaterThan(deletesBeforeSkip))
    expect(deleteCalls().at(-1)?.[0]).toBe('/api/collections/col_london/places/plc_one')
  })

  it('keeps the previous trip when rolling back the new one also fails', async () => {
    const user = userEvent.setup()
    const london = { id: 'col_london', name: 'London long weekend', placeIds: ['plc_saved'], cities: ['London'] }
    const paris = { id: 'col_paris', name: 'Paris weekend', placeIds: ['plc_paris'], cities: ['Paris'] }
    renderQueue({ trips: [london, paris] })

    await fileOneCafe(user)
    await chooseBatchTrip(user, 'Paris weekend')
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const method = (init as { method?: string } | undefined)?.method
      if (url.startsWith('/api/review/postcard/')) {
        const id = decodeURIComponent(url.slice('/api/review/postcard/'.length))
        const row = placesById.get(id)
        if (!row) return jsonResponse({ message: 'Place not found' }, 404)
        return jsonResponse(postcardFor(row))
      }
      if (method === 'DELETE' && url.includes('/col_london/')) return jsonResponse({ message: 'Trip busy' }, 500)
      if (method === 'DELETE' && url.includes('/col_paris/')) return jsonResponse({ message: 'Paris stayed' }, 500)
      return jsonResponse({ status: 'success' })
    })

    fireEvent.keyDown(window, { key: 'Enter' })

    await waitFor(() => expect(notifyError).toHaveBeenCalledWith('Paris stayed'))
    expect(notifyError).toHaveBeenCalledWith('Trip busy')
    const moveToast = [...notifySuccess.mock.calls].reverse().find((call) => {
      const text = String(call[0])
      return text.includes('One Cafe') && !text.includes('London long weekend')
    })
    expect(moveToast).toBeTruthy()
    expect(String(moveToast?.[0])).not.toContain('Paris')
    const parisDeletesBeforeUndo = deleteCalls().filter((call) => call[0] === '/api/collections/col_paris/places/plc_one').length
    expect(parisDeletesBeforeUndo).toBe(1)

    const undo = (moveToast?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
    await act(async () => { undo?.({} as React.MouseEvent<HTMLButtonElement>) })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe'))
    expect(deleteCalls().filter((call) => call[0] === '/api/collections/col_paris/places/plc_one')).toHaveLength(2)

    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(deleteCalls().filter((call) => call[0] === '/api/collections/col_london/places/plc_one').length).toBeGreaterThan(1))
  })

  it('leaves a group on its previous trip when the replacement cannot be removed', async () => {
    const user = userEvent.setup()
    const { entries: groupEntries, dutch } = sharedShot()
    const london = { id: 'col_london', name: 'London long weekend', placeIds: ['plc_saved'], cities: ['London', 'London'] }
    const paris = { id: 'col_paris', name: 'Paris weekend', placeIds: ['plc_paris'], cities: ['Paris', 'Paris'] }
    let failLondonDelete = true
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const method = (init as { method?: string } | undefined)?.method
      if (url.startsWith('/api/review/postcard/')) {
        const id = decodeURIComponent(url.slice('/api/review/postcard/'.length))
        const row = placesById.get(id)
        if (!row) return jsonResponse({ message: 'Place not found' }, 404)
        return jsonResponse(postcardFor(row))
      }
      if (method === 'DELETE' && failLondonDelete && url.includes('/col_london/')) {
        return jsonResponse({ message: 'Trip busy' }, 500)
      }
      return jsonResponse({ status: 'success' })
    })
    render(<ReviewQueue entries={groupEntries} postcard={postcardFor(dutch)} trips={[london, paris]} />)

    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(notifySuccess).toHaveBeenCalled())
    const firstUndo = (notifySuccess.mock.calls.find((call) => String(call[0]).includes('London long weekend'))?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
    await act(async () => { firstUndo?.({} as React.MouseEvent<HTMLButtonElement>) })
    await waitFor(() => expect(screen.getByTestId('review-group')).toBeInTheDocument())

    failLondonDelete = false
    fetchMock.mockClear()
    notifySuccess.mockClear()
    notifyError.mockClear()
    failLondonDelete = true
    await chooseBatchTrip(user, 'Paris weekend')
    fireEvent.keyDown(window, { key: 'Enter' })

    await waitFor(() => expect(screen.getByText(/2 of them in London long weekend/)).toBeInTheDocument())
    expect(screen.queryByText(/Paris weekend/)).not.toBeInTheDocument()
    expect(deleteCalls().map((call) => call[0]).sort()).toEqual([
      '/api/collections/col_london/places/plc_dutch',
      '/api/collections/col_london/places/plc_gails',
      '/api/collections/col_paris/places/plc_dutch',
      '/api/collections/col_paris/places/plc_gails',
    ].sort())
    const moveToast = notifySuccess.mock.calls.find((call) => String(call[0]).includes('Added 2 places'))
    expect(moveToast).toBeTruthy()
    expect(String(moveToast?.[0])).not.toContain('Paris')
    const deletesAfterMove = deleteCalls().length

    const undo = (moveToast?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
    await act(async () => { undo?.({} as React.MouseEvent<HTMLButtonElement>) })
    await waitFor(() => expect(screen.getByTestId('review-group')).toBeInTheDocument())
    expect(deleteCalls()).toHaveLength(deletesAfterMove)

    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(deleteCalls().length).toBeGreaterThan(deletesAfterMove))
    const skipped = deleteCalls().slice(deletesAfterMove).map((call) => call[0]).sort()
    expect(skipped).toEqual([
      '/api/collections/col_london/places/plc_dutch',
      '/api/collections/col_london/places/plc_gails',
    ].sort())
  })

  it('offers undo for the trips a library-only group add did release', async () => {
    const user = userEvent.setup()
    const { entries: groupEntries, dutch } = sharedShot()
    const london = { id: 'col_london', name: 'London long weekend', placeIds: ['plc_saved'], cities: ['London', 'London'] }
    let mode: 'stick' | 'partial' = 'stick'
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const method = (init as { method?: string } | undefined)?.method
      if (url.startsWith('/api/review/postcard/')) {
        const id = decodeURIComponent(url.slice('/api/review/postcard/'.length))
        const row = placesById.get(id)
        if (!row) return jsonResponse({ message: 'Place not found' }, 404)
        return jsonResponse(postcardFor(row))
      }
      if (mode === 'stick' && method === 'DELETE') return jsonResponse({ message: 'Trip busy' }, 500)
      if (mode === 'partial' && method === 'DELETE' && url.includes('plc_gails')) {
        return jsonResponse({ message: 'Trip busy' }, 500)
      }
      return jsonResponse({ status: 'success' })
    })
    render(<ReviewQueue entries={groupEntries} postcard={postcardFor(dutch)} trips={[london]} />)

    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(notifySuccess).toHaveBeenCalled())
    const firstUndo = (notifySuccess.mock.calls.find((call) => String(call[0]).includes('London long weekend'))?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
    await act(async () => { firstUndo?.({} as React.MouseEvent<HTMLButtonElement>) })
    await waitFor(() => expect(screen.getByTestId('review-group')).toBeInTheDocument())

    mode = 'partial'
    fetchMock.mockClear()
    notifySuccess.mockClear()
    notifyError.mockClear()
    await chooseBatchTrip(user, 'No trip')
    fireEvent.keyDown(window, { key: 'Enter' })

    await waitFor(() => expect(notifySuccess).toHaveBeenCalled())
    expect(notifyError).toHaveBeenCalledWith('Trip busy')
    expect(deleteCalls().map((call) => call[0]).sort()).toEqual([
      '/api/collections/col_london/places/plc_dutch',
      '/api/collections/col_london/places/plc_gails',
    ].sort())
    const undo = (notifySuccess.mock.calls[0]?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
    await act(async () => { undo?.({} as React.MouseEvent<HTMLButtonElement>) })

    await waitFor(() => expect(postCalls().map((call) => (call[1] as { body?: string }).body)).toEqual([
      JSON.stringify({ placeIds: ['plc_dutch'] }),
    ]))
    await waitFor(() => expect(screen.getByTestId('review-group')).toBeInTheDocument())
    const deletesBeforeSkip = deleteCalls().length
    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(deleteCalls().length).toBeGreaterThan(deletesBeforeSkip))
    expect(deleteCalls().slice(deletesBeforeSkip).map((call) => call[0]).sort()).toEqual([
      '/api/collections/col_london/places/plc_dutch',
      '/api/collections/col_london/places/plc_gails',
    ].sort())
  })

  it('stays quiet when a library-only group add cannot release any trip', async () => {
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
      if (method === 'DELETE') return jsonResponse({ message: 'Trip busy' }, 500)
      return jsonResponse({ status: 'success' })
    })
    render(<ReviewQueue entries={groupEntries} postcard={postcardFor(dutch)} trips={[london]} />)

    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(notifySuccess).toHaveBeenCalled())
    const firstUndo = (notifySuccess.mock.calls.find((call) => String(call[0]).includes('London long weekend'))?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
    await act(async () => { firstUndo?.({} as React.MouseEvent<HTMLButtonElement>) })
    await waitFor(() => expect(screen.getByTestId('review-group')).toBeInTheDocument())

    fetchMock.mockClear()
    notifySuccess.mockClear()
    notifyError.mockClear()
    await chooseBatchTrip(user, 'No trip')
    fireEvent.keyDown(window, { key: 'Enter' })

    await waitFor(() => expect(screen.getByText(/2 of them in London long weekend/)).toBeInTheDocument())
    expect(notifyError).toHaveBeenCalledWith("Couldn't remove 2 places from London long weekend.")
    expect(notifySuccess).not.toHaveBeenCalled()
  })

  function postcardFetch(input: RequestInfo | URL): Response | null {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    if (!url.startsWith('/api/review/postcard/')) return null
    const id = decodeURIComponent(url.slice('/api/review/postcard/'.length))
    const row = placesById.get(id)
    if (!row) return jsonResponse({ message: 'Place not found' }, 404)
    return jsonResponse(postcardFor(row))
  }

  it('counts a stranded new trip in the summary without replacing the previous one', async () => {
    const user = userEvent.setup()
    const london = { id: 'col_london', name: 'London long weekend', placeIds: ['plc_saved'], cities: ['London'] }
    const paris = { id: 'col_paris', name: 'Paris weekend', placeIds: ['plc_paris'], cities: ['Paris'] }
    fetchMock.mockImplementation(async (input, init) => {
      const postcard = postcardFetch(input)
      if (postcard) return postcard
      const method = (init as { method?: string } | undefined)?.method
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (method === 'DELETE') return jsonResponse({ message: url.includes('/col_paris/') ? 'Paris stayed' : 'Trip busy' }, 500)
      return jsonResponse({ status: 'success' })
    })
    renderQueue({ trips: [london, paris] })

    await fileOneCafe(user)
    await chooseBatchTrip(user, 'Paris weekend')
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    fireEvent.keyDown(window, { key: 'Enter' })

    await waitFor(() => expect(screen.getByText(/2 in Paris weekend and 1 in London long weekend/)).toBeInTheDocument())
  })

  it('releases a stranded trip on Skip and drops it after that delete succeeds', async () => {
    const user = userEvent.setup()
    const london = { id: 'col_london', name: 'London long weekend', placeIds: ['plc_saved'], cities: ['London'] }
    const paris = { id: 'col_paris', name: 'Paris weekend', placeIds: ['plc_paris'], cities: ['Paris'] }
    let allowParisDelete = false
    fetchMock.mockImplementation(async (input, init) => {
      const postcard = postcardFetch(input)
      if (postcard) return postcard
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const method = (init as { method?: string } | undefined)?.method
      if (method === 'DELETE' && url.includes('/col_london/')) return jsonResponse({ message: 'Trip busy' }, 500)
      if (method === 'DELETE' && url.includes('/col_paris/') && !allowParisDelete) return jsonResponse({ message: 'Paris stayed' }, 500)
      return jsonResponse({ status: 'success' })
    })
    renderQueue({ trips: [london, paris] })

    await fileOneCafe(user)
    await chooseBatchTrip(user, 'Paris weekend')
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))

    allowParisDelete = true
    await user.click(screen.getByRole('button', { name: /Previous/i }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe'))
    const beforeSkip = deleteCalls().length
    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    expect(deleteCalls().slice(beforeSkip).map((call) => call[0])).toEqual([
      '/api/collections/col_london/places/plc_one',
      '/api/collections/col_paris/places/plc_one',
    ])

    await user.click(screen.getByRole('button', { name: /Previous/i }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe'))
    const beforeSecond = deleteCalls().length
    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(deleteCalls().length).toBe(beforeSecond + 1))
    expect(deleteCalls().slice(beforeSecond).map((call) => call[0])).toEqual([
      '/api/collections/col_london/places/plc_one',
    ])
  })

  it('puts every released trip back when undoing an archive of a stranded filing', async () => {
    const user = userEvent.setup()
    const london = { id: 'col_london', name: 'London long weekend', placeIds: ['plc_saved'], cities: ['London'] }
    const paris = { id: 'col_paris', name: 'Paris weekend', placeIds: ['plc_paris'], cities: ['Paris'] }
    let blockDeletes = true
    fetchMock.mockImplementation(async (input, init) => {
      const postcard = postcardFetch(input)
      if (postcard) return postcard
      const method = (init as { method?: string } | undefined)?.method
      if (method === 'DELETE' && blockDeletes) return jsonResponse({ message: 'Trip busy' }, 500)
      return jsonResponse({ status: 'success' })
    })
    renderQueue({ trips: [london, paris] })

    await fileOneCafe(user)
    await chooseBatchTrip(user, 'Paris weekend')
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))

    blockDeletes = false
    await user.click(screen.getByRole('button', { name: /Previous/i }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe'))
    fireEvent.keyDown(window, { key: 'n' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    const toast = [...notifySuccess.mock.calls].reverse().find((call) => String(call[0]).includes('Archive'))
    const undo = (toast?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
    const beforeUndo = postCalls().length
    await act(async () => { undo?.({} as React.MouseEvent<HTMLButtonElement>) })
    await waitFor(() => expect(postCalls().length).toBe(beforeUndo + 2))
    expect(postCalls().slice(beforeUndo).map((call) => call[0])).toEqual([
      '/api/collections/col_london/places',
      '/api/collections/col_paris/places',
    ])
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe'))

    const beforeSkip = deleteCalls().length
    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(deleteCalls().length).toBe(beforeSkip + 2))
    expect(deleteCalls().slice(beforeSkip).map((call) => call[0])).toEqual([
      '/api/collections/col_london/places/plc_one',
      '/api/collections/col_paris/places/plc_one',
    ])
  })

  it('keeps a stranded group trip on the filing map until its delete succeeds', async () => {
    const user = userEvent.setup()
    const { entries: groupEntries, dutch } = sharedShot()
    const london = { id: 'col_london', name: 'London long weekend', placeIds: ['plc_saved'], cities: ['London', 'London'] }
    const paris = { id: 'col_paris', name: 'Paris weekend', placeIds: ['plc_paris'], cities: ['Paris', 'Paris'] }
    let allowParisDelete = false
    fetchMock.mockImplementation(async (input, init) => {
      const postcard = postcardFetch(input)
      if (postcard) return postcard
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const method = (init as { method?: string } | undefined)?.method
      if (method === 'DELETE' && url.includes('/col_london/')) return jsonResponse({ message: 'Trip busy' }, 500)
      if (method === 'DELETE' && url.includes('/col_paris/') && !allowParisDelete) return jsonResponse({ message: 'Paris stayed' }, 500)
      return jsonResponse({ status: 'success' })
    })
    render(<ReviewQueue entries={groupEntries} postcard={postcardFor(dutch)} trips={[london, paris]} />)

    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(notifySuccess).toHaveBeenCalled())
    const firstUndo = (notifySuccess.mock.calls.find((call) => String(call[0]).includes('London long weekend'))?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
    await act(async () => { firstUndo?.({} as React.MouseEvent<HTMLButtonElement>) })
    await waitFor(() => expect(screen.getByTestId('review-group')).toBeInTheDocument())

    await chooseBatchTrip(user, 'Paris weekend')
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText(/2 in London long weekend and 2 in Paris weekend/)).toBeInTheDocument())
    const moveToast = [...notifySuccess.mock.calls].reverse().find((call) => {
      const text = String(call[0])
      return text.includes('Added 2 places') && !text.includes('London long weekend')
    })
    expect(moveToast).toBeTruthy()
    const undo = (moveToast?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
    await act(async () => { undo?.({} as React.MouseEvent<HTMLButtonElement>) })
    await waitFor(() => expect(screen.getByTestId('review-group')).toBeInTheDocument())

    allowParisDelete = true
    const beforeSkip = deleteCalls().length
    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(deleteCalls().length).toBe(beforeSkip + 4))
    expect(deleteCalls().slice(beforeSkip).map((call) => call[0]).sort()).toEqual([
      '/api/collections/col_london/places/plc_dutch',
      '/api/collections/col_london/places/plc_gails',
      '/api/collections/col_paris/places/plc_dutch',
      '/api/collections/col_paris/places/plc_gails',
    ].sort())

    await user.click(screen.getByRole('button', { name: /Review the skipped/i }))
    await waitFor(() => expect(screen.getByTestId('review-group')).toBeInTheDocument())
    const beforeSecond = deleteCalls().length
    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(deleteCalls().length).toBe(beforeSecond + 2))
    expect(deleteCalls().slice(beforeSecond).map((call) => call[0]).sort()).toEqual([
      '/api/collections/col_london/places/plc_dutch',
      '/api/collections/col_london/places/plc_gails',
    ].sort())
  })

  it('keeps a stranded destination when the same trip is chosen again', async () => {
    const user = userEvent.setup()
    const london = { id: 'col_london', name: 'London long weekend', placeIds: ['plc_saved'], cities: ['London'] }
    const paris = { id: 'col_paris', name: 'Paris weekend', placeIds: ['plc_paris'], cities: ['Paris'] }
    let allowParisDelete = false
    fetchMock.mockImplementation(async (input, init) => {
      const postcard = postcardFetch(input)
      if (postcard) return postcard
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const method = (init as { method?: string } | undefined)?.method
      if (method === 'DELETE' && url.includes('/col_london/')) return jsonResponse({ message: 'Trip busy' }, 500)
      if (method === 'DELETE' && url.includes('/col_paris/') && !allowParisDelete) return jsonResponse({ message: 'Paris stayed' }, 500)
      return jsonResponse({ status: 'success' })
    })
    renderQueue({ trips: [london, paris] })

    await fileOneCafe(user)
    await chooseBatchTrip(user, 'Paris weekend')
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))

    allowParisDelete = true
    await user.click(screen.getByRole('button', { name: /Previous/i }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe'))
    const parisDeletes = deleteCalls().filter((call) => call[0] === '/api/collections/col_paris/places/plc_one').length
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    expect(deleteCalls().filter((call) => call[0] === '/api/collections/col_paris/places/plc_one')).toHaveLength(parisDeletes)

    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText(/2 in Paris weekend and 1 in London long weekend/)).toBeInTheDocument())
  })

  it('leaves an already tracked destination in place when the other trip is released', async () => {
    const user = userEvent.setup()
    const london = { id: 'col_london', name: 'London long weekend', placeIds: ['plc_saved'], cities: ['London'] }
    const paris = { id: 'col_paris', name: 'Paris weekend', placeIds: ['plc_paris'], cities: ['Paris'] }
    let blockDeletes = true
    fetchMock.mockImplementation(async (input, init) => {
      const postcard = postcardFetch(input)
      if (postcard) return postcard
      const method = (init as { method?: string } | undefined)?.method
      if (method === 'DELETE' && blockDeletes) return jsonResponse({ message: 'Trip busy' }, 500)
      return jsonResponse({ status: 'success' })
    })
    renderQueue({ trips: [london, paris] })

    await fileOneCafe(user)
    await chooseBatchTrip(user, 'Paris weekend')
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))

    blockDeletes = false
    await user.click(screen.getByRole('button', { name: /Previous/i }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe'))
    const parisDeletes = deleteCalls().filter((call) => call[0] === '/api/collections/col_paris/places/plc_one').length
    const before = deleteCalls().length
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    expect(deleteCalls().slice(before).map((call) => call[0])).toEqual([
      '/api/collections/col_london/places/plc_one',
    ])
    expect(deleteCalls().filter((call) => call[0] === '/api/collections/col_paris/places/plc_one')).toHaveLength(parisDeletes)

    const toast = [...notifySuccess.mock.calls].reverse().find((call) => {
      const text = String(call[0])
      return text.includes('One Cafe') && text.includes('Paris weekend')
    })
    const undo = (toast?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
    await act(async () => { undo?.({} as React.MouseEvent<HTMLButtonElement>) })
    await waitFor(() => expect(notifySuccess.mock.calls.some((call) => String(call[0]).includes('Restored'))).toBe(true))
    expect(deleteCalls().filter((call) => call[0] === '/api/collections/col_paris/places/plc_one')).toHaveLength(parisDeletes)
    expect(postCalls().filter((call) => call[0] === '/api/collections/col_london/places').length).toBeGreaterThan(1)

    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe'))
    const beforeSkip = deleteCalls().length
    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(deleteCalls().length).toBe(beforeSkip + 2))
    expect(deleteCalls().slice(beforeSkip).map((call) => call[0])).toEqual([
      '/api/collections/col_london/places/plc_one',
      '/api/collections/col_paris/places/plc_one',
    ])
  })

  it('removes every tracked trip when a stranded place moves to another', async () => {
    const user = userEvent.setup()
    const london = { id: 'col_london', name: 'London long weekend', placeIds: ['plc_saved'], cities: ['London'] }
    const paris = { id: 'col_paris', name: 'Paris weekend', placeIds: ['plc_paris'], cities: ['Paris'] }
    const rome = { id: 'col_rome', name: 'Rome weekend', placeIds: ['plc_rome'], cities: ['Rome'] }
    let blockDeletes = true
    fetchMock.mockImplementation(async (input, init) => {
      const postcard = postcardFetch(input)
      if (postcard) return postcard
      const method = (init as { method?: string } | undefined)?.method
      if (method === 'DELETE' && blockDeletes) return jsonResponse({ message: 'Trip busy' }, 500)
      return jsonResponse({ status: 'success' })
    })
    renderQueue({ trips: [london, paris, rome] })

    await fileOneCafe(user)
    await chooseBatchTrip(user, 'Paris weekend')
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))

    blockDeletes = false
    await user.click(screen.getByRole('button', { name: /Previous/i }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe'))
    await chooseBatchTrip(user, 'Rome weekend')
    const before = deleteCalls().length
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    expect(deleteCalls().slice(before).map((call) => call[0])).toEqual([
      '/api/collections/col_london/places/plc_one',
      '/api/collections/col_paris/places/plc_one',
    ])

    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText(/2 of them in Rome weekend/)).toBeInTheDocument())
    expect(screen.queryByText(/Paris weekend/)).not.toBeInTheDocument()
    expect(screen.queryByText(/London long weekend/)).not.toBeInTheDocument()
  })

  it('keeps a stranded group destination when that trip is chosen again', async () => {
    const user = userEvent.setup()
    const { entries: groupEntries, dutch } = sharedShot()
    const london = { id: 'col_london', name: 'London long weekend', placeIds: ['plc_saved'], cities: ['London', 'London'] }
    const paris = { id: 'col_paris', name: 'Paris weekend', placeIds: ['plc_paris'], cities: ['Paris', 'Paris'] }
    let allowParisDelete = false
    fetchMock.mockImplementation(async (input, init) => {
      const postcard = postcardFetch(input)
      if (postcard) return postcard
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const method = (init as { method?: string } | undefined)?.method
      if (method === 'DELETE' && url.includes('/col_london/')) return jsonResponse({ message: 'Trip busy' }, 500)
      if (method === 'DELETE' && url.includes('/col_paris/') && !allowParisDelete) return jsonResponse({ message: 'Paris stayed' }, 500)
      return jsonResponse({ status: 'success' })
    })
    render(<ReviewQueue entries={groupEntries} postcard={postcardFor(dutch)} trips={[london, paris]} />)

    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(notifySuccess).toHaveBeenCalled())
    const firstUndo = (notifySuccess.mock.calls.find((call) => String(call[0]).includes('London long weekend'))?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
    await act(async () => { firstUndo?.({} as React.MouseEvent<HTMLButtonElement>) })
    await waitFor(() => expect(screen.getByTestId('review-group')).toBeInTheDocument())

    await chooseBatchTrip(user, 'Paris weekend')
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText(/2 in London long weekend and 2 in Paris weekend/)).toBeInTheDocument())
    const moveToast = [...notifySuccess.mock.calls].reverse().find((call) => {
      const text = String(call[0])
      return text.includes('Added 2 places') && !text.includes('London long weekend')
    })
    const undo = (moveToast?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
    await act(async () => { undo?.({} as React.MouseEvent<HTMLButtonElement>) })
    await waitFor(() => expect(screen.getByTestId('review-group')).toBeInTheDocument())

    allowParisDelete = true
    const parisDeletes = deleteCalls().filter((call) => String(call[0]).includes('/col_paris/')).length
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText(/2 in London long weekend and 2 in Paris weekend/)).toBeInTheDocument())
    expect(deleteCalls().filter((call) => String(call[0]).includes('/col_paris/'))).toHaveLength(parisDeletes)
  })

  it('removes every tracked trip when a stranded group moves to another', async () => {
    const user = userEvent.setup()
    const { entries: groupEntries, dutch } = sharedShot()
    const london = { id: 'col_london', name: 'London long weekend', placeIds: ['plc_saved'], cities: ['London', 'London'] }
    const paris = { id: 'col_paris', name: 'Paris weekend', placeIds: ['plc_paris'], cities: ['Paris', 'Paris'] }
    const rome = { id: 'col_rome', name: 'Rome weekend', placeIds: ['plc_rome'], cities: ['Rome', 'Rome'] }
    let allowDeletes = false
    fetchMock.mockImplementation(async (input, init) => {
      const postcard = postcardFetch(input)
      if (postcard) return postcard
      const method = (init as { method?: string } | undefined)?.method
      if (method === 'DELETE' && !allowDeletes) return jsonResponse({ message: 'Trip busy' }, 500)
      return jsonResponse({ status: 'success' })
    })
    render(<ReviewQueue entries={groupEntries} postcard={postcardFor(dutch)} trips={[london, paris, rome]} />)

    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(notifySuccess).toHaveBeenCalled())
    const firstUndo = (notifySuccess.mock.calls.find((call) => String(call[0]).includes('London long weekend'))?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
    await act(async () => { firstUndo?.({} as React.MouseEvent<HTMLButtonElement>) })
    await waitFor(() => expect(screen.getByTestId('review-group')).toBeInTheDocument())

    await chooseBatchTrip(user, 'Paris weekend')
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText(/2 in London long weekend and 2 in Paris weekend/)).toBeInTheDocument())
    const moveToast = [...notifySuccess.mock.calls].reverse().find((call) => {
      const text = String(call[0])
      return text.includes('Added 2 places') && !text.includes('London long weekend')
    })
    const undo = (moveToast?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
    await act(async () => { undo?.({} as React.MouseEvent<HTMLButtonElement>) })
    await waitFor(() => expect(screen.getByTestId('review-group')).toBeInTheDocument())

    allowDeletes = true
    await chooseBatchTrip(user, 'Rome weekend')
    const before = deleteCalls().length
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText(/2 of them in Rome weekend/)).toBeInTheDocument())
    expect(screen.queryByText(/Paris weekend/)).not.toBeInTheDocument()
    expect(screen.queryByText(/London long weekend/)).not.toBeInTheDocument()
    expect(deleteCalls().slice(before).map((call) => call[0]).sort()).toEqual([
      '/api/collections/col_london/places/plc_dutch',
      '/api/collections/col_london/places/plc_gails',
      '/api/collections/col_paris/places/plc_dutch',
      '/api/collections/col_paris/places/plc_gails',
    ].sort())
  })

  it('names every trip when one place cannot be removed from them', async () => {
    const user = userEvent.setup()
    const london = { id: 'col_london', name: 'London long weekend', placeIds: ['plc_saved'], cities: ['London'] }
    const paris = { id: 'col_paris', name: 'Paris weekend', placeIds: ['plc_paris'], cities: ['Paris'] }
    fetchMock.mockImplementation(async (input, init) => {
      const postcard = postcardFetch(input)
      if (postcard) return postcard
      const method = (init as { method?: string } | undefined)?.method
      if (method === 'DELETE') return jsonResponse({ message: 'Trip busy' }, 500)
      return jsonResponse({ status: 'success' })
    })
    renderQueue({ trips: [london, paris] })

    await fileOneCafe(user)
    await chooseBatchTrip(user, 'Paris weekend')
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    await user.click(screen.getByRole('button', { name: /Previous/i }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe'))
    notifyError.mockClear()
    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(notifyError).toHaveBeenCalledWith(
      "Couldn't remove it from London long weekend and Paris weekend.",
    ))
    expect(notifyError).not.toHaveBeenCalledWith("Couldn't remove 2 places from their trips.")
  })

  it('counts each place once when a group release fails for several trips', async () => {
    const user = userEvent.setup()
    const { entries: groupEntries, dutch } = sharedShot()
    const london = { id: 'col_london', name: 'London long weekend', placeIds: ['plc_saved'], cities: ['London', 'London'] }
    const paris = { id: 'col_paris', name: 'Paris weekend', placeIds: ['plc_paris'], cities: ['Paris', 'Paris'] }
    fetchMock.mockImplementation(async (input, init) => {
      const postcard = postcardFetch(input)
      if (postcard) return postcard
      const method = (init as { method?: string } | undefined)?.method
      if (method === 'DELETE') return jsonResponse({ message: 'Trip busy' }, 500)
      return jsonResponse({ status: 'success' })
    })
    render(<ReviewQueue entries={groupEntries} postcard={postcardFor(dutch)} trips={[london, paris]} />)

    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(notifySuccess).toHaveBeenCalled())
    const firstUndo = (notifySuccess.mock.calls.find((call) => String(call[0]).includes('London long weekend'))?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
    await act(async () => { firstUndo?.({} as React.MouseEvent<HTMLButtonElement>) })
    await waitFor(() => expect(screen.getByTestId('review-group')).toBeInTheDocument())

    await chooseBatchTrip(user, 'Paris weekend')
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText(/2 in London long weekend and 2 in Paris weekend/)).toBeInTheDocument())
    const moveToast = [...notifySuccess.mock.calls].reverse().find((call) => {
      const text = String(call[0])
      return text.includes('Added 2 places') && !text.includes('London long weekend')
    })
    const undo = (moveToast?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
    await act(async () => { undo?.({} as React.MouseEvent<HTMLButtonElement>) })
    await waitFor(() => expect(screen.getByTestId('review-group')).toBeInTheDocument())

    notifyError.mockClear()
    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(notifyError).toHaveBeenCalledWith("Couldn't remove 2 places from their trips."))
    expect(notifyError).not.toHaveBeenCalledWith("Couldn't remove 4 places from their trips.")
  })

  function undoOf(call: unknown[] | undefined) {
    return (call?.[1] as { cancel?: { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } } | undefined)?.cancel?.onClick
  }

  it('offers a Library undo when a rolled-back move follows a failed trip removal', async () => {
    const user = userEvent.setup()
    const london = { id: 'col_london', name: 'London long weekend', placeIds: ['plc_saved'], cities: ['London'] }
    const paris = { id: 'col_paris', name: 'Paris weekend', placeIds: ['plc_paris'], cities: ['Paris'] }
    let failLondonDelete = false
    fetchMock.mockImplementation(async (input, init) => {
      const postcard = postcardFetch(input)
      if (postcard) return postcard
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const method = (init as { method?: string } | undefined)?.method
      if (method === 'DELETE' && failLondonDelete && url.includes('/col_london/')) {
        return jsonResponse({ message: 'Trip busy' }, 500)
      }
      return jsonResponse({ status: 'success' })
    })
    renderQueue({ trips: [london, paris] })

    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(notifySuccess).toHaveBeenCalled())
    failLondonDelete = true
    const firstUndo = undoOf(notifySuccess.mock.calls.find((call) => String(call[0]).includes('London long weekend')))
    await act(async () => { firstUndo?.({} as React.MouseEvent<HTMLButtonElement>) })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe'))
    expect(screen.getByTestId('postcard')).toHaveAttribute('data-status', 'inbox')

    await chooseBatchTrip(user, 'Paris weekend')
    const successBefore = notifySuccess.mock.calls.length
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(notifySuccess.mock.calls.length).toBe(successBefore + 1))
    const libraryToast = notifySuccess.mock.calls[successBefore]
    expect(String(libraryToast?.[0])).toContain('to your Library')
    expect(String(libraryToast?.[0])).not.toContain('Paris')
    expect(String(libraryToast?.[0])).not.toContain('London')

    const parisDeletes = deleteCalls().filter((call) => call[0] === '/api/collections/col_paris/places/plc_one').length
    const londonDeletes = deleteCalls().filter((call) => call[0] === '/api/collections/col_london/places/plc_one').length
    const parisPosts = postCalls().filter((call) => call[0] === '/api/collections/col_paris/places').length
    await act(async () => { undoOf(libraryToast)?.({} as React.MouseEvent<HTMLButtonElement>) })
    await waitFor(() => expect(notifySuccess.mock.calls.some((call) => String(call[0]).includes('Restored') && String(call[0]).includes('Inbox'))).toBe(true))
    expect(deleteCalls().filter((call) => call[0] === '/api/collections/col_paris/places/plc_one')).toHaveLength(parisDeletes)
    expect(deleteCalls().filter((call) => call[0] === '/api/collections/col_london/places/plc_one')).toHaveLength(londonDeletes)
    expect(postCalls().filter((call) => call[0] === '/api/collections/col_paris/places')).toHaveLength(parisPosts)
    expect(patchCalls().filter((call) => call[0] === '/api/places/plc_one').at(-1)?.[1]).toEqual(expect.objectContaining({
      body: JSON.stringify({ status: 'inbox' }),
    }))

    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(deleteCalls().filter((call) => call[0] === '/api/collections/col_london/places/plc_one')).toHaveLength(londonDeletes + 1))
  })

  it('offers a Library undo when a rolled-back move follows Archive', async () => {
    const user = userEvent.setup()
    const london = { id: 'col_london', name: 'London long weekend', placeIds: ['plc_saved'], cities: ['London'] }
    const paris = { id: 'col_paris', name: 'Paris weekend', placeIds: ['plc_paris'], cities: ['Paris'] }
    let failLondonDelete = false
    fetchMock.mockImplementation(async (input, init) => {
      const postcard = postcardFetch(input)
      if (postcard) return postcard
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const method = (init as { method?: string } | undefined)?.method
      if (method === 'DELETE' && failLondonDelete && url.includes('/col_london/')) {
        return jsonResponse({ message: 'Trip busy' }, 500)
      }
      return jsonResponse({ status: 'success' })
    })
    renderQueue({ trips: [london, paris] })

    await fileOneCafe(user)
    failLondonDelete = true
    fireEvent.keyDown(window, { key: 'n' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    await user.click(screen.getByRole('button', { name: /Previous/i }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe'))

    await chooseBatchTrip(user, 'Paris weekend')
    const successBefore = notifySuccess.mock.calls.length
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(notifySuccess.mock.calls.length).toBe(successBefore + 1))
    const libraryToast = notifySuccess.mock.calls[successBefore]
    expect(String(libraryToast?.[0])).toContain('to your Library')
    expect(String(libraryToast?.[0])).not.toContain('Paris')
    expect(String(libraryToast?.[0])).not.toContain('London')

    const parisDeletes = deleteCalls().filter((call) => call[0] === '/api/collections/col_paris/places/plc_one').length
    const londonDeletes = deleteCalls().filter((call) => call[0] === '/api/collections/col_london/places/plc_one').length
    const parisPosts = postCalls().filter((call) => call[0] === '/api/collections/col_paris/places').length
    await act(async () => { undoOf(libraryToast)?.({} as React.MouseEvent<HTMLButtonElement>) })
    await waitFor(() => expect(notifySuccess.mock.calls.some((call) => String(call[0]).includes('Restored') && String(call[0]).includes('Archive'))).toBe(true))
    expect(screen.getByTestId('postcard')).toHaveAttribute('data-status', 'archived')
    expect(deleteCalls().filter((call) => call[0] === '/api/collections/col_paris/places/plc_one')).toHaveLength(parisDeletes)
    expect(deleteCalls().filter((call) => call[0] === '/api/collections/col_london/places/plc_one')).toHaveLength(londonDeletes)
    expect(postCalls().filter((call) => call[0] === '/api/collections/col_paris/places')).toHaveLength(parisPosts)
  })

  it('says one added place is in each tracked trip', async () => {
    const user = userEvent.setup()
    const london = { id: 'col_london', name: 'London long weekend', placeIds: ['plc_saved'], cities: ['London'] }
    const paris = { id: 'col_paris', name: 'Paris weekend', placeIds: ['plc_paris'], cities: ['Paris'] }
    fetchMock.mockImplementation(async (input, init) => {
      const postcard = postcardFetch(input)
      if (postcard) return postcard
      const method = (init as { method?: string } | undefined)?.method
      if (method === 'DELETE') return jsonResponse({ message: 'Trip busy' }, 500)
      return jsonResponse({ status: 'success' })
    })
    renderQueue({ trips: [london, paris] })

    await fileOneCafe(user)
    await chooseBatchTrip(user, 'Paris weekend')
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(screen.getByText(
      /1 new place is in your Library, and it is in London long weekend and Paris weekend\./,
    )).toBeInTheDocument())
    expect(screen.queryByText(/1 in London long weekend and 1 in Paris weekend/)).not.toBeInTheDocument()
  })
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
    resetPostcardFlush()
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

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/place/plc_one?editor=classic'))
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

const fjellMatch = {
  placeId: 'plc_lib',
  name: 'Fjellheisen',
  city: 'Tromsø',
  kind: 'experience',
  createdAt: '2026-09-02T12:00:00.000Z',
  photoUrl: null,
  confidence: 0.86,
  certainty: 'likely' as const,
  label: 'Likely',
  summary: 'Same name start · both Tromsø · pins 50 m apart · saved 2 Sept',
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

function installDuplicateFetch() {
  fetchMock.mockImplementation(async (input, init) => {
    const url = requestUrl(input)
    const method = ((init as { method?: string } | undefined)?.method ?? 'GET').toUpperCase()
    if (url.includes('/duplicate-check')) {
      const match = url.includes('plc_one') ? fjellMatch : null
      return jsonResponse({ status: 'success', match })
    }
    if (url === '/api/places/bulk-merge' && method === 'POST') {
      return jsonResponse({
        status: 'success',
        success: 1,
        results: [{ status: 'success', mergeLogId: 'mrg_fjell' }],
      })
    }
    if (url === '/api/places/undo-merge' && method === 'POST') return jsonResponse({ status: 'success' })
    if (url === '/api/places/dismiss-duplicate' && method === 'POST') {
      const body = JSON.parse(String((init as { body?: string }).body)) as { pairs: unknown }
      return jsonResponse({ status: 'success', inserted: body.pairs })
    }
    if (url === '/api/places/dismiss-duplicate' && method === 'DELETE') return jsonResponse({ status: 'success' })
    if (url === '/api/places/plc_lib') return jsonResponse(place('plc_lib', 'Fjellheisen', source('lib')))
    if (url.startsWith('/api/review/postcard/')) {
      const id = decodeURIComponent(url.slice('/api/review/postcard/'.length))
      const row = placesById.get(id)
      if (!row) return jsonResponse({ message: 'Place not found' }, 404)
      return jsonResponse(postcardFor(row))
    }
    return jsonResponse({ status: 'success' })
  })
}

function posted(url: string, method: string) {
  return fetchMock.mock.calls
    .filter((call) => requestUrl(call[0] as RequestInfo) === url && ((call[1] as { method?: string } | undefined)?.method ?? 'GET').toUpperCase() === method)
    .map((call) => JSON.parse(String((call[1] as { body?: string }).body)))
}

describe('Review duplicate note', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetPostcardFlush()
    installDuplicateFetch()
    window.history.replaceState({}, '', '/review')
  })

  it('shows the Library match on the postcard', async () => {
    renderQueue()
    expect(await screen.findByRole('heading', { name: /Looks like Fjellheisen\s*,\s*already in your Library/ })).toBeInTheDocument()
    expect(screen.getByText('Likely')).toBeInTheDocument()
    expect(screen.getByText(fjellMatch.summary)).toBeInTheDocument()
    expect(screen.getByText(/Merge keeps everything/)).toBeInTheDocument()
  })

  it('merges into the Library place and undoes from the toast', async () => {
    const user = userEvent.setup()
    renderQueue()
    await user.click(await screen.findByRole('button', { name: 'Merge into Fjellheisen' }))

    await waitFor(() => expect(posted('/api/places/bulk-merge', 'POST')).toEqual([
      { clusters: [{ targetId: 'plc_lib', sourceIds: ['plc_one'], confidence: 0.86 }] },
    ]))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    const toast = notifySuccess.mock.calls.find((call) => String(call[0]).includes('Merged into Fjellheisen'))
    expect(toast?.[1]).toEqual(expect.objectContaining({ cancel: expect.objectContaining({ label: 'Undo' }) }))

    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(screen.getByText('1 merged into Fjellheisen.')).toBeInTheDocument())

    const undo = (toast?.[1]?.cancel as { onClick?: () => void } | undefined)?.onClick
    undo?.()
    await waitFor(() => expect(posted('/api/places/undo-merge', 'POST')).toEqual([
      { placeId: 'plc_lib', mergeLogId: 'mrg_fjell' },
    ]))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe'))
    expect(screen.getByTestId('postcard')).toHaveAttribute('data-status', 'inbox')
    expect(await screen.findByRole('button', { name: 'Merge into Fjellheisen' })).toBeInTheDocument()

    const patchesAfterUndo = patchCalls().length
    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(screen.getByText('added to Library').previousElementSibling).toHaveTextContent('0'))
    expect(patchCalls()).toHaveLength(patchesAfterUndo)
  })

  it('undoing a merge puts a Library add back on the postcard', async () => {
    const user = userEvent.setup()
    const sharedShot = {
      sourceId: 'src_shared',
      url: 'https://example.test/shared.jpg',
      name: 'shared.jpg',
      createdAt: '2026-10-18T12:00:00.000Z',
      softCover: false,
      siblings: [
        { placeId: 'plc_one', name: 'One Cafe', status: 'inbox' as const, createdAt: '2026-10-18T12:00:01.000Z' },
        { placeId: 'plc_two', name: 'Two Cafe', status: 'inbox' as const, createdAt: '2026-10-18T12:00:02.000Z' },
      ],
    }
    const previous = fetchMock.getMockImplementation()
    fetchMock.mockImplementation(async (input, init) => {
      const url = requestUrl(input)
      if (url.startsWith('/api/review/postcard/')) {
        const id = decodeURIComponent(url.slice('/api/review/postcard/'.length))
        const row = placesById.get(id)
        if (!row) return jsonResponse({ message: 'Place not found' }, 404)
        return jsonResponse({ ...postcardFor(row), screenshot: sharedShot })
      }
      if (!previous) return jsonResponse({ status: 'success' })
      return previous(input, init)
    })

    renderQueue({
      postcard: { ...postcardFor(placeOne), screenshot: sharedShot },
    })

    await user.click(screen.getAllByRole('button', { name: /Add to Library/i })[0])
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveAttribute('data-status', 'library'))

    await user.click(await screen.findByRole('button', { name: 'Merge into Fjellheisen' }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))

    const toast = notifySuccess.mock.calls.find((call) => String(call[0]).includes('Merged into Fjellheisen'))
    const undo = (toast?.[1]?.cancel as { onClick?: () => void } | undefined)?.onClick
    undo?.()

    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe'))
    expect(screen.getByTestId('postcard')).toHaveAttribute('data-status', 'library')
    expect(screen.getByRole('button', { name: /Two Cafe/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Two Cafe/ }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    expect(screen.getByRole('button', { name: /One Cafe/ })).toHaveTextContent('Added')

    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(screen.getByText('1 new place is in your Library.')).toBeInTheDocument())
    expect(screen.getByText('added to Library').previousElementSibling).toHaveTextContent('1')
    expect(screen.queryByText(/merged into/)).not.toBeInTheDocument()
    expect(patchCalls().map((call) => String((call[1] as { body?: string } | undefined)?.body))).toEqual([
      JSON.stringify({ status: 'library' }),
    ])
  })

  it('does not restore a merged place from the screenshot list', async () => {
    const user = userEvent.setup()
    const sharedShot = {
      sourceId: 'src_shared',
      url: 'https://example.test/shared.jpg',
      name: 'shared.jpg',
      createdAt: '2026-10-18T12:00:00.000Z',
      softCover: false,
      siblings: [
        { placeId: 'plc_one', name: 'One Cafe', status: 'inbox' as const, createdAt: '2026-10-18T12:00:01.000Z' },
        { placeId: 'plc_two', name: 'Two Cafe', status: 'inbox' as const, createdAt: '2026-10-18T12:00:02.000Z' },
      ],
    }
    const previous = fetchMock.getMockImplementation()
    fetchMock.mockImplementation(async (input, init) => {
      const url = requestUrl(input)
      if (url.startsWith('/api/review/postcard/')) {
        const id = decodeURIComponent(url.slice('/api/review/postcard/'.length))
        const row = placesById.get(id)
        if (!row) return jsonResponse({ message: 'Place not found' }, 404)
        return jsonResponse({ ...postcardFor(row), screenshot: sharedShot })
      }
      if (!previous) return jsonResponse({ status: 'success' })
      return previous(input, init)
    })

    renderQueue({
      postcard: { ...postcardFor(placeOne), screenshot: sharedShot },
    })
    await user.click(await screen.findByRole('button', { name: 'Merge into Fjellheisen' }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))

    await user.click(screen.getByRole('button', { name: /One Cafe/ }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe'))
    expect(screen.getByTestId('postcard')).toHaveAttribute('data-status', 'archived')
    expect(screen.queryByRole('button', { name: 'Restore from postcard' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
    expect(patchCalls().some((call) => String((call[1] as { body?: string } | undefined)?.body).includes('"status":"library"'))).toBe(false)

    await user.click(screen.getByRole('button', { name: /Two Cafe/ }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(screen.getByText('1 merged into Fjellheisen.')).toBeInTheDocument())
    expect(screen.getByText('added to Library').previousElementSibling).toHaveTextContent('0')
  })

  it('keeps both by dismissing the pair, with Undo', async () => {
    const user = userEvent.setup()
    renderQueue()
    await user.click(await screen.findByRole('button', { name: 'Keep both' }))

    await waitFor(() => expect(posted('/api/places/dismiss-duplicate', 'POST')).toEqual([
      { pairs: [{ placeId1: 'plc_one', placeId2: 'plc_lib' }] },
    ]))
    expect(await screen.findByText(/Fjellheisen and One Cafe stay separate/)).toBeInTheDocument()
    const toast = notifySuccess.mock.calls.find((call) => call[0] === 'Kept both: One Cafe and Fjellheisen')
    expect(toast?.[1]).toEqual(expect.objectContaining({ cancel: expect.objectContaining({ label: 'Undo' }) }))

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(posted('/api/places/dismiss-duplicate', 'DELETE')).toEqual([
      { pairs: [{ placeId1: 'plc_one', placeId2: 'plc_lib' }] },
    ]))
    expect(await screen.findByRole('button', { name: 'Merge into Fjellheisen' })).toBeInTheDocument()
  })

  it('opens a comparison with the Library place', async () => {
    const user = userEvent.setup()
    renderQueue()
    await user.click(await screen.findByRole('button', { name: 'Compare' }))
    expect(await screen.findByRole('dialog', { name: 'Compare with Fjellheisen' })).toBeInTheDocument()
  })

  it('hides merge after Not a place and restores it when that decision is undone', async () => {
    const user = userEvent.setup()
    renderQueue()
    await user.click(screen.getAllByRole('button', { name: /Not a place/i })[0])
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    await user.click(screen.getByRole('button', { name: /Previous/i }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveAttribute('data-status', 'archived'))

    expect(await screen.findByText(/Looks like Fjellheisen, already in your Library/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Merge into Fjellheisen' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Keep both' })).not.toBeInTheDocument()

    const archiveToast = notifySuccess.mock.calls.find((call) => String(call[0]).includes('Archive'))
    const undo = (archiveToast?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
    await act(async () => { undo?.({} as React.MouseEvent<HTMLButtonElement>) })

    expect(await screen.findByRole('button', { name: 'Merge into Fjellheisen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep both' })).toBeInTheDocument()
    expect(screen.getByTestId('postcard')).toHaveAttribute('data-status', 'inbox')
  })

  it('ignores an earlier Add undo after the place has been merged', async () => {
    const user = userEvent.setup()
    notifySuccess.mockImplementation((message) => String(message).includes('Added') ? 'toast-add' : 'toast-other')
    try {
      renderQueue()
      await user.click(screen.getAllByRole('button', { name: /Add to Library/i })[0])
      await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
      await user.click(screen.getByRole('button', { name: /Previous/i }))
      await user.click(await screen.findByRole('button', { name: 'Merge into Fjellheisen' }))
      await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
      expect(notify.dismiss).toHaveBeenCalledWith('toast-add')

      const addToast = notifySuccess.mock.calls.find((call) => String(call[0]).includes('Added'))
      const undo = (addToast?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
      const patchesAfterMerge = patchCalls().length
      await act(async () => { undo?.({} as React.MouseEvent<HTMLButtonElement>) })

      expect(patchCalls()).toHaveLength(patchesAfterMerge)
      expect(patchCalls().map((call) => String((call[1] as { body?: string } | undefined)?.body))).toEqual([
        JSON.stringify({ status: 'library' }),
      ])
      fireEvent.keyDown(window, { key: 's' })
      await waitFor(() => expect(screen.getByText('1 merged into Fjellheisen.')).toBeInTheDocument())
      expect(screen.queryByTestId('postcard')).not.toBeInTheDocument()
    } finally {
      notifySuccess.mockReset()
    }
  })

  it('does not turn a restored Library place into inbox when undo is repeated', async () => {
    const user = userEvent.setup()
    let undoPosts = 0
    let releaseFirstUndo: (response: Response) => void = () => {}
    const firstUndo = new Promise<Response>((resolve) => {
      releaseFirstUndo = resolve
    })
    const previous = fetchMock.getMockImplementation()
    fetchMock.mockImplementation(async (input, init) => {
      const url = requestUrl(input)
      const method = ((init as { method?: string } | undefined)?.method ?? 'GET').toUpperCase()
      if (url === '/api/places/undo-merge' && method === 'POST') {
        undoPosts += 1
        if (undoPosts === 1) return firstUndo
        return jsonResponse({ message: 'Merge not found' }, 404)
      }
      if (!previous) return jsonResponse({ status: 'success' })
      return previous(input, init)
    })

    renderQueue()
    await user.click(screen.getAllByRole('button', { name: /Add to Library/i })[0])
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    await user.click(screen.getByRole('button', { name: /Previous/i }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveAttribute('data-status', 'library'))
    await user.click(await screen.findByRole('button', { name: 'Merge into Fjellheisen' }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    await user.click(screen.getByRole('button', { name: /Previous/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument())

    const toast = notifySuccess.mock.calls.find((call) => String(call[0]).includes('Merged into Fjellheisen'))
    const undo = (toast?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
    await act(async () => {
      undo?.({} as React.MouseEvent<HTMLButtonElement>)
      screen.getByRole('button', { name: 'Undo' }).click()
    })
    expect(undoPosts).toBe(1)

    await act(async () => {
      releaseFirstUndo(jsonResponse({ message: 'Merge not found' }, 404))
      await firstUndo
    })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveAttribute('data-status', 'library'))
    expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe')

    await act(async () => { undo?.({} as React.MouseEvent<HTMLButtonElement>) })
    expect(undoPosts).toBe(1)
    expect(screen.getByTestId('postcard')).toHaveAttribute('data-status', 'library')
    expect(patchCalls().map((call) => String((call[1] as { body?: string } | undefined)?.body))).toEqual([
      JSON.stringify({ status: 'library' }),
    ])
  })

  it('saves postcard edits before merging and blocks writes while that request runs', async () => {
    const order: string[] = []
    let releaseStatus: () => void = () => {}
    const statusGate = new Promise<void>((resolve) => {
      releaseStatus = resolve
    })
    let releaseSections: (saved: boolean) => void = () => {}
    const sectionsGate = new Promise<boolean>((resolve) => {
      releaseSections = resolve
    })
    let releaseMerge: (response: Response) => void = () => {}
    const mergeGate = new Promise<Response>((resolve) => {
      releaseMerge = resolve
    })
    mockPostcardFlush.status = () => {
      order.push('status')
      return statusGate
    }
    mockPostcardFlush.sections = () => {
      order.push('sections')
      return sectionsGate
    }
    const previous = fetchMock.getMockImplementation()
    fetchMock.mockImplementation(async (input, init) => {
      const url = requestUrl(input)
      const method = ((init as { method?: string } | undefined)?.method ?? 'GET').toUpperCase()
      if (url === '/api/places/bulk-merge' && method === 'POST') {
        order.push('merge')
        return mergeGate
      }
      if (!previous) return jsonResponse({ status: 'success' })
      return previous(input, init)
    })

    renderQueue()
    const mergeButton = await screen.findByRole('button', { name: 'Merge into Fjellheisen' })
    await act(async () => { mergeButton.click() })

    expect(order).toEqual(['sections', 'status'])
    expect(posted('/api/places/bulk-merge', 'POST')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Edit postcard' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Attach photo' })).not.toBeInTheDocument()

    await act(async () => { releaseStatus() })
    expect(posted('/api/places/bulk-merge', 'POST')).toHaveLength(0)

    await act(async () => { releaseSections(true) })
    await waitFor(() => expect(posted('/api/places/bulk-merge', 'POST')).toHaveLength(1))
    expect(order).toEqual(['sections', 'status', 'merge'])
    expect(screen.queryByRole('button', { name: 'Edit postcard' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Attach photo' })).not.toBeInTheDocument()

    await act(async () => {
      releaseMerge(jsonResponse({
        status: 'success',
        success: 1,
        results: [{ status: 'success', mergeLogId: 'mrg_flush' }],
      }))
      await mergeGate
    })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
  })

  it('does not merge when a postcard edit fails to save', async () => {
    const user = userEvent.setup()
    mockPostcardFlush.sections = async () => false
    renderQueue()
    await user.click(await screen.findByRole('button', { name: 'Merge into Fjellheisen' }))

    await waitFor(() => expect(notifyError).toHaveBeenCalledWith("Couldn't save your edits, so these places weren't merged."))
    expect(posted('/api/places/bulk-merge', 'POST')).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Merge into Fjellheisen' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Edit postcard' })).toBeInTheDocument()
  })

  it('does not edit or attach a photo on a merged postcard', async () => {
    const user = userEvent.setup()
    renderQueue()
    await user.click(await screen.findByRole('button', { name: 'Merge into Fjellheisen' }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    await user.click(screen.getByRole('button', { name: /Previous/i }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveAttribute('data-status', 'archived'))

    expect(screen.queryByRole('button', { name: 'Edit postcard' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Attach photo' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open classic editor' }))
    expect(mockPush).not.toHaveBeenCalled()
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('does not undo an add while merge is in flight', async () => {
    const user = userEvent.setup()
    let releaseMerge: (response: Response) => void = () => {}
    const mergeGate = new Promise<Response>((resolve) => {
      releaseMerge = resolve
    })
    const previous = fetchMock.getMockImplementation()
    fetchMock.mockImplementation(async (input, init) => {
      const url = requestUrl(input)
      const method = ((init as { method?: string } | undefined)?.method ?? 'GET').toUpperCase()
      if (url === '/api/places/bulk-merge' && method === 'POST') return mergeGate
      if (!previous) return jsonResponse({ status: 'success' })
      return previous(input, init)
    })
    const patchBodies = () => patchCalls().map((call) => String((call[1] as { body?: string } | undefined)?.body))

    renderQueue()
    await user.click(screen.getAllByRole('button', { name: /Add to Library/i })[0])
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    await user.click(screen.getByRole('button', { name: /Previous/i }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveAttribute('data-status', 'library'))
    const addToast = notifySuccess.mock.calls.find((call) => String(call[0]).includes('Added'))
    const undo = (addToast?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
    const mergeButton = await screen.findByRole('button', { name: 'Merge into Fjellheisen' })

    await act(async () => {
      mergeButton.click()
      undo?.({} as React.MouseEvent<HTMLButtonElement>)
    })
    expect(posted('/api/places/bulk-merge', 'POST')).toHaveLength(1)
    expect(patchBodies()).toEqual([JSON.stringify({ status: 'library' })])

    await act(async () => {
      releaseMerge(jsonResponse({
        status: 'success',
        success: 1,
        results: [{ status: 'success', mergeLogId: 'mrg_race' }],
      }))
      await mergeGate
    })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    expect(patchBodies()).toEqual([JSON.stringify({ status: 'library' })])
    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(screen.getByText('1 merged into Fjellheisen.')).toBeInTheDocument())
    expect(screen.getByText('added to Library').previousElementSibling).toHaveTextContent('0')
  })

  it('does not merge while an add undo is in flight', async () => {
    const user = userEvent.setup()
    let releaseUndo: (response: Response) => void = () => {}
    const undoGate = new Promise<Response>((resolve) => {
      releaseUndo = resolve
    })
    const previous = fetchMock.getMockImplementation()
    fetchMock.mockImplementation(async (input, init) => {
      const method = ((init as { method?: string } | undefined)?.method ?? 'GET').toUpperCase()
      if (method === 'PATCH') {
        const body = JSON.parse(String((init as { body?: string }).body)) as { status?: string }
        if (body.status === 'inbox') return undoGate
      }
      if (!previous) return jsonResponse({ status: 'success' })
      return previous(input, init)
    })
    const patchBodies = () => patchCalls().map((call) => String((call[1] as { body?: string } | undefined)?.body))

    renderQueue()
    await user.click(screen.getAllByRole('button', { name: /Add to Library/i })[0])
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    await user.click(screen.getByRole('button', { name: /Previous/i }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveAttribute('data-status', 'library'))
    const addToast = notifySuccess.mock.calls.find((call) => String(call[0]).includes('Added'))
    const undo = (addToast?.[1]?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined)?.onClick
    const mergeButton = await screen.findByRole('button', { name: 'Merge into Fjellheisen' })

    await act(async () => {
      undo?.({} as React.MouseEvent<HTMLButtonElement>)
      mergeButton.click()
    })
    expect(posted('/api/places/bulk-merge', 'POST')).toHaveLength(0)
    expect(patchBodies().filter((body) => body.includes('"status":"inbox"'))).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Merge into Fjellheisen' })).toBeDisabled()

    await act(async () => {
      releaseUndo(jsonResponse({ status: 'success' }))
      await undoGate
    })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveAttribute('data-status', 'inbox'))
    expect(posted('/api/places/bulk-merge', 'POST')).toHaveLength(0)
    expect(patchBodies()).toEqual([
      JSON.stringify({ status: 'library' }),
      JSON.stringify({ status: 'inbox' }),
    ])
    expect(screen.getByRole('button', { name: 'Merge into Fjellheisen' })).toBeEnabled()
  })

  it('offers Undo after Keep both when the reviewer leaves, and Undo restores the note', async () => {
    const user = userEvent.setup()
    let releaseDismiss: (response: Response) => void = () => {}
    const dismissGate = new Promise<Response>((resolve) => {
      releaseDismiss = resolve
    })
    const dismissed = new Set<string>()
    const pairKey = (pair: { placeId1: string; placeId2: string }) => [pair.placeId1, pair.placeId2].sort().join('|')
    const sharedShot = {
      sourceId: 'src_shared',
      url: 'https://example.test/shared.jpg',
      name: 'shared.jpg',
      createdAt: '2026-10-18T12:00:00.000Z',
      softCover: false,
      siblings: [
        { placeId: 'plc_two', name: 'Two Cafe', status: 'inbox' as const, createdAt: '2026-10-18T12:00:01.000Z' },
        { placeId: 'plc_one', name: 'One Cafe', status: 'inbox' as const, createdAt: '2026-10-18T12:00:02.000Z' },
      ],
    }
    const previous = fetchMock.getMockImplementation()
    fetchMock.mockImplementation(async (input, init) => {
      const url = requestUrl(input)
      const method = ((init as { method?: string } | undefined)?.method ?? 'GET').toUpperCase()
      if (url.includes('/duplicate-check')) {
        const hidden = dismissed.has(pairKey({ placeId1: 'plc_one', placeId2: 'plc_lib' }))
        const match = url.includes('plc_one') && !hidden ? fjellMatch : null
        return jsonResponse({ status: 'success', match })
      }
      if (url === '/api/places/dismiss-duplicate' && method === 'POST') {
        const body = JSON.parse(String((init as { body?: string }).body)) as { pairs: Array<{ placeId1: string; placeId2: string }> }
        for (const pair of body.pairs) dismissed.add(pairKey(pair))
        return dismissGate
      }
      if (url === '/api/places/dismiss-duplicate' && method === 'DELETE') {
        const body = JSON.parse(String((init as { body?: string }).body)) as { pairs: Array<{ placeId1: string; placeId2: string }> }
        for (const pair of body.pairs) dismissed.delete(pairKey(pair))
        return jsonResponse({ status: 'success' })
      }
      if (url.startsWith('/api/review/postcard/')) {
        const id = decodeURIComponent(url.slice('/api/review/postcard/'.length))
        const row = placesById.get(id)
        if (!row) return jsonResponse({ message: 'Place not found' }, 404)
        return jsonResponse({ ...postcardFor(row), screenshot: sharedShot })
      }
      if (!previous) return jsonResponse({ status: 'success' })
      return previous(input, init)
    })

    renderQueue({
      entries: [entryFrom(placeTwo, secondSource), entryFrom(placeOne, firstSource)],
      postcard: { ...postcardFor(placeOne), screenshot: sharedShot },
      initialPlaceId: 'plc_one',
    })
    await user.click(await screen.findByRole('button', { name: 'Keep both' }))
    await waitFor(() => expect(posted('/api/places/dismiss-duplicate', 'POST')).toHaveLength(1))
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))

    await act(async () => {
      releaseDismiss(jsonResponse({
        status: 'success',
        inserted: [{ placeId1: 'plc_one', placeId2: 'plc_lib' }],
      }))
      await dismissGate
    })

    const toast = notifySuccess.mock.calls.find((call) => call[0] === 'Kept both: One Cafe and Fjellheisen')
    const undo = (toast?.[1]?.cancel as { onClick?: () => void } | undefined)?.onClick
    expect(undo).toBeInstanceOf(Function)
    expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe')
    expect(screen.queryByText(/stay separate/)).not.toBeInTheDocument()

    const checks = () => fetchMock.mock.calls.filter((call) => requestUrl(call[0] as RequestInfo).includes('/duplicate-check')).length
    const checksBeforeReturn = checks()
    await user.click(screen.getByRole('button', { name: /One Cafe/ }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe'))
    await waitFor(() => expect(checks()).toBeGreaterThan(checksBeforeReturn))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.queryByRole('button', { name: 'Merge into Fjellheisen' })).not.toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    await act(async () => { undo?.() })
    await waitFor(() => expect(posted('/api/places/dismiss-duplicate', 'DELETE')).toEqual([
      { pairs: [{ placeId1: 'plc_one', placeId2: 'plc_lib' }] },
    ]))

    await user.click(screen.getByRole('button', { name: /One Cafe/ }))
    expect(await screen.findByRole('button', { name: 'Merge into Fjellheisen' })).toBeInTheDocument()
    expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe')
  })

  function pairKey(pair: { placeId1: string; placeId2: string }) {
    return [pair.placeId1, pair.placeId2].sort().join('|')
  }

  function installDismissedPairFetch(options?: {
    holdOneChecks?: () => boolean
    dismissGate?: Promise<void>
  }) {
    const dismissed = new Set<string>()
    const pendingChecks: Array<() => void> = []
    const sharedShot = {
      sourceId: 'src_shared',
      url: 'https://example.test/shared.jpg',
      name: 'shared.jpg',
      createdAt: '2026-10-18T12:00:00.000Z',
      softCover: false,
      siblings: [
        { placeId: 'plc_two', name: 'Two Cafe', status: 'inbox' as const, createdAt: '2026-10-18T12:00:01.000Z' },
        { placeId: 'plc_one', name: 'One Cafe', status: 'inbox' as const, createdAt: '2026-10-18T12:00:02.000Z' },
      ],
    }
    const previous = fetchMock.getMockImplementation()
    fetchMock.mockImplementation(async (input, init) => {
      const url = requestUrl(input)
      const method = ((init as { method?: string } | undefined)?.method ?? 'GET').toUpperCase()
      if (url.includes('/duplicate-check')) {
        const hidden = dismissed.has(pairKey({ placeId1: 'plc_one', placeId2: 'plc_lib' }))
        const match = url.includes('plc_one') && !hidden ? fjellMatch : null
        if (options?.holdOneChecks?.() && url.includes('plc_one')) {
          const snapshot = match
          return new Promise((resolve) => {
            pendingChecks.push(() => resolve(jsonResponse({ status: 'success', match: snapshot })))
          })
        }
        return jsonResponse({ status: 'success', match })
      }
      if (url === '/api/places/dismiss-duplicate' && method === 'POST') {
        const body = JSON.parse(String((init as { body?: string }).body)) as { pairs: Array<{ placeId1: string; placeId2: string }> }
        const finish = () => {
          for (const pair of body.pairs) dismissed.add(pairKey(pair))
          return jsonResponse({ status: 'success', inserted: body.pairs })
        }
        if (options?.dismissGate) return options.dismissGate.then(finish)
        return finish()
      }
      if (url === '/api/places/dismiss-duplicate' && method === 'DELETE') {
        const body = JSON.parse(String((init as { body?: string }).body)) as { pairs: Array<{ placeId1: string; placeId2: string }> }
        for (const pair of body.pairs) dismissed.delete(pairKey(pair))
        return jsonResponse({ status: 'success' })
      }
      if (url.startsWith('/api/review/postcard/')) {
        const id = decodeURIComponent(url.slice('/api/review/postcard/'.length))
        const row = placesById.get(id)
        if (!row) return jsonResponse({ message: 'Place not found' }, 404)
        return jsonResponse({ ...postcardFor(row), screenshot: sharedShot })
      }
      if (!previous) return jsonResponse({ status: 'success' })
      return previous(input, init)
    })
    return {
      pendingChecks,
      queue: {
        entries: [entryFrom(placeTwo, secondSource), entryFrom(placeOne, firstSource)],
        postcard: { ...postcardFor(placeOne), screenshot: sharedShot },
        initialPlaceId: 'plc_one',
      },
    }
  }

  function oneCafeChecks() {
    return fetchMock.mock.calls.filter((call) => {
      const url = requestUrl(call[0] as RequestInfo)
      return url.includes('/duplicate-check') && url.includes('plc_one')
    }).length
  }

  it('brings Merge and Keep both back on the open card when Keep both is undone', async () => {
    const user = userEvent.setup()
    const { queue } = installDismissedPairFetch()
    renderQueue(queue)

    await user.click(await screen.findByRole('button', { name: 'Keep both' }))
    await waitFor(() => expect(posted('/api/places/dismiss-duplicate', 'POST')).toHaveLength(1))
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    const checksBeforeReturn = oneCafeChecks()
    await user.click(screen.getByRole('button', { name: /One Cafe/ }))
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe'))
    await waitFor(() => expect(oneCafeChecks()).toBeGreaterThan(checksBeforeReturn))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.queryByRole('button', { name: 'Merge into Fjellheisen' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Keep both' })).not.toBeInTheDocument()

    const toast = notifySuccess.mock.calls.find((call) => call[0] === 'Kept both: One Cafe and Fjellheisen')
    const undo = (toast?.[1]?.cancel as { onClick?: () => void } | undefined)?.onClick
    const checksBeforeUndo = oneCafeChecks()
    await act(async () => { await undo?.() })

    await waitFor(() => expect(oneCafeChecks()).toBeGreaterThan(checksBeforeUndo))
    expect(await screen.findByRole('button', { name: 'Merge into Fjellheisen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep both' })).toBeInTheDocument()
    expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe')
    expect(posted('/api/places/dismiss-duplicate', 'DELETE')).toEqual([
      { pairs: [{ placeId1: 'plc_one', placeId2: 'plc_lib' }] },
    ])
  })

  it('hides Merge on the open card when Keep both finishes after coming back', async () => {
    const user = userEvent.setup()
    let releaseDismiss: () => void = () => {}
    const dismissGate = new Promise<void>((resolve) => {
      releaseDismiss = resolve
    })
    const { queue } = installDismissedPairFetch({ dismissGate })
    renderQueue(queue)

    await user.click(await screen.findByRole('button', { name: 'Keep both' }))
    await waitFor(() => expect(posted('/api/places/dismiss-duplicate', 'POST')).toHaveLength(1))
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    await user.click(screen.getByRole('button', { name: /One Cafe/ }))
    expect(await screen.findByRole('button', { name: 'Merge into Fjellheisen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep both' })).toBeInTheDocument()

    await act(async () => { releaseDismiss() })

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Merge into Fjellheisen' })).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Keep both' })).not.toBeInTheDocument()
    expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe')
    expect(notifySuccess.mock.calls.some((call) => call[0] === 'Kept both: One Cafe and Fjellheisen')).toBe(true)
  })

  it('ignores a duplicate check that started before Keep both undo', async () => {
    const user = userEvent.setup()
    let holdOneChecks = false
    const { queue, pendingChecks } = installDismissedPairFetch({ holdOneChecks: () => holdOneChecks })
    renderQueue(queue)

    await user.click(await screen.findByRole('button', { name: 'Keep both' }))
    await waitFor(() => expect(posted('/api/places/dismiss-duplicate', 'POST')).toHaveLength(1))
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    holdOneChecks = true
    await user.click(screen.getByRole('button', { name: /One Cafe/ }))
    await waitFor(() => expect(pendingChecks).toHaveLength(1))

    const toast = notifySuccess.mock.calls.find((call) => call[0] === 'Kept both: One Cafe and Fjellheisen')
    const undo = (toast?.[1]?.cancel as { onClick?: () => void } | undefined)?.onClick
    await act(async () => { await undo?.() })
    await waitFor(() => expect(pendingChecks).toHaveLength(2))

    await act(async () => {
      const releases = pendingChecks.splice(0)
      releases[1]()
      releases[0]()
    })

    expect(await screen.findByRole('button', { name: 'Merge into Fjellheisen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep both' })).toBeInTheDocument()
    expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe')
  })
})
