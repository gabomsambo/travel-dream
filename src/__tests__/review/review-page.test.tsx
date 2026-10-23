import { render, screen } from '@testing-library/react'
import ReviewPage from '@/app/(app)/review/page'
import { loadReviewQueue } from '@/lib/review-queue'

const mockRedirect = jest.fn((url: string) => {
  throw new Error(`redirect:${url}`)
})

jest.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
}))

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(async () => ({ user: { id: 'user_review' } })),
}))

jest.mock('@/lib/review-queue', () => ({
  loadReviewQueue: jest.fn(),
}))

jest.mock('@/components/review/review-queue', () => ({
  ReviewQueue: ({
    initialPlaceId,
    entries,
    uploadSessionId,
  }: {
    initialPlaceId?: string
    entries: { placeId: string }[]
    uploadSessionId?: string
  }) => (
    <div
      data-testid="review-queue"
      data-initial-place-id={initialPlaceId ?? ''}
      data-upload={uploadSessionId ?? ''}
      data-count={String(entries.length)}
    />
  ),
}))

const mockLoad = loadReviewQueue as jest.MockedFunction<typeof loadReviewQueue>

describe('Review page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockLoad.mockResolvedValue({ entries: [], postcard: null, trips: [] })
  })

  it('keeps a place that is no longer inbox on the review page', async () => {
    render(await ReviewPage({ searchParams: Promise.resolve({ placeId: 'plc_library' }) }))

    expect(screen.getByTestId('review-queue')).toHaveAttribute('data-initial-place-id', 'plc_library')
    expect(screen.getByTestId('review-queue')).toHaveAttribute('data-upload', '')
    expect(mockLoad).toHaveBeenCalledWith('user_review', 'plc_library', undefined)
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('asks for one upload when the link names that upload', async () => {
    mockLoad.mockResolvedValue({
      entries: [{ placeId: 'P3' } as never],
      postcard: null,
      trips: [],
    })

    render(await ReviewPage({ searchParams: Promise.resolve({ upload: 'session_newest', placeId: 'P3' }) }))

    expect(mockLoad).toHaveBeenCalledWith('user_review', 'P3', 'session_newest')
    expect(screen.getByTestId('review-queue')).toHaveAttribute('data-upload', 'session_newest')
    expect(screen.getByTestId('review-queue')).toHaveAttribute('data-initial-place-id', 'P3')
    expect(screen.getByTestId('review-queue')).toHaveAttribute('data-count', '1')
  })
})
