"use client"

import * as React from "react"
import { Separator as SeparatorV1 } from "@/components/ui/separator"
import { Separator as SeparatorV2 } from "@/components/ui-v2/separator"
import * as SeparatorPrimitive from "@radix-ui/react-separator"
import { useUIRefresh } from "@/lib/feature-flags"

const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>((props, ref) => {
  const [uiRefreshEnabled] = useUIRefresh()

  if (uiRefreshEnabled) {
    return <SeparatorV2 ref={ref} {...props} />
  }

  return <SeparatorV1 ref={ref} {...props} />
})

Separator.displayName = SeparatorPrimitive.Root.displayName

export { Separator }
