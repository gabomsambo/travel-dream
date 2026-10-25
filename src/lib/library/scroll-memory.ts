/**
 * Remembers where the Library was scrolled, per URL, so Back from a place page
 * lands on the same chapter. The (app) shell scrolls inside <main>, which the
 * browser's own scroll restoration never sees. Restoring only follows a Back or
 * Forward, never a fresh visit through the sidebar.
 */

const PREFIX = "td:library-scroll:v1:"

export interface ScrollMemory {
  /** The row at the top of the screen; survives rows above it changing height. */
  rowKey: string
  /** Fallback when that row no longer exists. */
  top: number
}

// A Back or Forward is a `popstate`; the next click on a link or button starts a fresh visit instead.
let byHistory = false
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    byHistory = true
  })
  window.addEventListener("click", () => {
    byHistory = false
  }, true)
}

/** Whether the page being mounted was reached by Back or Forward. Asking uses it up. */
export function takeArrivalByHistory(): boolean {
  const was = byHistory
  byHistory = false
  return was
}

export function rememberScroll(url: string, memory: ScrollMemory) {
  try {
    window.sessionStorage.setItem(PREFIX + url, JSON.stringify(memory))
  } catch {
    // Private mode or a full quota: Back just lands at the top, as before.
  }
}

export function forgetScroll(url: string) {
  try {
    window.sessionStorage.removeItem(PREFIX + url)
  } catch {
    // Nothing stored that we could read back either.
  }
}

export function recallScroll(url: string): ScrollMemory | null {
  try {
    const raw = window.sessionStorage.getItem(PREFIX + url)
    if (!raw) return null
    const m = JSON.parse(raw) as Partial<ScrollMemory>
    return typeof m.rowKey === "string" && typeof m.top === "number" ? { rowKey: m.rowKey, top: m.top } : null
  } catch {
    return null
  }
}
