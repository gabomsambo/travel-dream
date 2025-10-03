"use client"

import { useState, useOptimistic, startTransition } from 'react'
import { ScreenshotCard } from './screenshot-card'
import { Image } from 'lucide-react'

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
  const [sources, setOptimisticSources] = useOptimistic(
    initialSources,
    (state: ScreenshotSource[], deletedId: string) =>
      state.filter(s => s.id !== deletedId)
  )

  const handleDelete = (sourceId: string) => {
    startTransition(() => {
      setOptimisticSources(sourceId)
    })
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {sources.map((source) => (
        <ScreenshotCard
          key={source.id}
          source={source}
          onDelete={handleDelete}
        />
      ))}
    </div>
  )
}
