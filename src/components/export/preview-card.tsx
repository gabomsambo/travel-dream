'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  type ColumnDef
} from '@tanstack/react-table'
import { useDebounce } from '@/hooks/use-debounce'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui-v2/card'
import { Badge } from '@/components/ui-v2/badge'
import { Skeleton } from '@/components/ui-v2/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui-v2/table'
import { FIELD_DEFINITIONS, transformValue } from '@/lib/export-field-metadata'
import type { ExportScope, FieldPreset, PreviewResponse } from '@/types/export'
import type { Place } from '@/types/database'

interface PreviewCardProps {
  scope: ExportScope
  preset: FieldPreset
  customFields?: string[]
}

export function PreviewCard({ scope, preset, customFields }: PreviewCardProps) {
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const debouncedScope = useDebounce(scope, 500)
  const debouncedPreset = useDebounce(preset, 500)
  const debouncedCustomFields = useDebounce(customFields, 500)

  useEffect(() => {
    const fetchPreview = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams({
          preset: debouncedPreset,
          scope: JSON.stringify(debouncedScope)
        })

        if (debouncedCustomFields && debouncedCustomFields.length > 0) {
          params.append('customFields', JSON.stringify(debouncedCustomFields))
        }

        const response = await fetch(`/api/export/preview?${params.toString()}`)

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({
            error: 'Failed to fetch preview'
          }))
          throw new Error(errorData.error || 'Failed to fetch preview')
        }

        const data: PreviewResponse = await response.json()

        if (!data.success) {
          throw new Error(data.error || 'Preview generation failed')
        }

        setPreviewData(data)
      } catch (err) {
        console.error('Preview fetch error:', err)
        setError(err instanceof Error ? err.message : 'Failed to load preview')
        setPreviewData(null)
      } finally {
        setIsLoading(false)
      }
    }

    fetchPreview()
  }, [debouncedScope, debouncedPreset, debouncedCustomFields])

  const columns = useMemo(() => {
    if (!previewData || previewData.preview.length === 0) return []

    const fieldIds = customFields && customFields.length > 0
      ? customFields
      : preset === 'custom'
      ? []
      : Object.keys(FIELD_DEFINITIONS).filter(
          fieldId => FIELD_DEFINITIONS[fieldId].includeInPreset.includes(preset)
        )

    const cols = fieldIds.map(fieldId => {
      const fieldDef = FIELD_DEFINITIONS[fieldId]
      if (!fieldDef) return null

      return {
        id: fieldId,
        accessorKey: fieldDef.dbField,
        header: fieldDef.csvHeader,
        cell: (info: any) => {
          const place = info.row.original as Place
          const value = transformValue(fieldDef, place)

          return (
            <div className="truncate max-w-[200px]" title={value}>
              {value || '-'}
            </div>
          )
        }
      }
    })

    return cols.filter(col => col !== null) as ColumnDef<Place>[]
  }, [previewData, preset, customFields])

  const table = useReactTable({
    data: previewData?.preview || [],
    columns,
    getCoreRowModel: getCoreRowModel()
  })

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 items-center">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-6 w-28" />
          </div>
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-destructive text-sm">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <span>{error}</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!previewData || previewData.count === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground text-sm text-center py-8">
            No places found matching your criteria
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <Badge variant="secondary">
            {previewData.count} {previewData.count === 1 ? 'place' : 'places'}
          </Badge>

          {Object.entries(previewData.stats.byKind).map(([kind, count]) => (
            <Badge key={kind} variant="outline">
              {kind}: {count}
            </Badge>
          ))}

          <Badge variant="outline">
            Est. {formatBytes(previewData.estimatedSize)}
          </Badge>
        </div>

        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map(headerGroup => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length > 0 ? (
                table.getRowModel().rows.map(row => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map(cell => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No preview available
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {previewData.count > 5 && (
          <div className="text-muted-foreground text-xs text-center">
            Showing first 5 of {previewData.count} places
          </div>
        )}
      </CardContent>
    </Card>
  )
}
