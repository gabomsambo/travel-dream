'use client';

import { useState, useEffect } from 'react';
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
  onReorder: (placeIds: string[]) => void;
  onRemove: (placeId: string) => void;
  isRemoving?: string | null;
}

export function DraggablePlacesList({
  places,
  onReorder,
  onRemove,
  isRemoving,
}: DraggablePlacesListProps) {
  const [items, setItems] = useState(places);

  useEffect(() => {
    setItems(places);
  }, [places]);

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

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);

      const newOrder = arrayMove(items, oldIndex, newIndex);

      setItems(newOrder);
      onReorder(newOrder.map((place) => place.id));
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {items.map((place, index) => (
            <CollectionPlaceItem
              key={place.id}
              place={place}
              index={index}
              onRemove={onRemove}
              isRemoving={isRemoving === place.id}
              sortable={true}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
