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
