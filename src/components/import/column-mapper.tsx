"use client"

import { useState, useMemo } from 'react'
import { ArrowRight, Check, AlertTriangle, X, ChevronDown } from 'lucide-react'
import { Badge } from "@/components/adapters/badge"
import { Button } from "@/components/adapters/button"
import { Card } from "@/components/adapters/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getTargetFieldOptions } from '@/lib/import-field-metadata'
import type { ColumnMapping, ImportTemplate } from '@/types/import'

interface ColumnMapperProps {
  headers: string[]
  sampleRows: string[][]
  mappings: ColumnMapping[]
  onMappingsChange: (mappings: ColumnMapping[]) => void
  template: ImportTemplate
  onTemplateChange: (template: ImportTemplate) => void
}

const TEMPLATES: Array<{ value: ImportTemplate; label: string; description: string }> = [
  { value: 'auto', label: 'Auto-detect', description: 'Automatically match columns' },
  { value: 'travel-dreams', label: 'Travel Dreams Export', description: 'Re-import your own exports' },
  { value: 'notion', label: 'Notion', description: 'Notion database export' },
  { value: 'airtable', label: 'Airtable', description: 'Airtable CSV export' },
  { value: 'google-sheets', label: 'Google Sheets', description: 'Google Sheets download' },
]

export function ColumnMapper({
  headers,
  sampleRows,
  mappings,
  onMappingsChange,
  template,
  onTemplateChange
}: ColumnMapperProps) {
  const targetFieldOptions = useMemo(() => getTargetFieldOptions(), [])

  const groupedOptions = useMemo(() => {
    const groups: Record<string, Array<{ value: string; label: string }>> = {}
    for (const option of targetFieldOptions) {
      if (!groups[option.category]) {
        groups[option.category] = []
      }
      groups[option.category].push({ value: option.value, label: option.label })
    }
    return groups
  }, [targetFieldOptions])

  const handleMappingChange = (sourceIndex: number, targetField: string | null) => {
    const newMappings = mappings.map((m, idx) =>
      idx === sourceIndex
        ? { ...m, targetField, confidence: targetField ? 1.0 : 0 }
        : m
    )
    onMappingsChange(newMappings)
  }

  const getMappingStatus = (mapping: ColumnMapping) => {
    if (!mapping.targetField) return 'unmapped'
    if (mapping.confidence >= 0.8) return 'high'
    if (mapping.confidence >= 0.5) return 'medium'
    return 'low'
  }

  const getSampleValue = (rowIndex: number, colIndex: number): string => {
    return sampleRows[rowIndex]?.[colIndex] || ''
  }

  const mappedCount = mappings.filter(m => m.targetField).length
  const hasNameMapping = mappings.some(m => m.targetField === 'name')

  return (
    <div className="space-y-4 w-full max-w-full">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-medium">Map Columns</h3>
          <p className="text-sm text-gray-500">
            Match your file columns to place fields. {mappedCount} of {headers.length} mapped.
          </p>
        </div>
        <Select value={template} onValueChange={(v) => onTemplateChange(v as ImportTemplate)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select template" />
          </SelectTrigger>
          <SelectContent>
            {TEMPLATES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                <div className="flex flex-col">
                  <span>{t.label}</span>
                  <span className="text-xs text-gray-500">{t.description}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!hasNameMapping && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm">Name column must be mapped to import</span>
        </div>
      )}

      <div className="space-y-2 max-h-[400px] overflow-y-auto w-full">
        {mappings.map((mapping, idx) => {
          const status = getMappingStatus(mapping)
          const samples = [0, 1, 2].map(i => getSampleValue(i, idx)).filter(Boolean)

          return (
            <Card key={idx} className="p-3">
              <div className="flex items-center gap-4">
                <div className="flex-1 min-w-0 w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{mapping.sourceColumn}</span>
                    {status === 'high' && (
                      <Badge variant="default" className="text-xs bg-green-100 text-green-800">
                        <Check className="h-3 w-3 mr-1" />
                        Auto
                      </Badge>
                    )}
                    {status === 'medium' && (
                      <Badge variant="outline" className="text-xs text-amber-600">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Review
                      </Badge>
                    )}
                  </div>
                  {samples.length > 0 && (
                    <p className="text-xs text-gray-500 mt-1 truncate">
                      e.g. {samples.slice(0, 2).map(s => s.length > 40 ? s.slice(0, 40) + '...' : s).join(', ')}
                    </p>
                  )}
                </div>

                <ArrowRight className="h-4 w-4 text-gray-400 flex-shrink-0" />

                <div className="w-[200px] flex-shrink-0">
                  <Select
                    value={mapping.targetField || 'skip'}
                    onValueChange={(v) => handleMappingChange(idx, v === 'skip' ? null : v)}
                  >
                    <SelectTrigger className={!mapping.targetField ? 'text-gray-400' : ''}>
                      <SelectValue placeholder="Skip column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="skip">
                        <span className="flex items-center gap-2 text-gray-500">
                          <X className="h-3 w-3" />
                          Skip column
                        </span>
                      </SelectItem>
                      {Object.entries(groupedOptions).map(([category, options]) => (
                        <div key={category}>
                          <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50">
                            {category}
                          </div>
                          {options.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <div className="flex items-center justify-between pt-4 border-t">
        <div className="text-sm text-gray-500">
          {mappedCount} columns mapped
          {!hasNameMapping && (
            <span className="text-amber-600 ml-2">(Name required)</span>
          )}
        </div>
      </div>
    </div>
  )
}
