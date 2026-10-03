import { cn } from "@/lib/utils"
import { kindIcon } from "./kind-icon"

// A deterministic duotone per place, so a missing photo reads as a deliberate
// poster rather than a hole. Hues are picked for white text at 4.5:1.
const PALETTES = [
  "from-teal-700 to-cyan-900",
  "from-orange-600 to-rose-800",
  "from-indigo-700 to-slate-900",
  "from-emerald-700 to-teal-950",
  "from-amber-600 to-orange-900",
  "from-fuchsia-700 to-indigo-900",
]

function hash(s: string): number {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}

export function FallbackArt({ name, kind, className }: { name: string; kind: string; className?: string }) {
  const Icon = kindIcon(kind)
  return (
    <div
      className={cn(
        "absolute inset-0 flex items-center justify-center overflow-hidden bg-gradient-to-br",
        PALETTES[hash(name) % PALETTES.length],
        className
      )}
      aria-hidden
    >
      <Icon className="h-1/3 w-1/3 max-h-24 max-w-24 -translate-y-1/4 text-white/25" strokeWidth={1.25} />
    </div>
  )
}
