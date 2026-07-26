"use client"

import { useEffect, useState } from "react"
import { UIRefreshProvider } from "@/components/ui-refresh-provider"
import {
  DEFAULT_UI_THEME,
  readUiThemeCookie,
  type UiTheme,
} from "@/lib/ui-theme"

/**
 * Resolves the theme from the cookie in the browser.
 *
 * For the root `error.tsx` and `not-found.tsx` boundaries only. Those render
 * outside the (app) segment — and the root error boundary replaces that subtree
 * outright — so no server-resolved theme reaches them, and reading the cookie in
 * the root layout is not an option: it would drag the static marketing routes
 * into dynamic rendering.
 *
 * The cost is one classic frame before the effect corrects it, which is
 * acceptable on an error or 404 page and is the same trade the legacy migration
 * already makes. Everywhere else the theme still arrives from the server.
 */
export function ClientUiThemeProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [theme, setTheme] = useState<UiTheme>(DEFAULT_UI_THEME)

  useEffect(() => {
    setTheme(readUiThemeCookie() ?? DEFAULT_UI_THEME)
  }, [])

  return <UIRefreshProvider theme={theme}>{children}</UIRefreshProvider>
}
