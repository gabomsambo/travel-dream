"use client"

import * as React from "react"
import {
  Card as CardV1,
  CardHeader as CardHeaderV1,
  CardTitle as CardTitleV1,
  CardDescription as CardDescriptionV1,
  CardContent as CardContentV1,
  CardFooter as CardFooterV1,
} from "@/components/ui/card"
import {
  Card as CardV2,
  CardHeader as CardHeaderV2,
  CardTitle as CardTitleV2,
  CardDescription as CardDescriptionV2,
  CardContent as CardContentV2,
  CardFooter as CardFooterV2,
  CardAction as CardActionV2,
} from "@/components/ui-v2/card"
import { useUIRefresh } from "@/lib/feature-flags"

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (props, ref) => {
    const [uiRefreshEnabled] = useUIRefresh()
    return uiRefreshEnabled ? <CardV2 ref={ref} {...props} /> : <CardV1 ref={ref} {...props} />
  }
)
Card.displayName = "Card"

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (props, ref) => {
    const [uiRefreshEnabled] = useUIRefresh()
    return uiRefreshEnabled ? <CardHeaderV2 ref={ref} {...props} /> : <CardHeaderV1 ref={ref} {...props} />
  }
)
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>((props, ref) => {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <CardTitleV2 ref={ref} {...props} /> : <CardTitleV1 ref={ref} {...props} />
})
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>((props, ref) => {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <CardDescriptionV2 ref={ref} {...props} /> : <CardDescriptionV1 ref={ref} {...props} />
})
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (props, ref) => {
    const [uiRefreshEnabled] = useUIRefresh()
    return uiRefreshEnabled ? <CardContentV2 ref={ref} {...props} /> : <CardContentV1 ref={ref} {...props} />
  }
)
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (props, ref) => {
    const [uiRefreshEnabled] = useUIRefresh()
    return uiRefreshEnabled ? <CardFooterV2 ref={ref} {...props} /> : <CardFooterV1 ref={ref} {...props} />
  }
)
CardFooter.displayName = "CardFooter"

const CardAction = CardActionV2

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent, CardAction }
