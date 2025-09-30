import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { cn } from '@/lib/utils'
import { Providers } from '@/components/providers'
import { Sidebar } from '@/components/navigation/sidebar'
import { Header } from '@/components/layout/header'
import { GlobalHotkeys } from '@/components/global-hotkeys'
import '@/styles/globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    default: 'Travel Dreams Collection',
    template: '%s | Travel Dreams Collection',
  },
  description: 'Capture, structure, and retrieve travel inspirations with ease',
  keywords: ['travel', 'places', 'collection', 'inspiration', 'planning'],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn(
        'min-h-screen bg-background font-sans antialiased',
        inter.className
      )}>
        <Providers>
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
        </Providers>
      </body>
    </html>
  )
}
