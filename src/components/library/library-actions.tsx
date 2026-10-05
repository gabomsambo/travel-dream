"use client"

import * as React from "react"
import type { LibraryItem } from "@/lib/library/types"

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
  toggleSelect: (id: string) => void
  /** Turns selection on with this place in it (the ⋯ menu's "Select"). */
  select: (id: string) => void
  /** A click on a place: quick look normally, toggle while selecting. */
  activate: (id: string, siblings: string[]) => void
  openPlace: (id: string, siblings: string[]) => void
  archive: (ids: string[]) => void
  remove: (ids: string[]) => void
  findImage: (item: LibraryItem) => void
}

export const LibraryActionsContext = React.createContext<LibraryActions | null>(null)

export function useLibraryActions(): LibraryActions {
  const ctx = React.useContext(LibraryActionsContext)
  if (!ctx) throw new Error("useLibraryActions must be used inside <LibraryActionsContext.Provider>")
  return ctx
}
