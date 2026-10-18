import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReviewQueue } from '@/components/review/review-queue'
import { notify } from '@/lib/notify'
import type { ReviewQueueItem } from '@/lib/review-queue'
import type { PlaceWithRelations, Source } from '@/types/database'

const mockPush = jest.fn()
const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}))
jest.mock('@/components/places/place-view/place-view', () => ({
  PlaceView: ({ place }: { place: PlaceWithRelations }) => <div data-testid="postcard">{place.name}</div>,
}))
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

const firstSource = source('one')
const secondSource = source('two')
const items: ReviewQueueItem[] = [
  { place: place('plc_one', 'One Cafe', firstSource), source: firstSource, screenshotUrl: firstSource.uri, screenshotName: 'one.jpg', uploadLabel: 'one.jpg', alsoIn: [] },
  { place: place('plc_two', 'Two Cafe', secondSource), source: secondSource, screenshotUrl: secondSource.uri, screenshotName: 'two.jpg', uploadLabel: 'two.jpg', alsoIn: [] },
]

describe('ReviewQueue decisions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'success' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    window.history.replaceState({}, '', '/review')
  })

  it('adds, advances, and offers an Undo that restores Inbox and the original card', async () => {
    const user = userEvent.setup()
    render(<ReviewQueue items={items} trips={[]} />)

    expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe')
    await user.click(screen.getAllByRole('button', { name: /Add to Library/i })[0])

    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/places/plc_one', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ status: 'library' }),
    }))

    await waitFor(() => expect(notifySuccess).toHaveBeenCalled())
    const toastOptions = notifySuccess.mock.calls[0][1]
    const cancel = toastOptions?.cancel as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined
    const undo = cancel?.onClick
    expect(undo).toBeInstanceOf(Function)
    await act(async () => { undo?.({} as React.MouseEvent<HTMLButtonElement>) })

    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('One Cafe'))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/places/plc_one', expect.objectContaining({
      body: JSON.stringify({ status: 'inbox' }),
    }))
  })

  it('uses keyboard decisions, never confirms archive, and summarizes skipped places', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false)
    render(<ReviewQueue items={items} trips={[]} />)

    fireEvent.keyDown(window, { key: 'n' })
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/places/plc_one', expect.objectContaining({
      body: JSON.stringify({ status: 'archived' }),
    }))

    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(screen.getByText("That's everything.")).toBeInTheDocument())
    expect(screen.getAllByText('1', { selector: 'strong' })).toHaveLength(2)
    expect(screen.getByText('Two Cafe')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    confirmSpy.mockRestore()
  })
  it('keeps letter shortcuts working after a mouse click leaves focus on a button', async () => {
    const user = userEvent.setup()
    render(<ReviewQueue items={items} trips={[]} />)

    const skipButton = screen.getAllByRole('button', { name: /Skip for now/i })[0]
    await user.click(skipButton)
    await waitFor(() => expect(screen.getByTestId('postcard')).toHaveTextContent('Two Cafe'))
    skipButton.focus()

    fireEvent.keyDown(skipButton, { key: 'n' })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/places/plc_two', expect.objectContaining({
      body: JSON.stringify({ status: 'archived' }),
    })))

    // Enter on a focused button is the button's own click, not a second "Add".
    fireEvent.keyDown(skipButton, { key: 'Enter' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
