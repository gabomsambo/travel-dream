"use client"

import { useEffect, useState } from "react"

/**
 * Feature Flags System
 *
 * Manages feature toggles with localStorage persistence.
 * Currently supports:
 * - UI Refresh (Tropical Boutique Explorer theme)
 */

const FEATURE_FLAG_KEYS = {
  UI_REFRESH: "ui-refresh-enabled",
} as const

type FeatureFlagKey = keyof typeof FEATURE_FLAG_KEYS

/**
 * Get feature flag value from localStorage
 */
function getFeatureFlag(key: FeatureFlagKey): boolean {
  if (typeof window === "undefined") return false

  const stored = localStorage.getItem(FEATURE_FLAG_KEYS[key])
  return stored === "true"
}

/**
 * Set feature flag value in localStorage
 */
function setFeatureFlag(key: FeatureFlagKey, enabled: boolean): void {
  if (typeof window === "undefined") return

  localStorage.setItem(FEATURE_FLAG_KEYS[key], enabled.toString())
}

/**
 * Hook: UI Refresh Feature Flag
 *
 * Returns [isEnabled, toggle] for the UI refresh feature.
 * Persists to localStorage and triggers re-render on change.
 *
 * Usage:
 * ```tsx
 * const [uiRefreshEnabled, toggleUIRefresh] = useUIRefresh()
 *
 * if (uiRefreshEnabled) {
 *   return <Button /> // uses adapter → ui-v2
 * } else {
 *   return <ButtonOld /> // uses ui (old)
 * }
 * ```
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
 * Get UI Refresh state (non-reactive)
 *
 * Use this for conditional imports or server-side checks.
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
