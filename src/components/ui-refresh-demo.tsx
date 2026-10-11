"use client"

import { useUiRefreshEnabled } from "@/components/ui-refresh-provider"
import { Button } from "@/components/adapters/button"
import { Button as ButtonV2 } from "@/components/ui-v2/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/adapters/card"
import { Card as CardV2, CardHeader as CardHeaderV2, CardTitle as CardTitleV2, CardContent as CardContentV2 } from "@/components/ui-v2/card"
import { Badge } from "@/components/adapters/badge"
import { Badge as BadgeV2 } from "@/components/ui-v2/badge"

/**
 * UI Refresh Demo Component
 *
 * Unreferenced scaffolding from the original UI-refresh rollout. It now
 * branches on `useUiRefreshEnabled()`, so it follows the Settings →
 * Appearance → "Tropical Boutique UI" switch like any other themed component.
 * It is still mounted by nothing — kept as the design reference for the two
 * component trees.
 */
export function UIRefreshDemo() {
  const uiRefreshEnabled = useUiRefreshEnabled()

  if (uiRefreshEnabled) {
    return (
      <CardV2 className="max-w-md">
        <CardHeaderV2>
          <CardTitleV2>Tropical Boutique UI ✨</CardTitleV2>
        </CardHeaderV2>
        <CardContentV2 className="space-y-4">
          <p className="text-sm text-muted-foreground">
            You&apos;re seeing the new UI with warm tropical colors, enhanced spacing, and refined components.
          </p>
          <div className="flex gap-2">
            <ButtonV2>Primary Action</ButtonV2>
            <ButtonV2 variant="outline">Secondary</ButtonV2>
          </div>
          <div className="flex gap-2 flex-wrap">
            <BadgeV2>Featured</BadgeV2>
            <BadgeV2 variant="secondary">Warm Sand</BadgeV2>
            <BadgeV2 variant="outline">Coral Accent</BadgeV2>
          </div>
        </CardContentV2>
      </CardV2>
    )
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Classic UI</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          You&apos;re seeing the classic UI. Enable Tropical Boutique UI in Settings to see the new design.
        </p>
        <div className="flex gap-2">
          <Button>Primary Action</Button>
          <Button variant="outline">Secondary</Button>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Badge>Featured</Badge>
          <Badge variant="secondary">Classic</Badge>
          <Badge variant="outline">Default</Badge>
        </div>
      </CardContent>
    </Card>
  )
}
