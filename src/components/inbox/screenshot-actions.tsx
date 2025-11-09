"use client"

import { useState } from 'react'
import { Button } from "@/components/adapters/button"
import { Sparkles, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"

interface ScreenshotActionsProps {
  screenshots: Array<{
    id: string
    llmProcessed?: number
  }>
  onProcessingComplete?: () => void
}

export function ScreenshotActions({ screenshots, onProcessingComplete }: ScreenshotActionsProps) {
  const [isProcessing, setIsProcessing] = useState(false)

  const unprocessedScreenshots = screenshots.filter(s => !s.llmProcessed || s.llmProcessed === 0)
  const processedScreenshots = screenshots.filter(s => s.llmProcessed === 1)

  const handleProcessUnprocessed = async () => {
    if (unprocessedScreenshots.length === 0) {
      toast.info('No unprocessed screenshots to process')
      return
    }

    setIsProcessing(true)

    try {
      const sourceIds = unprocessedScreenshots.map(s => s.id)

      toast.info(`Processing ${sourceIds.length} screenshots with AI...`)

      const response = await fetch('/api/llm-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceIds,
          provider: 'openai',
          context: {
            sourceType: 'screenshot',
            triggeredBy: 'manual-inbox'
          }
        })
      })

      if (!response.ok) {
        throw new Error('Failed to process screenshots')
      }

      const result = await response.json()

      toast.success(
        `Successfully processed ${result.summary.successful}/${result.summary.total} screenshots`,
        {
          description: `Extracted ${result.summary.totalPlaces} places with avg confidence ${Math.round(result.summary.avgProcessingTime)}ms`
        }
      )

      // Refresh the page or call callback
      if (onProcessingComplete) {
        onProcessingComplete()
      } else {
        window.location.reload()
      }

    } catch (error) {
      console.error('Error processing screenshots:', error)
      toast.error('Failed to process screenshots with AI')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleReprocessAll = async () => {
    if (screenshots.length === 0) {
      toast.info('No screenshots to reprocess')
      return
    }

    setIsProcessing(true)

    try {
      const sourceIds = screenshots.map(s => s.id)

      toast.info(`Reprocessing ${sourceIds.length} screenshots with AI...`)

      const response = await fetch('/api/llm-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceIds,
          provider: 'openai',
          context: {
            sourceType: 'screenshot',
            triggeredBy: 'manual-reprocess'
          }
        })
      })

      if (!response.ok) {
        throw new Error('Failed to reprocess screenshots')
      }

      const result = await response.json()

      toast.success(
        `Successfully reprocessed ${result.summary.successful}/${result.summary.total} screenshots`
      )

      // Refresh the page or call callback
      if (onProcessingComplete) {
        onProcessingComplete()
      } else {
        window.location.reload()
      }

    } catch (error) {
      console.error('Error reprocessing screenshots:', error)
      toast.error('Failed to reprocess screenshots with AI')
    } finally {
      setIsProcessing(false)
    }
  }

  if (screenshots.length === 0) {
    return null
  }

  return (
    <div className="flex gap-2">
      {unprocessedScreenshots.length > 0 && (
        <Button
          onClick={handleProcessUnprocessed}
          disabled={isProcessing}
          size="sm"
          variant="default"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Process {unprocessedScreenshots.length} with AI
            </>
          )}
        </Button>
      )}

      {processedScreenshots.length > 0 && (
        <Button
          onClick={handleReprocessAll}
          disabled={isProcessing}
          size="sm"
          variant="outline"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Reprocessing...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Reprocess All
            </>
          )}
        </Button>
      )}
    </div>
  )
}