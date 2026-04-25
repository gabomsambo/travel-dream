"use client"

import { Input } from "@/components/adapters/input"
import { Label } from "@/components/adapters/label"
import { Textarea } from "@/components/adapters/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/adapters/select"
import { Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { PLACE_KINDS } from "@/types/database"
import type { PlaceWithRelations } from "@/types/database"
import { FindImageButton } from "@/components/places/find-image-button"
import { PhotoAttribution } from "@/components/attribution/photo-attribution"
import { PoweredByGoogle } from "@/components/attribution/powered-by-google"

interface HeroSectionProps {
  place: PlaceWithRelations
  formData: any
  updateField: (field: any, value: any) => void
}

export function HeroSection({ place, formData, updateField }: HeroSectionProps) {
  const primaryPhoto = place.attachments.find(a => a.isPrimary) || place.attachments[0]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Hero Photo */}
        <div className="space-y-1">
          <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
            {primaryPhoto ? (
              <img
                src={primaryPhoto.uri}
                alt={place.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <span>No photo</span>
                <FindImageButton
                  placeId={place.id}
                  placeName={place.name}
                  placeCity={place.city}
                  hasGooglePlaceId={Boolean(place.googlePlaceId)}
                  onAttached={() => window.location.reload()}
                />
              </div>
            )}
            {primaryPhoto?.source === 'google_places' && (
              <div className="absolute bottom-2 right-2 bg-white/85 px-1.5 py-0.5 rounded">
                <PoweredByGoogle />
              </div>
            )}
          </div>
          {primaryPhoto && (
            <PhotoAttribution attribution={primaryPhoto.attribution} />
          )}
        </div>

        {/* Basic Info */}
        <div className="space-y-4">
          {/* Name */}
          <div>
            <Label htmlFor="name">Place Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => updateField('name', e.target.value)}
              className="text-2xl font-bold"
            />
          </div>

          {/* Kind (Category) */}
          <div>
            <Label htmlFor="kind">Category</Label>
            <Select
              value={formData.kind}
              onValueChange={(value) => updateField('kind', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLACE_KINDS.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {kind}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Rating (ratingSelf) */}
          <div>
            <Label>Personal Rating</Label>
            <div className="flex gap-1 mt-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={cn(
                    "h-6 w-6 cursor-pointer transition-colors",
                    star <= formData.ratingSelf
                      ? "fill-yellow-400 text-yellow-400"
                      : "fill-gray-200 text-gray-200 hover:fill-yellow-200"
                  )}
                  onClick={() => updateField('ratingSelf', star)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description || ''}
          onChange={(e) => updateField('description', e.target.value || null)}
          rows={4}
          placeholder="Add a description of this place..."
        />
      </div>
    </div>
  )
}
