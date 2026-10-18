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
  }: {
    initialPlaceId?: string
    entries: { placeId: string }[]
  }) => (
    <div data-testid="review-queue" data-initial-place-id={initialPlaceId ?? ''} data-count={String(entries.length)} />
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
    expect(mockLoad).toHaveBeenCalledWith('user_review', 'plc_library')
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})
