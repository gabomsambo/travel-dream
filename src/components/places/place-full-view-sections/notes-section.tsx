"use client"

import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface NotesSectionProps {
  formData: any
  updateField: (field: any, value: any) => void
}

export function NotesSection({ formData, updateField }: NotesSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>📝 Notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Personal Notes */}
        <div>
          <Label htmlFor="notes">Personal Notes</Label>
          <Textarea
            id="notes"
            value={formData.notes || ''}
            onChange={(e) => updateField('notes', e.target.value || null)}
            rows={6}
            placeholder="Add your personal notes, memories, or thoughts about this place..."
          />
        </div>

        {/* Practical Info */}
        <div>
          <Label htmlFor="practicalInfo">Practical Info</Label>
          <Textarea
            id="practicalInfo"
            value={formData.practicalInfo || ''}
            onChange={(e) => updateField('practicalInfo', e.target.value || null)}
            rows={4}
            placeholder="Parking info, dress code, best time to visit, booking requirements, etc."
          />
        </div>
      </CardContent>
    </Card>
  )
}
