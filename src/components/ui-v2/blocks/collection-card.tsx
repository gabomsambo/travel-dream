"use client"
import { FolderHeart, MapPin } from "lucide-react"
import type { Collection } from "@/types/database"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui-v2/card"
import { Badge } from "@/components/ui-v2/badge"

interface CollectionCardProps {
  collection: Collection
  placeCount?: number
  onClick?: () => void
  className?: string
}

export function CollectionCard({ collection, placeCount, onClick, className }: CollectionCardProps) {
  const count = placeCount ?? 0

  return (
    <Card
      className={cn("group cursor-pointer overflow-hidden transition-all hover:shadow-md", className)}
      onClick={onClick}
    >
      {/* Cover Image */}
      <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-primary/20 via-accent/10 to-secondary">
        {collection.coverImageUrl ? (
          <img
            src={collection.coverImageUrl || "/placeholder.svg"}
            alt={collection.name}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <FolderHeart className="h-16 w-16 text-primary/30" />
          </div>
        )}

        {/* Place Count Badge */}
        <Badge className="absolute right-3 bottom-3 bg-background/90 text-foreground backdrop-blur-sm">
          <MapPin className="h-3 w-3 mr-1" />
          {count} {count === 1 ? "place" : "places"}
        </Badge>
      </div>

      {/* Content */}
      <div className="p-4 space-y-2">
        <h3 className="font-semibold leading-tight text-balance line-clamp-1">{collection.name}</h3>

        {collection.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 text-pretty">{collection.description}</p>
        )}

        {collection.createdAt && (
          <p className="text-xs text-muted-foreground">Created {new Date(collection.createdAt).toLocaleDateString()}</p>
        )}
      </div>
    </Card>
  )
}
