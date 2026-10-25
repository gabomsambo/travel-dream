"use client"

import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { upload } from '@vercel/blob/client'
import {
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  CloudUpload,
  RefreshCw,
  ImageIcon,
} from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Button } from "@/components/adapters/button"
import { Badge } from "@/components/adapters/badge"
import { Card } from "@/components/adapters/card"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/adapters/sheet'
import { useActivityJobs } from '@/components/activity/activity-provider'
import {
  bindUnstartedUpload,
  cancelUploadSession,
  createAbandonedUploadStore,
  discardUnstartedUpload,
  handOverPendingBlobs,
  type AbandonedUpload,
  type AbandonedUploadStore,
  type UnstartedUploadBinding,
} from '@/lib/unstarted-upload'

interface MassUploadFile {
  id: string
  file: File
  progress: number
  status: 'pending' | 'uploading' | 'completed' | 'failed' | 'rejected'
  error?: string
  previewUrl?: string
  blobUrl?: string
  sourceId?: string
}

type MassUploadStep = 'upload' | 'review'

interface MassUploadSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Files dropped on the Inbox before the sheet opened. */
  initialFiles?: File[]
}

const MAX_FILES = 500
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const CONCURRENT_LIMIT = 3
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

function aborted(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError')
}

function trackInFlight<T>(pending: Set<Promise<unknown>>, promise: Promise<T>): Promise<T> {
  const tracked = promise.finally(() => {
    pending.delete(tracked)
  })
  pending.add(tracked)
  return tracked
}

async function drainInFlight(pending: Set<Promise<unknown>>): Promise<void> {
  while (pending.size > 0) {
    await Promise.allSettled(Array.from(pending))
  }
}

async function abandonUnstartedSession(
  binding: UnstartedUploadBinding,
  sessionId: string,
  startPromise: Promise<boolean> | null,
  pending: Set<Promise<unknown>>,
): Promise<void> {
  try {
    const started = startPromise ? await startPromise : false
    await drainInFlight(pending)
    if (started) {
      // Start already queued the session — leave it alone, but still register
      // blobs that never got a source row. Register inserts them as queued.
      await handOverPendingBlobs(sessionId, binding)
      return
    }
    // The cancel has to land first: once the session is closed, register
    // takes its 409 path and deletes the blob with it. A cancel that failed
    // leaves the session open, and registering then would leave the batch
    // behind as "still reading" in the Inbox.
    const cancel = await binding.cancel()
    if (!cancel.ok) return
    await handOverPendingBlobs(sessionId, binding)
  } catch {
    return
  }
}

