'use client';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui-v2/tabs';
import { Badge } from '@/components/adapters/badge';
import { cn } from '@/lib/utils';
import type { Place } from '@/types/database';
import { calculateDataCompleteness } from '@/lib/duplicate-target-selector';

interface DuplicatePlaceTabsProps {
  places: Place[];
  targetId: string;
  activeId: string;
  onSelect: (id: string) => void;
  className?: string;
}

function truncateName(name: string, maxLength: number = 20): string {
  if (name.length <= maxLength) return name;
  return name.substring(0, maxLength - 1) + '…';
}

function hasUniqueData(place: Place, target: Place): boolean {
  // Check if this place has data that the target is missing
  const hasUniqueDescription = place.description?.trim() && !target.description?.trim();
  const hasUniqueCoords = place.coords && (!target.coords ||
    typeof target.coords !== 'object' ||
    !('lat' in target.coords) ||
    target.coords.lat === null);
  const hasUniqueTags = Array.isArray(place.tags) && place.tags.length > 0 &&
    (!Array.isArray(target.tags) || target.tags.length === 0);
  const hasUniqueVibes = Array.isArray(place.vibes) && place.vibes.length > 0 &&
    (!Array.isArray(target.vibes) || target.vibes.length === 0);

  return hasUniqueDescription || hasUniqueCoords || hasUniqueTags || hasUniqueVibes;
}

export function DuplicatePlaceTabs({
  places,
  targetId,
  activeId,
  onSelect,
  className,
}: DuplicatePlaceTabsProps) {
  // Filter out the target from the tabs
  const nonTargetPlaces = places.filter(p => p.id !== targetId);
  const target = places.find(p => p.id === targetId);

  if (nonTargetPlaces.length === 0) {
    return null;
  }

  return (
    <Tabs value={activeId} onValueChange={onSelect} className={cn('w-full', className)}>
      <TabsList className="w-full justify-start overflow-x-auto">
        {nonTargetPlaces.map((place) => {
          const score = calculateDataCompleteness(place);
          const hasUnique = target ? hasUniqueData(place, target) : false;

          return (
            <TabsTrigger
              key={place.id}
              value={place.id}
              className="flex items-center gap-2 min-w-0"
            >
              <span className="truncate">{truncateName(place.name)}</span>
              {hasUnique && (
                <Badge
                  variant="secondary"
                  className="h-4 px-1 text-[10px] bg-blue-100 text-blue-700"
                >
                  +
                </Badge>
              )}
              <span className="text-[10px] text-muted-foreground">
                {score.score}%
              </span>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
