import { render, screen } from '@testing-library/react'
import ExploreLayout from '@/app/(app)/explore/layout'
import { loadExploreCached } from '@/lib/explore/load'

jest.mock('@/lib/auth-helpers', () => ({
  requireAuth: jest.fn(async () => ({ id: 'user_1' })),
}))

jest.mock('@/lib/explore/load', () => ({
  loadExploreCached: jest.fn(),
}))

jest.mock('@/components/explore/fonts', () => ({
  editorialFont: { variable: 'font-editorial-var' },
}))

describe('Explore layout', () => {
  // A layout above loading.tsx is rendered by every link prefetch of an Explore
  // route, from any page of the app: whatever it loads is sent to all of them.
  it('loads no places and wraps no provider, so prefetching an Explore link costs nothing', async () => {
    render(await ExploreLayout({ children: <p>page</p> }))
    expect(screen.getByText('page')).toBeInTheDocument()
    expect(loadExploreCached).not.toHaveBeenCalled()
  })
})
