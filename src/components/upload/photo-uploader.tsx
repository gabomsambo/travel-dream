"use client"

import { useState, useRef, useCallback } from 'react'
import { Upload, X, CheckCircle2, AlertCircle } from 'lucide-react'
import { upload } from '@vercel/blob/client'
import { Button } from "@/components/adapters/button"
import { Badge } from "@/components/adapters/badge"
import { toast } from 'sonner'

interface UploadingFile {
  id: string
  file: File
  progress: number
  status: 'uploading' | 'completed' | 'failed'
  error?: string
  previewUrl?: string
}

interface PhotoUploaderProps {
  placeId: string
  onUploadComplete?: () => void
  onUploadError?: (error: string) => void
  maxFiles?: number
  maxFileSize?: number
  compact?: boolean
  className?: string
}

export function PhotoUploader({
  placeId,
  onUploadComplete,
  onUploadError,
  maxFiles = 10,
  maxFileSize = 10 * 1024 * 1024,
  compact = false,
  className
}: PhotoUploaderProps) {
  const [uploadingFiles, setUploadingFiles] = useState<Map<string, UploadingFile>>(new Map())
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

  const validateFile = (file: File): { isValid: boolean; error?: string } => {
    if (!allowedTypes.includes(file.type)) {
      return { isValid: false, error: `Unsupported file type: ${file.type}` }
    }
    if (file.size > maxFileSize) {
      return { isValid: false, error: `File size exceeds ${Math.round(maxFileSize / (1024 * 1024))}MB limit` }
    }
    return { isValid: true }
  }

  const uploadFileToBlob = async (file: File, fileId: string): Promise<void> => {
    const timestamp = Date.now()
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const filename = `places/${placeId}/${timestamp}-${fileId}.${ext}`

    // Upload directly to Vercel Blob
    const blob = await upload(filename, file, {
      access: 'public',
      handleUploadUrl: '/api/blob/upload',
      onUploadProgress: (progress) => {
        const percent = Math.round((progress.loaded / progress.total) * 100)
        setUploadingFiles(prev => {
          const newMap = new Map(prev)
          const existing = newMap.get(fileId)
          if (existing) {
            newMap.set(fileId, { ...existing, progress: percent })
          }
          return newMap
        })
      },
    })

    // Get image dimensions (optional)
    let width: number | undefined
    let height: number | undefined
    try {
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          width = img.naturalWidth
          height = img.naturalHeight
          resolve()
        }
        img.onerror = reject
        img.src = URL.createObjectURL(file)
      })
    } catch {
      // Dimensions are optional
    }

    // Create attachment record with the blob URL
    const response = await fetch(`/api/places/${placeId}/attachments/blob-complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blobUrl: blob.url,
        originalName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        width,
        height,
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to create attachment record')
    }
  }

  const processFiles = async (files: File[]) => {
    const validFiles: File[] = []
    const errors: string[] = []

    for (const file of files) {
      const validation = validateFile(file)
      if (validation.isValid) {
        validFiles.push(file)
      } else {
        errors.push(`${file.name}: ${validation.error}`)
      }
    }

    if (errors.length > 0) {
      onUploadError?.(errors.join('; '))
      toast.error('Some files could not be uploaded', { description: errors[0] })
    }

    if (validFiles.length > maxFiles) {
      toast.error(`Cannot upload more than ${maxFiles} files at once`)
      return
    }

    if (validFiles.length === 0) return

    setIsUploading(true)

    // Add files to state
    const newFiles = new Map<string, UploadingFile>()
    validFiles.forEach(file => {
      const fileId = `${file.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const previewUrl = URL.createObjectURL(file)
      newFiles.set(fileId, {
        id: fileId,
        file,
        progress: 0,
        status: 'uploading',
        previewUrl
      })
    })
    setUploadingFiles(newFiles)

    // Upload files concurrently (max 3 at a time)
    const CONCURRENT_LIMIT = 3
    const fileEntries = Array.from(newFiles.entries())
    let successCount = 0

    for (let i = 0; i < fileEntries.length; i += CONCURRENT_LIMIT) {
      const batch = fileEntries.slice(i, i + CONCURRENT_LIMIT)

      await Promise.allSettled(
        batch.map(async ([fileId, fileData]) => {
          try {
            await uploadFileToBlob(fileData.file, fileId)

            setUploadingFiles(prev => {
              const newMap = new Map(prev)
              const existing = newMap.get(fileId)
              if (existing) {
                newMap.set(fileId, { ...existing, status: 'completed', progress: 100 })
              }
              return newMap
            })
            successCount++
          } catch (error) {
            console.error(`[PhotoUploader] Upload failed for ${fileId}:`, error)

            setUploadingFiles(prev => {
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

    if (successCount > 0) {
      toast.success(`${successCount} photo${successCount > 1 ? 's' : ''} uploaded successfully`)
      // Clean up preview URLs
      newFiles.forEach(f => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl)
      })
      setUploadingFiles(new Map())
      onUploadComplete?.()
    }
  }

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      processFiles(files)
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [placeId])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      processFiles(files)
    }
  }, [placeId])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const filesArray = Array.from(uploadingFiles.values())
  const uploadingCount = filesArray.filter(f => f.status === 'uploading').length

  if (compact) {
    return (
      <div className={className}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          id={`photo-upload-${placeId}`}
          disabled={isUploading}
        />
        <label htmlFor={`photo-upload-${placeId}`}>
          <Button variant="outline" disabled={isUploading} asChild>
            <span>
              <Upload className="h-4 w-4 mr-2" />
              {isUploading ? `Uploading ${uploadingCount}...` : 'Upload Photos'}
            </span>
          </Button>
        </label>
      </div>
    )
  }

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
        className="border-2 border-dashed rounded-lg p-6 cursor-pointer hover:border-gray-400 transition-colors"
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="text-center">
          <Upload className="mx-auto h-10 w-10 text-gray-400 mb-3" />
          <p className="text-sm font-medium">
            <span className="text-blue-600 hover:text-blue-700">Click to upload photos</span>
            <span className="text-muted-foreground"> or drag and drop</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            PNG, JPG, WebP up to 10MB each
          </p>
        </div>
      </div>

      {/* Upload Progress */}
      {filesArray.length > 0 && (
        <div className="mt-4 space-y-2">
          {filesArray.map((file) => (
            <div key={file.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
              {file.previewUrl && (
                <div className="w-10 h-10 rounded overflow-hidden bg-gray-100 flex-shrink-0">
                  <img src={file.previewUrl} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{file.file.name}</div>
                {file.status === 'uploading' && (
                  <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                    <div
                      className="bg-blue-600 h-1 rounded-full transition-all"
                      style={{ width: `${file.progress}%` }}
                    />
                  </div>
                )}
              </div>
              <div className="flex-shrink-0">
                {file.status === 'uploading' && (
                  <span className="text-xs text-blue-600">{file.progress}%</span>
                )}
                {file.status === 'completed' && (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                )}
                {file.status === 'failed' && (
                  <AlertCircle className="h-5 w-5 text-red-600" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
