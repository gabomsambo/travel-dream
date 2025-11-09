"use client"

import * as React from "react"
import { Badge as BadgeV1, badgeVariants as badgeVariantsV1 } from "@/components/ui/badge"
import { Badge as BadgeV2, badgeVariants as badgeVariantsV2 } from "@/components/ui-v2/badge"
import type { VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { useUIRefresh } from "@/lib/feature-flags"

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariantsV2> {
  asChild?: boolean
}

function Badge({ className, variant, asChild = false, ...props }: BadgeProps) {
  const [uiRefreshEnabled] = useUIRefresh()

  if (uiRefreshEnabled) {
    return (
      <BadgeV2
        variant={variant}
        asChild={asChild}
        className={cn("rounded-full", className)}
        {...props}
      />
    )
  }

  return (
    <BadgeV1
      variant={variant}
      className={className}
      {...props}
    />
  )
}

export { Badge, badgeVariantsV2 as badgeVariants }
