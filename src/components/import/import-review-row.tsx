"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/adapters/badge"
import { Card } from "@/components/adapters/card"
import { MapPin, Tag, Sparkles, CheckCircle, Inbox } from 'lucide-react'
import type { ParsedRow } from '@/types/import'

interface ImportReviewRowProps {
  row: ParsedRow
  isConfirmed: boolean
  onToggleConfirm: () => void
}

export function ImportReviewRow({
  row,
  isConfirmed,
  onToggleConfirm
}: ImportReviewRowProps) {
  const place = row.mappedData

  return (
    <Card className={`p-4 transition-colors ${isConfirmed ? 'bg-green-50 border-green-200' : ''}`}>
      <div className="flex items-start gap-4">
        <Checkbox
          checked={isConfirmed}
          onCheckedChange={onToggleConfirm}
          className="mt-1"
        />

        <div className="flex-1 min-w-0 grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="text-xs font-medium text-gray-500 uppercase">Raw Input (Row {row.rowNumber})</div>
            <div className="space-y-1 text-sm">
              {row.rawValues.slice(0, 5).map((value, idx) => (
                <div key={idx} className="text-gray-600 truncate">
                  {value || <span className="text-gray-400 italic">empty</span>}
                </div>
              ))}
              {row.rawValues.length > 5 && (
                <div className="text-gray-400 text-xs">
                  +{row.rawValues.length - 5} more fields
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-gray-500 uppercase">Parsed Result</div>
            <div className="space-y-1">
              <div className="font-medium">{place.name || 'Unnamed'}</div>

              <div className="flex items-center gap-2 text-sm">
                <Badge variant="outline" className="text-xs">
                  {place.kind || 'tip'}
                </Badge>
              </div>

              {(place.city || place.country) && (
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <MapPin className="h-3 w-3" />
                  <span>{[place.city, place.country].filter(Boolean).join(', ')}</span>
                </div>
              )}

              {place.tags && place.tags.length > 0 && (
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <Tag className="h-3 w-3" />
                  <span className="truncate">{place.tags.slice(0, 3).join(', ')}</span>
                </div>
              )}

              {place.vibes && place.vibes.length > 0 && (
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <Sparkles className="h-3 w-3" />
                  <span className="truncate">{place.vibes.slice(0, 3).join(', ')}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-shrink-0">
          {isConfirmed ? (
            <Badge variant="default" className="bg-green-100 text-green-800">
              <CheckCircle className="h-3 w-3 mr-1" />
              Library
            </Badge>
          ) : (
            <Badge variant="outline" className="text-gray-500">
              <Inbox className="h-3 w-3 mr-1" />
              Inbox
            </Badge>
          )}
        </div>
      </div>
    </Card>
  )
}
