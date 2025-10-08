"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { TagInput } from "@/components/ui-custom/tag-input"

interface PlanningSectionProps {
  formData: any
  updateField: (field: any, value: any) => void
}

export function PlanningSection({ formData, updateField }: PlanningSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>🗓️ Visit Planning</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Visit Status */}
        <div>
          <Label>Visit Status</Label>
          <div className="flex gap-2 mt-2">
            <Button
              variant={formData.visitStatus === 'not_visited' ? 'default' : 'outline'}
              onClick={() => updateField('visitStatus', 'not_visited')}
              size="sm"
            >
              Not Visited
            </Button>
            <Button
              variant={formData.visitStatus === 'visited' ? 'default' : 'outline'}
              onClick={() => updateField('visitStatus', 'visited')}
              size="sm"
            >
              Visited
            </Button>
            <Button
              variant={formData.visitStatus === 'planned' ? 'default' : 'outline'}
              onClick={() => updateField('visitStatus', 'planned')}
              size="sm"
            >
              Planned
            </Button>
          </div>
        </div>

        {/* Priority */}
        <div>
          <Label>Priority</Label>
          <div className="flex gap-1 mt-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={cn(
                  "h-6 w-6 cursor-pointer transition-colors",
                  star <= formData.priority
                    ? "fill-yellow-400 text-yellow-400"
                    : "fill-gray-200 text-gray-200 hover:fill-yellow-200"
                )}
                onClick={() => updateField('priority', star)}
              />
            ))}
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="lastVisited">Last Visited</Label>
            <Input
              id="lastVisited"
              type="date"
              value={formData.lastVisited || ''}
              onChange={(e) => updateField('lastVisited', e.target.value || null)}
            />
          </div>

          <div>
            <Label htmlFor="plannedVisit">Planned Visit</Label>
            <Input
              id="plannedVisit"
              type="date"
              value={formData.plannedVisit || ''}
              onChange={(e) => updateField('plannedVisit', e.target.value || null)}
            />
          </div>
        </div>

        {/* Recommended By */}
        <div>
          <Label htmlFor="recommendedBy">Recommended By</Label>
          <Input
            id="recommendedBy"
            value={formData.recommendedBy || ''}
            onChange={(e) => updateField('recommendedBy', e.target.value || null)}
            placeholder="Friend, influencer, blog, etc."
          />
        </div>

        {/* Companions */}
        <div>
          <Label>Companions</Label>
          <TagInput
            value={formData.companions}
            onChange={(companions) => updateField('companions', companions)}
            placeholder="Add companions..."
          />
        </div>
      </CardContent>
    </Card>
  )
}
