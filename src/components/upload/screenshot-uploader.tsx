"use client"

import { useState, useRef, useCallback } from 'react'
import { Upload, X, Image, AlertCircle, CheckCircle2 } from 'lucide-react'
import { upload } from '@vercel/blob/client'
import { Button } from "@/components/adapters/button"
import { Badge } from "@/components/adapters/badge"
import { Card } from "@/components/adapters/card"

interface UploadedFile {
  id: string
  file: File
  progress: number
  status: 'pending' | 'uploading' | 'completed' | 'failed'
  error?: string
  previewUrl?: string
  blobUrl?: string
  sourceId?: string
}

interface ScreenshotUploaderProps {
  sessionId: string
  onUploadComplete?: (results: any[]) => void
  onUploadError?: (error: string) => void
  maxFiles?: number
  maxFileSize?: number
  className?: string
}

const MAX_FILES_PER_BATCH = 20

export function ScreenshotUploader({
  sessionId,
  onUploadComplete,
  onUploadError,
  maxFiles = MAX_FILES_PER_BATCH,
  maxFileSize = 10 * 1024 * 1024,
  className
}: ScreenshotUploaderProps) {
  const [uploadedFiles, setUploadedFiles] = useState<Map<string, UploadedFile>>(new Map())
  const [isDragOver, setIsDragOver] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const completedUploadsRef = useRef<any[]>([])

  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

  const validateFile = useCallback((file: File): { isValid: boolean; error?: string } => {
    if (!allowedTypes.includes(file.type)) {
      return {
        isValid: false,
        error: `Unsupported file type: ${file.type}`
      }
    }

    if (file.size > maxFileSize) {
      return {
        isValid: false,
        error: `File size exceeds ${Math.round(maxFileSize / (1024 * 1024))}MB limit`
      }
    }

    return { isValid: true }
  }, [maxFileSize])

  const uploadFileToBlob = useCallback(async (file: File, fileId: string): Promise<{ blobUrl: string; sourceId: string }> => {
    // Generate a unique filename with timestamp
    const timestamp = Date.now()
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const filename = `screenshots/${sessionId}/${timestamp}-${fileId}.${ext}`

    // Upload directly to Vercel Blob (bypasses serverless function limits)
    const blob = await upload(filename, file, {
      access: 'public',
      handleUploadUrl: '/api/blob/upload',
      onUploadProgress: (progress) => {
        const percent = Math.round((progress.loaded / progress.total) * 100)
        setUploadedFiles(prev => {
          const newMap = new Map(prev)
          const existing = newMap.get(fileId)
          if (existing) {
            newMap.set(fileId, { ...existing, progress: percent })
          }
          return newMap
        })
      },
    })

    // Now create source record with the blob URL
    const response = await fetch('/api/upload/blob-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        blobUrl: blob.url,
        originalName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to create source record')
    }

    const result = await response.json()
    return { blobUrl: blob.url, sourceId: result.sourceId }
  }, [sessionId])

  const processFiles = useCallback(async (files: File[]) => {
    const validFiles: File[] = []
    const errors: string[] = []

    files.forEach(file => {
      const validation = validateFile(file)
      if (validation.isValid) {
        validFiles.push(file)
      } else {
        errors.push(`${file.name}: ${validation.error}`)
      }
    })

    if (errors.length > 0) {
      onUploadError?.(errors.join('; '))
    }

    if (validFiles.length + uploadedFiles.size > maxFiles) {
      onUploadError?.(`Cannot upload more than ${maxFiles} files`)
      return
    }

    if (validFiles.length === 0) return

    setIsUploading(true)
    completedUploadsRef.current = []

    // Add files to state with pending status
    const newFiles = new Map(uploadedFiles)
    validFiles.forEach(file => {
      const fileId = `${file.name}-${Date.now()}`
      const previewUrl = URL.createObjectURL(file)
      newFiles.set(fileId, {
        id: fileId,
        file,
        progress: 0,
        status: 'uploading',
        previewUrl
      })
    })
    setUploadedFiles(newFiles)

    // Upload files concurrently (max 3 at a time)
    const CONCURRENT_LIMIT = 3
    const fileEntries = Array.from(newFiles.entries()).filter(
      ([_, f]) => f.status === 'uploading'
    )

    for (let i = 0; i < fileEntries.length; i += CONCURRENT_LIMIT) {
      const batch = fileEntries.slice(i, i + CONCURRENT_LIMIT)

      await Promise.allSettled(
        batch.map(async ([fileId, fileData]) => {
          try {
            const result = await uploadFileToBlob(fileData.file, fileId)

            setUploadedFiles(prev => {
              const newMap = new Map(prev)
              const existing = newMap.get(fileId)
              if (existing) {
                newMap.set(fileId, {
                  ...existing,
                  status: 'completed',
                  progress: 100,
                  blobUrl: result.blobUrl,
                  sourceId: result.sourceId
                })
              }
              return newMap
            })

            completedUploadsRef.current.push({
              id: fileId,
              sourceId: result.sourceId,
              blobUrl: result.blobUrl,
              file: { name: fileData.file.name }
            })
          } catch (error) {
            console.error(`[ScreenshotUploader] Upload failed for ${fileId}:`, error)

            setUploadedFiles(prev => {
              const newMap = new Map(prev)
              const existing = newMap.get(fileId)
              if (existing) {
                newMap.set(fileId, {
                  ...existing,
                  status: 'failed',
                  error: error instanceof Error ? error.message : 'Upload failed'
                })
              }
              return newMap
            })
          }
        })
      )
    }

    setIsUploading(false)

    // Trigger completion callback with all successful uploads
    if (completedUploadsRef.current.length > 0) {
      console.log(`[ScreenshotUploader] All uploads completed, triggering OCR for ${completedUploadsRef.current.length} files`)
      onUploadComplete?.(completedUploadsRef.current)
    }
  }, [uploadedFiles, maxFiles, onUploadComplete, onUploadError, validateFile, uploadFileToBlob])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      processFiles(files)
    }
  }, [processFiles])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      processFiles(files)
    }
    // Reset input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [processFiles])

  const removeFile = (fileId: string) => {
    setUploadedFiles(prev => {
      const newMap = new Map(prev)
      const file = newMap.get(fileId)
      if (file?.previewUrl) {
        URL.revokeObjectURL(file.previewUrl)
      }
      newMap.delete(fileId)
      return newMap
    })
  }

  const clearAllFiles = () => {
    uploadedFiles.forEach(file => {
      if (file.previewUrl) {
        URL.revokeObjectURL(file.previewUrl)
      }
    })
    setUploadedFiles(new Map())
  }

  const filesArray = Array.from(uploadedFiles.values())
  const completedFiles = filesArray.filter(f => f.status === 'completed').length
  const failedFiles = filesArray.filter(f => f.status === 'failed').length
  const uploadingFiles = filesArray.filter(f => f.status === 'uploading').length

  return (
    <div className={className}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`border-2 border-dashed rounded-lg p-8 transition-colors duration-200 cursor-pointer ${
          isDragOver
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="text-center">
          <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <div className="text-lg font-medium text-gray-900 mb-2">
            Drop screenshots here or click to browse
          </div>
          <div className="text-sm text-gray-500 mb-4">
            Supports PNG, JPEG, WebP, HEIC (max {Math.round(maxFileSize / (1024 * 1024))}MB each, up to {maxFiles} photos per batch)
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation()
              fileInputRef.current?.click()
            }}
            disabled={isUploading}
          >
            <Image className="mr-2 h-4 w-4" />
            Select Screenshots
          </Button>
        </div>
      </div>

      {/* Upload Progress Summary */}
      {filesArray.length > 0 && (
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {filesArray.length} file{filesArray.length !== 1 ? 's' : ''}
            </Badge>
            {completedFiles > 0 && (
              <Badge variant="default">
                {completedFiles} completed
              </Badge>
            )}
            {uploadingFiles > 0 && (
              <Badge variant="secondary">
                {uploadingFiles} uploading
              </Badge>
            )}
            {failedFiles > 0 && (
              <Badge variant="destructive">
                {failedFiles} failed
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFiles}
            className="text-red-600 hover:text-red-700"
            disabled={isUploading}
          >
            Clear All
          </Button>
        </div>
      )}

      {/* File List */}
      {filesArray.length > 0 && (
        <div className="mt-4 space-y-2 max-h-64 overflow-y-auto">
          {filesArray.map((file) => (
            <Card key={file.id} className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {/* File Preview */}
                  {file.previewUrl && (
                    <div className="w-10 h-10 rounded overflow-hidden bg-gray-100 flex-shrink-0">
                      <img
                        src={file.previewUrl}
                        alt={file.file.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {file.file.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {(file.file.size / (1024 * 1024)).toFixed(1)}MB
                    </div>
                  </div>

                  {/* Status */}
                  <div className="flex items-center gap-2">
                    {file.status === 'uploading' && (
                      <div className="text-xs text-blue-600">
                        {file.progress}%
                      </div>
                    )}
                    {file.status === 'completed' && (
                      <Badge variant="default" className="text-xs">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Done
                      </Badge>
                    )}
                    {file.status === 'failed' && (
                      <Badge variant="destructive" className="text-xs">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Failed
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Remove Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeFile(file.id)}
                  className="h-8 w-8 text-gray-400 hover:text-red-600"
                  disabled={file.status === 'uploading'}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Progress Bar */}
              {file.status === 'uploading' && (
                <div className="mt-2">
                  <div className="w-full bg-gray-200 rounded-full h-1">
                    <div
                      className="bg-blue-600 h-1 rounded-full transition-all duration-300"
                      style={{ width: `${file.progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Error Message */}
              {file.error && (
                <div className="mt-2 text-xs text-red-600">
                  {file.error}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
