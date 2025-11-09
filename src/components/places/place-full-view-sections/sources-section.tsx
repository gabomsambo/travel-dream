"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/adapters/card"
import { Badge } from "@/components/adapters/badge"
import type { PlaceWithRelations } from "@/types/database"

interface SourcesSectionProps {
  place: PlaceWithRelations
}

export function SourcesSection({ place }: SourcesSectionProps) {
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Unknown"
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>📄 Source Materials</CardTitle>
      </CardHeader>
      <CardContent>
        {place.sources.length === 0 ? (
          <p className="text-sm text-muted-foreground">No source materials</p>
        ) : (
          <div className="space-y-3">
            {place.sources.map((source) => (
              <div key={source.id} className="flex items-start gap-3 p-3 border rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline">{source.type}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(source.createdAt)}
                    </span>
                  </div>
                  {source.meta?.filename && (
                    <div className="text-sm font-medium">{source.meta.filename}</div>
                  )}
                  {source.meta?.url && (
                    <a
                      href={source.meta.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {source.meta.url}
                    </a>
                  )}
                  {source.uri && source.type === 'screenshot' && (
                    <div className="text-xs text-muted-foreground">
                      Path: {source.uri}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
