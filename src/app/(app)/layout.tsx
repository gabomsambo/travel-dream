import { Sidebar } from '@/components/navigation/sidebar'
import { Header } from '@/components/layout/header'
import { GlobalHotkeys } from '@/components/global-hotkeys'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <GlobalHotkeys />
      <div className="flex h-screen overflow-hidden">
        <div className="hidden md:block">
          <Sidebar />
        </div>
        <div className="flex flex-1 flex-col">
          <Header />
          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </>
  )
}
