"use client"

import * as React from "react"
import { Checkbox as CheckboxV1 } from "@/components/ui/checkbox"
import { Checkbox as CheckboxV2 } from "@/components/ui-v2/checkbox"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { useUIRefresh } from "@/lib/feature-flags"

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>((props, ref) => {
  const [uiRefreshEnabled] = useUIRefresh()

  if (uiRefreshEnabled) {
    return <CheckboxV2 ref={ref} {...props} />
  }

  return <CheckboxV1 ref={ref} {...props} />
})

Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
