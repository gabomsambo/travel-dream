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
  readUiThemeCookie,
  type UiTheme,
} from '@/lib/ui-theme'
import {
  UIRefreshProvider,
  useUiTheme,
  useUiRefreshEnabled,
} from '@/components/ui-refresh-provider'
import { ClientUiThemeProvider } from '@/components/client-ui-theme-provider'

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

describe('readUiThemeCookie', () => {
  it('distinguishes "no preference" from "chose classic"', () => {
    expect(readUiThemeCookie()).toBeNull()

    document.cookie = `${UI_THEME_COOKIE}=classic; path=/`
    expect(readUiThemeCookie()).toBe('classic')
  })

  it('reads a tropical preference', () => {
    document.cookie = `${UI_THEME_COOKIE}=tropical; path=/`

    expect(readUiThemeCookie()).toBe('tropical')
  })

  it('normalizes a present but unusable value to classic, not null', () => {
    document.cookie = `${UI_THEME_COOKIE}=banana; path=/`

    expect(readUiThemeCookie()).toBe(DEFAULT_UI_THEME)
  })

  it.each(['100%', '%zz', '%', 'tropical%E0%A4%A'])(
    'treats the malformed percent-encoded value %p as classic without throwing',
    (value) => {
      // decodeURIComponent rejects these. This runs in an effect on every (app)
      // page, so throwing would drop the whole tree into the error boundary.
      document.cookie = `${UI_THEME_COOKIE}=${value}; path=/`

      expect(() => readUiThemeCookie()).not.toThrow()
      expect(readUiThemeCookie()).toBe(DEFAULT_UI_THEME)
    }
  )
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

  it('drops the <html> attribute when the provider unmounts', () => {
    // A soft navigation out of (app) into the marketing tree unmounts the
    // provider but keeps <html>; the tropical tokens must not survive it.
    const { unmount } = render(
      <UIRefreshProvider theme="tropical">
        <Probe />
      </UIRefreshProvider>
    )
    expect(document.documentElement.getAttribute('data-theme')).toBe('tropical')

    act(() => {
      unmount()
    })

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

  it('clears the legacy flag, so losing the cookie later cannot re-migrate', () => {
    // The flag survives "clear cookies" — the common browser default leaves site
    // storage alone — so if the migration did not consume it, it would later
    // re-apply tropical over a more recent explicit choice.
    localStorage.setItem(LEGACY_UI_REFRESH_KEY, 'true')

    const first = render(
      <UIRefreshProvider theme="classic">
        <Probe />
      </UIRefreshProvider>
    )

    expect(document.cookie).toContain(`${UI_THEME_COOKIE}=tropical`)
    expect(localStorage.getItem(LEGACY_UI_REFRESH_KEY)).toBeNull()

    act(() => {
      first.unmount()
    })
    clearCookies()
    mockRefresh.mockClear()

    render(
      <UIRefreshProvider theme="classic">
        <Probe />
      </UIRefreshProvider>
    )

    expect(document.cookie).not.toContain(UI_THEME_COOKIE)
    expect(screen.getByTestId('theme')).toHaveTextContent('classic')
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('survives a malformed cookie instead of crashing the app tree', () => {
    // The migration effect reads the cookie on every (app) page, so a throw
    // there would take the whole tree into the root error boundary.
    document.cookie = `${UI_THEME_COOKIE}=100%; path=/`
    localStorage.setItem(LEGACY_UI_REFRESH_KEY, 'true')

    expect(() =>
      render(
        <UIRefreshProvider theme="classic">
          <Probe />
        </UIRefreshProvider>
      )
    ).not.toThrow()

    // The cookie is present, however garbled, so it still counts as a choice
    // and the legacy flag must not override it.
    expect(screen.getByTestId('theme')).toHaveTextContent('classic')
    expect(mockRefresh).not.toHaveBeenCalled()
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

  it('reports the new server theme on the very first render after it changes', () => {
    // The element the server renders `data-theme` on already carries the new
    // theme's custom properties. If the context caught up only in a passive
    // effect, consumers would render the old tree for one painted frame —
    // tropical colours on classic components. So assert on the render sequence,
    // not just the settled value: no intermediate render with the stale theme.
    const rendered: UiTheme[] = []

    function RenderLog() {
      rendered.push(useUiTheme())
      return null
    }

    const { rerender } = render(
      <UIRefreshProvider theme="classic">
        <RenderLog />
      </UIRefreshProvider>
    )
    expect(rendered).toEqual(['classic'])

    rendered.length = 0
    act(() => {
      rerender(
        <UIRefreshProvider theme="tropical">
          <RenderLog />
        </UIRefreshProvider>
      )
    })

    expect(rendered).toEqual(['tropical'])
  })
})

describe('ClientUiThemeProvider', () => {
  // The root error and 404 boundaries render outside (app), so no server-
  // resolved theme reaches them and the cookie must be read in the browser.

  it('resolves tropical from the cookie and themes portalled content too', () => {
    document.cookie = `${UI_THEME_COOKIE}=tropical; path=/`

    render(
      <ClientUiThemeProvider>
        <Probe />
      </ClientUiThemeProvider>
    )

    expect(screen.getByTestId('theme')).toHaveTextContent('tropical')
    expect(screen.getByTestId('tropical')).toHaveTextContent('true')
    expect(document.documentElement.getAttribute('data-theme')).toBe('tropical')
  })

  it('stays classic with no cookie, and with an unrecognised one', () => {
    const { unmount } = render(
      <ClientUiThemeProvider>
        <Probe />
      </ClientUiThemeProvider>
    )
    expect(screen.getByTestId('theme')).toHaveTextContent('classic')

    act(() => {
      unmount()
    })
    document.cookie = `${UI_THEME_COOKIE}=banana; path=/`

    render(
      <ClientUiThemeProvider>
        <Probe />
      </ClientUiThemeProvider>
    )

    expect(screen.getByTestId('theme')).toHaveTextContent('classic')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })
})
