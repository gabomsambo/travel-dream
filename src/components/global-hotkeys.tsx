'use client'

import { useState } from 'react'
import { useNavigationHotkeys } from '@/hooks/use-hotkeys'
import { CommandPalette } from '@/components/search/command-palette'

export function GlobalHotkeys() {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  useNavigationHotkeys(() => setCommandPaletteOpen(true))

  return (
    <CommandPalette 
      open={commandPaletteOpen} 
      onOpenChange={setCommandPaletteOpen} 
    />
  )
}
