"use client"

import { useState, useRef, useCallback, useEffect } from 'react'
import { upload } from '@vercel/blob/client'
import {
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  CloudUpload,
  Inbox,
  Ban,
} from 'lucide-react'
import { Button } from "@/components/adapters/button"
import { Badge } from "@/components/adapters/badge"
import { Card } from "@/components/adapters/card"
import { useMassUploadStatus } from '@/hooks/use-mass-upload-status'
import { toast } from 'sonner'
import Link from 'next/link'

interface MassUploadFile {
  id: string
  file: File
  progress: number
  status: 'pending' | 'uploading' | 'completed' | 'failed'
  error?: string
  previewUrl?: string
  blobUrl?: string
  sourceId?: string
}

type MassUploadStep = 'upload' | 'review' | 'processing'

const MAX_FILES = 500
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const CONCURRENT_LIMIT = 3
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

export function MassUploadPage() {
  const [step, setStep] = useState<MassUploadStep>('upload')
  const [files, setFiles] = useState<Map<string, MassUploadFile>>(new Map())
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const completedUploadsRef = useRef<string[]>([])

  const status = useMassUploadStatus()
  const [isCancelling, setIsCancelling] = useState(false)
  const [isTriggering, setIsTriggering] = useState(false)
  const [triggerResult, setTriggerResult] = useState<string | null>(null)

  // On mount: resume active session if one exists, otherwise create new
  useEffect(() => {
    const init = async () => {
      try {
        // Check for an existing active processing session
        const sessionsRes = await fetch('/api/upload/sessions?limit=5')
        if (sessionsRes.ok) {
          const sessionsData = await sessionsRes.json()
          if (sessionsData.status === 'success' && sessionsData.sessions) {
            const active = sessionsData.sessions.find((s: { status: string; startedAt?: string; meta?: { uploadedFiles?: string[] } }) => {
              const uploadedFiles = s.meta?.uploadedFiles || []
              if (s.status !== 'active' || uploadedFiles.length === 0) return false
              // Skip sessions older than 24h (likely abandoned, not in-progress)
              if (s.startedAt) {
                const ageMs = Date.now() - new Date(s.startedAt).getTime()
                if (ageMs > 24 * 60 * 60 * 1000) return false
              }
              return true
            })
            if (active) {
              setSessionId(active.id)
              setStep('processing')
              status.startPolling(active.id)
              return
            }
          }
        }
      } catch {
        // Fall through to create new session
      }

      // No active session — create a new one
      try {
        const res = await fetch('/api/upload/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileCount: 0 }),
        })
        const data = await res.json()
        if (data.status === 'success' && data.session?.id) {
          setSessionId(data.session.id)
        } else {
          toast.error('Failed to create upload session')
        }
      } catch {
        toast.error('Failed to create upload session')
      }
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const validateFile = useCallback((file: File): { isValid: boolean; error?: string } => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return { isValid: false, error: `Unsupported file type: ${file.type}` }
    }
    if (file.size > MAX_FILE_SIZE) {
      return { isValid: false, error: `File exceeds ${Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB limit` }
    }
    return { isValid: true }
  }, [])

  const uploadFileToBlob = useCallback(async (file: File, fileId: string): Promise<{ blobUrl: string; sourceId: string }> => {
    if (!sessionId) throw new Error('No session')

    const timestamp = Date.now()
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const filename = `screenshots/${sessionId}/${timestamp}-${fileId.slice(0, 8)}.${ext}`

    const blob = await upload(filename, file, {
      access: 'public',
      handleUploadUrl: '/api/blob/upload',
      onUploadProgress: (progress) => {
        const percent = Math.round((progress.loaded / progress.total) * 100)
        setFiles(prev => {
          const newMap = new Map(prev)
          const existing = newMap.get(fileId)
          if (existing) {
            newMap.set(fileId, { ...existing, progress: percent })
          }
          return newMap
        })
      },
    })

    const response = await fetch('/api/mass-upload/register', {
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
      throw new Error('Failed to register upload')
    }

    const result = await response.json()
    return { blobUrl: blob.url, sourceId: result.sourceId }
  }, [sessionId])

  const processFiles = useCallback(async (newFileList: File[]) => {
    if (!sessionId) {
      toast.error('Session not ready. Please wait a moment and try again.')
      return
    }

    const validFiles: File[] = []
    const errors: string[] = []

    newFileList.forEach(file => {
      const validation = validateFile(file)
      if (validation.isValid) {
        validFiles.push(file)
      } else {
        errors.push(`${file.name}: ${validation.error}`)
      }
    })

    if (errors.length > 0) {
      toast.error(`${errors.length} file(s) skipped`, { description: errors.slice(0, 3).join('; ') })
    }

    if (validFiles.length + files.size > MAX_FILES) {
      toast.error(`Cannot upload more than ${MAX_FILES} files`)
      return
    }

    if (validFiles.length === 0) return

    setIsUploading(true)

    // Add files to state
    const updatedFiles = new Map(files)
    const newEntries: Array<[string, MassUploadFile]> = []
    validFiles.forEach(file => {
      const fileId = crypto.randomUUID()
      const previewUrl = URL.createObjectURL(file)
      const entry: MassUploadFile = {
        id: fileId,
        file,
        progress: 0,
        status: 'uploading',
        previewUrl,
      }
      updatedFiles.set(fileId, entry)
      newEntries.push([fileId, entry])
    })
    setFiles(updatedFiles)

    // Upload in batches of CONCURRENT_LIMIT
    for (let i = 0; i < newEntries.length; i += CONCURRENT_LIMIT) {
      const batch = newEntries.slice(i, i + CONCURRENT_LIMIT)

      await Promise.allSettled(
        batch.map(async ([fileId, fileData]) => {
          try {
            const result = await uploadFileToBlob(fileData.file, fileId)

            setFiles(prev => {
              const newMap = new Map(prev)
              const existing = newMap.get(fileId)
              if (existing) {
                newMap.set(fileId, {
                  ...existing,
                  status: 'completed',
                  progress: 100,
                  blobUrl: result.blobUrl,
                  sourceId: result.sourceId,
                })
              }
              return newMap
            })

            completedUploadsRef.current.push(result.sourceId)
          } catch (error) {
            setFiles(prev => {
              const newMap = new Map(prev)
              const existing = newMap.get(fileId)
              if (existing) {
                newMap.set(fileId, {
                  ...existing,
                  status: 'failed',
                  error: error instanceof Error ? error.message : 'Upload failed',
                })
              }
              return newMap
            })
          }
        })
      )
    }

    setIsUploading(false)
  }, [sessionId, files, validateFile, uploadFileToBlob])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const droppedFiles = Array.from(e.dataTransfer.files)
    if (droppedFiles.length > 0) {
      processFiles(droppedFiles)
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
    const selectedFiles = Array.from(e.target.files || [])
    if (selectedFiles.length > 0) {
      processFiles(selectedFiles)
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [processFiles])

  const removeFile = useCallback((fileId: string) => {
    setFiles(prev => {
      const newMap = new Map(prev)
      const file = newMap.get(fileId)
      if (file?.previewUrl) {
        URL.revokeObjectURL(file.previewUrl)
      }
      newMap.delete(fileId)
      return newMap
    })
  }, [])

  const handleStartProcessing = useCallback(async () => {
    if (!sessionId) return

    setIsStarting(true)
    try {
      const res = await fetch('/api/mass-upload/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      const data = await res.json()

      if (data.status === 'success') {
        setStep('processing')
        status.startPolling(sessionId)
        toast.success(`${data.queued} screenshots queued for processing`)
      } else {
        toast.error(data.message || 'Failed to start processing')
      }
    } catch {
      toast.error('Failed to start processing')
    } finally {
      setIsStarting(false)
    }
  }, [sessionId, status])

  const handleStartFresh = useCallback(async () => {
    // Best-effort mark old session completed
    if (sessionId) {
      fetch(`/api/upload/sessions?sessionId=${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      }).catch(() => {})
    }

    // Reset state for instant UI feedback
    status.reset()
    setFiles(new Map())
    completedUploadsRef.current = []
    setStep('upload')
    setSessionId(null)

    // Create fresh session
    try {
      const res = await fetch('/api/upload/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileCount: 0 }),
      })
      const data = await res.json()
      if (data.status === 'success' && data.session?.id) {
        setSessionId(data.session.id)
      } else {
        toast.error('Failed to create new upload session')
      }
    } catch {
      toast.error('Failed to create new upload session')
    }
  }, [sessionId, status])

  const handleCancelProcessing = useCallback(async () => {
    if (!sessionId) return
    setIsCancelling(true)
    try {
      const res = await fetch('/api/mass-upload/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      const data = await res.json()
      if (data.status === 'success') {
        toast.success(`Cancelled ${data.cancelled} remaining screenshot${data.cancelled !== 1 ? 's' : ''}`)
      } else {
        toast.error(data.message || 'Failed to cancel')
      }
    } catch {
      toast.error('Failed to cancel processing')
    } finally {
      setIsCancelling(false)
    }
  }, [sessionId])

  const filesArray = Array.from(files.values())
  const completedFiles = filesArray.filter(f => f.status === 'completed').length
  const failedFiles = filesArray.filter(f => f.status === 'failed').length
  const uploadingFiles = filesArray.filter(f => f.status === 'uploading').length
  const allUploaded = filesArray.length > 0 && uploadingFiles === 0

  // --- RENDER ---

  // Step 3: Processing
  if (step === 'processing') {
    const processed = status.counts.completed + status.counts.failed
    const progressPercent = status.total > 0 ? Math.round((processed / status.total) * 100) : 0

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        {status.isComplete ? (
          // Complete state
          <Card className="p-8 text-center">
            <CheckCircle2 className="mx-auto h-16 w-16 text-green-500 mb-4" />
            <h2 className="text-2xl font-semibold mb-2">Processing Complete!</h2>
            <p className="text-muted-foreground mb-2">
              {status.placesCreated} places found from {status.counts.completed} screenshots
            </p>
            {status.counts.failed > 0 && (
              <p className="text-sm text-red-600 mb-4">
                {status.counts.failed} screenshot{status.counts.failed !== 1 ? 's' : ''} failed to process
              </p>
            )}
            {status.counts.cancelled > 0 && (
              <p className="text-sm text-muted-foreground mb-4">
                {status.counts.cancelled} screenshot{status.counts.cancelled !== 1 ? 's' : ''} cancelled
              </p>
            )}
            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/inbox">
                <Button size="lg">
                  <Inbox className="mr-2 h-4 w-4" />
                  View in Inbox
                </Button>
              </Link>
              <Button size="lg" variant="outline" onClick={handleStartFresh}>
                <Upload className="mr-2 h-4 w-4" />
                Upload More Photos
              </Button>
            </div>
          </Card>
        ) : (
          // Processing in progress
          <>
            <Card className="p-8 text-center">
              <Loader2 className="mx-auto h-12 w-12 text-blue-500 animate-spin mb-4" />
              <h2 className="text-xl font-semibold mb-2">Processing Screenshots</h2>
              <p className="text-2xl font-bold text-blue-600 mb-1">
                {processed} of {status.total} processed
              </p>
              <p className="text-muted-foreground mb-4">
                {status.placesCreated} places found so far
              </p>

              {/* Progress bar */}
              <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* Status breakdown */}
              <div className="flex flex-wrap justify-center gap-2 mb-6">
                {status.counts.queued > 0 && (
                  <Badge variant="outline">{status.counts.queued} queued</Badge>
                )}
                {status.counts.extracting > 0 && (
                  <Badge variant="secondary">{status.counts.extracting} extracting</Badge>
                )}
                {status.counts.enriching > 0 && (
                  <Badge variant="secondary">{status.counts.enriching} enriching</Badge>
                )}
                {status.counts.completed > 0 && (
                  <Badge variant="default">{status.counts.completed} completed</Badge>
                )}
                {status.counts.failed > 0 && (
                  <Badge variant="destructive">{status.counts.failed} failed</Badge>
                )}
                {status.counts.cancelled > 0 && (
                  <Badge variant="outline">{status.counts.cancelled} cancelled</Badge>
                )}
              </div>

              {/* Dev-only: manual cron trigger */}
              {process.env.NODE_ENV === 'development' && (
                <div className="border-t pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isTriggering}
                    onClick={async () => {
                      setIsTriggering(true)
                      setTriggerResult(null)
                      try {
                        const res = await fetch('/api/mass-upload/dev-trigger', { method: 'POST' })
                        const data = await res.json()
                        setTriggerResult(
                          `Processed: ${data.processed ?? 0}, Failed: ${data.failed ?? 0}, Places: ${data.placesCreated ?? 0}, Remaining: ${data.remaining ?? 0}`
                        )
                      } catch {
                        setTriggerResult('Trigger failed')
                      } finally {
                        setIsTriggering(false)
                      }
                    }}
                  >
                    {isTriggering ? (
                      <>
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        Running cron...
                      </>
                    ) : (
                      'Trigger Processing (Dev)'
                    )}
                  </Button>
                  {triggerResult && (
                    <p className="text-xs text-muted-foreground mt-2">{triggerResult}</p>
                  )}
                </div>
              )}
            </Card>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
              <p className="text-blue-800 font-medium">
                You can safely close this page.
              </p>
              <p className="text-sm text-blue-600 mt-1">
                Processing continues automatically in the background. Come back anytime to check progress.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button variant="outline" onClick={handleStartFresh}>
                <Upload className="mr-2 h-4 w-4" />
                Upload More Photos
              </Button>
              {status.counts.queued > 0 && (
                <Button
                  variant="outline"
                  onClick={handleCancelProcessing}
                  disabled={isCancelling}
                  className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                >
                  {isCancelling ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Cancelling...
                    </>
                  ) : (
                    <>
                      <Ban className="mr-2 h-4 w-4" />
                      Cancel Remaining
                    </>
                  )}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    )
  }

  // Step 2: Review
  if (step === 'review') {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Review Uploads</h2>
            <p className="text-sm text-muted-foreground">
              {completedFiles} screenshot{completedFiles !== 1 ? 's' : ''} ready to process
              {failedFiles > 0 && ` (${failedFiles} failed)`}
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={() => setStep('upload')}
          >
            Add More
          </Button>
        </div>

        {/* Thumbnail grid */}
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {filesArray
            .filter(f => f.status === 'completed')
            .map(file => (
              <div key={file.id} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
                {file.previewUrl && (
                  <img
                    src={file.previewUrl}
                    alt={file.file.name}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
            ))}
        </div>

        {/* Start processing */}
        <Card className="p-6 text-center">
          <CloudUpload className="mx-auto h-10 w-10 text-blue-500 mb-3" />
          <p className="text-muted-foreground mb-4">
            Once started, processing continues in the background. You can close this page.
          </p>
          <Button
            size="lg"
            onClick={handleStartProcessing}
            disabled={isStarting || completedFiles === 0}
          >
            {isStarting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                Start Processing {completedFiles} Screenshot{completedFiles !== 1 ? 's' : ''}
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </Card>
      </div>
    )
  }

  // Step 1: Upload
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Drop zone */}
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
            Drop travel screenshots here or tap to browse
          </div>
          <div className="text-sm text-gray-500 mb-4">
            Supports PNG, JPEG, WebP, HEIC (max 10MB each, up to {MAX_FILES} photos)
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
            Select Screenshots
          </Button>
        </div>
      </div>

      {/* Upload progress summary */}
      {filesArray.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">
              {filesArray.length} file{filesArray.length !== 1 ? 's' : ''}
            </Badge>
            {completedFiles > 0 && (
              <Badge variant="default">{completedFiles} uploaded</Badge>
            )}
            {uploadingFiles > 0 && (
              <Badge variant="secondary">{uploadingFiles} uploading</Badge>
            )}
            {failedFiles > 0 && (
              <Badge variant="destructive">{failedFiles} failed</Badge>
            )}
          </div>
        </div>
      )}

      {/* File list */}
      {filesArray.length > 0 && (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {filesArray.map((file) => (
            <Card key={file.id} className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {file.previewUrl && (
                    <div className="w-10 h-10 rounded overflow-hidden bg-gray-100 flex-shrink-0">
                      <img
                        src={file.previewUrl}
                        alt={file.file.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{file.file.name}</div>
                    <div className="text-xs text-gray-500">
                      {(file.file.size / (1024 * 1024)).toFixed(1)}MB
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {file.status === 'uploading' && (
                      <span className="text-xs text-blue-600">{file.progress}%</span>
                    )}
                    {file.status === 'completed' && (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    )}
                    {file.status === 'failed' && (
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeFile(file.id)}
                  className="h-8 w-8 text-gray-400 hover:text-red-600 ml-2"
                  disabled={file.status === 'uploading'}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

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

              {file.error && (
                <div className="mt-2 text-xs text-red-600">{file.error}</div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Continue to review */}
      {allUploaded && completedFiles > 0 && (
        <div className="flex justify-end">
          <Button onClick={() => setStep('review')} size="lg">
            Continue to Review
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
