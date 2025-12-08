"use client"

import { useState } from 'react'
import { Card } from "@/components/adapters/card"
import { Badge } from "@/components/adapters/badge"
import { Button } from "@/components/adapters/button"
import { Image, FileText, Clock, CheckCircle, AlertCircle, X, RefreshCw, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface ScreenshotSource {
  id: string
  uri: string
  ocrText: string | null
  meta: any
  createdAt: string
}

interface ScreenshotCardProps {
  source: ScreenshotSource
  onDelete?: (sourceId: string) => void
  onRetryComplete?: () => void
}

export function ScreenshotCard({ source, onDelete, onRetryComplete }: ScreenshotCardProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)

  const uploadInfo = source.meta?.uploadInfo
  const ocrStatus = uploadInfo?.ocrStatus || 'unknown'
  const thumbnailPath = uploadInfo?.thumbnailPath
  const originalName = uploadInfo?.originalName || 'Unknown'
  const confidence = uploadInfo?.ocrConfidence

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'processing':
        return <Clock className="h-4 w-4 text-blue-600" />
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-600" />
      default:
        return <Clock className="h-4 w-4 text-gray-400" />
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default">OCR Complete</Badge>
      case 'processing':
        return <Badge variant="secondary">Processing</Badge>
      case 'failed':
        return <Badge variant="destructive">OCR Failed</Badge>
      default:
        return <Badge variant="outline">Pending</Badge>
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/sources/${source.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to delete screenshot')
      }

      toast.success('Screenshot deleted successfully')
      onDelete?.(source.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete screenshot')
      console.error('Error deleting screenshot:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleRetry = async () => {
    setIsRetrying(true)
    try {
      const response = await fetch('/api/llm-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceIds: [source.id],
          provider: 'openai',
          context: {
            sourceType: 'screenshot',
            triggeredBy: 'manual-retry'
          }
        })
      })

      if (!response.ok) {
        throw new Error('Failed to retry processing')
      }

      const result = await response.json()

      if (result.summary.successful > 0) {
        toast.success('Screenshot reprocessed successfully', {
          description: `Extracted ${result.summary.totalPlaces} places`
        })
        onRetryComplete?.()
        window.location.reload()
      } else {
        toast.error('Failed to process screenshot')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to retry processing')
      console.error('Error retrying screenshot:', error)
    } finally {
      setIsRetrying(false)
    }
  }

  return (
    <Card className="p-4 hover:shadow-md transition-shadow relative group">
      {/* Action buttons */}
      <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
        {/* Retry button - only for failed status */}
        {ocrStatus === 'failed' && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 bg-blue-50 hover:bg-blue-100 text-blue-600 hover:text-blue-700"
            onClick={handleRetry}
            disabled={isRetrying}
          >
            {isRetrying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        )}
        {/* Delete button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700"
          onClick={handleDelete}
          disabled={isDeleting}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-3">
        {/* Thumbnail */}
        {thumbnailPath ? (
          <div className="aspect-video w-full rounded-lg overflow-hidden bg-gray-100">
            <img
              src={thumbnailPath}
              alt={originalName}
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="aspect-video w-full rounded-lg bg-gray-100 flex items-center justify-center">
            <Image className="h-8 w-8 text-gray-400" />
          </div>
        )}

        {/* File Info */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium truncate">{originalName}</span>
            {getStatusIcon(ocrStatus)}
          </div>

          <div className="flex items-center gap-2">
            {getStatusBadge(ocrStatus)}
            {confidence && (
              <Badge variant="outline" className="text-xs">
                {Math.round(confidence)}% confidence
              </Badge>
            )}
          </div>

          {/* OCR Text Preview */}
          {source.ocrText && (
            <div className="mt-2">
              <div className="flex items-center gap-1 mb-1">
                <FileText className="h-3 w-3 text-gray-500" />
                <span className="text-xs text-gray-500">Extracted Text</span>
              </div>
              <p className="text-xs text-gray-700 line-clamp-3">
                {source.ocrText.substring(0, 150)}
                {source.ocrText.length > 150 && '...'}
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
