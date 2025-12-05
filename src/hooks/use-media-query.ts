"use client"

import { useState, useEffect } from 'react'

export function useMediaQuery(query: string, defaultValue = false): boolean {
  const [matches, setMatches] = useState(defaultValue)

  useEffect(() => {
    const mediaQuery = window.matchMedia(query)
    setMatches(mediaQuery.matches)

    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches)
    }

    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [query])

  return matches
}

export function useIsDesktop(): boolean {
  // Default to true (desktop) to match common SSR expectations
  return useMediaQuery('(min-width: 1024px)', true)
}
