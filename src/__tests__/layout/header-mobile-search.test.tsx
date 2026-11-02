import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Header } from '@/components/layout/header'

const openPalette = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/inbox',
}))

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { name: 'Ada Lovelace', email: 'ada@example.com' } },
    status: 'authenticated',
  }),
  signOut: jest.fn(() => Promise.resolve()),
}))

jest.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme: jest.fn() }),
}))

jest.mock('@/components/activity/activity-provider', () => ({
  useActivityJobs: () => ({
    jobs: [],
    connectionState: 'idle',
    observeSession: jest.fn(),
    acknowledge: jest.fn(),
  }),
}))

jest.mock('@/components/navigation/mobile-nav', () => ({
  MobileNav: () => <button type="button" aria-label="Open menu" />,
}))

jest.mock('@/components/search/search-bar', () => ({
  SearchBar: ({ placeholder }: { placeholder?: string }) => (
    <input aria-label="Search places field" placeholder={placeholder} />
  ),
}))

jest.mock('@/components/search/command-palette', () => ({
  CommandPalette: ({ open }: { open: boolean; onOpenChange: (open: boolean) => void }) => {
    openPalette(open)
    return open ? <div role="dialog" aria-label="Command palette">palette</div> : null
  },
}))

jest.mock('next/dynamic', () => {
  return (loader: () => Promise<{ default: React.ComponentType<unknown> }>) => {
    const React = require('react') as typeof import('react')
    const Lazy = React.lazy(loader)
    return function Dynamic(props: Record<string, unknown>) {
      return (
        <React.Suspense fallback={null}>
          <Lazy {...props} />
        </React.Suspense>
      )
    }
  }
})

describe('header mobile search', () => {
  beforeEach(() => {
    openPalette.mockClear()
  })

  it('opens the command palette from the Search icon button', async () => {
    const user = userEvent.setup()
    render(<Header />)

    const search = await screen.findByRole('button', { name: 'Search' })
    await user.click(search)

    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeInTheDocument()
  })
})
