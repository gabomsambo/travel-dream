"use client"

import * as React from "react"
import { Check, X, Archive, Filter, Keyboard, ChevronDown, Download, FileText, FileSpreadsheet, Loader2, MoreHorizontal } from "lucide-react"
import { Button } from "@/components/adapters/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/adapters/dropdown-menu"
import { Badge } from "@/components/adapters/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/adapters/select"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/adapters/tooltip"
import { cn } from "@/lib/utils"

export type ConfidenceFilter = "all" | "high" | "medium" | "low" | "very-low"

export interface InboxToolbarProps {
  // Selection state
  selectedCount: number
  totalCount: number
  isAllSelected?: boolean
  isSomeSelected?: boolean

  // Actions
  onConfirmSelected?: () => void
  onArchiveSelected?: () => void
  onExportSelected?: (format: 'csv' | 'xlsx') => void
  onSelectAll?: () => void
  onSelectNone?: () => void
  isExporting?: boolean

  // Filters
  confidenceFilter: ConfidenceFilter
  onConfidenceFilterChange: (filter: ConfidenceFilter) => void

  // Confidence-based selection
  onSelectHighConfidence?: () => void
  onSelectMediumConfidence?: () => void
  onSelectLowConfidence?: () => void

  // UI state
  showKeyboardHints?: boolean
  onToggleKeyboardHints?: () => void
  disabled?: boolean
  loading?: boolean

  className?: string
}

const confidenceFilterOptions = [
  { value: "all", label: "All Confidence", description: "Show all items" },
  { value: "high", label: "High (90%+)", description: "Ready for auto-confirmation" },
  { value: "medium", label: "Medium (80-89%)", description: "Quick review recommended" },
  { value: "low", label: "Low (60-79%)", description: "Manual review needed" },
  { value: "very-low", label: "Very Low (<60%)", description: "Careful review required" },
] as const

function getConfidenceFilterInfo(filter: ConfidenceFilter) {
  return confidenceFilterOptions.find(option => option.value === filter) || confidenceFilterOptions[0]
}

export function InboxToolbar({
  selectedCount,
  totalCount,
  isAllSelected = false,
  isSomeSelected = false,
  onConfirmSelected,
  onArchiveSelected,
  onExportSelected,
  onSelectAll,
  onSelectNone,
  isExporting = false,
  confidenceFilter,
  onConfidenceFilterChange,
  onSelectHighConfidence,
  onSelectMediumConfidence,
  onSelectLowConfidence,
  showKeyboardHints = false,
  onToggleKeyboardHints,
  disabled = false,
  loading = false,
  className
}: InboxToolbarProps) {
  const hasSelection = selectedCount > 0
  const filterInfo = getConfidenceFilterInfo(confidenceFilter)

  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 border-b bg-background/95 backdrop-blur", className)}>
      {/* Left section: Selection info and bulk actions */}
      <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
        {/* Selection counter and controls */}
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

          {/* Select all/none toggle */}
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

        {/* Bulk action buttons */}
        {hasSelection && (
          <div className="flex items-center gap-2">
            {/* Primary action - always visible */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={onConfirmSelected}
                    disabled={disabled || loading}
                    className="h-8"
                  >
                    <Check className="mr-1 h-3 w-3" />
                    <span className="hidden sm:inline">Confirm</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Move selected items to library (Shortcut: C)
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Mobile: More actions dropdown */}
            <div className="sm:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onArchiveSelected}>
                    <Archive className="h-4 w-4 mr-2" />
                    Archive
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onExportSelected?.('csv')}>
                    <FileText className="h-4 w-4 mr-2" />
                    Export CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onExportSelected?.('xlsx')}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Export Excel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Desktop: Show all buttons inline */}
            <div className="hidden sm:flex items-center gap-2">
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
                      Archive
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Archive selected items (Shortcut: X)
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
          </div>
        )}
      </div>

      {/* Right section: Filters and settings */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
        {/* Quick confidence selection - hidden on mobile */}
        <div className="hidden md:flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-1">Quick select:</span>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onSelectHighConfidence}
                  disabled={disabled}
                  className="h-7 px-2 text-xs text-green-700 hover:bg-green-50"
                >
                  High
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Select high confidence items (90%+)
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onSelectMediumConfidence}
                  disabled={disabled}
                  className="h-7 px-2 text-xs text-orange-700 hover:bg-orange-50"
                >
                  Med
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Select medium confidence items (80-89%)
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onSelectLowConfidence}
                  disabled={disabled}
                  className="h-7 px-2 text-xs text-red-700 hover:bg-red-50"
                >
                  Low
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Select low confidence items (&lt;60%)
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Confidence filter dropdown - full width on mobile */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground hidden sm:block" />
          <Select value={confidenceFilter} onValueChange={onConfidenceFilterChange}>
            <SelectTrigger className="w-full sm:w-44 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {confidenceFilterOptions.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  description={option.description}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Keyboard shortcuts toggle - hidden on mobile */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleKeyboardHints}
                className={cn(
                  "h-8 px-2 hidden md:flex",
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
                  <div>c - Confirm current item</div>
                  <div>C - Confirm all selected</div>
                  <div>x - Archive current item</div>
                  <div>X - Archive all selected</div>
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

export default InboxToolbar