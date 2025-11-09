"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/adapters/dialog"
import { Separator } from "@/components/adapters/separator"
import { Kbd } from "@/components/ui/kbd"

interface KeyboardShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function KeyboardShortcutsDialog({
  open,
  onOpenChange
}: KeyboardShortcutsDialogProps) {
  const shortcuts = {
    'Navigation': [
      { key: ['Cmd', 'I'], description: 'Go to Inbox' },
      { key: ['Cmd', 'L'], description: 'Go to Library' },
      { key: ['Cmd', 'C'], description: 'Go to Collections' },
      { key: ['Cmd', 'K'], description: 'Open Command Palette' },
    ],
    'Inbox Actions': [
      { key: ['J'], description: 'Navigate down' },
      { key: ['K'], description: 'Navigate up' },
      { key: ['C'], description: 'Confirm current item' },
      { key: ['X'], description: 'Archive current item' },
      { key: ['E'], description: 'Edit current item' },
      { key: ['Space'], description: 'Toggle selection' },
      { key: ['Shift', 'C'], description: 'Confirm selected items' },
      { key: ['Shift', 'X'], description: 'Archive selected items' },
      { key: ['?'], description: 'Show keyboard help' },
    ],
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Navigate and manage your travel collection faster with keyboard shortcuts
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {Object.entries(shortcuts).map(([category, items]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold mb-3">{category}</h3>
              <div className="space-y-2">
                {items.map((shortcut, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between py-2"
                  >
                    <span className="text-sm text-muted-foreground">
                      {shortcut.description}
                    </span>
                    <div className="flex gap-1">
                      {shortcut.key.map((k, i) => (
                        <Kbd key={i}>{k}</Kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {category !== Object.keys(shortcuts)[Object.keys(shortcuts).length - 1] && (
                <Separator className="mt-4" />
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
