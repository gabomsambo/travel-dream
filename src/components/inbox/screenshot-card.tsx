"use client"

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Image, FileText, Clock, CheckCircle, AlertCircle, X } from 'lucide-react'
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
}

export function ScreenshotCard({ source, onDelete }: ScreenshotCardProps) {
  const [isDeleting, setIsDeleting] = useState(false)

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

  return (
    <Card className="p-4 hover:shadow-md transition-shadow relative group">
      {/* Delete button */}
      <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
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
