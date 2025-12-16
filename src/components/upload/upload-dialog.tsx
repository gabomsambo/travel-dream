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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ScreenshotUploader } from './screenshot-uploader'
import { UploadProgress } from './upload-progress'
import { ImportWorkflow } from '@/components/import/import-workflow'
import { CheckCircle, XCircle, Clock, Loader2, Camera, FileSpreadsheet } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from 'sonner'

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
  const [activeTab, setActiveTab] = useState<'screenshot' | 'import'>('screenshot')
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
  const [hasStartedProcessing, setHasStartedProcessing] = useState(false)
  const [error, setError] = useState<string>('')
  const [pendingSourceIds, setPendingSourceIds] = useState<string[]>([])

  // Warning dialog state
  const [showTabSwitchWarning, setShowTabSwitchWarning] = useState(false)
  const [pendingTab, setPendingTab] = useState<'screenshot' | 'import' | null>(null)
  const [showCloseWarning, setShowCloseWarning] = useState(false)
  const [importStep, setImportStep] = useState<string>('upload')

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

      // Auto-transition steps - only if we actually started processing
      if (newStats.uploadedFiles > 0 &&
          newStats.ocrPending === 0 &&
          hasStartedProcessing &&
          !isProcessingOCR) {
        setCurrentStep('complete')
      }
    } catch (err) {
      console.error('Failed to fetch session status:', err)
    }
  }

  const handleUploadComplete = (results: any[]) => {
    console.log('[UploadDialog] handleUploadComplete called with', results.length, 'results')

    if (results.length === 0) {
      console.warn('[UploadDialog] No results to process, returning early')
      return
    }

    // Extract source IDs and accumulate them (don't auto-process)
    const newSourceIds: string[] = []

    for (const result of results) {
      // New Vercel Blob format: { sourceId, blobUrl, ... }
      if (result.sourceId) {
        console.log('[UploadDialog] Found sourceId (Blob format):', result.sourceId)
        newSourceIds.push(result.sourceId)
        continue
      }

      // Legacy react-uploady format
      if (result.state === 'finished' && result.uploadResponse) {
        try {
          let response = result.uploadResponse.data
          if (typeof response === 'string') {
            response = JSON.parse(response)
          }

          if (response.status === 'success' && response.results) {
            const successfulResults = response.results.filter((r: any) => r.success)
            successfulResults.forEach((r: any) => {
              if (r.sourceId) {
                newSourceIds.push(r.sourceId)
              }
            })
          }
        } catch (parseError) {
          console.error('[UploadDialog] Failed to parse upload response:', parseError)
        }
      }
    }

    console.log('[UploadDialog] Accumulated sourceIds:', newSourceIds)

    if (newSourceIds.length > 0) {
      setPendingSourceIds(prev => {
        const existingSet = new Set(prev)
        const uniqueNew = newSourceIds.filter(id => !existingSet.has(id))
        return [...prev, ...uniqueNew]
      })
    }
  }

  const startProcessing = async () => {
    if (pendingSourceIds.length === 0) return

    setCurrentStep('processing')
    setIsProcessingOCR(true)
    setHasStartedProcessing(true)
    setError('')

    try {
      console.log('[UploadDialog] Starting OCR processing for', pendingSourceIds.length, 'sources')
      const response = await fetch('/api/upload/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceIds: pendingSourceIds,
          sessionId
        })
      })

      console.log('[UploadDialog] OCR process response status:', response.status, response.statusText)

      if (!response.ok) {
        throw new Error('Failed to start OCR processing')
      }

      const ocrResults = await response.json()
      console.log('[UploadDialog] OCR processing completed:', ocrResults)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'OCR processing failed')
    } finally {
      setIsProcessingOCR(false)
    }
  }

  const handleUploadError = (error: string) => {
    setError(error)
    toast.error(error, { duration: 2000 })
  }

  // Check if there's unsaved progress on current tab
  const hasUnsavedProgress = (): boolean => {
    if (activeTab === 'screenshot') {
      return uploadStats.uploadedFiles > 0 ||
             uploadStats.ocrProcessed > 0 ||
             currentStep !== 'upload' ||
             hasStartedProcessing ||
             pendingSourceIds.length > 0
    }
    if (activeTab === 'import') {
      return importStep !== 'upload'
    }
    return false
  }

  // Guarded tab change handler
  const handleTabChange = (newTab: 'screenshot' | 'import') => {
    if (newTab === activeTab) return

    if (hasUnsavedProgress()) {
      setPendingTab(newTab)
      setShowTabSwitchWarning(true)
    } else {
      setActiveTab(newTab)
    }
  }

  // Confirm tab switch after warning
  const confirmTabSwitch = () => {
    if (pendingTab) {
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
      setHasStartedProcessing(false)
      setError('')
      setImportStep('upload')
      setPendingSourceIds([])
      setActiveTab(pendingTab)
    }
    setPendingTab(null)
    setShowTabSwitchWarning(false)
  }

  // Guarded dialog close handler
  const handleDialogOpenChange = (open: boolean) => {
    if (!open && hasUnsavedProgress()) {
      setShowCloseWarning(true)
      return
    }
    if (!open) {
      handleClose()
    } else {
      onOpenChange(open)
    }
  }

  // Confirm close after warning
  const confirmClose = () => {
    setShowCloseWarning(false)
    handleClose()
  }

  const handleClose = () => {
    // Reset state
    setActiveTab('screenshot')
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
    setHasStartedProcessing(false)
    setError('')
    setImportStep('upload')
    setPendingSourceIds([])

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
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Upload</DialogTitle>
          <DialogDescription>
            Add places from screenshots or import from CSV/Excel files
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => handleTabChange(v as 'screenshot' | 'import')} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="screenshot" disabled={isProcessingOCR}>
              <Camera className="h-4 w-4 mr-2" />
              Screenshot
            </TabsTrigger>
            <TabsTrigger value="import" disabled={isProcessingOCR || currentStep !== 'upload'}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              CSV/Excel
            </TabsTrigger>
          </TabsList>

          <TabsContent value="screenshot" className="min-h-[400px]">
            {/* Progress Steps for Screenshot */}
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

            {/* Screenshot Upload Content */}
            <div className="min-h-[300px]">
              {currentStep === 'upload' && sessionId && (
                <>
                  <ScreenshotUploader
                    sessionId={sessionId}
                    onUploadComplete={handleUploadComplete}
                    onUploadError={handleUploadError}
                    maxFiles={20}
                  />

                  {pendingSourceIds.length > 0 && (
                    <div className="mt-4 flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <span className="text-sm text-blue-800">
                        {pendingSourceIds.length} file{pendingSourceIds.length !== 1 ? 's' : ''} ready to process
                      </span>
                      <Button onClick={startProcessing}>
                        Start Processing
                      </Button>
                    </div>
                  )}
                </>
              )}

              {(currentStep === 'processing' || currentStep === 'complete') && (
                <UploadProgress
                  sessionId={sessionId}
                  uploadStats={uploadStats}
                  isComplete={currentStep === 'complete'}
                  onRetryFailed={() => {
                    console.log('Retry failed uploads')
                  }}
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="import" className="min-h-[400px] w-full max-w-full overflow-hidden">
            <ImportWorkflow
              onComplete={(result) => {
                if (onComplete) {
                  onComplete(result)
                }
              }}
              onClose={handleClose}
              onStepChange={(step) => setImportStep(step)}
            />
          </TabsContent>
        </Tabs>

        {activeTab === 'screenshot' && (
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
        )}

        {/* Tab Switch Warning Dialog */}
        <AlertDialog open={showTabSwitchWarning} onOpenChange={setShowTabSwitchWarning}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Switch tabs?</AlertDialogTitle>
              <AlertDialogDescription>
                You have an upload in progress. Switching tabs will discard your current progress and any uploaded files.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => {
                setPendingTab(null)
                setShowTabSwitchWarning(false)
              }}>
                Stay here
              </AlertDialogCancel>
              <AlertDialogAction onClick={confirmTabSwitch}>
                Switch anyway
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Dialog Close Warning */}
        <AlertDialog open={showCloseWarning} onOpenChange={setShowCloseWarning}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Leave upload?</AlertDialogTitle>
              <AlertDialogDescription>
                You have an upload in progress. Leaving now will discard your current progress and any uploaded files.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setShowCloseWarning(false)}>
                Continue uploading
              </AlertDialogCancel>
              <AlertDialogAction onClick={confirmClose}>
                Leave anyway
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  )
}