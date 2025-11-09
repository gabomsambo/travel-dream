"use client"

import * as React from "react"
import {
  Popover as PopoverV1,
  PopoverTrigger as PopoverTriggerV1,
  PopoverContent as PopoverContentV1,
} from "@/components/ui/popover"
import {
  Popover as PopoverV2,
  PopoverTrigger as PopoverTriggerV2,
  PopoverContent as PopoverContentV2,
} from "@/components/ui-v2/popover"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { useUIRefresh } from "@/lib/feature-flags"

function Popover(props: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <PopoverV2 {...props} /> : <PopoverV1 {...props} />
}

function PopoverTrigger(props: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <PopoverTriggerV2 {...props} /> : <PopoverTriggerV1 {...props} />
}

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>((props, ref) => {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <PopoverContentV2 ref={ref} {...props} /> : <PopoverContentV1 ref={ref} {...props} />
})
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent }
