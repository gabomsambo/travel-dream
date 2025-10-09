'use client';

import { X, MapPin, GripVertical } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Place } from '@/types/database';

interface CollectionPlaceItemProps {
  place: Place;
  index: number;
  onRemove?: (placeId: string) => void;
  isRemoving?: boolean;
  sortable?: boolean;
}

export function CollectionPlaceItem({
  place,
  index,
  onRemove,
  isRemoving = false,
  sortable = false,
}: CollectionPlaceItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: place.id,
    disabled: !sortable,
  });

  const style = sortable
    ? {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }
    : {};

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-4 p-4 border rounded-lg bg-card',
        'hover:bg-accent/5 transition-colors group',
        isRemoving && 'opacity-50 pointer-events-none',
        sortable && 'touch-none'
      )}
    >
      {/* Drag Handle */}
      {sortable && (
        <div
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-5 w-5" />
        </div>
      )}

      {/* Index */}
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-sm font-medium shrink-0">
        {index + 1}
      </div>

      {/* Place Info */}
      <div className="flex-1 min-w-0">
        <h4 className="font-medium truncate">{place.name}</h4>
        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
          {place.kind && (
            <Badge variant="outline" className="text-xs">
              {place.kind}
            </Badge>
          )}
          {(place.city || place.country) && (
            <div className="flex items-center gap-1 truncate">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {[place.city, place.country].filter(Boolean).join(', ')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Remove Button */}
      {onRemove && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50"
          onClick={() => onRemove(place.id)}
          disabled={isRemoving}
          title="Remove from collection"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
