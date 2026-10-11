'use client';

import { Merge, XCircle, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/adapters/button';

interface DuplicateReviewToolbarProps {
  selectedCount: number;
  totalCount: number;
  onMerge: () => void;
  onDismiss: () => void;
  onClear: () => void;
  isLoading?: boolean;
}

export function DuplicateReviewToolbar({
  selectedCount,
  totalCount,
  onMerge,
  onDismiss,
  onClear,
  isLoading = false,
}: DuplicateReviewToolbarProps) {
  const mergeLabel = selectedCount > 0 ? `Merge (${selectedCount})` : 'Merge All';
  const dismissLabel = selectedCount > 0 ? `Dismiss (${selectedCount})` : 'Dismiss All';
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
          disabled={totalCount === 0 || isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Merge className="h-4 w-4 mr-1" />
          )}
          {mergeLabel}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onDismiss}
          disabled={totalCount === 0 || isLoading}
        >
          <XCircle className="h-4 w-4 mr-1" />
          {dismissLabel}
        </Button>
      </div>
    </div>
  );
}
