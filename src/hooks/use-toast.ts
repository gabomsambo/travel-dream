"use client"

import * as React from "react"

export type ToastActionElement = React.ReactElement

export interface Toast {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function useToast() {
  const [toasts, setToasts] = React.useState<Toast[]>([])

  const toast = React.useCallback(
    ({ title, description, action }: Omit<Toast, "id">) => {
      const id = Math.random().toString(36).substr(2, 9)
      setToasts((prev) => [...prev, { id, title, description, action, open: true }])
      return { id, dismiss: () => setToasts((prev) => prev.filter((t) => t.id !== id)) }
    },
    []
  )

  const dismiss = React.useCallback((toastId?: string) => {
    setToasts((prev) =>
      toastId ? prev.filter((t) => t.id !== toastId) : []
    )
  }, [])

  return { toasts, toast, dismiss }
}
