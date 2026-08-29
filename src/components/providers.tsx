"use client"

import * as React from "react"
import { SessionProvider } from "next-auth/react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { type ThemeProviderProps } from "next-themes/dist/types"

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        {/*
          The UI theme provider lives in (app)/layout.tsx, not here: it needs
          the cookie value resolved on the server, and reading a cookie in this
          root layout would opt the static marketing routes into dynamic
          rendering for no benefit — they ship no theme code.
        */}
        {children}
      </ThemeProvider>
    </SessionProvider>
  )
}
