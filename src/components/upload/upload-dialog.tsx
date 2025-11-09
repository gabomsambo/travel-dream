"use client"

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/adapters/dialog"
import { Button } from "@/components/adapters/button"
import { Badge } from "@/components/adapters/badge"
import { ScreenshotUploader } from './screenshot-uploader'
import { UploadProgress } from './upload-progress'
import { CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react'

interface UploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete?: (results: any) => void
}

interface UploadSession {
  id: string
  fileCount: number
  completedCount: number
  failedCount: number
  status: 'active' | 'completed' | 'cancelled'
  uploadedFiles: string[]
  processingQueue: string[]
  errors: Array<{ fileId: string; error: string }>
}

interface UploadStats {
  totalFiles: number
  uploadedFiles: number
  failedUploads: number
  ocrProcessed: number
  ocrPending: number
  ocrFailed: number
}

export function UploadDialog({ open, onOpenChange, onComplete }: UploadDialogProps) {
  const [sessionId, setSessionId] = useState<string>('')
  const [session, setSession] = useState<UploadSession | null>(null)
  const [uploadStats, setUploadStats] = useState<UploadStats>({
    totalFiles: 0,
    uploadedFiles: 0,
    failedUploads: 0,
    ocrProcessed: 0,
    ocrPending: 0,
    ocrFailed: 0
  })
  const [currentStep, setCurrentStep] = useState<'upload' | 'processing' | 'complete'>('upload')
  const [isProcessingOCR, setIsProcessingOCR] = useState(false)
  const [error, setError] = useState<string>('')

  // Initialize session when dialog opens
  useEffect(() => {
    if (open && !sessionId) {
      initializeSession()
    }
  }, [open, sessionId])

  // Poll session status during processing
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null

    if (sessionId && (currentStep === 'processing' || isProcessingOCR)) {
      interval = setInterval(async () => {
        await fetchSessionStatus()
      }, 2000) // Poll every 2 seconds
    }

    return () => {
      if (interval) {
        clearInterval(interval)
      }
    }
  }, [sessionId, currentStep, isProcessingOCR])

  const initializeSession = async () => {
    try {
      const response = await fetch('/api/upload/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metadata: { startedAt: new Date().toISOString() }
        })
      })

      if (!response.ok) {
        throw new Error('Failed to create upload session')
      }

      const data = await response.json()
      setSessionId(data.session.id)
      setSession(data.session)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize session')
    }
  }

  const fetchSessionStatus = async () => {
    if (!sessionId) return

    try {
      const response = await fetch(`/api/upload/sessions?sessionId=${sessionId}&details=true`)

      if (!response.ok) {
        throw new Error('Failed to fetch session status')
      }

      const data = await response.json()
      setSession(data.session)

      // Update stats
      const newStats: UploadStats = {
        totalFiles: data.session.fileCount || 0,
        uploadedFiles: data.session.completedCount || 0,
        failedUploads: data.session.failedCount || 0,
        ocrProcessed: 0,
        ocrPending: data.session.meta?.processingQueue?.length || 0,
        ocrFailed: data.session.meta?.errors?.length || 0
      }

      // Count OCR processed files
      if (data.session.sources) {
        newStats.ocrProcessed = data.session.sources.filter((source: any) =>
          source.meta?.uploadInfo?.ocrStatus === 'completed'
        ).length
      }

      setUploadStats(newStats)

      // Auto-transition steps
      if (newStats.uploadedFiles > 0 && newStats.ocrPending === 0 && !isProcessingOCR) {
        setCurrentStep('complete')
      }
    } catch (err) {
      console.error('Failed to fetch session status:', err)
    }
  }

  const handleUploadComplete = async (results: any[]) => {
    if (results.length === 0) return

    setCurrentStep('processing')
    setIsProcessingOCR(true)

    try {
      // Extract source IDs from react-uploady upload results
      const sourceIds: string[] = []

      for (const result of results) {
        if (result.state === 'finished' && result.uploadResponse) {
          try {
            // Handle both string and object responses
            let response = result.uploadResponse.data
            if (typeof response === 'string') {
              response = JSON.parse(response)
            }

            if (response.status === 'success' && response.results) {
              response.results
                .filter((r: any) => r.success)
                .forEach((r: any) => {
                  if (r.sourceId) {
                    sourceIds.push(r.sourceId)
                  }
                })
            }
          } catch (parseError) {
            console.warn('Failed to parse upload response:', parseError, result.uploadResponse)
          }
        }
      }

      if (sourceIds.length === 0) {
        throw new Error('No successful uploads to process')
      }

      // Start OCR processing
      const response = await fetch('/api/upload/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceIds,
          sessionId
        })
      })

      if (!response.ok) {
        throw new Error('Failed to start OCR processing')
      }

      const ocrResults = await response.json()
      console.log('OCR processing completed:', ocrResults)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'OCR processing failed')
    } finally {
      setIsProcessingOCR(false)
    }
  }

  const handleUploadError = (error: string) => {
    setError(error)
  }

  const handleClose = () => {
    // Reset state
    setSessionId('')
    setSession(null)
    setUploadStats({
      totalFiles: 0,
      uploadedFiles: 0,
      failedUploads: 0,
      ocrProcessed: 0,
      ocrPending: 0,
      ocrFailed: 0
    })
    setCurrentStep('upload')
    setIsProcessingOCR(false)
    setError('')

    onOpenChange(false)

    if (onComplete && session) {
      onComplete(session)
    }
  }

  const getStepIcon = (step: string) => {
    switch (step) {
      case 'upload':
        return currentStep === 'upload' ?
          <Clock className="h-4 w-4" /> :
          <CheckCircle className="h-4 w-4 text-green-600" />
      case 'processing':
        return currentStep === 'processing' || isProcessingOCR ?
          <Loader2 className="h-4 w-4 animate-spin" /> :
          currentStep === 'complete' ?
            <CheckCircle className="h-4 w-4 text-green-600" /> :
            <Clock className="h-4 w-4 text-gray-400" />
      case 'complete':
        return currentStep === 'complete' ?
          <CheckCircle className="h-4 w-4 text-green-600" /> :
          <Clock className="h-4 w-4 text-gray-400" />
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Screenshots</DialogTitle>
          <DialogDescription>
            Upload your travel screenshots for OCR text extraction and organization
          </DialogDescription>
        </DialogHeader>

        {/* Progress Steps */}
        <div className="flex items-center justify-between mb-6 px-4">
          <div className="flex items-center gap-2">
            {getStepIcon('upload')}
            <span className={currentStep === 'upload' ? 'font-medium' : 'text-gray-500'}>
              Upload Files
            </span>
          </div>
          <div className="flex-1 h-px bg-gray-200 mx-4" />
          <div className="flex items-center gap-2">
            {getStepIcon('processing')}
            <span className={currentStep === 'processing' || isProcessingOCR ? 'font-medium' : 'text-gray-500'}>
              Process OCR
            </span>
          </div>
          <div className="flex-1 h-px bg-gray-200 mx-4" />
          <div className="flex items-center gap-2">
            {getStepIcon('complete')}
            <span className={currentStep === 'complete' ? 'font-medium' : 'text-gray-500'}>
              Complete
            </span>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2 text-red-800">
              <XCircle className="h-4 w-4" />
              <span className="font-medium">Error</span>
            </div>
            <p className="text-red-700 mt-1">{error}</p>
          </div>
        )}

        {/* Upload Stats */}
        {uploadStats.totalFiles > 0 && (
          <div className="mb-4 flex gap-2 flex-wrap">
            <Badge variant="outline">
              {uploadStats.totalFiles} total files
            </Badge>
            {uploadStats.uploadedFiles > 0 && (
              <Badge variant="default">
                {uploadStats.uploadedFiles} uploaded
              </Badge>
            )}
            {uploadStats.failedUploads > 0 && (
              <Badge variant="destructive">
                {uploadStats.failedUploads} upload failed
              </Badge>
            )}
            {uploadStats.ocrProcessed > 0 && (
              <Badge variant="secondary">
                {uploadStats.ocrProcessed} OCR complete
              </Badge>
            )}
            {uploadStats.ocrPending > 0 && (
              <Badge variant="outline">
                {uploadStats.ocrPending} OCR pending
              </Badge>
            )}
            {uploadStats.ocrFailed > 0 && (
              <Badge variant="destructive">
                {uploadStats.ocrFailed} OCR failed
              </Badge>
            )}
          </div>
        )}

        {/* Main Content */}
        <div className="min-h-[400px]">
          {currentStep === 'upload' && sessionId && (
            <ScreenshotUploader
              sessionId={sessionId}
              onUploadComplete={handleUploadComplete}
              onUploadError={handleUploadError}
              maxFiles={100}
            />
          )}

          {(currentStep === 'processing' || currentStep === 'complete') && (
            <UploadProgress
              sessionId={sessionId}
              uploadStats={uploadStats}
              isComplete={currentStep === 'complete'}
              onRetryFailed={() => {
                // TODO: Implement retry logic
                console.log('Retry failed uploads')
              }}
            />
          )}
        </div>

        <DialogFooter>
          <div className="flex justify-between w-full">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isProcessingOCR}
            >
              {currentStep === 'complete' ? 'Close' : 'Cancel'}
            </Button>

            {currentStep === 'complete' && (
              <Button onClick={handleClose}>
                View in Inbox
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}