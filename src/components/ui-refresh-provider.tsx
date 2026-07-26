"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  DEFAULT_UI_THEME,
  LEGACY_UI_REFRESH_KEY,
  readUiThemeCookie,
  writeUiThemeCookie,
  type UiTheme,
} from "@/lib/ui-theme"

/**
 * Carries the server-resolved UI theme down to the adapters.
 *
 * The value arrives from `(app)/layout.tsx`, which read it from the cookie, so
 * it is already correct during SSR and on the very first client render.
 * Nothing here reads localStorage to decide the theme — that is what used to
 * cause the flash.
 *
 * Outside the (app) tree there is no provider, so the context default applies
 * and those routes render classic. That is intentional: the marketing routes
 * ship no theme code and stay statically rendered.
 */
const UiThemeContext = createContext<UiTheme>(DEFAULT_UI_THEME)

/** The active visual theme. */
export function useUiTheme(): UiTheme {
  return useContext(UiThemeContext)
}

/** Convenience for the adapters, which branch on "is this the tropical tree?". */
export function useUiRefreshEnabled(): boolean {
  return useUiTheme() === "tropical"
}

function hasThemeCookie(): boolean {
  return readUiThemeCookie() !== null
}

export function UIRefreshProvider({
  theme: serverTheme,
  children,
}: {
  theme: UiTheme
  children: React.ReactNode
}) {
  const router = useRouter()

  // Seeded from the server value, so SSR and the first client render already
  // agree. Local state exists only so the one-time legacy migration below can
  // flip the tree immediately instead of waiting on a server round-trip.
  const [theme, setTheme] = useState<UiTheme>(serverTheme)
  const [lastServerTheme, setLastServerTheme] = useState<UiTheme>(serverTheme)

  // A new server theme takes effect during this render, not in an effect after
  // it. The shell element it is rendered on already carries the new
  // `data-theme`, so a passive effect would leave one painted frame where the
  // tropical custom properties apply to the classic component tree — exactly
  // the flash this whole path exists to remove.
  if (lastServerTheme !== serverTheme) {
    setLastServerTheme(serverTheme)
    setTheme(serverTheme)
  }

  // Radix renders dialogs, popovers, tooltips and toasts through a portal into
  // document.body — outside the themed shell element — so mirror the attribute
  // onto <html> to keep those in the same theme. Portalled content only ever
  // mounts after hydration, so doing this in an effect costs nothing at first
  // paint.
  //
  // The cleanup matters: (app) and (marketing) share a root layout, so a soft
  // navigation out of the app tree unmounts this provider while <html> lives
  // on. Without it a tropical user would drag tropical tokens onto the
  // marketing routes, which render the classic tree. Swapping themes in place
  // runs cleanup and effect in the same commit, before paint, so there is no
  // flicker.
  useEffect(() => {
    if (theme !== "tropical") {
      document.documentElement.removeAttribute("data-theme")
      return
    }

    document.documentElement.setAttribute("data-theme", "tropical")
    return () => {
      document.documentElement.removeAttribute("data-theme")
    }
  }, [theme])

  // One-time migration: someone who opted into tropical before this shipped has
  // the old localStorage flag and no cookie. Honour it once, then let the
  // cookie be the source of truth. Without this they would silently revert to
  // classic.
  //
  // The flag is dropped as soon as it has been honoured, so this really is
  // one-shot. A cookie can disappear long after the migration — clearing
  // cookies without clearing site storage is the common browser default — and a
  // surviving flag would then re-apply tropical over a later explicit choice.
  //
  // localStorage cannot be read on the server, so this necessarily costs those
  // users one corrected frame — only on the single load that migrates them.
  useEffect(() => {
    if (hasThemeCookie()) return

    let legacyOptIn = false
    try {
      legacyOptIn = localStorage.getItem(LEGACY_UI_REFRESH_KEY) === "true"
    } catch {
      // localStorage can throw in private/blocked contexts — treat as no opt-in.
    }
    if (!legacyOptIn) return

    writeUiThemeCookie("tropical")
    try {
      localStorage.removeItem(LEGACY_UI_REFRESH_KEY)
    } catch {
      // Blocked storage again: the read above already succeeded, so this is the
      // rare quota/permission case. The cookie now exists either way.
    }
    setTheme("tropical")
    router.refresh()
  }, [router])

  return (
    <UiThemeContext.Provider value={theme}>{children}</UiThemeContext.Provider>
  )
}
