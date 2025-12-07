"use client"

import { CollectionMapboxMap } from './collection-map-wrapper'
import { MobileMapSheet } from './mobile-map-sheet'
import { cn } from '@/lib/utils'

interface CollectionMapRendererProps {
  className?: string
  mode?: 'responsive' | 'mobile-only' | 'desktop-only'
}

export function CollectionMapRenderer({
  className,
  mode = 'responsive'
}: CollectionMapRendererProps) {
  if (mode === 'mobile-only') {
    return (
      <MobileMapSheet>
        <CollectionMapboxMap />
      </MobileMapSheet>
    )
  }

  if (mode === 'desktop-only') {
    return (
      <div className={className || "h-[400px] w-full rounded-lg overflow-hidden border"}>
        <CollectionMapboxMap />
      </div>
    )
  }

  // Responsive mode: render both, hide with CSS to avoid hydration mismatch
  return (
    <>
      {/* Mobile: FAB + Bottom Sheet */}
      <div className="lg:hidden">
        <MobileMapSheet>
          <CollectionMapboxMap />
        </MobileMapSheet>
      </div>
      {/* Desktop: Inline map */}
      <div className={cn(
        "hidden lg:block",
        className || "h-[400px] w-full rounded-lg overflow-hidden border"
      )}>
        <CollectionMapboxMap />
      </div>
    </>
  )
}
