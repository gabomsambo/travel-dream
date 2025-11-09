"use client"

import * as React from "react"
import {
  Dialog as DialogV1,
  DialogPortal as DialogPortalV1,
  DialogOverlay as DialogOverlayV1,
  DialogClose as DialogCloseV1,
  DialogTrigger as DialogTriggerV1,
  DialogContent as DialogContentV1,
  DialogHeader as DialogHeaderV1,
  DialogFooter as DialogFooterV1,
  DialogTitle as DialogTitleV1,
  DialogDescription as DialogDescriptionV1,
} from "@/components/ui/dialog"
import {
  Dialog as DialogV2,
  DialogPortal as DialogPortalV2,
  DialogOverlay as DialogOverlayV2,
  DialogClose as DialogCloseV2,
  DialogTrigger as DialogTriggerV2,
  DialogContent as DialogContentV2,
  DialogHeader as DialogHeaderV2,
  DialogFooter as DialogFooterV2,
  DialogTitle as DialogTitleV2,
  DialogDescription as DialogDescriptionV2,
} from "@/components/ui-v2/dialog"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { useUIRefresh } from "@/lib/feature-flags"

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <DialogV2 {...props} /> : <DialogV1 {...props} />
}

function DialogPortal(props: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <DialogPortalV2 {...props} /> : <DialogPortalV1 {...props} />
}

function DialogOverlay(props: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>) {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <DialogOverlayV2 {...props} /> : <DialogOverlayV1 {...props} />
}

function DialogClose(props: React.ComponentProps<typeof DialogPrimitive.Close>) {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <DialogCloseV2 {...props} /> : <DialogCloseV1 {...props} />
}

function DialogTrigger(props: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <DialogTriggerV2 {...props} /> : <DialogTriggerV1 {...props} />
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>((props, ref) => {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <DialogContentV2 ref={ref} {...props} /> : <DialogContentV1 ref={ref} {...props} />
})
DialogContent.displayName = DialogPrimitive.Content.displayName

function DialogHeader(props: React.HTMLAttributes<HTMLDivElement>) {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <DialogHeaderV2 {...props} /> : <DialogHeaderV1 {...props} />
}
DialogHeader.displayName = "DialogHeader"

function DialogFooter(props: React.HTMLAttributes<HTMLDivElement>) {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <DialogFooterV2 {...props} /> : <DialogFooterV1 {...props} />
}
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>((props, ref) => {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <DialogTitleV2 ref={ref} {...props} /> : <DialogTitleV1 ref={ref} {...props} />
})
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>((props, ref) => {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <DialogDescriptionV2 ref={ref} {...props} /> : <DialogDescriptionV1 ref={ref} {...props} />
})
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
