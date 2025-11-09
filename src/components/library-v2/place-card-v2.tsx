"use client"

import * as React from "react"
import { MapPin, Star, Heart, MoreVertical } from "lucide-react"
import type { PlaceWithCover } from "@/lib/library-adapters"
import { FavoriteManager, parsePriceLevel, formatPriceSymbols } from "@/lib/library-adapters"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface PlaceCardV2Props {
  place: PlaceWithCover
  onClick?: () => void
  className?: string
}

export function PlaceCardV2({ place, onClick, className }: PlaceCardV2Props) {
  const [isFavorited, setIsFavorited] = React.useState(
    FavoriteManager.isFavorited(place.id)
  )

  const handleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation()
    FavoriteManager.toggleFavorite(place.id)
    setIsFavorited(!isFavorited)
  }

  const priceLevel = parsePriceLevel(place.price_level)
  const priceSymbols = formatPriceSymbols(priceLevel)

  // Ensure vibes is always an array
  const vibes = Array.isArray(place.vibes) ? place.vibes : []

  return (
    <Card
      className={cn(
        "group cursor-pointer overflow-hidden transition-all hover:shadow-md",
        className
      )}
      onClick={onClick}
    >
      {/* Cover Image */}
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {place.coverUrl ? (
          <img
            src={place.coverUrl}
            alt={place.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <MapPin className="h-12 w-12 text-muted-foreground/30" />
          </div>
        )}

        {/* Favorite Button */}
        <Button
          size="icon"
          variant="secondary"
          className="absolute right-3 top-3 h-8 w-8 rounded-full shadow-md"
          onClick={handleFavorite}
        >
          <Heart
            className={cn(
              "h-4 w-4 transition-colors",
              isFavorited && "fill-destructive text-destructive"
            )}
          />
          <span className="sr-only">Favorite</span>
        </Button>

        {/* Status Badge */}
        {place.status === "inbox" && (
          <Badge className="absolute left-3 top-3 bg-accent text-accent-foreground">
            New
          </Badge>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold leading-tight text-balance line-clamp-2">
              {place.name}
            </h3>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">More options</span>
            </Button>
          </div>

          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            <span className="line-clamp-1">
              {place.city}, {place.country}
            </span>
          </div>
        </div>

        {/* Description */}
        {place.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 text-pretty">
            {place.description}
          </p>
        )}

        {/* Vibes */}
        {vibes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {vibes.slice(0, 3).map((vibe) => (
              <Badge key={vibe} variant="secondary" className="text-xs font-normal">
                {vibe}
              </Badge>
            ))}
            {vibes.length > 3 && (
              <Badge variant="secondary" className="text-xs font-normal">
                +{vibes.length - 3}
              </Badge>
            )}
          </div>
        )}

        {/* Footer Meta */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-3 text-sm">
            {place.ratingSelf && place.ratingSelf > 0 && (
              <div className="flex items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-accent text-accent" />
                <span className="font-medium">{place.ratingSelf}</span>
              </div>
            )}
            {priceSymbols && (
              <div className="flex items-center gap-0.5 text-muted-foreground">
                <span className="font-medium">{priceSymbols}</span>
              </div>
            )}
          </div>

          <Badge variant="outline" className="text-xs capitalize">
            {place.kind}
          </Badge>
        </div>
      </div>
    </Card>
  )
}
