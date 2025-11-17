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

export interface ArchiveToolbarProps {
  selectedCount: number
  totalCount: number
  isAllSelected?: boolean
  isSomeSelected?: boolean

  onRestoreSelected?: () => void
  onDeleteSelected?: () => void
  onExportSelected?: (format: 'csv' | 'xlsx') => void
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
    <div className={cn("flex items-center justify-between gap-4 p-4 border-b bg-background/95 backdrop-blur", className)}>
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
                  Move selected items back to library (Shortcut: R)
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
                  Permanently delete selected items from database (Shortcut: D)
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
                  <div>r - Restore current item</div>
                  <div>R - Restore all selected</div>
                  <div>d - Delete current item</div>
                  <div>D - Delete all selected</div>
                  <div>Space - Toggle selection</div>
                  <div>Cmd/Ctrl+A - Select all</div>
                  <div>Cmd+Shift+A - Go to archive</div>
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
