import type { Metadata } from 'next'
import { Inter, Plus_Jakarta_Sans } from 'next/font/google'
import { cn } from '@/lib/utils'
import { Providers } from '@/components/providers'
import '@/styles/globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body'
})

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-heading'
})

export const metadata: Metadata = {
  title: {
    default: 'Travel Dreams',
    template: '%s | Travel Dreams',
  },
  description: 'A calm, visual place to store your travel ideas.',
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
        inter.variable,
        plusJakarta.variable,
        inter.className
      )}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
