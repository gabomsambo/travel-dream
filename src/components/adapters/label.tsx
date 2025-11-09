"use client"

import * as React from "react"
import { Label as LabelV1 } from "@/components/ui/label"
import { Label as LabelV2 } from "@/components/ui-v2/label"
import * as LabelPrimitive from "@radix-ui/react-label"
import { useUIRefresh } from "@/lib/feature-flags"

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>((props, ref) => {
  const [uiRefreshEnabled] = useUIRefresh()

  if (uiRefreshEnabled) {
    return <LabelV2 ref={ref} {...props} />
  }

  return <LabelV1 ref={ref} {...props} />
})

Label.displayName = LabelPrimitive.Root.displayName

export { Label }
