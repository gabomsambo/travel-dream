'use server'

import { cookies } from 'next/headers'
import {
  UI_THEME_COOKIE,
  UI_THEME_COOKIE_MAX_AGE,
  UI_THEME_COOKIE_SECURE,
  normalizeUiTheme,
  type UiTheme,
} from './ui-theme'

/**
 * Persist the visual theme choice.
 *
 * Cookies can only be written from a Server Function or Route Handler — not
 * during a Server Component render — so the settings switch calls this.
 *
 * Deliberately not `httpOnly`: the switch writes the same cookie client-side
 * first so the change is instant, and this call makes it durable.
 *
 * Every attribute comes from `ui-theme.ts`, which is also what
 * `writeUiThemeCookie` writes. Cookie identity is (name, domain, path), so this
 * replaces the client-side write rather than upgrading it — sharing the
 * definitions is what keeps the replacement a no-op instead of a downgrade.
 */
export async function setUiTheme(theme: UiTheme): Promise<void> {
  const cookieStore = await cookies()

  cookieStore.set(UI_THEME_COOKIE, normalizeUiTheme(theme), {
    path: '/',
    maxAge: UI_THEME_COOKIE_MAX_AGE,
    sameSite: 'lax',
    secure: UI_THEME_COOKIE_SECURE,
  })
}
