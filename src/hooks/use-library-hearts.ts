"use client"

import * as React from "react"
import { notify } from "@/lib/notify"
import {
  readDreams, requeueDreams, saveDreams, setDreamLocal, takePendingDreams, writeDreams,
} from "@/lib/explore/dreams"

/** The device key that records this account's one-time sync of the old device-only hearts. */
export function heartsSyncedKey(userId: string): string {
  return `td:hearts-synced:v1:${userId}`
}

const BATCH = 500

async function saveAll(ids: string[], on: boolean): Promise<string[]> {
  const batches: Promise<string[]>[] = []
  for (let i = 0; i < ids.length; i += BATCH) batches.push(saveDreams(ids.slice(i, i + BATCH), on))
  return (await Promise.all(batches)).flat()
}

/**
 * Hearts, saved to the account.
 *
 * On the first Library load on a device, the hearts this device kept before
 * they were an account field are sent up once. The server keeps only the
 * caller's own places and ignores repeats, so a retry or a second tab is
 * harmless, and the device copy is never cleared before the account has them.
 * After that sync the account is the truth: its hearts are mirrored onto the
 * device for Shuffle, after replaying any heart a dropped request left queued.
 */
export function useLibraryHearts({ userId, heartIds }: { userId: string; heartIds: string[] }) {
  const [hearts, setHearts] = React.useState<Set<string>>(() => new Set(heartIds))
  // Optimistic changes still on their way to the server, so a refresh that
  // lands mid-save doesn't flip a heart back for a moment.
  const inflight = React.useRef(new Map<string, { on: boolean; ticket: number; committed: boolean }>())
  const tickets = React.useRef(0)
  const toggledDuringSync = React.useRef<Map<string, boolean> | null>(null)

  const withInflight = React.useCallback((base: Iterable<string>) => {
    const next = new Set(base)
    for (const [id, v] of inflight.current) {
      if (v.on) next.add(id)
      else next.delete(id)
    }
    return next
  }, [])

  React.useEffect(() => setHearts(withInflight(heartIds)), [heartIds, withInflight])

  // Read once per mount: the effect below must see the list this page loaded with.
  const initial = React.useRef(heartIds)
  React.useEffect(() => {
    let cancelled = false
    const deviceAtStart = readDreams()
    const toggled = new Map<string, boolean>()
    toggledDuringSync.current = toggled
    void (async () => {
      const key = heartsSyncedKey(userId)
      let synced = false
      try {
        synced = localStorage.getItem(key) === "1"
      } catch {
        /* storage blocked: treat as not synced; the server dedupes */
      }
      const account = new Set(initial.current)
      const pending = takePendingDreams()
      const off = new Set(pending.off)
      const on = new Set(pending.on.filter((id) => !account.has(id)))
      if (!synced) for (const id of readDreams()) if (!account.has(id) && !off.has(id)) on.add(id)

      let added: string[] = []
      const onPromise = on.size ? saveAll([...on], true) : Promise.resolve([] as string[])
      const offPromise = off.size ? saveAll([...off], false) : Promise.resolve([] as string[])
      try {
        added = await onPromise
        await offPromise
        try {
          localStorage.setItem(key, "1")
        } catch {
          /* storage blocked */
        }
      } catch {
        // Nothing is lost: the device copy is untouched and the queue is put back.
        await Promise.allSettled([onPromise, offPromise])
        requeueDreams(pending.on, true)
        requeueDreams(pending.off, false)
        return
      }
      const final = new Set(account)
      for (const id of added) final.add(id)
      for (const id of off) final.delete(id)
      const deviceNow = readDreams()
      let diverged = false
      for (const id of deviceNow) {
        if (!deviceAtStart.has(id)) {
          final.add(id)
          diverged = true
        }
      }
      for (const id of deviceAtStart) {
        if (!deviceNow.has(id)) {
          final.delete(id)
          diverged = true
        }
      }
      for (const [id, heartOn] of toggled) {
        if (heartOn) final.add(id)
        else final.delete(id)
        diverged = true
      }
      writeDreams(final)
      if (toggledDuringSync.current === toggled) toggledDuringSync.current = null
      if (!cancelled && (added.length || off.size || diverged)) setHearts(withInflight(final))
    })()
    return () => {
      cancelled = true
      if (toggledDuringSync.current === toggled) toggledDuringSync.current = null
    }
  }, [userId, withInflight])

  /** Hearts or un-hearts places now, saves in the background, and rolls back on failure. */
  const setMany = React.useCallback(
    async (ids: string[], on: boolean): Promise<boolean> => {
      if (!ids.length) return true
      const ticket = ++tickets.current
      for (const id of ids) {
        const existing = inflight.current.get(id)
        const committed = existing ? existing.committed : hearts.has(id)
        inflight.current.set(id, { on, ticket, committed })
        setDreamLocal(id, on)
        toggledDuringSync.current?.set(id, on)
      }
      setHearts((prev) => {
        const next = new Set(prev)
        for (const id of ids) {
          if (on) next.add(id)
          else next.delete(id)
        }
        return next
      })
      const owns = (id: string) => inflight.current.get(id)?.ticket === ticket
      try {
        await saveAll(ids, on)
        for (const id of ids) {
          const current = inflight.current.get(id)
          if (current && current.ticket !== ticket) current.committed = on
        }
        return true
      } catch {
        const revert = new Map<string, boolean>()
        for (const id of ids) {
          const entry = inflight.current.get(id)
          if (entry?.ticket === ticket) revert.set(id, entry.committed)
        }
        if (revert.size) {
          setHearts((prev) => {
            const next = new Set(prev)
            for (const [id, was] of revert) {
              if (was) next.add(id)
              else next.delete(id)
              setDreamLocal(id, was)
              toggledDuringSync.current?.set(id, was)
            }
            return next
          })
          notify.error(on ? "Couldn't save that heart. Try again in a moment." : "Couldn't remove that heart. Try again in a moment.")
        }
        return false
      } finally {
        for (const id of ids) if (owns(id)) inflight.current.delete(id)
      }
    },
    [hearts]
  )

  return { hearts, setHearts: setMany }
}
