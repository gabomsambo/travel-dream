"use client"

import { useState, useTransition, useOptimistic } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Save, Check } from "lucide-react"
import { Button } from "@/components/adapters/button"
import { useDebouncedCallback } from "@/hooks/use-auto-save"
import type { PlaceWithRelations } from "@/types/database"

// Import all section components (to be created)
import { HeroSection } from "./place-full-view-sections/hero-section"
import { LocationSection } from "./place-full-view-sections/location-section"
import { DetailsSection } from "./place-full-view-sections/details-section"
import { ContactSection } from "./place-full-view-sections/contact-section"
import { PlanningSection } from "./place-full-view-sections/planning-section"
import { NotesSection } from "./place-full-view-sections/notes-section"
import { ReservationsSection } from "./place-full-view-sections/reservations-section"
import { LinksSection } from "./place-full-view-sections/links-section"
import { MediaSection } from "./place-full-view-sections/media-section"
import { SourcesSection } from "./place-full-view-sections/sources-section"
import { MetadataSection } from "./place-full-view-sections/metadata-section"

interface PlaceFullViewProps {
  initialPlace: PlaceWithRelations
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export function PlaceFullView({ initialPlace }: PlaceFullViewProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Form state for all 34 fields
  const [formData, setFormData] = useState({
    // Basic fields (3)
    name: initialPlace.name || '',
    kind: initialPlace.kind,
    description: initialPlace.description || '',

    // Location fields (6)
    city: initialPlace.city || '',
    country: initialPlace.country || '',
    admin: initialPlace.admin || '',
    address: initialPlace.address || '',
    coords: initialPlace.coords || null,
    altNames: Array.isArray(initialPlace.altNames) ? initialPlace.altNames : [],

    // Tag fields (5) - Ensure arrays, not null
    tags: Array.isArray(initialPlace.tags) ? initialPlace.tags : [],
    vibes: Array.isArray(initialPlace.vibes) ? initialPlace.vibes : [],
    activities: Array.isArray(initialPlace.activities) ? initialPlace.activities : [],
    cuisine: Array.isArray(initialPlace.cuisine) ? initialPlace.cuisine : [],
    amenities: Array.isArray(initialPlace.amenities) ? initialPlace.amenities : [],

    // Metadata fields (3)
    price_level: initialPlace.price_level || null,
    best_time: initialPlace.best_time || null,
    ratingSelf: initialPlace.ratingSelf || 0,

    // Contact fields (4)
    website: initialPlace.website || null,
    phone: initialPlace.phone || null,
    email: initialPlace.email || null,
    hours: initialPlace.hours || null,

    // Visit tracking (4)
    visitStatus: initialPlace.visitStatus || 'not_visited',
    priority: initialPlace.priority || 0,
    lastVisited: initialPlace.lastVisited || null,
    plannedVisit: initialPlace.plannedVisit || null,

    // Social fields (2)
    recommendedBy: initialPlace.recommendedBy || null,
    companions: Array.isArray(initialPlace.companions) ? initialPlace.companions : [],

    // Notes fields (2)
    notes: initialPlace.notes || '',
    practicalInfo: initialPlace.practicalInfo || '',
  })

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')

  // Optimistic state for immediate UI feedback
  const [optimisticPlace, setOptimisticPlace] = useOptimistic(initialPlace)

  // Auto-save function
  const handleSave = async () => {
    setSaveStatus('saving')

    try {
      const response = await fetch(`/api/places/${initialPlace.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        console.error('API Error Response:', errorData)
        console.error('Validation errors detail:', errorData?.errors)
        const errorMessage = errorData?.message || errorData?.errors?.[0]?.message || 'Failed to save'
        throw new Error(errorMessage)
      }

      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)

      // Refresh server data
      router.refresh()
    } catch (error) {
      setSaveStatus('error')
      console.error('Save failed:', error)
      console.error('Form data being sent:', formData)
      alert(`Save failed: ${error instanceof Error ? error.message : 'Please try again'}`)
    }
  }

  // Debounced save (800ms)
  const debouncedSave = useDebouncedCallback(handleSave, 800)

  // Update form data and trigger debounced save
  const updateField = <K extends keyof typeof formData>(
    field: K,
    value: typeof formData[K]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }))

    // Optimistic update
    startTransition(() => {
      setOptimisticPlace(prev => ({ ...prev, [field]: value }))
    })

    debouncedSave()
  }

  return (
    <div className="min-h-screen bg-background -m-6">
      {/* Header */}
      <div className="sticky -top-6 z-50 bg-background border-b">
        <div className="container max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/library')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Library
            </Button>
            <span className="text-sm text-muted-foreground">
              Editing: {formData.name}
            </span>
          </div>

          {/* Save Status Indicator */}
          <div className="flex items-center gap-2">
            {saveStatus === 'saving' && (
              <span className="text-sm text-muted-foreground flex items-center gap-2">
                <Save className="h-4 w-4 animate-spin" />
                Saving...
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="text-sm text-green-600 flex items-center gap-2">
                <Check className="h-4 w-4" />
                Saved
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="text-sm text-red-600">Save failed</span>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container max-w-6xl mx-auto px-4 py-8">
        <div className="space-y-8">
          <HeroSection place={optimisticPlace} formData={formData} updateField={updateField} />
          <LocationSection formData={formData} updateField={updateField} />
          <DetailsSection formData={formData} updateField={updateField} />
          <ContactSection formData={formData} updateField={updateField} />
          <PlanningSection formData={formData} updateField={updateField} />
          <NotesSection formData={formData} updateField={updateField} />
          <ReservationsSection place={optimisticPlace} />
          <LinksSection place={optimisticPlace} />
          <MediaSection place={optimisticPlace} />
          <SourcesSection place={optimisticPlace} />
          <MetadataSection place={optimisticPlace} />
        </div>
      </div>
    </div>
  )
}
