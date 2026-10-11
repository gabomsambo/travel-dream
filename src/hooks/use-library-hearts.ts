"use client"

import * as React from "react"
import { bindHeartUi, readDreams, seedAccountHearts, visibleHeartIds, writeHearts } from "@/lib/explore/dreams"

/** The device key that records this account's one-time copy of its old device-only hearts. */
export function heartsSyncedKey(userId: string): string {
  return `td:hearts-synced:v1:${userId}`
}

/**
 * Hearts, saved to the account. The account is the source of truth the shelf
 * and the buttons read.
 *
 * On the first Library load on a device, hearts this device kept before they
 * were an account field are copied up once — only ids the account does not
 * already have, and only ever turned on. The device list is kept and marked
 * migrated after that copy succeeds. If the copy fails, the next load tries
 * again. Nothing else is merged.
 *
 * A click toggles at once and sends one save for that place. Another click
 * while the save is in flight keeps only the latest desired state and sends
 * it when the current save finishes. If the save fails, the place returns to
 * the last state the account confirmed and a small error toast is shown.
 */
export function useLibraryHearts({ userId, heartIds }: { userId: string; heartIds: string[] }) {
  const serverRef = React.useRef(heartIds)
  serverRef.current = heartIds
  const [hearts, setHearts] = React.useState(() => visibleHeartIds(heartIds))

  React.useLayoutEffect(() => {
    bindHeartUi(() => setHearts(visibleHeartIds(serverRef.current)))
    return () => bindHeartUi(null)
  }, [])

  React.useLayoutEffect(() => {
    seedAccountHearts(heartIds)
    setHearts(visibleHeartIds(heartIds))
  }, [heartIds])

  React.useLayoutEffect(() => {
    const key = heartsSyncedKey(userId)
    let synced = false
    try {
      synced = localStorage.getItem(key) === "1"
    } catch {
      synced = false
    }
    if (synced) return
    const account = new Set(serverRef.current)
    const toCopy = [...readDreams()].filter((id) => id && !account.has(id))
    void (async () => {
      if (toCopy.length) {
        const result = await writeHearts(toCopy, true, { quiet: true, has: () => false })
        if (!result.httpOk) return
      }
      try {
        localStorage.setItem(key, "1")
      } catch {
        /* storage blocked */
      }
    })()
  }, [userId])

  const setMany = React.useCallback(async (ids: string[], on: boolean): Promise<boolean> => {
    if (!ids.length) return true
    const result = await writeHearts(ids, on, { has: (id) => serverRef.current.includes(id) })
    return result.ok
  }, [])

  return { hearts, setHearts: setMany }
}
