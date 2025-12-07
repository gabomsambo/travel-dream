'use client';

import { useState, useMemo } from 'react';
import { Star, XCircle, Merge } from 'lucide-react';
import { Button } from '@/components/adapters/button';
import { Badge } from '@/components/adapters/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui-v2/select';
import { DuplicatePlaceTabs } from './duplicate-place-tabs';
import { DuplicateComparisonPanel } from './duplicate-comparison-panel';
import { DuplicateMatchReasoning } from './duplicate-match-reasoning';
import { DuplicateMergePreview } from './duplicate-merge-preview';
import {
  calculateDataCompleteness,
  recommendMergeTarget,
  computeMergedPlace,
} from '@/lib/duplicate-target-selector';
import { cn } from '@/lib/utils';
import type { Place } from '@/types/database';

interface DuplicateCluster {
  cluster_id: string;
  places: Place[];
  avgConfidence: number;
}

interface DuplicateExpandedViewProps {
  cluster: DuplicateCluster;
  onMerge: () => void;
  onMergePair: (targetId: string, sourceId: string) => void;
  onDismiss: () => void;
  reasoning?: string[];
  isLoading?: boolean;
  className?: string;
}

export function DuplicateExpandedView({
  cluster,
  onMerge,
  onMergePair,
  onDismiss,
  reasoning,
  isLoading = false,
  className,
}: DuplicateExpandedViewProps) {
  const recommendedTargetId = useMemo(
    () => recommendMergeTarget(cluster.places),
    [cluster.places]
  );

  const [selectedTargetId, setSelectedTargetId] = useState<string>(recommendedTargetId);

  const nonTargetPlaces = useMemo(
    () => cluster.places.filter(p => p.id !== selectedTargetId),
    [cluster.places, selectedTargetId]
  );

  const [activeTabPlaceId, setActiveTabPlaceId] = useState<string>(
    nonTargetPlaces[0]?.id || ''
  );

  const target = useMemo(
    () => cluster.places.find(p => p.id === selectedTargetId),
    [cluster.places, selectedTargetId]
  );

  const activePlace = useMemo(
    () => cluster.places.find(p => p.id === activeTabPlaceId),
    [cluster.places, activeTabPlaceId]
  );

  const mergedPlace = useMemo(() => {
    if (!target) return null;
    return computeMergedPlace(target, nonTargetPlaces);
  }, [target, nonTargetPlaces]);

  // When target changes, update active tab to first non-target place
  const handleTargetChange = (newTargetId: string) => {
    setSelectedTargetId(newTargetId);
    const newNonTargets = cluster.places.filter(p => p.id !== newTargetId);
    if (newNonTargets.length > 0 && !newNonTargets.find(p => p.id === activeTabPlaceId)) {
      setActiveTabPlaceId(newNonTargets[0].id);
    }
  };

  if (!target) {
    return <div className="text-muted-foreground text-sm">No target selected</div>;
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Target Selector */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">Merge Target (Keep This Place)</label>
        <Select value={selectedTargetId} onValueChange={handleTargetChange}>
          <SelectTrigger className="w-full max-w-md">
            <SelectValue placeholder="Select target place" />
          </SelectTrigger>
          <SelectContent>
            {cluster.places.map((place) => {
              const score = calculateDataCompleteness(place);
              const isRecommended = place.id === recommendedTargetId;

              return (
                <SelectItem key={place.id} value={place.id}>
                  <div className="flex items-center gap-2 min-w-0 w-full">
                    <span className="truncate flex-1 min-w-0">{place.name}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      ({score.score}%)
                    </span>
                    {isRecommended && (
                      <Badge
                        variant="secondary"
                        className="h-5 px-1.5 text-[10px] bg-green-100 text-green-700 flex-shrink-0"
                      >
                        <Star className="h-3 w-3 mr-0.5" />
                        Rec
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Place Tabs (for 3+ places) */}
      {cluster.places.length > 2 && (
        <div>
          <label className="text-sm font-medium mb-2 block">Compare With</label>
          <DuplicatePlaceTabs
            places={cluster.places}
            targetId={selectedTargetId}
            activeId={activeTabPlaceId}
            onSelect={setActiveTabPlaceId}
          />
        </div>
      )}

      {/* Comparison Panel */}
      {activePlace && (
        <div className="border rounded-lg p-4 bg-card">
          <h4 className="text-sm font-medium mb-4">Field Comparison</h4>
          <DuplicateComparisonPanel target={target} compareTo={activePlace} />
        </div>
      )}

      {/* Match Reasoning */}
      {reasoning && reasoning.length > 0 && (
        <div className="border rounded-lg p-4 bg-card">
          <DuplicateMatchReasoning reasoning={reasoning} />
        </div>
      )}

      {/* Merge Preview */}
      {mergedPlace && (
        <DuplicateMergePreview
          mergedPlace={mergedPlace}
          sourceCount={cluster.places.length}
        />
      )}

      {/* Action Buttons */}
      <div className="flex flex-col gap-3 pt-2 border-t">
        {/* Primary action: Merge the two being compared */}
        {activePlace && (
          <div className="flex gap-3">
            <Button
              onClick={() => onMergePair(selectedTargetId, activeTabPlaceId)}
              disabled={isLoading}
              className="flex-1 min-w-0"
            >
              <Merge className="h-4 w-4 mr-2 flex-shrink-0" />
              <span className="truncate">Merge These Two</span>
            </Button>
            <Button
              variant="outline"
              onClick={onDismiss}
              disabled={isLoading}
              className="flex-shrink-0"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Not Duplicates
              <kbd className="ml-2 bg-muted px-1.5 py-0.5 rounded text-xs font-mono hidden sm:inline">
                d
              </kbd>
            </Button>
          </div>
        )}

        {/* Secondary action: Merge all (only show for 3+ places) */}
        {cluster.places.length > 2 && (
          <Button
            variant="secondary"
            onClick={onMerge}
            disabled={isLoading}
            className="w-full"
          >
            <Merge className="h-4 w-4 mr-2" />
            Merge All {cluster.places.length} Places
            <kbd className="ml-2 bg-secondary-foreground/10 px-1.5 py-0.5 rounded text-xs font-mono hidden sm:inline">
              m
            </kbd>
          </Button>
        )}
      </div>
    </div>
  );
}
