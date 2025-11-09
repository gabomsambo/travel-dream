"use client"

import { useState, useEffect } from 'react'
import { Card } from "@/components/adapters/card"
import { Button } from "@/components/adapters/button"
import { Badge } from "@/components/adapters/badge"
import {
  CheckCircle,
  Clock,
  AlertCircle,
  RefreshCw,
  Eye,
  Image as ImageIcon,
  FileText
} from 'lucide-react'

interface UploadStats {
  totalFiles: number
  uploadedFiles: number
  failedUploads: number
  ocrProcessed: number
  ocrPending: number
  ocrFailed: number
}

interface UploadProgressProps {
  sessionId: string
  uploadStats: UploadStats
  isComplete: boolean
  onRetryFailed: () => void
  className?: string
}

interface ProcessedFile {
  id: string
  originalName: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  ocrText?: string
  confidence?: number
  thumbnailPath?: string
  storedPath?: string
  error?: string
}

export function UploadProgress({
  sessionId,
  uploadStats,
  isComplete,
  onRetryFailed,
  className
}: UploadProgressProps) {
  const [files, setFiles] = useState<ProcessedFile[]>([])
  const [selectedFile, setSelectedFile] = useState<ProcessedFile | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    if (sessionId) {
      fetchSessionDetails()
    }
  }, [sessionId, uploadStats])

  const fetchSessionDetails = async () => {
    try {
      const response = await fetch(`/api/upload/sessions?sessionId=${sessionId}&details=true`)

      if (!response.ok) {
        throw new Error('Failed to fetch session details')
      }

      const data = await response.json()

      if (data.session?.sources) {
        const processedFiles: ProcessedFile[] = data.session.sources.map((source: any) => ({
          id: source.id,
          originalName: source.meta?.uploadInfo?.originalName || 'Unknown',
          status: getFileStatus(source.meta?.uploadInfo?.ocrStatus),
          ocrText: source.ocrText,
          confidence: source.meta?.uploadInfo?.ocrConfidence,
          thumbnailPath: source.meta?.uploadInfo?.thumbnailPath,
          storedPath: source.meta?.uploadInfo?.storedPath,
          error: source.meta?.uploadInfo?.ocrStatus === 'failed' ? 'OCR processing failed' : undefined
        }))

        setFiles(processedFiles)
      }
    } catch (error) {
      console.error('Failed to fetch session details:', error)
    }
  }

  const getFileStatus = (ocrStatus: string): ProcessedFile['status'] => {
    switch (ocrStatus) {
      case 'completed':
        return 'completed'
      case 'processing':
        return 'processing'
      case 'failed':
        return 'failed'
      default:
        return 'pending'
    }
  }

  const getStatusIcon = (status: ProcessedFile['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'processing':
        return <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-600" />
      default:
        return <Clock className="h-4 w-4 text-gray-400" />
    }
  }

  const getStatusBadge = (status: ProcessedFile['status']) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default">Complete</Badge>
      case 'processing':
        return <Badge variant="secondary">Processing</Badge>
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>
      default:
        return <Badge variant="outline">Pending</Badge>
    }
  }

  const completionPercentage = uploadStats.totalFiles > 0
    ? Math.round((uploadStats.ocrProcessed / uploadStats.totalFiles) * 100)
    : 0

  return (
    <div className={className}>
      {/* Overall Progress */}
      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Processing Progress</h3>
          <div className="text-2xl font-bold text-blue-600">
            {completionPercentage}%
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-500"
            style={{ width: `${completionPercentage}%` }}
          />
        </div>

        {/* Status Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-gray-900">
              {uploadStats.totalFiles}
            </div>
            <div className="text-sm text-gray-500">Total Files</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600">
              {uploadStats.ocrProcessed}
            </div>
            <div className="text-sm text-gray-500">Processed</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-600">
              {uploadStats.ocrPending}
            </div>
            <div className="text-sm text-gray-500">Pending</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-600">
              {uploadStats.ocrFailed}
            </div>
            <div className="text-sm text-gray-500">Failed</div>
          </div>
        </div>

        {uploadStats.ocrFailed > 0 && (
          <div className="mt-4 pt-4 border-t">
            <Button
              variant="outline"
              onClick={onRetryFailed}
              className="w-full"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry Failed Uploads
            </Button>
          </div>
        )}
      </Card>

      {/* File List */}
      {files.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Processed Files</h3>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {/* Thumbnail */}
                  {file.thumbnailPath && (
                    <div className="w-12 h-12 rounded overflow-hidden bg-gray-100 flex-shrink-0">
                      <img
                        src={file.thumbnailPath}
                        alt={file.originalName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium truncate">
                        {file.originalName}
                      </span>
                      {getStatusIcon(file.status)}
                    </div>

                    {file.confidence && (
                      <div className="text-xs text-gray-500">
                        OCR Confidence: {Math.round(file.confidence)}%
                      </div>
                    )}

                    {file.ocrText && (
                      <div className="text-xs text-gray-600 mt-1 line-clamp-2">
                        {file.ocrText.substring(0, 100)}
                        {file.ocrText.length > 100 && '...'}
                      </div>
                    )}

                    {file.error && (
                      <div className="text-xs text-red-600 mt-1">
                        {file.error}
                      </div>
                    )}
                  </div>

                  {/* Status */}
                  <div className="flex items-center gap-2">
                    {getStatusBadge(file.status)}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 ml-3">
                  {file.thumbnailPath && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSelectedFile(file)
                        setShowPreview(true)
                      }}
                      className="h-8 w-8"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}

                  {file.ocrText && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSelectedFile(file)
                        setShowPreview(true)
                      }}
                      className="h-8 w-8"
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Completion Message */}
      {isComplete && uploadStats.ocrProcessed > 0 && (
        <Card className="p-6 mt-6 bg-green-50 border-green-200">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-6 w-6 text-green-600" />
            <div>
              <h3 className="font-semibold text-green-900">Upload Complete!</h3>
              <p className="text-green-700 text-sm">
                {uploadStats.ocrProcessed} screenshots have been processed and are ready to view in your inbox.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* File Preview Modal */}
      {showPreview && selectedFile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl max-h-[90vh] overflow-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">{selectedFile.originalName}</h3>
                <Button
                  variant="ghost"
                  onClick={() => setShowPreview(false)}
                >
                  ×
                </Button>
              </div>

              {selectedFile.storedPath && (
                <div className="mb-4">
                  <img
                    src={selectedFile.storedPath}
                    alt={selectedFile.originalName}
                    className="max-w-full max-h-96 object-contain mx-auto"
                  />
                </div>
              )}

              {selectedFile.ocrText && (
                <div>
                  <h4 className="font-medium mb-2">Extracted Text:</h4>
                  <div className="bg-gray-50 p-4 rounded-lg text-sm">
                    {selectedFile.ocrText}
                  </div>
                  {selectedFile.confidence && (
                    <div className="text-xs text-gray-500 mt-2">
                      Confidence: {Math.round(selectedFile.confidence)}%
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}