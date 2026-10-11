"use client"

import { LibrarySheet } from "./library-sheet"

/** Every shortcut listed here is handled in `LibraryClient`'s key handler — none is aspirational. */
export const SHORTCUTS: Array<{ keys: string[]; label: string; group: string }> = [
  { group: "Find", keys: ["/"], label: "Search your library" },
  { group: "Find", keys: ["⌘", "K"], label: "Search (press again for the app's command palette)" },
  { group: "Find", keys: ["↑", "↓", "↵"], label: "Move through results, open the quick look" },
  { group: "Find", keys: ["f"], label: "Open the filters" },
  { group: "Move", keys: ["j"], label: "Next place" },
  { group: "Move", keys: ["k"], label: "Previous place" },
  { group: "Move", keys: ["↵"], label: "Quick look the focused place" },
  { group: "Select", keys: ["s"], label: "Select mode on or off" },
  { group: "Select", keys: ["x"], label: "Select the focused place (Space works too)" },
  { group: "Select", keys: ["⇧", "click"], label: "Select a range" },
  { group: "Select", keys: ["⌘", "A"], label: "Select everything shown" },
  { group: "Select", keys: ["Esc"], label: "Clear the selection" },
  { group: "With a selection", keys: ["c"], label: "Add to collection" },
  { group: "With a selection", keys: ["h"], label: "Heart / remove hearts" },
  { group: "With a selection", keys: ["e"], label: "Export as CSV" },
  { group: "With a selection", keys: ["a"], label: "Archive (with undo)" },
  { group: "With a selection", keys: ["d"], label: "Delete (asks first)" },
  { group: "Help", keys: ["?"], label: "This list" },
]

export function LibraryShortcuts({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const groups = [...new Set(SHORTCUTS.map((s) => s.group))]
  return (
    <LibrarySheet open={open} onOpenChange={onOpenChange} title="Keyboard shortcuts" description="Anywhere on the Library page, outside a text field.">
      <div className="grid gap-5 px-5 pb-6 sm:grid-cols-2">
        {groups.map((g) => (
          <section key={g}>
            <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{g}</h3>
            <dl className="space-y-1.5">
              {SHORTCUTS.filter((s) => s.group === g).map((s) => (
                <div key={s.label} className="flex items-start gap-3 text-sm">
                  <dt className="flex shrink-0 gap-1">
                    {s.keys.map((k) => (
                      <kbd key={k} className="min-w-[22px] rounded-md border bg-secondary px-1.5 py-0.5 text-center font-sans text-[11px]">
                        {k}
                      </kbd>
                    ))}
                  </dt>
                  <dd className="text-muted-foreground">{s.label}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </LibrarySheet>
  )
}
