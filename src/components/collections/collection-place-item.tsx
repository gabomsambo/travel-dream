'use client';

import { useState } from 'react';
import { X, MapPin, GripVertical, Lock, Unlock, StickyNote } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from '@/lib/utils';
import type { Place } from '@/types/database';

interface CollectionPlaceItemProps {
  place: Place;
  index: number;
  onRemove?: (placeId: string) => void;
  isRemoving?: boolean;
  sortable?: boolean;
  isPinned?: boolean;
  onTogglePin?: (placeId: string) => void;
  note?: string;
  onNoteChange?: (placeId: string, note: string) => void;
  isHovered?: boolean;
  onHover?: (hover: boolean) => void;
}

export function CollectionPlaceItem({
  place,
  index,
  onRemove,
  isRemoving = false,
  sortable = false,
  isPinned = false,
  onTogglePin,
  note = '',
  onNoteChange,
  isHovered = false,
  onHover,
}: CollectionPlaceItemProps) {
  const [showNoteInput, setShowNoteInput] = useState(!!note);

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
    disabled: !sortable || isPinned,
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
        'flex flex-col gap-3 p-4 border rounded-lg bg-card',
        'hover:bg-accent/5 transition-all group',
        isRemoving && 'opacity-50 pointer-events-none',
        sortable && !isPinned && 'touch-none',
        isHovered && 'ring-2 ring-primary',
        isPinned && 'border-primary/50 bg-primary/5'
      )}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
    >
      <div className="flex items-center gap-4">
        {/* Drag Handle - disabled if pinned */}
        {sortable && (
          <div
            ref={setActivatorNodeRef}
            {...attributes}
            {...(isPinned ? {} : listeners)}
            className={cn(
              'cursor-grab active:cursor-grabbing shrink-0 text-muted-foreground hover:text-foreground transition-colors',
              isPinned && 'cursor-not-allowed opacity-50'
            )}
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-5 w-5" />
          </div>
        )}

        {/* Index */}
        <div
          className={cn(
            'flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium shrink-0',
            isPinned ? 'bg-primary/20 text-primary' : 'bg-muted'
          )}
        >
          {index + 1}
        </div>

        {/* Thumbnail */}

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

        {/* Actions (show on hover) */}
        <div className="flex items-center gap-1">
          {onNoteChange && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowNoteInput(!showNoteInput)}
              className={cn(
                'opacity-0 group-hover:opacity-100 transition-opacity',
                showNoteInput && 'opacity-100 text-primary'
              )}
              title="Add note"
            >
              <StickyNote className="h-4 w-4" />
            </Button>
          )}
          {onTogglePin && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onTogglePin(place.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              title={isPinned ? 'Unpin place' : 'Pin place'}
            >
              {isPinned ? (
                <Lock className="h-4 w-4 text-primary" />
              ) : (
                <Unlock className="h-4 w-4" />
              )}
            </Button>
          )}
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
      </div>

      {/* Inline Note Textarea */}
      {showNoteInput && onNoteChange && (
        <div className="pl-16">
          <Textarea
            placeholder="Add a note for this stop..."
            value={note}
            onChange={(e) => onNoteChange(place.id, e.target.value)}
            className="min-h-[60px] text-sm resize-none"
          />
        </div>
      )}
    </div>
  );
}
