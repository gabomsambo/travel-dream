"use client"

import { KIND_ICONS } from '@/components/places/kind-selector'
import { getKindColor } from '@/lib/map-utils'
import { cn } from '@/lib/utils'
import type { PlaceKind } from '@/types/database'

interface KindBadgeProps {
  kind: string
  size?: 'sm' | 'md'
  showLabel?: boolean
  className?: string
}

export function KindBadge({ kind, size = 'sm', showLabel = true, className }: KindBadgeProps) {
  const color = getKindColor(kind)
  const IconComponent = KIND_ICONS[kind as PlaceKind]

  const iconSize = size === 'sm' ? 12 : 14
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs'
  const padding = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-1'

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md font-medium",
        padding,
        textSize,
        className
      )}
      style={{
        backgroundColor: `${color}20`,
        color: color
      }}
    >
      {IconComponent && (
        <IconComponent size={iconSize} weight="fill" />
      )}
      {showLabel && (
        <span className="capitalize">{kind}</span>
      )}
    </span>
  )
}
