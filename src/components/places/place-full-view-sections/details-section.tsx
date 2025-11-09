"use client"

import { Input } from "@/components/adapters/input"
import { Label } from "@/components/adapters/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/adapters/card"
import { TagInput } from "@/components/ui-custom/tag-input"

interface DetailsSectionProps {
  formData: any
  updateField: (field: any, value: any) => void
}

export function DetailsSection({ formData, updateField }: DetailsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>📋 Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Tags */}
        <div>
          <Label>Tags</Label>
          <TagInput
            value={formData.tags}
            onChange={(tags) => updateField('tags', tags)}
            placeholder="Add tags..."
            variant="default"
          />
        </div>

        {/* Vibes */}
        <div>
          <Label>Vibes</Label>
          <TagInput
            value={formData.vibes}
            onChange={(vibes) => updateField('vibes', vibes)}
            placeholder="Add vibes..."
            variant="purple"
          />
        </div>

        {/* Price Level & Best Time */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="price_level">Price Level</Label>
            <Input
              id="price_level"
              value={formData.price_level || ''}
              onChange={(e) => updateField('price_level', e.target.value || null)}
              placeholder="$$"
            />
          </div>

          <div>
            <Label htmlFor="best_time">Best Time</Label>
            <Input
              id="best_time"
              value={formData.best_time || ''}
              onChange={(e) => updateField('best_time', e.target.value || null)}
              placeholder="Summer"
            />
          </div>
        </div>

        {/* Activities */}
        <div>
          <Label>Activities</Label>
          <TagInput
            value={formData.activities}
            onChange={(activities) => updateField('activities', activities)}
            placeholder="Add activities..."
            variant="blue"
          />
        </div>

        {/* Cuisine */}
        <div>
          <Label>Cuisine</Label>
          <TagInput
            value={formData.cuisine}
            onChange={(cuisine) => updateField('cuisine', cuisine)}
            placeholder="Add cuisine types..."
            variant="orange"
          />
        </div>

        {/* Amenities */}
        <div>
          <Label>Amenities</Label>
          <TagInput
            value={formData.amenities}
            onChange={(amenities) => updateField('amenities', amenities)}
            placeholder="Add amenities..."
            variant="green"
          />
        </div>
      </CardContent>
    </Card>
  )
}
