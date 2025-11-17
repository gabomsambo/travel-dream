"use client"

import * as React from "react"
import { Archive, Trash2, Keyboard, FolderPlus } from "lucide-react"
import { Button } from "@/components/adapters/button"
import { Badge } from "@/components/adapters/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/adapters/tooltip"
import { cn } from "@/lib/utils"

export interface LibraryToolbarProps {
  selectedCount: number
  totalCount: number
  isAllSelected?: boolean
  isSomeSelected?: boolean

  onArchiveSelected?: () => void
  onDeleteSelected?: () => void
  onAddToCollectionSelected?: () => void
  onSelectAll?: () => void
  onSelectNone?: () => void

  showKeyboardHints?: boolean
  onToggleKeyboardHints?: () => void
  disabled?: boolean
  loading?: boolean

  className?: string
}

export function LibraryToolbar({
  selectedCount,
  totalCount,
  isAllSelected = false,
  isSomeSelected = false,
  onArchiveSelected,
  onDeleteSelected,
  onAddToCollectionSelected,
  onSelectAll,
  onSelectNone,
  showKeyboardHints = false,
  onToggleKeyboardHints,
  disabled = false,
  loading = false,
  className
}: LibraryToolbarProps) {
  const hasSelection = selectedCount > 0

  return (
    <div className={cn("flex items-center justify-between gap-4 p-4 border-b bg-background/95 backdrop-blur", className)}>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {hasSelection ? (
            <Badge variant="secondary" className="px-3 py-1">
              {selectedCount} {selectedCount === 1 ? 'item' : 'items'} selected
            </Badge>
          ) : (
            <span className="text-sm text-muted-foreground">
              {totalCount} {totalCount === 1 ? 'item' : 'items'}
            </span>
          )}

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={isAllSelected ? onSelectNone : onSelectAll}
                  disabled={disabled || totalCount === 0}
                  className="h-8"
                >
                  {isAllSelected ? "None" : isSomeSelected ? "All" : "All"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isAllSelected ? "Deselect all items" : "Select all items"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {hasSelection && (
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onArchiveSelected}
                    disabled={disabled || loading}
                    className="h-8"
                  >
                    <Archive className="mr-1 h-3 w-3" />
                    Archive ({selectedCount})
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Move selected items to archive (Shortcut: A)
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onAddToCollectionSelected}
                    disabled={disabled || loading}
                    className="h-8"
                  >
                    <FolderPlus className="mr-1 h-3 w-3" />
                    Add to Collection
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Add selected items to a collection
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onDeleteSelected}
                    disabled={disabled || loading}
                    className="h-8 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    Delete
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Delete selected items (Shortcut: D)
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleKeyboardHints}
                className={cn(
                  "h-8 px-2",
                  showKeyboardHints && "bg-accent text-accent-foreground"
                )}
              >
                <Keyboard className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <div className="space-y-1">
                <div className="font-medium">Keyboard Shortcuts</div>
                <div className="text-xs space-y-0.5">
                  <div>j/k - Navigate up/down</div>
                  <div>a - Archive selected</div>
                  <div>d - Delete selected</div>
                  <div>Space - Toggle selection</div>
                  <div>Cmd/Ctrl+A - Select all</div>
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  )
}

export default LibraryToolbar
