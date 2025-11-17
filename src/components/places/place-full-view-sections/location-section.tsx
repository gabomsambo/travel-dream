"use client"

import { Input } from "@/components/adapters/input"
import { Label } from "@/components/adapters/label"
import { Textarea } from "@/components/adapters/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/adapters/card"
import { Separator } from "@/components/adapters/separator"
import { TagInput } from "@/components/ui-custom/tag-input"
import { CoordinateInput } from "@/components/ui-custom/coordinate-input"

interface LocationSectionProps {
  formData: any
  updateField: (field: any, value: any) => void
}

export function LocationSection({ formData, updateField }: LocationSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>📍 Location</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* City */}
          <div>
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              value={formData.city || ''}
              onChange={(e) => updateField('city', e.target.value || null)}
              placeholder="San Francisco"
            />
          </div>

          {/* Country */}
          <div>
            <Label htmlFor="country">Country</Label>
            <Input
              id="country"
              value={formData.country || ''}
              onChange={(e) => updateField('country', e.target.value || null)}
              placeholder="United States"
            />
          </div>

          {/* State/Region */}
          <div>
            <Label htmlFor="admin">State/Region</Label>
            <Input
              id="admin"
              value={formData.admin || ''}
              onChange={(e) => updateField('admin', e.target.value || null)}
              placeholder="California"
            />
          </div>
        </div>

        {/* Full Address */}
        <div>
          <Label htmlFor="address">Full Address</Label>
          <Textarea
            id="address"
            value={formData.address || ''}
            onChange={(e) => updateField('address', e.target.value || null)}
            placeholder="123 Main St, San Francisco, CA 94102"
            rows={2}
          />
        </div>

        <Separator />

        {/* Coordinates */}
        <div>
          <Label>Coordinates</Label>
          <CoordinateInput
            value={formData.coords}
            onChange={(coords) => updateField('coords', coords)}
          />
        </div>

        {/* Alternative Names */}
        <div>
          <Label>Alternative Names</Label>
          <TagInput
            value={formData.altNames}
            onChange={(names) => updateField('altNames', names)}
            placeholder="Add alternative names..."
          />
          <p className="text-xs text-muted-foreground mt-1">
            Press Enter or comma to add
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
