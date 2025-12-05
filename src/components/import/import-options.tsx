"use client"

import { useState, useEffect } from 'react'
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/adapters/badge"
import { Info, CheckCircle, Inbox } from 'lucide-react'
import type { Collection } from '@/types/database'

interface ImportOptionsProps {
  confidentMode: boolean
  onConfidentModeChange: (enabled: boolean) => void
  selectedCollectionId: string | null
  onCollectionChange: (id: string | null) => void
  validCount: number
  invalidCount: number
}

export function ImportOptions({
  confidentMode,
  onConfidentModeChange,
  selectedCollectionId,
  onCollectionChange,
  validCount,
  invalidCount
}: ImportOptionsProps) {
  const [collections, setCollections] = useState<Collection[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchCollections() {
      try {
        const response = await fetch('/api/collections')
        const data = await response.json()
        setCollections(data.collections || [])
      } catch (err) {
        console.error('Failed to fetch collections:', err)
      } finally {
        setIsLoading(false)
      }
    }
    fetchCollections()
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-1">Import Options</h3>
        <p className="text-sm text-gray-500">
          Configure how places will be imported
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
          <Checkbox
            id="confident-mode"
            checked={confidentMode}
            onCheckedChange={(checked) => onConfidentModeChange(!!checked)}
          />
          <div className="space-y-1">
            <label htmlFor="confident-mode" className="text-sm font-medium cursor-pointer">
              Confident mode
            </label>
            <p className="text-xs text-gray-500">
              Review each row before importing. Confirmed rows go directly to your library,
              unconfirmed rows go to inbox for later review.
            </p>
          </div>
        </div>

        <div className="p-4 border rounded-lg space-y-3">
          <label className="text-sm font-medium">Add to collection (optional)</label>
          <Select
            value={selectedCollectionId || 'none'}
            onValueChange={(v) => onCollectionChange(v === 'none' ? null : v)}
            disabled={isLoading}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a collection" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No collection</SelectItem>
              {collections.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500">
            All imported places will be added to this collection
          </p>
        </div>
      </div>

      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-2">
            <div className="text-sm font-medium text-blue-900">Import Summary</div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="default" className="bg-green-100 text-green-800">
                <CheckCircle className="h-3 w-3 mr-1" />
                {validCount} valid rows
              </Badge>
              {invalidCount > 0 && (
                <Badge variant="destructive">
                  {invalidCount} invalid rows
                </Badge>
              )}
            </div>
            <div className="text-xs text-blue-700 space-y-1">
              {confidentMode ? (
                <>
                  <div className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    <span>You&apos;ll review each row before importing</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="ml-4">Confirmed → Library</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="ml-4">Unconfirmed → Inbox</span>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-1">
                  <Inbox className="h-3 w-3" />
                  <span>All {validCount} places will be added to your inbox</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
