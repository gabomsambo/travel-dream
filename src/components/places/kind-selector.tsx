"use client"

import { cn } from '@/lib/utils'
import { PlaceKind } from '@/types/database'
import {
  ForkKnife,
  Coffee,
  Wine,
  MusicNote,
  Storefront,
  House,
  Bed,
  Buildings,
  Bank,
  Image,
  Lighthouse,
  Sparkle,
  MapTrifold,
  ThermometerHot,
  Confetti,
  Tree,
  Umbrella,
  Mountains,
  Binoculars,
  City,
  HouseLine,
  ShoppingBag,
  Train,
  Lightbulb,
  IconProps,
} from '@phosphor-icons/react'
import type { ForwardRefExoticComponent, RefAttributes } from 'react'

export const KIND_CATEGORIES = {
  'Food & Drink': ['restaurant', 'cafe', 'bar', 'club', 'market'],
  'Stay': ['stay', 'hostel', 'hotel'],
  'See & Do': ['museum', 'gallery', 'landmark', 'experience', 'tour', 'thermal', 'festival'],
  'Outdoors': ['park', 'beach', 'natural', 'viewpoint'],
  'Places': ['city', 'neighborhood'],
  'Shop': ['shop'],
  'Other': ['transit', 'tip']
} as const

type PhosphorIcon = ForwardRefExoticComponent<IconProps & RefAttributes<SVGSVGElement>>

const KIND_ICONS: Record<PlaceKind, PhosphorIcon> = {
  restaurant: ForkKnife,
  cafe: Coffee,
  bar: Wine,
  club: MusicNote,
  market: Storefront,
  stay: House,
  hostel: Bed,
  hotel: Buildings,
  museum: Bank,
  gallery: Image,
  landmark: Lighthouse,
  experience: Sparkle,
  tour: MapTrifold,
  thermal: ThermometerHot,
  festival: Confetti,
  park: Tree,
  beach: Umbrella,
  natural: Mountains,
  viewpoint: Binoculars,
  city: City,
  neighborhood: HouseLine,
  shop: ShoppingBag,
  transit: Train,
  tip: Lightbulb
}

interface KindSelectorProps {
  value: PlaceKind
  onChange: (kind: PlaceKind) => void
  disabled?: boolean
  compact?: boolean
}

export function KindSelector({ value, onChange, disabled, compact = false }: KindSelectorProps) {
  const getIcon = (kind: PlaceKind) => {
    const IconComponent = KIND_ICONS[kind]
    if (!IconComponent) return null
    return (
      <IconComponent
        size={compact ? 16 : 20}
        weight={value === kind ? 'fill' : 'regular'}
        className={cn(
          "transition-colors",
          value === kind ? "text-primary" : "text-muted-foreground"
        )}
      />
    )
  }

  const formatKindLabel = (kind: string) => {
    return kind.charAt(0).toUpperCase() + kind.slice(1)
  }

  return (
    <div className="space-y-4">
      {Object.entries(KIND_CATEGORIES).map(([category, kinds]) => (
        <div key={category}>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">{category}</h4>
          <div className="flex flex-wrap gap-2">
            {kinds.map(kind => (
              <button
                key={kind}
                type="button"
                disabled={disabled}
                onClick={() => onChange(kind as PlaceKind)}
                className={cn(
                  "flex items-center gap-2 rounded-md text-sm transition-all",
                  compact ? "px-2 py-1.5" : "px-3 py-2",
                  "border",
                  value === kind
                    ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/20"
                    : "border-border hover:border-primary/50 hover:bg-muted/50",
                  disabled && "opacity-50 cursor-not-allowed"
                )}
              >
                {getIcon(kind as PlaceKind)}
                <span className={cn(
                  "transition-colors",
                  value === kind ? "font-medium" : ""
                )}>
                  {formatKindLabel(kind)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export { KIND_ICONS }

