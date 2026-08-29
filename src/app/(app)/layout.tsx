import { cookies } from 'next/headers'
import { Sidebar } from '@/components/navigation/sidebar'
import { Header } from '@/components/layout/header'
import { GlobalHotkeys } from '@/components/global-hotkeys'
import { UIRefreshProvider } from '@/components/ui-refresh-provider'
import { requireAuth } from '@/lib/auth-helpers'
import { UI_THEME_COOKIE, normalizeUiTheme } from '@/lib/ui-theme'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAuth()

  // Resolved on the server so the first painted frame is already the right
  // theme. This layout is dynamic anyway (requireAuth reads the session), so
  // the cookie read costs nothing here.
  const cookieStore = await cookies()
  const uiTheme = normalizeUiTheme(cookieStore.get(UI_THEME_COOKIE)?.value)

  return (
    <UIRefreshProvider theme={uiTheme}>
      <GlobalHotkeys />
      {/*
        Only tropical gets an attribute. Classic is the `:root` default, so
        emitting data-theme="classic" would add nothing — and it would override
        the <html> attribute the provider sets, which is what lets the one-time
        legacy migration flip the theme without a server round-trip.
      */}
      {/*
        The themed subtree paints its own canvas: <body> carries bg-background
        but sits outside it, so without this a tropical user would see the
        classic background for the first frame, until the provider mirrors the
        attribute onto <html>. In the steady state both resolve identically.
      */}
      <div
        data-theme={uiTheme === 'tropical' ? 'tropical' : undefined}
        className="flex h-screen overflow-hidden bg-background text-foreground"
      >
        <div className="hidden md:block">
          <Sidebar />
        </div>
        <div className="flex flex-1 flex-col">
          <Header />
          <main className="flex-1 overflow-y-auto p-3 sm:p-6">
            {children}
          </main>
        </div>
      </div>
    </UIRefreshProvider>
  )
}
