"use client"

import { useState, useOptimistic, startTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ScreenshotCard } from './screenshot-card'
import { Button } from "@/components/adapters/button"
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog"
import { Image, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface ScreenshotSource {
  id: string
  uri: string
  ocrText: string | null
  meta: any
  createdAt: string
}

interface ScreenshotGridProps {
  sources: ScreenshotSource[]
}

export function ScreenshotGrid({ sources: initialSources }: ScreenshotGridProps) {
  const router = useRouter()
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [isClearing, setIsClearing] = useState(false)

  const [sources, setOptimisticSources] = useOptimistic(
    initialSources,
    (state: ScreenshotSource[], action: string) => {
      if (action === 'clear-all') return []
      return state.filter(s => s.id !== action)
    }
  )

  const handleDelete = (sourceId: string) => {
    startTransition(() => {
      setOptimisticSources(sourceId)
    })
  }

  const handleClearAll = async () => {
    setIsClearing(true)
    try {
      const response = await fetch('/api/sources/clear', { method: 'DELETE' })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to clear screenshots')
      }

      const result = await response.json()
      startTransition(() => {
        setOptimisticSources('clear-all')
      })
      toast.success(`Cleared ${result.deleted} screenshot${result.deleted !== 1 ? 's' : ''}`)
      setClearDialogOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to clear screenshots')
      console.error('Error clearing screenshots:', error)
    } finally {
      setIsClearing(false)
    }
  }

  if (sources.length === 0) {
    return (
      <div className="text-center py-12">
        <Image className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <p className="text-gray-500">No screenshots found</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => setClearDialogOpen(true)}
        >
          <Trash2 className="h-4 w-4 mr-1.5" />
          Clear All
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {sources.map((source) => (
          <ScreenshotCard
            key={source.id}
            source={source}
            onDelete={handleDelete}
          />
        ))}
      </div>

      <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              Clear All Screenshots?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {sources.length} screenshot{sources.length !== 1 ? 's' : ''} from your inbox.
              Places already extracted from these screenshots will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClearing}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleClearAll}
              disabled={isClearing}
            >
              {isClearing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Clearing...
                </>
              ) : (
                'Clear All'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
