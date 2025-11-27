'use client';

import { MapPin, Sparkles } from 'lucide-react';
import { Badge } from '@/components/adapters/badge';
import { Card } from '@/components/adapters/card';
import { cn } from '@/lib/utils';
import type { Place } from '@/types/database';

interface DuplicateMergePreviewProps {
  mergedPlace: Place;
  sourceCount: number;
  className?: string;
}

export function DuplicateMergePreview({
  mergedPlace,
  sourceCount,
  className,
}: DuplicateMergePreviewProps) {
  return (
    <Card
      className={cn(
        'p-4 border-2 border-dashed border-primary/50 bg-primary/5',
        className
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Merged Result Preview</span>
        </div>
        <Badge variant="secondary" className="text-xs">
          {sourceCount} places → 1
        </Badge>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="font-semibold text-lg">{mergedPlace.name}</h3>
          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
            <MapPin className="h-3 w-3" />
            <span>
              {mergedPlace.city && mergedPlace.country
                ? `${mergedPlace.city}, ${mergedPlace.country}`
                : mergedPlace.city || mergedPlace.country || 'Location unknown'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary">{mergedPlace.kind}</Badge>
          {Array.isArray(mergedPlace.tags) && mergedPlace.tags.slice(0, 5).map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
          {Array.isArray(mergedPlace.tags) && mergedPlace.tags.length > 5 && (
            <Badge variant="outline" className="text-xs">
              +{mergedPlace.tags.length - 5}
            </Badge>
          )}
        </div>

        {Array.isArray(mergedPlace.vibes) && mergedPlace.vibes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {mergedPlace.vibes.slice(0, 3).map((vibe) => (
              <Badge
                key={vibe}
                variant="outline"
                className="text-xs bg-purple-50 text-purple-700 border-purple-200"
              >
                {vibe}
              </Badge>
            ))}
          </div>
        )}

        {mergedPlace.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {mergedPlace.description}
          </p>
        )}

        {mergedPlace.coords && typeof mergedPlace.coords === 'object' &&
         'lat' in mergedPlace.coords && 'lon' in mergedPlace.coords &&
         mergedPlace.coords.lat !== null && mergedPlace.coords.lon !== null && (
          <div className="text-xs text-muted-foreground">
            📍 {mergedPlace.coords.lat.toFixed(6)}, {mergedPlace.coords.lon.toFixed(6)}
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-dashed border-primary/30">
        <p className="text-xs text-muted-foreground">
          <strong>{sourceCount - 1}</strong> place{sourceCount - 1 !== 1 ? 's' : ''} will be archived after merge
        </p>
      </div>
    </Card>
  );
}
