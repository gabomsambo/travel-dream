'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { useNavigationHotkeys } from '@/hooks/use-hotkeys'

const CommandPalette = dynamic(
  () => import('@/components/search/command-palette').then(mod => ({ default: mod.CommandPalette })),
  { ssr: false }
)

export function GlobalHotkeys() {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  useNavigationHotkeys(() => setCommandPaletteOpen(true))

  if (!commandPaletteOpen) return null

  return (
    <CommandPalette
      open={commandPaletteOpen}
      onOpenChange={setCommandPaletteOpen}
    />
  )
}
