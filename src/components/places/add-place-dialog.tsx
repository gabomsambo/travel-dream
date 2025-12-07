"use client"

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/adapters/dialog"
import { Button } from "@/components/adapters/button"
import { Input } from "@/components/adapters/input"
import { Textarea } from "@/components/adapters/textarea"
import { Label } from "@/components/adapters/label"
import { Badge } from "@/components/adapters/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/adapters/select"
import { LocationPicker } from '@/components/ui/location-picker'
import { KindSelector } from './kind-selector'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui-v2/collapsible'
import { ChevronDown, ChevronUp, X, Loader2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { PlaceKind, Place } from '@/types/database'
import type { LocationData } from '@/hooks/use-google-places'

interface AddPlaceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPlaceCreated?: (place: Place) => void
}

interface AddPlaceFormData {
  name: string
  kind: PlaceKind
  description: string
  googlePlaceId?: string
  address?: string
  city?: string
  admin?: string
  country?: string
  coords?: { lat: number; lon: number }
  tags: string[]
  vibes: string[]
  activities: string[]
  cuisine: string[]
  amenities: string[]
  website?: string
  phone?: string
  hours?: Record<string, string>
  priceLevel?: string
  notes?: string
  bestTime?: string
}

const initialFormData: AddPlaceFormData = {
  name: '',
  kind: 'restaurant',
  description: '',
  tags: [],
  vibes: [],
  activities: [],
  cuisine: [],
  amenities: [],
}

