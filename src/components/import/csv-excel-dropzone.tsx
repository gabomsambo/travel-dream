"use client"

import { useState, useCallback } from 'react'
import { Upload, FileSpreadsheet, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from "@/components/adapters/button"
import { Badge } from "@/components/adapters/badge"
import type { ImportPreviewResponse } from '@/types/import'

interface CSVExcelDropzoneProps {
  onParsed: (result: ImportPreviewResponse) => void
  onError?: (error: string) => void
  className?: string
}

export function CSVExcelDropzone({
  onParsed,
  onError,
  className
}: CSVExcelDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const allowedExtensions = ['.csv', '.xlsx', '.xls']
  const maxFileSize = 10 * 1024 * 1024

  const validateFile = (file: File): { isValid: boolean; error?: string } => {
    const extension = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!allowedExtensions.includes(extension)) {
      return {
        isValid: false,
        error: `Unsupported file type. Please upload CSV or Excel files.`
      }
    }

    if (file.size > maxFileSize) {
      return {
        isValid: false,
        error: `File too large. Maximum size is 10MB.`
      }
    }

    return { isValid: true }
  }

  const handleFile = useCallback(async (file: File) => {
    const validation = validateFile(file)
    if (!validation.isValid) {
      onError?.(validation.error!)
      return
    }

    setSelectedFile(file)
    setIsLoading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/import/parse', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (data.status === 'error') {
        throw new Error(data.message)
      }

      onParsed({
        headers: data.headers,
        sampleRows: data.sampleRows,
        totalRows: data.totalRows,
        suggestedMappings: data.suggestedMappings,
        detectedTemplate: data.detectedTemplate,
        format: data.format,
      })
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Failed to parse file')
      setSelectedFile(null)
    } finally {
      setIsLoading(false)
    }
  }, [onParsed, onError])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      handleFile(files[0])
    }
  }, [handleFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFile(files[0])
    }
  }, [handleFile])

  return (
    <div className={className}>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          border-2 border-dashed rounded-lg p-8 transition-colors duration-200
          ${isDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          ${isLoading ? 'opacity-50 pointer-events-none' : ''}
        `}
      >
        <div className="text-center">
          {isLoading ? (
            <>
              <Loader2 className="mx-auto h-12 w-12 text-gray-400 mb-4 animate-spin" />
              <div className="text-lg font-medium text-gray-900 mb-2">
                Parsing file...
              </div>
              {selectedFile && (
                <div className="text-sm text-gray-500">
                  {selectedFile.name}
                </div>
              )}
            </>
          ) : (
            <>
              <FileSpreadsheet className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <div className="text-lg font-medium text-gray-900 mb-2">
                Drop your CSV or Excel file here
              </div>
              <div className="text-sm text-gray-500 mb-4">
                Supports CSV, XLSX, XLS (max 10MB)
              </div>
              <label>
                <input
                  type="file"
                  className="hidden"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileSelect}
                />
                <Button asChild variant="outline">
                  <span>
                    <Upload className="mr-2 h-4 w-4" />
                    Select File
                  </span>
                </Button>
              </label>
            </>
          )}
        </div>
      </div>

      {selectedFile && !isLoading && (
        <div className="mt-4 flex items-center gap-2">
          <Badge variant="outline">
            <FileSpreadsheet className="h-3 w-3 mr-1" />
            {selectedFile.name}
          </Badge>
          <span className="text-sm text-gray-500">
            ({(selectedFile.size / 1024).toFixed(1)} KB)
          </span>
        </div>
      )}
    </div>
  )
}
