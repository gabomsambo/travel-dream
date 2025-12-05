"use client"

import { useMemo } from 'react'
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import { Badge } from "@/components/adapters/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import type { ParsedRow } from '@/types/import'

interface ImportPreviewProps {
  validRows: ParsedRow[]
  invalidRows: ParsedRow[]
  headers: string[]
}

export function ImportPreview({
  validRows,
  invalidRows,
  headers
}: ImportPreviewProps) {
  const visibleValidRows = validRows.slice(0, 100)
  const visibleInvalidRows = invalidRows.slice(0, 100)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Preview</h3>
          <p className="text-sm text-gray-500">
            Review the parsed data before importing
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="default" className="bg-green-100 text-green-800">
            <CheckCircle className="h-3 w-3 mr-1" />
            {validRows.length} valid
          </Badge>
          {invalidRows.length > 0 && (
            <Badge variant="destructive">
              <XCircle className="h-3 w-3 mr-1" />
              {invalidRows.length} errors
            </Badge>
          )}
        </div>
      </div>

      <Tabs defaultValue="valid">
        <TabsList>
          <TabsTrigger value="valid">
            Valid Rows ({validRows.length})
          </TabsTrigger>
          {invalidRows.length > 0 && (
            <TabsTrigger value="invalid">
              Error Rows ({invalidRows.length})
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="valid" className="mt-4">
          {visibleValidRows.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No valid rows to import
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-[300px]">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Row
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Name
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Type
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        City
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Country
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {visibleValidRows.map((row) => (
                      <tr key={row.rowNumber} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-500">{row.rowNumber}</td>
                        <td className="px-3 py-2 font-medium truncate max-w-[200px]">
                          {row.mappedData.name || '-'}
                        </td>
                        <td className="px-3 py-2">{row.mappedData.kind || '-'}</td>
                        <td className="px-3 py-2">{row.mappedData.city || '-'}</td>
                        <td className="px-3 py-2">{row.mappedData.country || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {validRows.length > 100 && (
                <div className="px-3 py-2 bg-gray-50 text-sm text-gray-500 text-center">
                  Showing first 100 of {validRows.length} rows
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {invalidRows.length > 0 && (
          <TabsContent value="invalid" className="mt-4">
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-[300px]">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Row
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Data
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Errors
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {visibleInvalidRows.map((row) => (
                      <tr key={row.rowNumber} className="hover:bg-red-50">
                        <td className="px-3 py-2 text-gray-500">{row.rowNumber}</td>
                        <td className="px-3 py-2 max-w-[300px]">
                          <div className="truncate text-xs text-gray-600">
                            {row.rawValues.slice(0, 3).join(', ')}...
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="space-y-1">
                            {row.errors.map((error, idx) => (
                              <div key={idx} className="flex items-center gap-1 text-red-600 text-xs">
                                <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                                <span>{error.field}: {error.message}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {invalidRows.length > 100 && (
                <div className="px-3 py-2 bg-gray-50 text-sm text-gray-500 text-center">
                  Showing first 100 of {invalidRows.length} error rows
                </div>
              )}
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
