"use client"

import { useState } from "react"
import { Button } from "@/components/adapters/button"
import { Label } from "@/components/adapters/label"
import { Textarea } from "@/components/adapters/textarea"
import type { PlaceWithRelations } from "@/types/database"

interface NotesTabProps {
  place: PlaceWithRelations
  onUpdate?: () => Promise<void>
}

export function NotesTab({ place }: NotesTabProps) {
  const [notes, setNotes] = useState(place.notes || "")
  const [practicalInfo, setPracticalInfo] = useState(place.practicalInfo || "")
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)

    try {
      const response = await fetch(`/api/places/${place.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: notes || null,
          practicalInfo: practicalInfo || null,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to save notes")
      }

      alert("Notes saved successfully!")
    } catch (error) {
      alert("Failed to save notes")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="notes">Personal Notes</Label>
        <Textarea
          id="notes"
          placeholder="Your thoughts, impressions, memories..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-2 min-h-[150px]"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Add your personal notes and reflections about this place
        </p>
      </div>

      <div>
        <Label htmlFor="practical-info">Practical Information</Label>
        <Textarea
          id="practical-info"
          placeholder="Bring cash only, entrance on side street, best to arrive early..."
          value={practicalInfo}
          onChange={(e) => setPracticalInfo(e.target.value)}
          className="mt-2 min-h-[150px]"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Tips, logistics, and practical advice for visiting
        </p>
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? "Saving..." : "Save Notes"}
      </Button>
    </div>
  )
}
