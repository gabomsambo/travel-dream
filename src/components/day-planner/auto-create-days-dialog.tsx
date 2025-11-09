"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sparkles } from "lucide-react"
import type { Place } from "@/types/database"

interface AutoCreateDaysDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  places: Place[]
  onApply: (hoursPerDay: number) => void
  transportMode: 'drive' | 'walk'
}

export function AutoCreateDaysDialog({
  open,
  onOpenChange,
  places,
  onApply,
  transportMode,
}: AutoCreateDaysDialogProps) {
  const [hoursPerDay, setHoursPerDay] = useState(8)

  const handleApply = () => {
    onApply(hoursPerDay)
  }

  const estimatedDays = Math.ceil(places.length / 5)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Auto-Create Days
          </DialogTitle>
          <DialogDescription>
            Automatically organize {places.length} places into daily itineraries based on time and distance.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="hours">Hours per day</Label>
            <Input
              id="hours"
              type="number"
              min={1}
              max={24}
              value={hoursPerDay}
              onChange={(e) => setHoursPerDay(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              How many hours you want to spend traveling each day
            </p>
          </div>

          <div className="rounded-lg bg-muted p-4 space-y-2">
            <h4 className="font-medium text-sm">Preview</h4>
            <p className="text-sm text-muted-foreground">
              This will create approximately <span className="font-semibold">{estimatedDays} days</span> based on {transportMode === 'drive' ? 'driving' : 'walking'} at {transportMode === 'drive' ? '60 km/h' : '5 km/h'}.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply}>
            <Sparkles className="h-4 w-4 mr-2" />
            Create Days
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
