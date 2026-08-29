"use client"

import { useEffect, useState } from "react"
import { LEGACY_UI_REFRESH_KEY } from "@/lib/ui-theme"

/**
 * Retired localStorage feature-flag path.
 *
 * This used to be how the tropical theme was selected: every adapter called
 * `useUIRefresh()` after hydration, which is what caused the flash of the wrong
 * theme on first paint. The theme is now a cookie resolved on the server — see
 * `src/lib/ui-theme.ts` and the "Theming" section of CLAUDE.md.
 *
 * This module is retired and unreferenced: nothing the app renders imports it,
 * and it is *not* part of the migration path — `UIRefreshProvider` reads
 * `LEGACY_UI_REFRESH_KEY` from `ui-theme.ts` directly. It is kept deliberately,
 * by owner decision, rather than because anything depends on it.
 *
 * The key is imported from `ui-theme.ts` so there is exactly one spelling of
 * it; the import only ever goes in that direction, because `ui-theme.ts` is
 * server-safe and this is a client module. Do not reintroduce this as a theme
 * source.
 */

const FEATURE_FLAG_KEYS = {
  UI_REFRESH: LEGACY_UI_REFRESH_KEY,
} as const

type FeatureFlagKey = keyof typeof FEATURE_FLAG_KEYS

/**
 * Get feature flag value from localStorage
 */
function getFeatureFlag(key: FeatureFlagKey): boolean {
  if (typeof window === "undefined") return false

  try {
    const stored = localStorage.getItem(FEATURE_FLAG_KEYS[key])
    return stored === "true"
  } catch {
    return false
  }
}

/**
 * Set feature flag value in localStorage
 */
function setFeatureFlag(key: FeatureFlagKey, enabled: boolean): void {
  if (typeof window === "undefined") return

  try {
    localStorage.setItem(FEATURE_FLAG_KEYS[key], enabled.toString())
  } catch {
    // localStorage may be unavailable in some environments
  }
}

/**
 * Hook: UI Refresh Feature Flag (retired)
 *
 * Returns [isEnabled, toggle] for the legacy localStorage flag. It reads
 * nothing the app renders from, so it can disagree with the active theme.
 *
 * To branch on the current theme, use `useUiRefreshEnabled()` (or
 * `useUiTheme()`) from `@/components/ui-refresh-provider` instead — those are
 * seeded from the server-resolved cookie and are correct on the first render.
 */
export function useUIRefresh(): [boolean, () => void] {
  const [enabled, setEnabled] = useState<boolean>(false)

  useEffect(() => {
    setEnabled(getFeatureFlag("UI_REFRESH"))

    const handleChange = (e: CustomEvent) => {
      setEnabled(e.detail.enabled)
    }

    window.addEventListener("ui-refresh-changed", handleChange as EventListener)
    return () => window.removeEventListener("ui-refresh-changed", handleChange as EventListener)
  }, [])

  const toggle = () => {
    const newValue = !enabled
    setUIRefreshEnabled(newValue)
  }

  return [enabled, toggle]
}

/**
 * Get the legacy flag (non-reactive). Browser-only — always false on the
 * server, which is why the theme moved to a cookie.
 */
export function getUIRefreshEnabled(): boolean {
  return getFeatureFlag("UI_REFRESH")
}

/**
 * Set UI Refresh state programmatically
 */
export function setUIRefreshEnabled(enabled: boolean): void {
  setFeatureFlag("UI_REFRESH", enabled)

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("ui-refresh-changed", { detail: { enabled } })
    )

    if (typeof (window as any).gtag === "function") {
      (window as any).gtag("event", enabled ? "theme_enabled" : "theme_disabled", {
        event_category: "UI",
        event_label: "Tropical Boutique Theme",
        theme_name: "tropical_boutique",
        timestamp: Date.now()
      })
    }

    if (typeof (window as any).analytics === "object" && (window as any).analytics?.track) {
      (window as any).analytics.track(enabled ? "Theme Enabled" : "Theme Disabled", {
        theme: "tropical_boutique",
        source: "settings_toggle",
        timestamp: Date.now()
      })
    }

    console.log(`[Analytics] Theme ${enabled ? "enabled" : "disabled"}: tropical_boutique`)
  }
}
