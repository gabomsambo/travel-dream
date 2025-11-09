"use client"

import * as React from "react"
import {
  Sheet as SheetV1,
  SheetTrigger as SheetTriggerV1,
  SheetClose as SheetCloseV1,
  SheetContent as SheetContentV1,
  SheetHeader as SheetHeaderV1,
  SheetFooter as SheetFooterV1,
  SheetTitle as SheetTitleV1,
  SheetDescription as SheetDescriptionV1,
} from "@/components/ui/sheet"
import {
  Sheet as SheetV2,
  SheetTrigger as SheetTriggerV2,
  SheetClose as SheetCloseV2,
  SheetContent as SheetContentV2,
  SheetHeader as SheetHeaderV2,
  SheetFooter as SheetFooterV2,
  SheetTitle as SheetTitleV2,
  SheetDescription as SheetDescriptionV2,
} from "@/components/ui-v2/sheet"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { useUIRefresh } from "@/lib/feature-flags"

function Sheet(props: React.ComponentProps<typeof SheetPrimitive.Root>) {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <SheetV2 {...props} /> : <SheetV1 {...props} />
}

const SheetPortal = SheetPrimitive.Portal
const SheetOverlay = SheetPrimitive.Overlay

function SheetTrigger(props: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <SheetTriggerV2 {...props} /> : <SheetTriggerV1 {...props} />
}

function SheetClose(props: React.ComponentProps<typeof SheetPrimitive.Close>) {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <SheetCloseV2 {...props} /> : <SheetCloseV1 {...props} />
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content> & {
    side?: "top" | "bottom" | "left" | "right"
  }
>((props, ref) => {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <SheetContentV2 ref={ref} {...props} /> : <SheetContentV1 ref={ref} {...props} />
})
SheetContent.displayName = SheetPrimitive.Content.displayName

function SheetHeader(props: React.HTMLAttributes<HTMLDivElement>) {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <SheetHeaderV2 {...props} /> : <SheetHeaderV1 {...props} />
}
SheetHeader.displayName = "SheetHeader"

function SheetFooter(props: React.HTMLAttributes<HTMLDivElement>) {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <SheetFooterV2 {...props} /> : <SheetFooterV1 {...props} />
}
SheetFooter.displayName = "SheetFooter"

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>((props, ref) => {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <SheetTitleV2 ref={ref} {...props} /> : <SheetTitleV1 ref={ref} {...props} />
})
SheetTitle.displayName = SheetPrimitive.Title.displayName

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>((props, ref) => {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <SheetDescriptionV2 ref={ref} {...props} /> : <SheetDescriptionV1 ref={ref} {...props} />
})
SheetDescription.displayName = SheetPrimitive.Description.displayName

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
