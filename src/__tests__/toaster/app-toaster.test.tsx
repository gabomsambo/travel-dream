/**
 * Regression guard: Sonner was wired at 161 call sites but never mounted, so
 * every toast was a no-op. Assert the toaster renders, shows each type, stays
 * singleton, and survives client navigation (layout-level mount).
 */

jest.unmock('sonner')

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'next-themes'
import { toast } from 'sonner'
import { AppToaster } from '@/components/app-toaster'

const mockPush = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/library',
}))

function AppShell({ children }: { children?: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <AppToaster />
      {children}
    </ThemeProvider>
  )
}

function countToasters() {
  const mounted = document.querySelectorAll('[data-sonner-toaster]').length
  if (mounted > 0) return mounted
  return document.querySelectorAll('section[aria-live="polite"][aria-label*="Notifications"]').length
}

beforeEach(() => {
  mockPush.mockClear()
  toast.dismiss()
})

describe('AppToaster', () => {
  it('renders exactly one toaster instance', () => {
    render(<AppShell />)
    expect(countToasters()).toBe(1)
  })

  it('shows visible text for each toast type', async () => {
    const user = userEvent.setup()
    render(
      <AppShell>
        <button type="button" onClick={() => toast.success('Success message')}>
          success
        </button>
        <button type="button" onClick={() => toast.error('Error message')}>
          error
        </button>
        <button type="button" onClick={() => toast.info('Info message')}>
          info
        </button>
        <button type="button" onClick={() => toast.warning('Warning message')}>
          warning
        </button>
        <button type="button" onClick={() => toast.loading('Loading message')}>
          loading
        </button>
      </AppShell>
    )

    await user.click(screen.getByRole('button', { name: 'success' }))
    expect(await screen.findByText('Success message')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'error' }))
    expect(await screen.findByText('Error message')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'info' }))
    expect(await screen.findByText('Info message')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'warning' }))
    expect(await screen.findByText('Warning message')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'loading' }))
    expect(await screen.findByText('Loading message')).toBeVisible()

    expect(countToasters()).toBe(1)
  })

  it('keeps a single toaster mounted across client navigation', async () => {
    const user = userEvent.setup()

    function Page({ label }: { label: string }) {
      return (
        <button type="button" onClick={() => toast.success(`${label} toast`)}>
          fire on {label}
        </button>
      )
    }

    const { rerender } = render(
      <AppShell>
        <Page label="library" />
      </AppShell>
    )

    await user.click(screen.getByRole('button', { name: 'fire on library' }))
    expect(await screen.findByText('library toast')).toBeVisible()
    expect(countToasters()).toBe(1)

    act(() => {
      rerender(
        <AppShell>
          <Page label="inbox" />
        </AppShell>
      )
    })

    expect(countToasters()).toBe(1)

    await user.click(screen.getByRole('button', { name: 'fire on inbox' }))
    await waitFor(() => {
      expect(screen.getByText('inbox toast')).toBeVisible()
    })
    expect(countToasters()).toBe(1)
  })
})
