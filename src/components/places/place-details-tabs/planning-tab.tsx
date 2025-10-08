"use client"

import { useState } from "react"
import { Star, Calendar, Users, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { PlaceWithRelations } from "@/types/database"

interface PlanningTabProps {
  place: PlaceWithRelations
  onUpdate?: () => Promise<void>
}

export function PlanningTab({ place }: PlanningTabProps) {
  const [visitStatus, setVisitStatus] = useState(
    place.visitStatus || "not_visited"
  )
  const [priority, setPriority] = useState(place.priority || 0)
  const [lastVisited, setLastVisited] = useState(place.lastVisited || "")
  const [plannedVisit, setPlannedVisit] = useState(place.plannedVisit || "")
  const [recommendedBy, setRecommendedBy] = useState(
    place.recommendedBy || ""
  )
  const [companions, setCompanions] = useState(() => {
    if (!place.companions) return ""
    if (Array.isArray(place.companions)) return place.companions.join(", ")
    if (typeof place.companions === 'string') {
      try {
        const parsed = JSON.parse(place.companions)
        return Array.isArray(parsed) ? parsed.join(", ") : place.companions
      } catch {
        return place.companions
      }
    }
    return ""
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)

    try {
      const response = await fetch(`/api/places/${place.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitStatus,
          priority,
          lastVisited: lastVisited || null,
          plannedVisit: plannedVisit || null,
          recommendedBy: recommendedBy || null,
          companions: companions
            ? companions.split(",").map((c) => c.trim()).filter(Boolean)
            : null,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to save")
      }

      alert("Planning details saved successfully!")
    } catch (error) {
      alert("Failed to save planning details")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Label className="mb-3 block">Visit Status</Label>
        <div className="flex gap-3">
          {["not_visited", "planned", "visited"].map((status) => (
            <button
              key={status}
              onClick={() => setVisitStatus(status)}
              className={`
                px-4 py-2 rounded-md border transition-colors text-sm font-medium
                ${
                  visitStatus === status
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-background border-input hover:bg-accent"
                }
              `}
            >
              {status === "not_visited" && "Not Visited"}
              {status === "planned" && "Planned"}
              {status === "visited" && "Visited"}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="mb-3 block">Priority</Label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => setPriority(star)}
              className="transition-colors"
            >
              <Star
                className={`h-6 w-6 ${
                  star <= priority
                    ? "fill-yellow-400 text-yellow-400"
                    : "text-gray-300"
                }`}
              />
            </button>
          ))}
          <button
            onClick={() => setPriority(0)}
            className="ml-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
      </div>

      {visitStatus === "visited" && (
        <div>
          <Label htmlFor="last-visited" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Last Visited
          </Label>
          <Input
            id="last-visited"
            type="date"
            value={lastVisited}
            onChange={(e) => setLastVisited(e.target.value)}
            className="mt-2"
          />
        </div>
      )}

      {visitStatus === "planned" && (
        <div>
          <Label htmlFor="planned-visit" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Planned Visit
          </Label>
          <Input
            id="planned-visit"
            type="date"
            value={plannedVisit}
            onChange={(e) => setPlannedVisit(e.target.value)}
            className="mt-2"
          />
        </div>
      )}

      <div>
        <Label htmlFor="recommended-by" className="flex items-center gap-2">
          <UserPlus className="h-4 w-4" />
          Recommended By
        </Label>
        <Input
          id="recommended-by"
          type="text"
          placeholder="Friend, blog, Instagram, etc."
          value={recommendedBy}
          onChange={(e) => setRecommendedBy(e.target.value)}
          className="mt-2"
        />
      </div>

      <div>
        <Label htmlFor="companions" className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          Companions
        </Label>
        <Input
          id="companions"
          type="text"
          placeholder="Alice, Bob, Carol (comma-separated)"
          value={companions}
          onChange={(e) => setCompanions(e.target.value)}
          className="mt-2"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Separate multiple names with commas
        </p>
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? "Saving..." : "Save Planning Details"}
      </Button>
    </div>
  )
}
