'use client';

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CollectionPlaceItem } from './collection-place-item';
import type { Place } from '@/types/database';

interface DraggablePlacesListProps {
  places: Place[];
  onReorder: (places: Place[]) => void;
  onRemove: (placeId: string) => void;
  isRemoving?: string | null;
  pinnedPlaceIds?: string[];
  placeNotes?: Record<string, string>;
  onTogglePin?: (placeId: string) => void;
  onNoteChange?: (placeId: string, note: string) => void;
  hoveredPlaceId?: string | null;
  onPlaceHover?: (placeId: string | null) => void;
}

export function DraggablePlacesList({
  places,
  onReorder,
  onRemove,
  isRemoving,
  pinnedPlaceIds = [],
  placeNotes = {},
  onTogglePin,
  onNoteChange,
  hoveredPlaceId,
  onPlaceHover,
}: DraggablePlacesListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (pinnedPlaceIds.includes(active.id as string)) {
      return;
    }

    if (over && active.id !== over.id) {
      const oldIndex = places.findIndex((item) => item.id === active.id);
      const newIndex = places.findIndex((item) => item.id === over.id);

      const newOrder = arrayMove(places, oldIndex, newIndex);
      onReorder(newOrder);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={places.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {places.map((place, index) => (
            <CollectionPlaceItem
              key={place.id}
              place={place}
              index={index}
              onRemove={onRemove}
              isRemoving={isRemoving === place.id}
              sortable={true}
              isPinned={pinnedPlaceIds.includes(place.id)}
              onTogglePin={onTogglePin}
              note={placeNotes[place.id] || ''}
              onNoteChange={onNoteChange}
              isHovered={hoveredPlaceId === place.id}
              onHover={(hover) => onPlaceHover?.(hover ? place.id : null)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
