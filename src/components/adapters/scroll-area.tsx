"use client"

import * as React from "react"
import {
  ScrollArea as ScrollAreaV1,
  ScrollBar as ScrollBarV1,
} from "@/components/ui/scroll-area"
import {
  ScrollArea as ScrollAreaV2,
  ScrollBar as ScrollBarV2,
} from "@/components/ui-v2/scroll-area"
import { useUIRefresh } from "@/lib/feature-flags"

const ScrollArea = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof ScrollAreaV2>>(
  (props, ref) => {
    const [uiRefreshEnabled] = useUIRefresh()

    if (uiRefreshEnabled) {
      return <ScrollAreaV2 ref={ref} {...props} />
    }

    return <ScrollAreaV1 ref={ref} {...props} />
  }
)
ScrollArea.displayName = "ScrollArea"

const ScrollBar = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof ScrollBarV2>>(
  (props, ref) => {
    const [uiRefreshEnabled] = useUIRefresh()

    if (uiRefreshEnabled) {
      return <ScrollBarV2 ref={ref} {...props} />
    }

    return <ScrollBarV1 ref={ref} {...props} />
  }
)
ScrollBar.displayName = "ScrollBar"

export { ScrollArea, ScrollBar }
