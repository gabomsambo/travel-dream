"use client"

import { useState, useEffect, useCallback } from 'react'

interface ViewportState {
  longitude: number
  latitude: number
  zoom: number
}

const DEFAULT_VIEWPORT: ViewportState = {
  longitude: 0,
  latitude: 20,
  zoom: 3
}

function getStorageKey(collectionId: string | null): string {
  return `map-viewport-${collectionId || 'all'}`
}

export function useMapViewport(collectionId: string | null) {
  const [viewport, setViewport] = useState<ViewportState>(DEFAULT_VIEWPORT)

  useEffect(() => {
    const key = getStorageKey(collectionId)
    const stored = localStorage.getItem(key)

    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        setViewport(parsed)
      } catch {
        setViewport(DEFAULT_VIEWPORT)
      }
    } else {
      setViewport(DEFAULT_VIEWPORT)
    }
  }, [collectionId])

  const saveViewport = useCallback((newViewport: ViewportState) => {
    const key = getStorageKey(collectionId)
    setViewport(newViewport)
    localStorage.setItem(key, JSON.stringify(newViewport))
  }, [collectionId])

  return {
    viewport,
    saveViewport
  }
}
