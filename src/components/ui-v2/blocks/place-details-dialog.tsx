"use client"
import { MapPin, Star, DollarSign, Calendar, ExternalLink, Heart, Archive, Trash2 } from "lucide-react"
import type { Place } from "@/mocks/types"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"

interface PlaceDetailsDialogProps {
  place: Place | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PlaceDetailsDialog({ place, open, onOpenChange }: PlaceDetailsDialogProps) {
  if (!place) return null

  const priceSymbols = place.priceLevel ? "$".repeat(place.priceLevel) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0">
        <ScrollArea className="max-h-[90vh]">
          {/* Cover Image */}
          {place.coverUrl && (
            <div className="relative aspect-[21/9] overflow-hidden">
              <img src={place.coverUrl || "/placeholder.svg"} alt={place.name} className="h-full w-full object-cover" />
            </div>
          )}

          <div className="p-6 space-y-6">
            {/* Header */}
            <DialogHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <DialogTitle className="text-2xl text-balance">{place.name}</DialogTitle>
                  <DialogDescription className="flex items-center gap-1.5 text-base">
                    <MapPin className="h-4 w-4" />
                    {place.city}, {place.country}
                  </DialogDescription>
                </div>
                <Badge variant="outline" className="capitalize shrink-0">
                  {place.kind}
                </Badge>
              </div>
            </DialogHeader>

            {/* Meta Info */}
            <div className="flex flex-wrap items-center gap-4 text-sm">
              {place.rating && (
                <div className="flex items-center gap-1.5">
                  <Star className="h-4 w-4 fill-accent text-accent" />
                  <span className="font-medium">{place.rating}</span>
                </div>
              )}
              {priceSymbols && (
                <div className="flex items-center gap-1.5">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{priceSymbols}</span>
                </div>
              )}
              {place.createdAt && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>Added {place.createdAt.toLocaleDateString()}</span>
                </div>
              )}
            </div>

            <Separator />

            {/* Tabs */}
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="details" className="flex-1">
                  Details
                </TabsTrigger>
                <TabsTrigger value="vibes" className="flex-1">
                  Vibes & Tags
                </TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4">
                {place.description && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm">Description</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed text-pretty">{place.description}</p>
                  </div>
                )}

                {place.coordinates && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm">Location</h4>
                    <p className="text-sm text-muted-foreground">
                      {place.coordinates.lat.toFixed(4)}, {place.coordinates.lng.toFixed(4)}
                    </p>
                  </div>
                )}

                {place.confidence && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm">Confidence Score</h4>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${place.confidence * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium">{Math.round(place.confidence * 100)}%</span>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="vibes" className="space-y-4">
                {place.vibes && place.vibes.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm">Vibes</h4>
                    <div className="flex flex-wrap gap-2">
                      {place.vibes.map((vibe) => (
                        <Badge key={vibe} variant="secondary" className="capitalize">
                          {vibe}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {place.tags && place.tags.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm">Tags</h4>
                    <div className="flex flex-wrap gap-2">
                      {place.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="capitalize">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <Separator />

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button variant="default" className="gap-2">
                <Heart className="h-4 w-4" />
                Add to Favorites
              </Button>
              <Button variant="outline" className="gap-2 bg-transparent">
                <Archive className="h-4 w-4" />
                Archive
              </Button>
              <Button variant="outline" className="gap-2 bg-transparent">
                <ExternalLink className="h-4 w-4" />
                Open in Maps
              </Button>
              <Button variant="ghost" className="gap-2 text-destructive hover:text-destructive ml-auto">
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
