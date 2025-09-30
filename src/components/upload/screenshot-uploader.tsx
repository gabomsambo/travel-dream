"use client"

import { useState, useRef, useCallback, useEffect } from 'react'
import { Upload, X, Image, AlertCircle } from 'lucide-react'
import Uploady, { useItemProgressListener, useBatchStartListener, useItemFinishListener } from '@rpldy/uploady'
import UploadDropZone from '@rpldy/upload-drop-zone'
import UploadButton from '@rpldy/upload-button'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

interface UploadedFile {
  id: string
  file: File
  progress: number
  status: 'pending' | 'uploading' | 'completed' | 'failed'
  error?: string
  previewUrl?: string
}

interface ScreenshotUploaderProps {
  sessionId: string
  onUploadComplete?: (results: any[]) => void
  onUploadError?: (error: string) => void
  maxFiles?: number
  maxFileSize?: number
  className?: string
}

// Inner component that contains the uploader logic and hooks
function ScreenshotUploaderInner({
  sessionId,
  onUploadComplete,
  onUploadError,
  maxFiles = 100,
  maxFileSize = 10 * 1024 * 1024, // 10MB
  className
}: ScreenshotUploaderProps) {
  const [uploadedFiles, setUploadedFiles] = useState<Map<string, UploadedFile>>(new Map())
  const [isDragOver, setIsDragOver] = useState(false)

  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

  const validateFile = (file: File): { isValid: boolean; error?: string } => {
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
  }

  const handleFileSelect = useCallback((files: File[]) => {
    const validFiles: File[] = []
    const errors: string[] = []

    files.forEach(file => {
      const validation = validateFile(file)
      if (validation.isValid) {
        validFiles.push(file)

        // Create preview URL for images
        const previewUrl = URL.createObjectURL(file)

        // Add to uploaded files map
        setUploadedFiles(prev => new Map(prev.set(file.name, {
          id: file.name,
          file,
          progress: 0,
          status: 'pending',
          previewUrl
        })))
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

    return validFiles
  }, [uploadedFiles.size, maxFiles, maxFileSize, onUploadError])

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

  // Component that uses Uploady hooks (must be inside Uploady provider)
  function UploadyHooks() {
    const completedItemsRef = useRef<any[]>([])

    // React-Uploady event listeners
    useBatchStartListener((batch) => {
      console.log(`Starting upload batch with ${batch.items.length} files`)
      completedItemsRef.current = [] // Reset completed items for new batch

      // Add files to our state when batch starts
      batch.items.forEach((item) => {
        if (item.file) {
          const previewUrl = URL.createObjectURL(item.file)
          setUploadedFiles(prev => new Map(prev.set(item.file.name, {
            id: item.file.name,
            file: item.file,
            progress: 0,
            status: 'uploading',
            previewUrl
          })))
        }
      })
    })

    useItemProgressListener((item) => {
      setUploadedFiles(prev => {
        const newMap = new Map(prev)
        const existing = newMap.get(item.file?.name || item.id)
        if (existing) {
          newMap.set(item.file?.name || item.id, {
            ...existing,
            progress: item.completed,
            status: item.completed === 100 ? 'completed' : 'uploading'
          })
        }
        return newMap
      })
    })

    useItemFinishListener((item) => {
      setUploadedFiles(prev => {
        const newMap = new Map(prev)
        const existing = newMap.get(item.file?.name || item.id)
        if (existing) {
          newMap.set(item.file?.name || item.id, {
            ...existing,
            status: item.state === 'finished' ? 'completed' : 'failed',
            error: item.state === 'error' ? 'Upload failed' : undefined
          })
        }
        return newMap
      })

      // Collect completed items
      completedItemsRef.current.push(item)

      // Trigger completion callback with all completed items so far
      if (item.state === 'finished') {
        onUploadComplete?.(completedItemsRef.current)
      }
    })

    return null // This component only handles hooks
  }

  const filesArray = Array.from(uploadedFiles.values())
  const completedFiles = filesArray.filter(f => f.status === 'completed').length
  const failedFiles = filesArray.filter(f => f.status === 'failed').length
  const uploadingFiles = filesArray.filter(f => f.status === 'uploading').length

  return (
    <div className={className}>
      <UploadyHooks />

      <UploadDropZone
        onDragOverClassName="border-blue-500 bg-blue-50"
        className="border-2 border-dashed rounded-lg p-8 transition-colors duration-200 border-gray-300 hover:border-gray-400"
      >
        <div className="text-center">
          <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <div className="text-lg font-medium text-gray-900 mb-2">
            Drop screenshots here or click to browse
          </div>
          <div className="text-sm text-gray-500 mb-4">
            Supports PNG, JPEG, WebP, HEIC (max {Math.round(maxFileSize / (1024 * 1024))}MB each)
          </div>
          <UploadButton className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2">
            <Image className="mr-2 h-4 w-4" />
            Select Screenshots
          </UploadButton>
        </div>
      </UploadDropZone>

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

// Main exported component that wraps the inner component with Uploady provider
export function ScreenshotUploader(props: ScreenshotUploaderProps) {
  return (
    <Uploady
      destination={{
        url: "/api/upload",
        method: "POST",
        params: { sessionId: props.sessionId },
        filesParamName: "files"
      }}
      multiple={true}
      autoUpload={true}
      accept="image/*"
    >
      <ScreenshotUploaderInner {...props} />
    </Uploady>
  )
}