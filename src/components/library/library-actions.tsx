"use client"

import * as React from "react"
import type { LibraryItem } from "@/lib/library/types"

/** How a click reached a place: shift extends a range while selecting. */
export interface ActivateOptions {
  shiftKey?: boolean
}

/**
 * What a place on the Library page can do, provided once by `LibraryClient` so
 * tiles, journal entries, list rows and map rows stay presentational.
 */
export interface LibraryActions {
  hearts: Set<string>
  toggleHeart: (id: string) => void
  selected: Set<string>
  /** True while anything is selected or Select is switched on: clicks then toggle. */
  selecting: boolean
  toggleSelect: (id: string, opts?: ActivateOptions) => void
  /** Turns selection on with this place in it (the ⋯ menu's "Select", a long press). */
  select: (id: string) => void
  /** A click on a place: quick look normally, toggle (or extend a range) while selecting. */
  activate: (id: string, siblings: string[], opts?: ActivateOptions) => void
  openPlace: (id: string, siblings: string[]) => void
  archive: (ids: string[]) => void
  remove: (ids: string[]) => void
  addToCollection: (ids: string[]) => void
  findImage: (item: LibraryItem) => void
}

export const LibraryActionsContext = React.createContext<LibraryActions | null>(null)

export function useLibraryActions(): LibraryActions {
  const ctx = React.useContext(LibraryActionsContext)
  if (!ctx) throw new Error("useLibraryActions must be used inside <LibraryActionsContext.Provider>")
  return ctx
}

/**
 * Long-press to start selecting, on touch screens: 450 ms without moving, a
 * short vibration where supported, and the click that follows the press is
 * swallowed so it doesn't toggle the place straight back off.
 */
export function useLongPress(onLongPress: () => void, enabled: boolean) {
  const timer = React.useRef<number | null>(null)
  const start = React.useRef<{ x: number; y: number } | null>(null)
  const fired = React.useRef(false)
  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }
  React.useEffect(() => cancel, [])
  // The handlers stay attached when disabled: the press itself turns selecting on,
  // and the click that follows it must still be swallowed.
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (!enabled || e.pointerType !== "touch") return
      fired.current = false
      start.current = { x: e.clientX, y: e.clientY }
      cancel()
      timer.current = window.setTimeout(() => {
        fired.current = true
        try {
          navigator.vibrate?.(12)
        } catch {
          /* not supported */
        }
        onLongPress()
      }, 450)
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!start.current) return
      if (Math.abs(e.clientX - start.current.x) > 8 || Math.abs(e.clientY - start.current.y) > 8) cancel()
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onClickCapture: (e: React.MouseEvent) => {
      if (fired.current) {
        fired.current = false
        e.preventDefault()
        e.stopPropagation()
      }
    },
    onContextMenu: (e: React.MouseEvent) => {
      // The browser's own long-press menu would cover the selection we just started.
      if (fired.current || timer.current !== null) e.preventDefault()
    },
  }
}
