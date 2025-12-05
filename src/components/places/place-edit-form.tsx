"use client"

import { useState, FormEvent } from 'react'
import { Input } from "@/components/adapters/input"
import { Textarea } from "@/components/adapters/textarea"
import { Label } from "@/components/adapters/label"
import { Button } from "@/components/adapters/button"
import { Badge } from "@/components/adapters/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/adapters/select"
import { X, ChevronDown, ChevronUp, Check } from 'lucide-react'
import { PLACE_KINDS } from '@/types/database'
import type { Place } from '@/types/database'
import { LocationPicker } from '@/components/ui/location-picker'
import type { LocationData } from '@/hooks/use-google-places'

interface PlaceEditFormProps {
  place: Place
  onSave: (updates: Partial<Place>) => Promise<void>
  onCancel: () => void
  isSubmitting?: boolean
  onSaveAndConfirm?: (updates: Partial<Place>) => Promise<void>
  showConfirmButton?: boolean
}

export function PlaceEditForm({
  place,
  onSave,
  onCancel,
  isSubmitting = false,
  onSaveAndConfirm,
  showConfirmButton = false
}: PlaceEditFormProps) {
  const [formData, setFormData] = useState({
    name: place.name,
    kind: place.kind,
    description: place.description || '',
    city: place.city || '',
    country: place.country || '',
    admin: place.admin || '',
    address: place.address || '',
    googlePlaceId: place.googlePlaceId || null,
    coords: place.coords || null,
    tags: Array.isArray(place.tags) ? place.tags : [],
    vibes: Array.isArray(place.vibes) ? place.vibes : [],
    activities: Array.isArray(place.activities) ? place.activities : [],
    cuisine: Array.isArray(place.cuisine) ? place.cuisine : [],
    amenities: Array.isArray(place.amenities) ? place.amenities : [],
    price_level: place.price_level || '',
    best_time: place.best_time || '',
    notes: place.notes || '',
    ratingSelf: place.ratingSelf || 0,
  })

  const [showManualLocation, setShowManualLocation] = useState(false)

  const handleLocationChange = (location: LocationData | null) => {
    if (location) {
      setFormData(prev => ({
        ...prev,
        googlePlaceId: location.googlePlaceId,
        address: location.address,
        city: location.city || '',
        admin: location.admin || '',
        country: location.country || '',
        coords: location.coords,
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        googlePlaceId: null,
        address: '',
        city: '',
        admin: '',
        country: '',
        coords: null,
      }))
    }
  }

  const [tagInput, setTagInput] = useState('')
  const [vibeInput, setVibeInput] = useState('')
  const [activityInput, setActivityInput] = useState('')
  const [cuisineInput, setCuisineInput] = useState('')
  const [amenityInput, setAmenityInput] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    await onSave(formData)
  }

  const handleSaveAndConfirm = async () => {
    if (onSaveAndConfirm) {
      await onSaveAndConfirm(formData)
    }
  }

  const addItem = (field: 'tags' | 'vibes' | 'activities' | 'cuisine' | 'amenities', value: string) => {
    if (value.trim() && !formData[field].includes(value.trim())) {
      setFormData(prev => ({ ...prev, [field]: [...prev[field], value.trim()] }))
    }
  }

  const removeItem = (field: 'tags' | 'vibes' | 'activities' | 'cuisine' | 'amenities', value: string) => {
    setFormData(prev => ({ ...prev, [field]: prev[field].filter(item => item !== value) }))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <h3 className="font-semibold text-lg">Core Information</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              required
              placeholder="Place name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="kind">Kind *</Label>
            <Select
              value={formData.kind}
              onValueChange={(value) => setFormData(prev => ({ ...prev, kind: value }))}
            >
              <SelectTrigger id="kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLACE_KINDS.map(kind => (
                  <SelectItem key={kind} value={kind}>
                    {kind}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            rows={3}
            placeholder="What makes this place interesting?"
          />
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-semibold text-lg">Location</h3>

        <div className="space-y-2">
          <Label>Search Location</Label>
          <LocationPicker
            value={{
              googlePlaceId: formData.googlePlaceId,
              name: formData.name,
              address: formData.address,
              city: formData.city,
              admin: formData.admin,
              country: formData.country,
              coords: formData.coords,
            }}
            onChange={handleLocationChange}
            placeholder="Search for a place..."
          />
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowManualLocation(!showManualLocation)}
          className="text-muted-foreground"
        >
          {showManualLocation ? (
            <>
              <ChevronUp className="h-4 w-4 mr-1" />
              Hide manual entry
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4 mr-1" />
              Edit location manually
            </>
          )}
        </Button>

        {showManualLocation && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                  placeholder="City name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin">State/Region</Label>
                <Input
                  id="admin"
                  value={formData.admin}
                  onChange={(e) => setFormData(prev => ({ ...prev, admin: e.target.value }))}
                  placeholder="State or region"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  value={formData.country}
                  onChange={(e) => setFormData(prev => ({ ...prev, country: e.target.value }))}
                  placeholder="Country name (e.g., United States)"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Full Address</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                placeholder="Street address"
              />
            </div>
          </>
        )}
      </div>

      <div className="space-y-4">
        <h3 className="font-semibold text-lg">Metadata</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="price_level">Price Level</Label>
            <Select
              value={formData.price_level || undefined}
              onValueChange={(value) => setFormData(prev => ({ ...prev, price_level: value }))}
            >
              <SelectTrigger id="price_level">
                <SelectValue placeholder="Select price level (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="$">$ - Budget</SelectItem>
                <SelectItem value="$$">$$ - Moderate</SelectItem>
                <SelectItem value="$$$">$$$ - Upscale</SelectItem>
                <SelectItem value="$$$$">$$$$ - Fine Dining</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="best_time">Best Time to Visit</Label>
            <Input
              id="best_time"
              value={formData.best_time}
              onChange={(e) => setFormData(prev => ({ ...prev, best_time: e.target.value }))}
              placeholder="e.g., summer, sunset, weekdays"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            rows={2}
            placeholder="Personal notes or tips"
          />
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-semibold text-lg">Categories & Details</h3>

        <div className="space-y-2">
          <Label>Tags</Label>
          <div className="flex gap-2">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addItem('tags', tagInput)
                  setTagInput('')
                }
              }}
              placeholder="Add tag..."
            />
            <Button
              type="button"
              onClick={() => {
                addItem('tags', tagInput)
                setTagInput('')
              }}
            >
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {formData.tags.map(tag => (
              <Badge key={tag} variant="outline">
                {tag}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 ml-1 p-0"
                  onClick={() => removeItem('tags', tag)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Vibes</Label>
          <div className="flex gap-2">
            <Input
              value={vibeInput}
              onChange={(e) => setVibeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addItem('vibes', vibeInput)
                  setVibeInput('')
                }
              }}
              placeholder="Add vibe..."
            />
            <Button
              type="button"
              onClick={() => {
                addItem('vibes', vibeInput)
                setVibeInput('')
              }}
            >
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {formData.vibes.map(vibe => (
              <Badge key={vibe} variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                {vibe}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 ml-1 p-0"
                  onClick={() => removeItem('vibes', vibe)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Activities</Label>
          <div className="flex gap-2">
            <Input
              value={activityInput}
              onChange={(e) => setActivityInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addItem('activities', activityInput)
                  setActivityInput('')
                }
              }}
              placeholder="Add activity..."
            />
            <Button
              type="button"
              onClick={() => {
                addItem('activities', activityInput)
                setActivityInput('')
              }}
            >
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {formData.activities.map(activity => (
              <Badge key={activity} variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                {activity}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 ml-1 p-0"
                  onClick={() => removeItem('activities', activity)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
        </div>

        {['restaurant', 'cafe', 'bar'].includes(formData.kind) && (
          <div className="space-y-2">
            <Label>Cuisine</Label>
            <div className="flex gap-2">
              <Input
                value={cuisineInput}
                onChange={(e) => setCuisineInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addItem('cuisine', cuisineInput)
                    setCuisineInput('')
                  }
                }}
                placeholder="Add cuisine type..."
              />
              <Button
                type="button"
                onClick={() => {
                  addItem('cuisine', cuisineInput)
                  setCuisineInput('')
                }}
              >
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {formData.cuisine.map(item => (
                <Badge key={item} variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                  {item}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4 ml-1 p-0"
                    onClick={() => removeItem('cuisine', item)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label>Amenities</Label>
          <div className="flex gap-2">
            <Input
              value={amenityInput}
              onChange={(e) => setAmenityInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addItem('amenities', amenityInput)
                  setAmenityInput('')
                }
              }}
              placeholder="Add amenity..."
            />
            <Button
              type="button"
              onClick={() => {
                addItem('amenities', amenityInput)
                setAmenityInput('')
              }}
            >
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {formData.amenities.map(amenity => (
              <Badge key={amenity} variant="outline" className="bg-green-50 text-green-700 border-green-200">
                {amenity}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 ml-1 p-0"
                  onClick={() => removeItem('amenities', amenity)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-3 justify-end pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Saving...' : 'Save Changes'}
        </Button>
        {showConfirmButton && onSaveAndConfirm && (
          <Button
            type="button"
            onClick={handleSaveAndConfirm}
            disabled={isSubmitting}
          >
            <Check className="h-4 w-4 mr-2" />
            {isSubmitting ? 'Confirming...' : 'Save & Confirm to Library'}
          </Button>
        )}
      </div>
    </form>
  )
}
