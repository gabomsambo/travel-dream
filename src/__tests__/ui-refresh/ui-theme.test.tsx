/**
 * UI theme (classic / tropical) — cookie-backed, server-rendered selection.
 *
 * These cover the reliability contract: an absent, stale or malformed
 * preference must always resolve to a working classic experience, and an
 * existing localStorage opt-in must survive the move to cookies.
 */

import { render, screen, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import {
  DEFAULT_UI_THEME,
  LEGACY_UI_REFRESH_KEY,
  UI_THEME_COOKIE,
  normalizeUiTheme,
} from '@/lib/ui-theme'
import {
  UIRefreshProvider,
  useUiTheme,
  useUiRefreshEnabled,
} from '@/components/ui-refresh-provider'

const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

function Probe() {
  return (
    <>
      <span data-testid="theme">{useUiTheme()}</span>
      <span data-testid="tropical">{String(useUiRefreshEnabled())}</span>
    </>
  )
}

function clearCookies() {
  for (const entry of document.cookie.split('; ')) {
    const name = entry.split('=')[0]
    if (name) document.cookie = `${name}=; path=/; max-age=0`
  }
}

beforeEach(() => {
  mockRefresh.mockClear()
  clearCookies()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('normalizeUiTheme', () => {
  it('accepts the two real themes', () => {
    expect(normalizeUiTheme('classic')).toBe('classic')
    expect(normalizeUiTheme('tropical')).toBe('tropical')
  })

  it('falls back to classic for absent, empty or unknown values', () => {
    expect(normalizeUiTheme(undefined)).toBe(DEFAULT_UI_THEME)
    expect(normalizeUiTheme(null)).toBe(DEFAULT_UI_THEME)
    expect(normalizeUiTheme('')).toBe(DEFAULT_UI_THEME)
    expect(normalizeUiTheme('banana')).toBe(DEFAULT_UI_THEME)
    expect(normalizeUiTheme('TROPICAL')).toBe(DEFAULT_UI_THEME)
  })

  it('defaults to classic', () => {
    expect(DEFAULT_UI_THEME).toBe('classic')
  })
})

describe('UIRefreshProvider', () => {
  it('uses the server-resolved theme, with no localStorage read', () => {
    render(
      <UIRefreshProvider theme="tropical">
        <Probe />
      </UIRefreshProvider>
    )

    expect(screen.getByTestId('theme')).toHaveTextContent('tropical')
    expect(screen.getByTestId('tropical')).toHaveTextContent('true')
  })

  it('renders classic when the server says classic', () => {
    render(
      <UIRefreshProvider theme="classic">
        <Probe />
      </UIRefreshProvider>
    )

    expect(screen.getByTestId('theme')).toHaveTextContent('classic')
    expect(screen.getByTestId('tropical')).toHaveTextContent('false')
  })

  it('defaults to classic with no provider at all (marketing routes)', () => {
    render(<Probe />)

    expect(screen.getByTestId('theme')).toHaveTextContent('classic')
  })

  it('mirrors tropical onto <html> so portalled content is themed too', () => {
    render(
      <UIRefreshProvider theme="tropical">
        <Probe />
      </UIRefreshProvider>
    )

    expect(document.documentElement.getAttribute('data-theme')).toBe('tropical')
  })

  it('leaves no attribute on <html> for classic', () => {
    render(
      <UIRefreshProvider theme="classic">
        <Probe />
      </UIRefreshProvider>
    )

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('migrates a legacy localStorage opt-in to the cookie, once', () => {
    localStorage.setItem(LEGACY_UI_REFRESH_KEY, 'true')

    render(
      <UIRefreshProvider theme="classic">
        <Probe />
      </UIRefreshProvider>
    )

    expect(document.cookie).toContain(`${UI_THEME_COOKIE}=tropical`)
    // and it flips immediately rather than waiting for the server round-trip
    expect(screen.getByTestId('theme')).toHaveTextContent('tropical')
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('does not migrate when the legacy flag is absent or false', () => {
    localStorage.setItem(LEGACY_UI_REFRESH_KEY, 'false')

    render(
      <UIRefreshProvider theme="classic">
        <Probe />
      </UIRefreshProvider>
    )

    expect(document.cookie).not.toContain(UI_THEME_COOKIE)
    expect(screen.getByTestId('theme')).toHaveTextContent('classic')
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('does not let a stale legacy flag override an existing cookie choice', () => {
    // User opted into tropical long ago, then explicitly switched back to
    // classic. The cookie is authoritative; the stale flag must not win.
    document.cookie = `${UI_THEME_COOKIE}=classic; path=/`
    localStorage.setItem(LEGACY_UI_REFRESH_KEY, 'true')

    render(
      <UIRefreshProvider theme="classic">
        <Probe />
      </UIRefreshProvider>
    )

    expect(screen.getByTestId('theme')).toHaveTextContent('classic')
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('follows the server when the theme changes underneath it', () => {
    const { rerender } = render(
      <UIRefreshProvider theme="classic">
        <Probe />
      </UIRefreshProvider>
    )
    expect(screen.getByTestId('theme')).toHaveTextContent('classic')

    act(() => {
      rerender(
        <UIRefreshProvider theme="tropical">
          <Probe />
        </UIRefreshProvider>
      )
    })

    expect(screen.getByTestId('theme')).toHaveTextContent('tropical')
    expect(document.documentElement.getAttribute('data-theme')).toBe('tropical')
  })
})
