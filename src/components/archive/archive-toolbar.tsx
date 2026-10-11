"use client"

import * as React from "react"
import { RotateCcw, Trash2, Download, FileText, FileSpreadsheet, Loader2, Keyboard } from "lucide-react"
import { Button } from "@/components/adapters/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/adapters/dropdown-menu"
import { Badge } from "@/components/adapters/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/adapters/tooltip"
import { cn } from "@/lib/utils"

/** Shortcuts this page actually handles. The tooltip must not promise more. */
export const ARCHIVE_SHORTCUTS = [
  "r — Restore the selection",
  "d — Delete the selection",
  "Cmd/Ctrl+A — Select all shown",
  "Esc — Clear the selection",
] as const

export interface ArchiveToolbarProps {
  selectedCount: number
  totalCount: number
  isAllSelected?: boolean
  isSomeSelected?: boolean

  onRestoreSelected?: () => void
  onDeleteSelected?: () => void
  onExportSelected?: (format: 'csv' | 'xlsx' | 'pdf') => void
  onSelectAll?: () => void
  onSelectNone?: () => void
  isExporting?: boolean

  showKeyboardHints?: boolean
  onToggleKeyboardHints?: () => void
  disabled?: boolean
  loading?: boolean

  className?: string
}

export function ArchiveToolbar({
  selectedCount,
  totalCount,
  isAllSelected = false,
  isSomeSelected = false,
  onRestoreSelected,
  onDeleteSelected,
  onExportSelected,
  onSelectAll,
  onSelectNone,
  isExporting = false,
  showKeyboardHints = false,
  onToggleKeyboardHints,
  disabled = false,
  loading = false,
  className
}: ArchiveToolbarProps) {
  const hasSelection = selectedCount > 0

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-2 p-3 border-b bg-background/95 backdrop-blur sm:gap-4 sm:p-4", className)}>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {hasSelection ? (
            <Badge variant="secondary" className="px-3 py-1">
              {selectedCount} {selectedCount === 1 ? 'item' : 'items'} selected
            </Badge>
          ) : (
            <span className="text-sm text-muted-foreground">
              {totalCount} {totalCount === 1 ? 'item' : 'items'} archived
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
                  {isAllSelected ? "None" : isSomeSelected ? "All remaining" : "All"}
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
                    variant="default"
                    size="sm"
                    onClick={onRestoreSelected}
                    disabled={disabled || loading}
                    className="h-8 bg-green-600 hover:bg-green-700 text-white"
                  >
                    <RotateCcw className="mr-1 h-3 w-3" />
                    Restore to Library ({selectedCount})
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Restore the selection to the library (r)
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={onDeleteSelected}
                    disabled={disabled || loading}
                    className="h-8"
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    Permanently Delete ({selectedCount})
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Permanently delete the selection (d)
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={disabled || loading || isExporting}
                  className="h-8"
                >
                  {isExporting ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="mr-1 h-3 w-3" />
                  )}
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onExportSelected?.('csv')}>
                  <FileText className="h-4 w-4 mr-2" />
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onExportSelected?.('xlsx')}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Export as Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onExportSelected?.('pdf')}>
                  <FileText className="h-4 w-4 mr-2" />
                  Export as PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
                aria-label="Keyboard shortcuts"
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
                  {ARCHIVE_SHORTCUTS.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  )
}

export default ArchiveToolbar
