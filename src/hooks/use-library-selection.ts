"use client"

import * as React from "react"

/**
 * Select mode for the Library: an explicit mode, a selection that survives
 * changing filters (so a trip can be gathered from several searches), and
 * shift-click ranges in the order the page reads.
 *
 * `known` is every place on the page before filtering; ids that leave it
 * (archived, deleted) drop out of the selection. `order` is the visible
 * reading order the ranges and "select all" use.
 */
export function useLibrarySelection(known: string[], order: string[]) {
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set())
  const [mode, setMode] = React.useState(false)
  const anchor = React.useRef<string | null>(null)
  const selecting = mode || selected.size > 0

  React.useEffect(() => {
    const live = new Set(known)
    setSelected((prev) => {
      const next = [...prev].filter((id) => live.has(id))
      return next.length === prev.size ? prev : new Set(next)
    })
  }, [known])

  const toggle = React.useCallback(
    (id: string, opts?: { range?: boolean }) => {
      setMode(true)
      // Read the anchor now: the updater runs later, after this call has already moved it.
      const from = anchor.current ? order.indexOf(anchor.current) : -1
      const to = order.indexOf(id)
      setSelected((prev) => {
        const next = new Set(prev)
        if (opts?.range && from >= 0 && to >= 0) {
          // A range always selects: it extends from the last place you clicked.
          const [a, b] = from < to ? [from, to] : [to, from]
          for (const x of order.slice(a, b + 1)) next.add(x)
        } else if (next.has(id)) {
          next.delete(id)
        } else {
          next.add(id)
        }
        return next
      })
      anchor.current = id
    },
    [order]
  )

  const selectAll = React.useCallback(() => {
    setMode(true)
    setSelected((prev) => new Set([...prev, ...order]))
  }, [order])

  const clear = React.useCallback(() => {
    setSelected(new Set())
    setMode(false)
    anchor.current = null
  }, [])

  const remove = React.useCallback((ids: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of ids) next.delete(id)
      return next
    })
  }, [])

  const visibleSelected = React.useMemo(() => order.filter((id) => selected.has(id)).length, [order, selected])

  return { selected, selecting, mode, setMode, toggle, selectAll, clear, remove, visibleSelected }
}
