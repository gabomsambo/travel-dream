"use client"

import * as React from "react"
import {
  Tooltip as TooltipV1,
  TooltipTrigger as TooltipTriggerV1,
  TooltipContent as TooltipContentV1,
  TooltipProvider as TooltipProviderV1,
} from "@/components/ui/tooltip"
import {
  Tooltip as TooltipV2,
  TooltipTrigger as TooltipTriggerV2,
  TooltipContent as TooltipContentV2,
  TooltipProvider as TooltipProviderV2,
} from "@/components/ui-v2/tooltip"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { useUIRefresh } from "@/lib/feature-flags"

function TooltipProvider(props: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <TooltipProviderV2 {...props} /> : <TooltipProviderV1 {...props} />
}

function Tooltip(props: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <TooltipV2 {...props} /> : <TooltipV1 {...props} />
}

function TooltipTrigger(props: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <TooltipTriggerV2 {...props} /> : <TooltipTriggerV1 {...props} />
}

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>((props, ref) => {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <TooltipContentV2 ref={ref} {...props} /> : <TooltipContentV1 ref={ref} {...props} />
})
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