export function AddPlaceDialog({ open, onOpenChange, onPlaceCreated }: AddPlaceDialogProps) {
  const [formData, setFormData] = useState<AddPlaceFormData>(initialFormData)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showMoreFields, setShowMoreFields] = useState(false)
  const [duplicateWarning, setDuplicateWarning] = useState<{
    count: number
    names: string[]
  } | null>(null)
  const router = useRouter()

  const [tagInput, setTagInput] = useState('')
  const [vibeInput, setVibeInput] = useState('')
  const [activityInput, setActivityInput] = useState('')
  const [cuisineInput, setCuisineInput] = useState('')
  const [amenityInput, setAmenityInput] = useState('')

  const checkForDuplicates = useCallback(async (name: string, city: string) => {
    if (!name || name.length < 3) {
      setDuplicateWarning(null)
      return
    }

    try {
      const searchParams = new URLSearchParams({
        search: name,
        status: 'library',
        limit: '10',
      })

      if (city) {
        searchParams.set('city', city)
      }

      const response = await fetch(`/api/places?${searchParams}`)
      if (!response.ok) return

      const data = await response.json()
      if (data.places && data.places.length > 0) {
        const matchingPlaces = data.places.filter((place: any) => {
          const nameLower = name.toLowerCase()
          const placeNameLower = place.name.toLowerCase()
          return placeNameLower.includes(nameLower) || nameLower.includes(placeNameLower)
        })

        if (matchingPlaces.length > 0) {
          setDuplicateWarning({
            count: matchingPlaces.length,
            names: matchingPlaces.slice(0, 3).map((p: any) => p.name)
          })
          return
        }
      }
      setDuplicateWarning(null)
    } catch (error) {
      console.error('Failed to check for duplicates:', error)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.name.trim().length >= 3) {
        checkForDuplicates(formData.name.trim(), formData.city || '')
      } else {
        setDuplicateWarning(null)
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [formData.name, formData.city, checkForDuplicates])

  const handleLocationChange = (location: LocationData | null) => {
    if (location) {
      setFormData(prev => ({
        ...prev,
        googlePlaceId: location.googlePlaceId,
        address: location.address,
        city: location.city || '',
        admin: location.admin || '',
        country: location.country || '',
        coords: location.coords ? { lat: location.coords.lat, lon: location.coords.lon } : undefined,
        // Auto-fill hours from Google Places if available
        ...(location.hours ? { hours: location.hours } : {}),
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        googlePlaceId: undefined,
        address: '',
        city: '',
        admin: '',
        country: '',
        coords: undefined,
        hours: undefined,
      }))
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

  const resetForm = () => {
    setFormData(initialFormData)
    setTagInput('')
    setVibeInput('')
    setActivityInput('')
    setCuisineInput('')
    setAmenityInput('')
    setShowMoreFields(false)
    setDuplicateWarning(null)
  }

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error('Name is required')
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch('/api/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          kind: formData.kind,
          description: formData.description.trim() || null,
          googlePlaceId: formData.googlePlaceId || null,
          address: formData.address || null,
          city: formData.city || null,
          admin: formData.admin || null,
          country: formData.country || null,
          coords: formData.coords || null,
          tags: formData.tags.length > 0 ? formData.tags : null,
          vibes: formData.vibes.length > 0 ? formData.vibes : null,
          activities: formData.activities.length > 0 ? formData.activities : null,
          cuisine: formData.cuisine.length > 0 ? formData.cuisine : null,
          amenities: formData.amenities.length > 0 ? formData.amenities : null,
          website: formData.website?.trim() || null,
          phone: formData.phone?.trim() || null,
          hours: formData.hours || null,
          price_level: formData.priceLevel || null,
          best_time: formData.bestTime?.trim() || null,
          notes: formData.notes?.trim() || null,
          status: 'library',
          confidence: 1.0,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create place')
      }

      const place = await response.json()
      toast.success(`${place.name} added to library`)
      onPlaceCreated?.(place)
      resetForm()
      onOpenChange(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create place')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      resetForm()
      onOpenChange(false)
    }
  }

  const showCuisineField = ['restaurant', 'cafe', 'bar'].includes(formData.kind)

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add New Place</DialogTitle>
          <DialogDescription>
            Add a place to your travel collection manually
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4 px-1">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Café de Flore"
                disabled={isSubmitting}
              />
              {duplicateWarning && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md text-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <p className="text-amber-800 dark:text-amber-200">
                      Found {duplicateWarning.count} similar place{duplicateWarning.count > 1 ? 's' : ''}: {duplicateWarning.names.join(', ')}
                      {duplicateWarning.count > 3 && ` and ${duplicateWarning.count - 3} more`}
                    </p>
                    <Link 
                      href="/duplicates" 
                      className="text-amber-600 dark:text-amber-400 underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-300"
                    >
                      View in Duplicates
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Kind *</Label>
              <KindSelector
                value={formData.kind}
                onChange={kind => setFormData(prev => ({ ...prev, kind }))}
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label>Location</Label>
              <LocationPicker
                value={{
                  googlePlaceId: formData.googlePlaceId,
                  address: formData.address,
                  city: formData.city,
                  admin: formData.admin,
                  country: formData.country,
                  coords: formData.coords,
                }}
                onChange={handleLocationChange}
                placeholder="Search for a place..."
                disabled={isSubmitting}
              />
              {formData.city && (
                <p className="text-sm text-muted-foreground">
                  {[formData.city, formData.admin, formData.country].filter(Boolean).join(', ')}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="What makes this place special?"
                rows={3}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <Collapsible open={showMoreFields} onOpenChange={setShowMoreFields}>
            <CollapsibleTrigger asChild>
              <Button 
                type="button" 
                variant="ghost" 
                className="w-full justify-between border border-dashed"
                disabled={isSubmitting}
              >
                <span>More Details</span>
                {showMoreFields ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="priceLevel">Price Level</Label>
                  <Select
                    value={formData.priceLevel || ''}
                    onValueChange={value => setFormData(prev => ({ ...prev, priceLevel: value || undefined }))}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="priceLevel">
                      <SelectValue placeholder="Select price level" />
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
                  <Label htmlFor="bestTime">Best Time to Visit</Label>
                  <Input
                    id="bestTime"
                    value={formData.bestTime || ''}
                    onChange={e => setFormData(prev => ({ ...prev, bestTime: e.target.value }))}
                    placeholder="e.g., summer, sunset, weekdays"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    type="url"
                    value={formData.website || ''}
                    onChange={e => setFormData(prev => ({ ...prev, website: e.target.value }))}
                    placeholder="https://..."
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone || ''}
                    onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="+1 (555) 123-4567"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Tags</Label>
                <div className="flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addItem('tags', tagInput)
                        setTagInput('')
                      }
                    }}
                    placeholder="Add tag..."
                    disabled={isSubmitting}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      addItem('tags', tagInput)
                      setTagInput('')
                    }}
                    disabled={isSubmitting}
                  >
                    Add
                  </Button>
                </div>
                {formData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {formData.tags.map(tag => (
                      <Badge key={tag} variant="outline">
                        {tag}
                        <button
                          type="button"
                          className="ml-1 hover:text-destructive"
                          onClick={() => removeItem('tags', tag)}
                          disabled={isSubmitting}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Vibes</Label>
                <div className="flex gap-2">
                  <Input
                    value={vibeInput}
                    onChange={e => setVibeInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addItem('vibes', vibeInput)
                        setVibeInput('')
                      }
                    }}
                    placeholder="Add vibe..."
                    disabled={isSubmitting}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      addItem('vibes', vibeInput)
                      setVibeInput('')
                    }}
                    disabled={isSubmitting}
                  >
                    Add
                  </Button>
                </div>
                {formData.vibes.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {formData.vibes.map(vibe => (
                      <Badge key={vibe} variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                        {vibe}
                        <button
                          type="button"
                          className="ml-1 hover:text-destructive"
                          onClick={() => removeItem('vibes', vibe)}
                          disabled={isSubmitting}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Activities</Label>
                <div className="flex gap-2">
                  <Input
                    value={activityInput}
                    onChange={e => setActivityInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addItem('activities', activityInput)
                        setActivityInput('')
                      }
                    }}
                    placeholder="Add activity..."
                    disabled={isSubmitting}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      addItem('activities', activityInput)
                      setActivityInput('')
                    }}
                    disabled={isSubmitting}
                  >
                    Add
                  </Button>
                </div>
                {formData.activities.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {formData.activities.map(activity => (
                      <Badge key={activity} variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                        {activity}
                        <button
                          type="button"
                          className="ml-1 hover:text-destructive"
                          onClick={() => removeItem('activities', activity)}
                          disabled={isSubmitting}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {showCuisineField && (
                <div className="space-y-2">
                  <Label>Cuisine</Label>
                  <div className="flex gap-2">
                    <Input
                      value={cuisineInput}
                      onChange={e => setCuisineInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addItem('cuisine', cuisineInput)
                          setCuisineInput('')
                        }
                      }}
                      placeholder="Add cuisine type..."
                      disabled={isSubmitting}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        addItem('cuisine', cuisineInput)
                        setCuisineInput('')
                      }}
                      disabled={isSubmitting}
                    >
                      Add
                    </Button>
                  </div>
                  {formData.cuisine.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {formData.cuisine.map(item => (
                        <Badge key={item} variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                          {item}
                          <button
                            type="button"
                            className="ml-1 hover:text-destructive"
                            onClick={() => removeItem('cuisine', item)}
                            disabled={isSubmitting}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label>Amenities</Label>
                <div className="flex gap-2">
                  <Input
                    value={amenityInput}
                    onChange={e => setAmenityInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addItem('amenities', amenityInput)
                        setAmenityInput('')
                      }
                    }}
                    placeholder="Add amenity..."
                    disabled={isSubmitting}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      addItem('amenities', amenityInput)
                      setAmenityInput('')
                    }}
                    disabled={isSubmitting}
                  >
                    Add
                  </Button>
                </div>
                {formData.amenities.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {formData.amenities.map(amenity => (
                      <Badge key={amenity} variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        {amenity}
                        <button
                          type="button"
                          className="ml-1 hover:text-destructive"
                          onClick={() => removeItem('amenities', amenity)}
                          disabled={isSubmitting}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes || ''}
                  onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Personal notes or tips..."
                  rows={2}
                  disabled={isSubmitting}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <DialogFooter className="border-t pt-4">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              'Add to Library'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

