/**
 * UI theme (visual skin) — "classic" (the original blue/white look) or
 * "tropical" (the Tropical Boutique Explorer look).
 *
 * This is a separate axis from next-themes' dark/light mode: the two combine,
 * so there are four visual states. Dark/light stays on `class` on <html>;
 * this one is a `data-theme` attribute.
 *
 * The choice is persisted in a cookie rather than localStorage so the server
 * can render the right theme on the first paint (no flash). It is read in
 * `src/app/(app)/layout.tsx`, which is already dynamic, so the read costs
 * nothing; the marketing routes deliberately do not read it and stay static.
 *
 * Token definitions live in `src/styles/globals.css`.
 */

export const UI_THEME_COOKIE = 'ui-theme'

export const UI_THEMES = ['classic', 'tropical'] as const

export type UiTheme = (typeof UI_THEMES)[number]

/** Classic is the default: what a visitor with no stored preference sees. */
export const DEFAULT_UI_THEME: UiTheme = 'classic'

/** Legacy localStorage flag, kept only so an existing opt-in can be migrated. */
export const LEGACY_UI_REFRESH_KEY = 'ui-refresh-enabled'

/** One year, in seconds. */
export const UI_THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/**
 * Coerce any cookie value to a theme we can actually render.
 *
 * Absent, unrecognised and stale values all collapse to `classic`, which is
 * what makes a missing/garbage cookie a working experience rather than a
 * broken one.
 */
export function normalizeUiTheme(value: string | null | undefined): UiTheme {
  return (UI_THEMES as readonly string[]).includes(value ?? '')
    ? (value as UiTheme)
    : DEFAULT_UI_THEME
}

/**
 * Write the theme cookie from the browser.
 *
 * The single place the client-side attributes live, so they cannot drift from
 * each other; the server action in `ui-theme-actions.ts` writes the same cookie
 * durably afterwards. `secure` is mirrored from that action, which sets it in
 * production — over https both writers must produce the same cookie, or the
 * client write is replaced rather than upgraded.
 */
export function writeUiThemeCookie(theme: UiTheme): void {
  const secure = window.location.protocol === 'https:' ? '; secure' : ''

  document.cookie = `${UI_THEME_COOKIE}=${normalizeUiTheme(theme)}; path=/; max-age=${UI_THEME_COOKIE_MAX_AGE}; samesite=lax${secure}`
}

/**
 * Read the theme cookie from the browser.
 *
 * Returns `null` when no cookie is set at all, which is a different question
 * from "which theme" — the legacy migration needs to distinguish "never chose"
 * from "chose classic". A present but unrecognised value normalizes to classic.
 *
 * Never throws. It runs inside effects on every (app) page, so a throw here
 * would take the whole tree into the root error boundary; a cookie nobody in
 * this codebase wrote — including one with malformed percent-encoding, which
 * `decodeURIComponent` rejects — is just another unrecognised value.
 */
export function readUiThemeCookie(): UiTheme | null {
  const prefix = `${UI_THEME_COOKIE}=`
  const entry = document.cookie
    .split('; ')
    .find((part) => part.startsWith(prefix))

  if (entry === undefined) return null

  const raw = entry.slice(prefix.length)

  let decoded: string
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    return DEFAULT_UI_THEME
  }

  return normalizeUiTheme(decoded)
}
