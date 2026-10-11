"use client"

import * as React from "react"
import { notify } from "@/lib/notify"
import {
  heartAccountValue,
  heartIntentsNewerThan,
  heartRollbackValue,
  heartSeqSnapshot,
  inflightHeart,
  queueHeartWrites,
  readDreams,
  setDreamLocal,
  takePendingDreams,
  writeDreams,
} from "@/lib/explore/dreams"

/** The device key that records this account's one-time sync of the old device-only hearts. */
export function heartsSyncedKey(userId: string): string {
  return `td:hearts-synced:v1:${userId}`
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
  const inflight = React.useRef(new Map<string, number>())

  const withInflight = React.useCallback((base: Iterable<string>) => {
    const next = new Set(base)
    for (const [id, seq] of inflight.current) {
      const on = inflightHeart(id, seq)
      if (on === null) continue
      if (on) next.add(id)
      else next.delete(id)
    }
    return next
  }, [])

  React.useEffect(() => setHearts(withInflight(heartIds)), [heartIds, withInflight])

  // Read once per mount: the effect below must see the list this page loaded with.
  const initial = React.useRef(heartIds)
  const deviceAtStartRef = React.useRef<Set<string> | null>(null)
  React.useEffect(() => {
    let cancelled = false
    const deviceAtStart = readDreams()
    if (deviceAtStartRef.current === null) deviceAtStartRef.current = deviceAtStart
    const seqAtStart = heartSeqSnapshot()
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
      const off = pending.off
      const offSet = new Set(off)
      const pendingOn = pending.on.filter((id) => !account.has(id))
      const onIds = [...pendingOn]
      if (!synced) {
        const seen = new Set(onIds)
        for (const id of readDreams()) {
          if (!account.has(id) && !offSet.has(id) && !seen.has(id)) onIds.push(id)
        }
      }
      const hadAccount = (id: string) => account.has(id)
      const baseline = (id: string) => hadAccount(id) || deviceAtStart.has(id)
      const onWrite = queueHeartWrites(onIds, true, { baseline, account: hadAccount, requeue: new Set(pendingOn) })
      const offWrite = queueHeartWrites(off, false, { baseline, account: hadAccount, requeue: new Set(off) })
      const floor = new Map(seqAtStart)
      for (const [id, seq] of onWrite.seqs) floor.set(id, Math.max(floor.get(id) ?? 0, seq))
      for (const [id, seq] of offWrite.seqs) floor.set(id, Math.max(floor.get(id) ?? 0, seq))
      const [onResult, offResult] = await Promise.all([onWrite.done, offWrite.done])
      if (!onResult.ok || !offResult.ok) return
      try {
        localStorage.setItem(key, "1")
      } catch {
        /* storage blocked */
      }
      const final = new Set(account)
      for (const id of onResult.applied) final.add(id)
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
      for (const change of heartIntentsNewerThan(floor)) {
        if (change.on) final.add(change.id)
        else final.delete(change.id)
        diverged = true
      }
      writeDreams(final)
      if (!cancelled && (onResult.applied.length || off.length || diverged)) setHearts(withInflight(final))
    })()
    return () => {
      cancelled = true
    }
  }, [userId, withInflight])

  /** Hearts or un-hearts places now, saves in the background, and rolls back on failure. */
  const setMany = React.useCallback(
    async (ids: string[], on: boolean): Promise<boolean> => {
      if (!ids.length) return true
      const had = new Map(ids.map((id) => [id, hearts.has(id)]))
      const write = queueHeartWrites(ids, on, { baseline: (id) => had.get(id) ?? false })
      for (const [id, seq] of write.seqs) inflight.current.set(id, seq)
      for (const id of ids) setDreamLocal(id, on)
      setHearts((prev) => {
        const next = new Set(prev)
        for (const id of ids) {
          if (on) next.add(id)
          else next.delete(id)
        }
        return next
      })
      const owns = (id: string, seq: number) => inflight.current.get(id) === seq
      try {
        const result = await write.done
        if (result.ok) return true
        const revert = new Map<string, { visible: boolean; device: boolean }>()
        let synced = false
        try {
          synced = localStorage.getItem(heartsSyncedKey(userId)) === "1"
        } catch {
          synced = false
        }
        const deviceAtStart = deviceAtStartRef.current
        for (const id of result.rejected) {
          const preserveDevice = !synced && (deviceAtStart?.has(id) ?? false)
          revert.set(id, { visible: heartAccountValue(id), device: heartRollbackValue(id, preserveDevice) })
        }
        if (revert.size) {
          setHearts((prev) => {
            const next = new Set(prev)
            for (const [id, rolled] of revert) {
              if (rolled.visible) next.add(id)
              else next.delete(id)
              setDreamLocal(id, rolled.device)
            }
            return next
          })
          notify.error(on ? "Couldn't save that heart. Try again in a moment." : "Couldn't remove that heart. Try again in a moment.")
        }
        return false
      } finally {
        for (const [id, seq] of write.seqs) if (owns(id, seq)) inflight.current.delete(id)
      }
    },
    [hearts, userId]
  )

  return { hearts, setHearts: setMany }
}
