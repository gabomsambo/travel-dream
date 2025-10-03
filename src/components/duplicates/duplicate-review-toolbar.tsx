import { Button } from '@/components/ui/button';

interface DuplicateReviewToolbarProps {
  selectedCount: number;
  onMerge: () => void;
  onDismiss: () => void;
  onClear: () => void;
}

export function DuplicateReviewToolbar({
  selectedCount,
  onMerge,
  onDismiss,
  onClear
}: DuplicateReviewToolbarProps) {
  return (
    <div className="border-b p-4 flex items-center justify-between bg-background">
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">
          {selectedCount > 0 ? `${selectedCount} selected` : 'No selection'}
        </span>
        {selectedCount > 0 && (
          <Button variant="outline" size="sm" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="default"
          size="sm"
          onClick={onMerge}
          disabled={selectedCount === 0}
        >
          Merge ({selectedCount})
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onDismiss}
          disabled={selectedCount === 0}
        >
          Dismiss
        </Button>
      </div>

      <div className="text-xs text-muted-foreground">
        Shortcuts: m=merge, d=dismiss, c=clear
      </div>
    </div>
  );
}
