"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { PlaceWithRelations } from "@/types/database"

interface MetadataSectionProps {
  place: PlaceWithRelations
}

export function MetadataSection({ place }: MetadataSectionProps) {
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A"
    return new Date(dateString).toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const getConfidenceBadge = (confidence: number | null) => {
    if (!confidence) return <Badge variant="outline">Unknown</Badge>

    if (confidence >= 0.9) return <Badge className="bg-green-600">High ({(confidence * 100).toFixed(0)}%)</Badge>
    if (confidence >= 0.8) return <Badge className="bg-blue-600">Medium ({(confidence * 100).toFixed(0)}%)</Badge>
    if (confidence >= 0.6) return <Badge className="bg-yellow-600">Low ({(confidence * 100).toFixed(0)}%)</Badge>
    return <Badge className="bg-gray-600">Very Low ({(confidence * 100).toFixed(0)}%)</Badge>
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>ℹ️ Metadata</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-muted-foreground">Created</div>
            <div className="font-medium" suppressHydrationWarning>
              {formatDate(place.createdAt)}
            </div>
          </div>

          <div>
            <div className="text-sm text-muted-foreground">Last Updated</div>
            <div className="font-medium" suppressHydrationWarning>
              {formatDate(place.updatedAt)}
            </div>
          </div>

          <div>
            <div className="text-sm text-muted-foreground">Confidence Score</div>
            <div className="mt-1">{getConfidenceBadge(place.confidence)}</div>
          </div>

          <div>
            <div className="text-sm text-muted-foreground">Status</div>
            <div className="mt-1">
              <Badge>{place.status}</Badge>
            </div>
          </div>

          <div>
            <div className="text-sm text-muted-foreground">Place ID</div>
            <div className="font-mono text-xs">{place.id}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
