"use client"

import { useState, useMemo } from 'react'
import { CheckCircle, Inbox, Check, X } from 'lucide-react'
import { Button } from "@/components/adapters/button"
import { Badge } from "@/components/adapters/badge"
import { ImportReviewRow } from './import-review-row'
import type { ParsedRow } from '@/types/import'

interface ImportReviewProps {
  validRows: ParsedRow[]
  confirmedRowNumbers: Set<number>
  onConfirmedChange: (rowNumbers: Set<number>) => void
  onConfirm: () => void
  isImporting: boolean
}

export function ImportReview({
  validRows,
  confirmedRowNumbers,
  onConfirmedChange,
  onConfirm,
  isImporting
}: ImportReviewProps) {
  const confirmedCount = confirmedRowNumbers.size
  const inboxCount = validRows.length - confirmedCount

  const toggleRow = (rowNumber: number) => {
    const newSet = new Set(confirmedRowNumbers)
    if (newSet.has(rowNumber)) {
      newSet.delete(rowNumber)
    } else {
      newSet.add(rowNumber)
    }
    onConfirmedChange(newSet)
  }

  const selectAll = () => {
    onConfirmedChange(new Set(validRows.map(r => r.rowNumber)))
  }

  const selectNone = () => {
    onConfirmedChange(new Set())
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Review Import</h3>
          <p className="text-sm text-gray-500">
            Confirm which places go directly to your library
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={selectAll}>
            <Check className="h-4 w-4 mr-1" />
            Select All
          </Button>
          <Button variant="outline" size="sm" onClick={selectNone}>
            <X className="h-4 w-4 mr-1" />
            Deselect All
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
        <Badge variant="default" className="bg-green-100 text-green-800">
          <CheckCircle className="h-3 w-3 mr-1" />
          {confirmedCount} → Library
        </Badge>
        <Badge variant="outline">
          <Inbox className="h-3 w-3 mr-1" />
          {inboxCount} → Inbox
        </Badge>
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {validRows.map((row) => (
          <ImportReviewRow
            key={row.rowNumber}
            row={row}
            isConfirmed={confirmedRowNumbers.has(row.rowNumber)}
            onToggleConfirm={() => toggleRow(row.rowNumber)}
          />
        ))}
      </div>

      <div className="flex items-center justify-between pt-4 border-t">
        <div className="text-sm text-gray-500">
          {confirmedCount} confirmed, {inboxCount} to inbox
        </div>
        <Button onClick={onConfirm} disabled={isImporting}>
          {isImporting ? 'Importing...' : `Confirm & Import ${validRows.length} Places`}
        </Button>
      </div>
    </div>
  )
}
