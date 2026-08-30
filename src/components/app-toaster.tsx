'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Toaster } from '@/components/ui-v2/sonner'
import { registerToastNavigator } from '@/lib/toast-navigate'

/**
 * Authenticated-app toast host. Mounted once in `(app)/layout.tsx` so every
 * `toast.*` call site becomes visible without duplicating Radix's separate store.
 */
export function AppToaster() {
  const router = useRouter()

  useEffect(() => {
    registerToastNavigator((href) => router.push(href))
  }, [router])

  return (
    <Toaster
      closeButton
      expand={false}
      visibleToasts={3}
      duration={5000}
      pauseWhenPageIsHidden
      position="top-right"
      offset={{ top: '4.25rem', right: '12px' }}
      containerAriaLabel="Notifications"
      toastOptions={{
        classNames: {
          toast: 'app-toast',
          title: 'app-toast-title',
          description: 'app-toast-description',
          actionButton: 'app-toast-action',
          closeButton: 'app-toast-close',
        },
      }}
    />
  )
}
