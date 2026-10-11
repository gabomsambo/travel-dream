"use client"

import * as React from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { editorialFont } from "@/components/explore/fonts"

/**
 * The Library's one modal surface: a bottom sheet on phones, a centred panel
 * from `sm` up (`full` makes it the whole screen on phones, for search).
 * Radix handles focus trapping, Esc and returning focus to the trigger.
 */
export function LibrarySheet({
  open,
  onOpenChange,
  title,
  description,
  hideHeader = false,
  full = false,
  wide = false,
  footer,
  children,
  initialFocus,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** Keep the title for screen readers only (the content carries its own header). */
  hideHeader?: boolean
  full?: boolean
  wide?: boolean
  footer?: React.ReactNode
  children: React.ReactNode
  /** Element to focus on open, instead of the first focusable one. */
  initialFocus?: React.RefObject<HTMLElement | null>
  className?: string
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          onOpenAutoFocus={(e) => {
            if (initialFocus?.current) {
              e.preventDefault()
              initialFocus.current.focus()
            }
          }}
          className={cn(
            editorialFont.variable,
            "fixed z-[60] flex flex-col bg-background text-foreground shadow-2xl outline-none",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
            full
              ? "inset-0 max-sm:data-[state=open]:slide-in-from-bottom-4 sm:inset-auto sm:left-1/2 sm:top-[10vh] sm:max-h-[80vh] sm:w-[640px] sm:-translate-x-1/2 sm:rounded-2xl sm:border"
              : cn(
                  "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-3xl pb-[env(safe-area-inset-bottom)] max-sm:data-[state=open]:slide-in-from-bottom-8",
                  "sm:inset-auto sm:bottom-auto sm:left-1/2 sm:top-[12vh] sm:max-h-[76vh] sm:-translate-x-1/2 sm:rounded-2xl sm:border sm:pb-0",
                  wide ? "sm:w-[640px]" : "sm:w-[480px]"
                ),
            className
          )}
        >
          {!full && <div className="mx-auto mt-2 h-[5px] w-10 shrink-0 rounded-full bg-border sm:hidden" aria-hidden />}
          <div className={cn("flex shrink-0 items-center gap-3 px-5 pb-2 pt-3 sm:pt-4", hideHeader && "sr-only")}>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="font-heading text-base font-semibold">{title}</Dialog.Title>
              {description && <Dialog.Description className="mt-0.5 text-xs text-muted-foreground">{description}</Dialog.Description>}
            </div>
            <Dialog.Close
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          {!description && <Dialog.Description className="sr-only">{title}</Dialog.Description>}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
          {footer && <div className="shrink-0 border-t px-5 py-3">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
