"use client"

import * as React from "react"
import { Switch as SwitchV1 } from "@/components/ui/switch"
import { Switch as SwitchV2 } from "@/components/ui-v2/switch"
import { useUIRefresh } from "@/lib/feature-flags"

const Switch = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof SwitchV2>>(
  (props, ref) => {
    const [uiRefreshEnabled] = useUIRefresh()

    if (uiRefreshEnabled) {
      return <SwitchV2 ref={ref} {...props} />
    }

    return <SwitchV1 ref={ref} {...props} />
  }
)

Switch.displayName = "Switch"

export { Switch }
