"use client"

import * as React from "react"
import { Button as ButtonV1, buttonVariants as buttonVariantsV1 } from "@/components/ui/button"
import { Button as ButtonV2, buttonVariants as buttonVariantsV2 } from "@/components/ui-v2/button"
import type { VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { useUIRefresh } from "@/lib/feature-flags"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariantsV2> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size = "default", asChild = false, ...props }, ref) => {
    const [uiRefreshEnabled] = useUIRefresh()
    const sizeOverride = size === "default" ? "h-10" : ""

    if (uiRefreshEnabled) {
      return (
        <ButtonV2
          ref={ref}
          variant={variant}
          size={size}
          asChild={asChild}
          className={cn(sizeOverride, className)}
          {...props}
        />
      )
    }

    const v1Size = (size === "icon-sm" || size === "icon-lg") ? "icon" : size

    return (
      <ButtonV1
        ref={ref}
        variant={variant}
        size={v1Size as any}
        asChild={asChild}
        className={cn(sizeOverride, className)}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariantsV2 as buttonVariants }
