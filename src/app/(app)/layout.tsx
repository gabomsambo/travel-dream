import { Sidebar } from '@/components/navigation/sidebar'
import { Header } from '@/components/layout/header'
import { GlobalHotkeys } from '@/components/global-hotkeys'
import { requireAuth } from '@/lib/auth-helpers'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAuth()

  return (
    <>
      <GlobalHotkeys />
      <div className="flex h-screen overflow-hidden">
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
    </>
  )
}
