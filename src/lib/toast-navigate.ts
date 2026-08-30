import { toast, type ExternalToast } from 'sonner'

type NavigateFn = (href: string) => void

let navigateFn: NavigateFn | null = null

/** Registered once from the app toaster so toast actions use client navigation. */
export function registerToastNavigator(fn: NavigateFn): void {
  navigateFn = fn
}

export function navigateFromToast(href: string): void {
  if (navigateFn) {
    navigateFn(href)
  } else {
    window.location.assign(href)
  }
}

type ToastWithNavigateOptions = ExternalToast & {
  actionLabel?: string
  type?: 'success' | 'info' | 'warning' | 'error'
}

/** Toast with a primary action that routes to a page (e.g. background job completion). */
export function toastWithNavigate(
  message: string,
  href: string,
  options?: ToastWithNavigateOptions
): void {
  const { actionLabel = 'View', type = 'success', ...toastOptions } = options ?? {}
  toast[type](message, {
    duration: 8000,
    closeButton: true,
    ...toastOptions,
    action: {
      label: actionLabel,
      onClick: () => navigateFromToast(href),
    },
  })
}
