/**
 * UI Component Adapters - Export Index
 *
 * This file provides convenient exports for all UI adapters.
 *
 * Usage:
 * import { Button, Card, Badge } from "@/components/adapters"
 *
 * Each adapter keeps the v1 component API and picks a tree at render time:
 * `useUiRefreshEnabled()` (server-resolved theme cookie) selects `ui-v2/` for
 * tropical and `ui/` for classic. `ui-v2/` is a newer shadcn generation, not
 * "the tropical theme" — the look itself is CSS custom properties, and plenty
 * of files import `ui-v2/` directly so it renders in classic too. See the
 * "Theming" section of CLAUDE.md.
 */

export * from "./button"
export * from "./card"
export * from "./badge"
export * from "./checkbox"
export * from "./input"
export * from "./label"
export * from "./separator"
export * from "./textarea"
export * from "./switch"
export * from "./dialog"
export * from "./sheet"
export * from "./tooltip"
export * from "./scroll-area"
export * from "./popover"
export * from "./command"
export * from "./select"
