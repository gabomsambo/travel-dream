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
 *
 * This is what the page hands to `LibraryActionsProvider`, rebuilt whenever
 * hearts or the selection change. Places never read it directly: they get the
 * stable functions from `useLibraryActions` and subscribe to their own heart
 * and selection state, so one heart re-renders one tile, not the screen.
 */
export interface LibraryActions {
  hearts: ReadonlySet<string>
  toggleHeart: (id: string) => void
  selected: ReadonlySet<string>
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

/** The part of `LibraryActions` that does things; its identity never changes. */
export type LibraryActionFns = Omit<LibraryActions, "hearts" | "selected" | "selecting">

/** The part that places subscribe to, one id at a time. */
export interface LibraryLiveState {
  hearts: ReadonlySet<string>
  selected: ReadonlySet<string>
  selecting: boolean
}

export interface LibraryLive {
  get: () => LibraryLiveState
  set: (next: LibraryLiveState) => void
  subscribe: (listener: () => void) => () => void
}

export function createLibraryLive(initial: LibraryLiveState): LibraryLive {
  let snapshot = initial
  const listeners = new Set<() => void>()
  return {
    get: () => snapshot,
    set: (next) => {
      if (next.hearts === snapshot.hearts && next.selected === snapshot.selected && next.selecting === snapshot.selecting) return
      snapshot = next
      listeners.forEach((listener) => listener())
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

interface LibraryActionsContextValue {
  fns: LibraryActionFns
  live: LibraryLive
}

const LibraryActionsContext = React.createContext<LibraryActionsContextValue | null>(null)

// A layout effect on the client; the server renders once and never runs either.
const useCommitEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect

/**
 * Publishes `value` to the places beneath it without re-rendering them when it
 * changes. The functions are a fixed facade over the latest `value`; hearts and
 * selection reach places through a store they subscribe to by id.
 */
export function LibraryActionsProvider({ value, children }: { value: LibraryActions; children: React.ReactNode }) {
  const latest = React.useRef(value)
  const [ctx] = React.useState<LibraryActionsContextValue>(() => ({
    fns: {
      toggleHeart: (id) => latest.current.toggleHeart(id),
      toggleSelect: (id, opts) => latest.current.toggleSelect(id, opts),
      select: (id) => latest.current.select(id),
      activate: (id, siblings, opts) => latest.current.activate(id, siblings, opts),
      openPlace: (id, siblings) => latest.current.openPlace(id, siblings),
      archive: (ids) => latest.current.archive(ids),
      remove: (ids) => latest.current.remove(ids),
      addToCollection: (ids) => latest.current.addToCollection(ids),
      findImage: (item) => latest.current.findImage(item),
    },
    live: createLibraryLive({ hearts: value.hearts, selected: value.selected, selecting: value.selecting }),
  }))
  // After commit, never during render: a render that is thrown away must not leak into the store.
  useCommitEffect(() => {
    latest.current = value
    ctx.live.set({ hearts: value.hearts, selected: value.selected, selecting: value.selecting })
  })
  return <LibraryActionsContext.Provider value={ctx}>{children}</LibraryActionsContext.Provider>
}

function useLibraryContext(): LibraryActionsContextValue {
  const ctx = React.useContext(LibraryActionsContext)
  if (!ctx) throw new Error("Library places must be rendered inside <LibraryActionsProvider>")
  return ctx
}

/** What a place can do. Never changes identity, so reading it never re-renders. */
export function useLibraryActions(): LibraryActionFns {
  return useLibraryContext().fns
}

/** Re-renders only when this selector's (primitive) result changes. */
function useLibraryLive<T extends boolean>(select: (s: LibraryLiveState) => T): T {
  const { live } = useLibraryContext()
  const read = () => select(live.get())
  return React.useSyncExternalStore(live.subscribe, read, read)
}

export function useIsHearted(id: string): boolean {
  return useLibraryLive((s) => s.hearts.has(id))
}

export function useIsSelected(id: string): boolean {
  return useLibraryLive((s) => s.selected.has(id))
}

/** True while Select mode is on or anything is selected. */
export function useIsSelecting(): boolean {
  return useLibraryLive((s) => s.selecting)
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