export function MassUploadSheet({ open, onOpenChange, initialFiles }: MassUploadSheetProps) {
  const router = useRouter()
  const [step, setStep] = useState<MassUploadStep>('upload')
  const [files, setFiles] = useState<Map<string, MassUploadFile>>(new Map())
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const filesRef = useRef<Map<string, MassUploadFile>>(new Map())
  const listParentRef = useRef<HTMLDivElement>(null)
  const seededFiles = useRef<File[] | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const startedRef = useRef(false)
  const startPromiseRef = useRef<Promise<boolean> | null>(null)
  const abortRef = useRef<AbortController>(new AbortController())
  const inFlightRef = useRef<Set<Promise<unknown>>>(new Set())
  const abandonedStoreRef = useRef<AbandonedUploadStore | null>(null)
  const epochRef = useRef(0)
  const openingIdRef = useRef(0)

  const { observeSession } = useActivityJobs()
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [batchError, setBatchError] = useState<string | null>(null)
  const [startError, setStartError] = useState<string | null>(null)

  // A new batch each time the sheet opens. Progress lives on the Inbox card.
  useEffect(() => {
    if (!open) {
      setFiles(new Map())
      setStep('upload')
      setSessionId(null)
      setIsUploading(false)
      setIsStarting(false)
      setSessionError(null)
      setBatchError(null)
      setStartError(null)
      seededFiles.current = null
      return
    }

    openingIdRef.current += 1
    const controller = new AbortController()
    abortRef.current = controller
    startedRef.current = false
    let cancelled = false
    let releaseBinding = () => {}
    let binding: UnstartedUploadBinding | null = null
    let abandoning = false
    let cancelRequest: Promise<Response> | null = null
    let startRequestedHeld = false
    const store = createAbandonedUploadStore()
    abandonedStoreRef.current = store
    const create = async () => {
      try {
        const res = await fetch('/api/upload/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileCount: 0 }),
          signal: controller.signal,
        })
        const data = await res.json()
        if (cancelled || controller.signal.aborted) return
        if (data.status === 'success' && data.session?.id) {
          const id = data.session.id
          sessionIdRef.current = id
          releaseBinding()
          binding = {
            sessionId: () => id,
            startRequested: () =>
              startRequestedHeld || startedRef.current || startPromiseRef.current !== null,
            store,
            cancel: () => {
              if (!cancelRequest) cancelRequest = cancelUploadSession(id)
              return cancelRequest
            },
          }
          releaseBinding = bindUnstartedUpload(binding)
          setSessionId(id)
          setSessionError(null)
        } else {
          setSessionError('Failed to create upload session')
        }
      } catch {
        if (!cancelled && !controller.signal.aborted) setSessionError('Failed to create upload session')
      }
    }
    void create()
    return () => {
      cancelled = true
      const currentSessionId = sessionIdRef.current
      const startPromise = startPromiseRef.current
      const alreadyStarted = startedRef.current
      const startWasRequested = alreadyStarted || startPromise !== null
      if (startWasRequested) startRequestedHeld = true
      // The cancel goes out first, while the page is still there.
      if (binding && currentSessionId && !startWasRequested) {
        try {
          void binding.cancel().then(() => undefined, () => undefined)
        } catch {
          // The hand-over below reports the failure.
        }
      }
      const pending = inFlightRef.current
      inFlightRef.current = new Set()
      epochRef.current += 1
      abortRef.current.abort()
      filesRef.current.forEach(file => {
        if (file.previewUrl) URL.revokeObjectURL(file.previewUrl)
      })
      sessionIdRef.current = null
      startedRef.current = false
      startPromiseRef.current = null
      if (binding && currentSessionId) {
        if (!abandoning) {
          abandoning = true
          // The binding stays live until the hand-over is on its way: a
          // refresh or a sign-out in that window still has to find this
          // session and the blobs that never got a source row. When Start
          // already succeeded, abandon registers those blobs into the open
          // session without cancelling it.
          void abandonUnstartedSession(
            binding,
            currentSessionId,
            alreadyStarted ? Promise.resolve(true) : startPromise,
            pending,
          ).finally(() => releaseBinding())
        }
      } else if (!abandoning) {
        releaseBinding()
      }
    }
  }, [open])

  // Task 2: Sync filesRef with files state (for unmount cleanup)
  useEffect(() => {
    filesRef.current = files
  }, [files])

  // Task 2: Revoke all object URLs on unmount
  useEffect(() => {
    return () => {
      filesRef.current.forEach(file => {
        if (file.previewUrl) URL.revokeObjectURL(file.previewUrl)
      })
    }
  }, [])

  // Task 1: beforeunload guard during upload
  useEffect(() => {
    if (!isUploading) return

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isUploading])

  useEffect(() => {
    const onPageHide = () => {
      discardUnstartedUpload()
    }
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
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

  const uploadFileToBlob = useCallback(async (
    file: File,
    fileId: string,
    epoch: number,
  ): Promise<{ blobUrl: string; sourceId: string }> => {
    const signal = abortRef.current.signal
    if (!sessionId) throw new Error('No session')
    if (signal.aborted || epochRef.current !== epoch) throw aborted()

    // The store of the batch this file belongs to. A file that finishes
    // uploading after the sheet closed still lands in that batch's store, so
    // the hand-over can find it.
    const store = abandonedStoreRef.current

    const timestamp = Date.now()
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const filename = `screenshots/${sessionId}/${timestamp}-${fileId.slice(0, 8)}.${ext}`

    const task = (async () => {
      const blob = await upload(filename, file, {
        access: 'public',
        handleUploadUrl: '/api/blob/upload',
        abortSignal: signal,
        onUploadProgress: (progress) => {
          if (epochRef.current !== epoch) return
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

      const payload: AbandonedUpload = {
        blobUrl: blob.url,
        originalName: file.name || 'screenshot',
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
      }
      // The blob is in the store now: until the server confirms a source row
      // it is an orphan that only this batch knows about.
      store?.add(payload)
      if (signal.aborted || epochRef.current !== epoch) throw aborted()

      const response = await fetch('/api/mass-upload/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          blobUrl: payload.blobUrl,
          originalName: payload.originalName,
          fileSize: payload.fileSize,
          mimeType: payload.mimeType,
        }),
        signal,
      })

      if (!response.ok) {
        throw new Error('Failed to register upload')
      }

      const result = await response.json()
      store?.remove(payload.blobUrl)
      return { blobUrl: blob.url, sourceId: result.sourceId as string }
    })()

    return trackInFlight(inFlightRef.current, task)
  }, [sessionId])

  const processFiles = useCallback(async (newFileList: File[]) => {
    const epoch = epochRef.current
    const signal = abortRef.current.signal
    if (signal.aborted || epochRef.current !== epoch) return
    if (!sessionId) {
      setSessionError('Session not ready. Please wait a moment and try again.')
      return
    }

    setBatchError(null)

    const validFiles: File[] = []
    const rejectedEntries: Array<[string, MassUploadFile]> = []

    newFileList.forEach(file => {
      const validation = validateFile(file)
      if (validation.isValid) {
        validFiles.push(file)
      } else {
        const fileId = crypto.randomUUID()
        rejectedEntries.push([fileId, {
          id: fileId,
          file,
          progress: 0,
          status: 'rejected',
          error: validation.error,
        }])
      }
    })

    const commitRejected = () => {
      if (rejectedEntries.length === 0) return
      setFiles(prev => {
        const newMap = new Map(prev)
        rejectedEntries.forEach(([id, entry]) => newMap.set(id, entry))
        return newMap
      })
    }

    const queuedCount = Array.from(files.values()).filter(f => f.status !== 'rejected').length

    if (validFiles.length + queuedCount > MAX_FILES) {
      setBatchError(`Cannot upload more than ${MAX_FILES} files`)
      commitRejected()
      return
    }

    if (validFiles.length === 0) {
      commitRejected()
      return
    }

    if (signal.aborted || epochRef.current !== epoch) return

    // Add files to state
    const updatedFiles = new Map(files)
    rejectedEntries.forEach(([id, entry]) => updatedFiles.set(id, entry))
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
    if (epochRef.current !== epoch) {
      newEntries.forEach(([, entry]) => {
        if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl)
      })
      return
    }
    setFiles(updatedFiles)
    setIsUploading(true)

    try {
      // Upload in batches of CONCURRENT_LIMIT
      for (let i = 0; i < newEntries.length; i += CONCURRENT_LIMIT) {
        if (signal.aborted || epochRef.current !== epoch) break
        const batch = newEntries.slice(i, i + CONCURRENT_LIMIT)

        await Promise.allSettled(
          batch.map(async ([fileId, fileData]) => {
            try {
              const result = await uploadFileToBlob(fileData.file, fileId, epoch)
              if (epochRef.current !== epoch) return

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

            } catch (error) {
              if (signal.aborted || epochRef.current !== epoch) return
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
    } finally {
      if (epochRef.current === epoch) setIsUploading(false)
    }
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

  useEffect(() => {
    if (!open || !sessionId || !initialFiles || initialFiles.length === 0) return
    if (seededFiles.current === initialFiles) return
    seededFiles.current = initialFiles
    void processFiles(initialFiles)
  }, [open, sessionId, initialFiles, processFiles])

  const handleStartProcessing = useCallback(async () => {
    if (!sessionId || startedRef.current) return

    setIsStarting(true)
    setStartError(null)
    const epoch = epochRef.current
    const openingId = openingIdRef.current
    const run = (async (): Promise<boolean> => {
      const stillThisOpening = () => epochRef.current === epoch
      try {
        const res = await fetch('/api/mass-upload/start', {
          method: 'POST',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        })
        const data = await res.json()

        if (data.status === 'success') {
          observeSession(sessionId)
          router.push('/inbox')
          router.refresh()
          if (openingIdRef.current === openingId) {
            startedRef.current = true
            onOpenChange(false)
          }
          return true
        }
        if (stillThisOpening()) setStartError(data.message || 'Failed to start processing')
        return false
      } catch {
        if (stillThisOpening()) setStartError('Failed to start processing')
        return false
      } finally {
        if (stillThisOpening()) setIsStarting(false)
      }
    })()
    startPromiseRef.current = run
    try {
      await run
    } finally {
      if (startPromiseRef.current === run) startPromiseRef.current = null
    }
  }, [sessionId, observeSession, onOpenChange, router])

  // Task 3: Per-file retry (uses filesRef to avoid stale closure)
  const retryFile = useCallback(async (fileId: string) => {
    const epoch = epochRef.current
    const fileData = filesRef.current.get(fileId)
    if (!fileData || !sessionId || abortRef.current.signal.aborted) return

    setFiles(prev => {
      const updated = new Map(prev)
      const current = prev.get(fileId)
      if (current) {
        updated.set(fileId, { ...current, status: 'uploading', progress: 0, error: undefined })
      }
      return updated
    })

    try {
      const result = await uploadFileToBlob(fileData.file, fileId, epoch)
      if (epochRef.current !== epoch) return
      setFiles(prev => {
        const updated = new Map(prev)
        const current = prev.get(fileId)
        if (current) {
          updated.set(fileId, {
            ...current,
            status: 'completed',
            progress: 100,
            blobUrl: result.blobUrl,
            sourceId: result.sourceId,
          })
        }
        return updated
      })
    } catch (error) {
      if (epochRef.current !== epoch || abortRef.current.signal.aborted) return
      setFiles(prev => {
        const updated = new Map(prev)
        const current = prev.get(fileId)
        if (current) {
          updated.set(fileId, {
            ...current,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Retry failed',
          })
        }
        return updated
      })
    }
  }, [sessionId, uploadFileToBlob])

  // Task 3: Retry all failed (uses filesRef to avoid stale closure)
  const retryAllFailed = useCallback(async () => {
    const failedIds = Array.from(filesRef.current.entries())
      .filter(([, f]) => f.status === 'failed')
      .map(([id]) => id)

    for (let i = 0; i < failedIds.length; i += CONCURRENT_LIMIT) {
      const batch = failedIds.slice(i, i + CONCURRENT_LIMIT)
      await Promise.allSettled(batch.map(id => retryFile(id)))
    }
  }, [retryFile])

  const filesArray = Array.from(files.values())

  // Task 4: Virtual list (must be called unconditionally — React hook rule)
  const rowVirtualizer = useVirtualizer({
    count: filesArray.length,
    getScrollElement: () => listParentRef.current,
    estimateSize: () => 88,
    overscan: 5,
  })

  const completedFiles = filesArray.filter(f => f.status === 'completed').length
  const failedFiles = filesArray.filter(f => f.status === 'failed').length
  const rejectedFiles = filesArray.filter(f => f.status === 'rejected').length
  const uploadingFiles = filesArray.filter(f => f.status === 'uploading').length
  const allUploaded = filesArray.length > 0 && uploadingFiles === 0

  if (!open) return null

  const frame = (content: ReactNode) => (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[min(92vh,860px)] overflow-y-auto rounded-t-2xl px-4 pb-8 sm:px-8">
        <SheetHeader>
          <SheetTitle>Upload screenshots</SheetTitle>
          <SheetDescription>
            Drop travel screenshots. After Start, they report back in your Inbox.
          </SheetDescription>
        </SheetHeader>
        {content}
      </SheetContent>
    </Sheet>
  )

  // Step 2: Review
  if (step === 'review') {
    return frame(
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Review Uploads</h2>
            <p className="text-sm text-muted-foreground">
              {completedFiles} screenshot{completedFiles !== 1 ? 's' : ''} ready to process
              {failedFiles > 0 && ` (${failedFiles} failed)`}
              {rejectedFiles > 0 && ` (${rejectedFiles} skipped)`}
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
                  <>
                    <img
                      src={file.previewUrl}
                      alt={file.file.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                        const fallback = e.currentTarget.nextElementSibling as HTMLElement
                        if (fallback) fallback.style.display = 'flex'
                      }}
                    />
                    <div className="w-full h-full items-center justify-center" style={{ display: 'none' }}>
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    </div>
                  </>
                )}
              </div>
            ))}
        </div>

        {/* Start processing */}
        <Card className="p-6 text-center">
          <CloudUpload className="mx-auto h-10 w-10 text-blue-500 mb-3" />
          <p className="text-muted-foreground mb-4">
            After Start, this upload shows up in your Inbox. You can leave; the bell rings when it is done.
          </p>
          {startError && (
            <p className="text-sm text-destructive mb-4">{startError}</p>
          )}
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
  return frame(
    <div className="max-w-2xl mx-auto space-y-6">
      {sessionError && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {sessionError}
        </div>
      )}
      {batchError && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {batchError}
        </div>
      )}
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
        role="button"
        tabIndex={0}
        aria-label="Drop travel screenshots here or press Enter to browse files"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            fileInputRef.current?.click()
          }
        }}
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
            tabIndex={-1}
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
          <div className="flex items-center gap-2 flex-wrap" aria-live="polite" aria-atomic="true">
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
            {rejectedFiles > 0 && (
              <Badge variant="destructive">{rejectedFiles} skipped</Badge>
            )}
          </div>
          {/* Task 3: Retry All Failed button */}
          {failedFiles > 0 && !isUploading && (
            <Button variant="outline" size="sm" onClick={retryAllFailed}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry Failed ({failedFiles})
            </Button>
          )}
        </div>
      )}

      {/* File list — Task 4: Virtualized */}
      {filesArray.length > 0 && (
        <div ref={listParentRef} className="max-h-80 overflow-auto">
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map(virtualRow => {
              const file = filesArray[virtualRow.index]
              return (
                <div
                  key={file.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <Card className="p-3 h-full">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {file.previewUrl && (
                          <div className="w-10 h-10 rounded overflow-hidden bg-gray-100 flex-shrink-0">
                            {/* Task 5: HEIC fallback */}
                            <img
                              src={file.previewUrl}
                              alt={file.file.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none'
                                const fallback = e.currentTarget.nextElementSibling as HTMLElement
                                if (fallback) fallback.style.display = 'flex'
                              }}
                            />
                            <div className="h-full w-full rounded bg-muted items-center justify-center" style={{ display: 'none' }}>
                              <ImageIcon className="h-5 w-5 text-muted-foreground" />
                            </div>
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
                          {(file.status === 'failed' || file.status === 'rejected') && (
                            <AlertCircle className="w-4 h-4 text-red-500" />
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        {/* Task 3: Per-file retry button */}
                        {file.status === 'failed' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => retryFile(file.id)}
                            className="h-8 w-8 text-blue-500 hover:text-blue-700"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        )}
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
                    </div>

                    {file.status === 'uploading' && (
                      <div className="mt-2">
                        <div className="w-full bg-gray-200 rounded-full h-1">
                          <div
                            role="progressbar"
                            aria-valuenow={file.progress}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`Upload progress for ${file.file.name}`}
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
                </div>
              )
            })}
          </div>
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
