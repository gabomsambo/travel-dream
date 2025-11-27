'use client';

import { Merge, XCircle, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/adapters/button';

interface DuplicateReviewToolbarProps {
  selectedCount: number;
  onMerge: () => void;
  onDismiss: () => void;
  onClear: () => void;
  isLoading?: boolean;
}

export function DuplicateReviewToolbar({
  selectedCount,
  onMerge,
  onDismiss,
  onClear,
  isLoading = false,
}: DuplicateReviewToolbarProps) {
  return (
    <div className="border-b p-4 flex items-center justify-between bg-background sticky top-0 z-10">
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">
          {selectedCount > 0 ? `${selectedCount} selected` : 'No selection'}
        </span>
        {selectedCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            disabled={isLoading}
          >
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="default"
          size="sm"
          onClick={onMerge}
          disabled={selectedCount === 0 || isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Merge className="h-4 w-4 mr-1" />
          )}
          Merge ({selectedCount})
          <kbd className="ml-2 bg-primary-foreground/20 px-1.5 py-0.5 rounded text-xs font-mono hidden sm:inline">
            m
          </kbd>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onDismiss}
          disabled={selectedCount === 0 || isLoading}
        >
          <XCircle className="h-4 w-4 mr-1" />
          Dismiss
          <kbd className="ml-2 bg-muted px-1.5 py-0.5 rounded text-xs font-mono hidden sm:inline">
            d
          </kbd>
        </Button>
      </div>
    </div>
  );
}
