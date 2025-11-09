"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MapPin, Car, Footprints } from "lucide-react"

interface DayMetricsProps {
  stops: number
  transportMode: 'drive' | 'walk'
  onTransportModeChange: (mode: 'drive' | 'walk') => void
}

export function DayMetrics({
  stops,
  transportMode,
  onTransportModeChange,
}: DayMetricsProps) {
  return (
    <div className="container py-4">
      <Card className="p-4 bg-gradient-to-r from-primary/5 to-accent/5 border-primary/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <MapPin className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Stops</p>
              <p className="text-2xl font-bold">{stops}</p>
            </div>
          </div>

          <div className="flex items-center gap-1 border rounded-lg p-1">
            <Button
              variant={transportMode === 'drive' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onTransportModeChange('drive')}
              className="gap-2"
            >
              <Car className="h-4 w-4" />
              Drive
            </Button>
            <Button
              variant={transportMode === 'walk' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onTransportModeChange('walk')}
              className="gap-2"
            >
              <Footprints className="h-4 w-4" />
              Walk
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
