'use client';

import { cn } from '@/lib/utils';
import { useExplore } from './explore-provider';
import { PlaceTile } from './place-tile';

/** A magazine spread: the section's lead place large, the rest in a tight grid. */
export function PlaceGrid({
  title,
  placeIds,
  captions,
}: {
  title: string;
  placeIds: string[];
  captions: Record<string, string>;
}) {
  const { places, openPlace } = useExplore();
  const list = placeIds.map((id) => places.get(id)).filter((p) => p !== undefined);
  return (
    <section className="space-y-4 px-4 sm:px-8">
      <div className="flex items-baseline gap-3 border-b pb-2">
        <h2 className="font-editorial text-4xl">{title}</h2>
        <span className="text-xs text-muted-foreground">{list.length}</span>
      </div>
      <div className="grid auto-rows-[160px] grid-cols-2 gap-3 sm:auto-rows-[200px] sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {list.map((p, i) => (
          <PlaceTile
            key={p.id}
            place={p}
            shape={i === 0 && list.length > 1 ? 'hero' : 'poster'}
            caption={captions[p.id]}
            onOpen={() => openPlace(p.id, placeIds)}
            className={cn('aspect-auto h-full w-full sm:w-full lg:w-full', i === 0 && leadClass(list.length))}
          />
        ))}
      </div>
    </section>
  );
}

// The lead gets the 2×2 only when there are enough places to fill the columns beside it.
function leadClass(n: number): string {
  if (n >= 5) return 'col-span-2 row-span-2';
  if (n >= 2) return 'col-span-2';
  return '';
}