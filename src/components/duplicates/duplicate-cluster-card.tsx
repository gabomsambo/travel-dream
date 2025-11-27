'use client';

import { Card } from '@/components/adapters/card';
import { DuplicateConfidenceBadge } from './duplicate-confidence-badge';
import { DuplicateExpandedView } from './duplicate-expanded-view';
import {
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui-v2/accordion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Place } from '@/types/database';

interface DuplicateCluster {
  cluster_id: string;
  places: Place[];
  avgConfidence: number;
}

interface DuplicateClusterCardProps {
  cluster: DuplicateCluster;
  selected: boolean;
  onSelect: () => void;
  onMerge: () => void;
  onMergePair: (targetId: string, sourceId: string) => void;
  onDismiss: () => void;
  isLoading?: boolean;
  reasoning?: string[];
}

export function DuplicateClusterCard({
  cluster,
  selected,
  onSelect,
  onMerge,
  onMergePair,
  onDismiss,
  isLoading = false,
  reasoning,
}: DuplicateClusterCardProps) {
  const displayPlaces = cluster.places.slice(0, 5);
  const remainingCount = cluster.places.length - 5;

  const commonCity = cluster.places[0]?.city;
  const commonCountry = cluster.places[0]?.country;
  const commonKind = cluster.places[0]?.kind;

  return (
    <AccordionItem value={cluster.cluster_id} className="border-0">
      <Card
        className={cn(
          'transition-all hover:shadow-md overflow-hidden',
          selected && 'ring-2 ring-blue-500'
        )}
      >
        <AccordionTrigger
          className="p-4 w-full hover:no-underline [&>svg]:hidden"
          onClick={(e) => {
            // Allow accordion toggle but also handle selection
            if (e.ctrlKey || e.metaKey || e.shiftKey) {
              e.preventDefault();
              onSelect();
            }
          }}
        >
          <div className="flex-1 text-left">
            <div className="flex items-start justify-between mb-3">
              <DuplicateConfidenceBadge confidence={cluster.avgConfidence} />
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {cluster.places.length} places
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
              </div>
            </div>

            <div className="space-y-1 mb-3">
              {displayPlaces.map((place, idx) => (
                <div key={place.id} className="text-sm truncate">
                  {idx + 1}. {place.name}
                </div>
              ))}
              {remainingCount > 0 && (
                <div className="text-sm text-muted-foreground">
                  ...and {remainingCount} more
                </div>
              )}
            </div>

            <div className="flex gap-2 text-xs text-muted-foreground">
              {commonKind && <span className="capitalize">{commonKind}</span>}
              {commonCity && <span>• {commonCity}</span>}
              {commonCountry && <span>• {commonCountry}</span>}
            </div>
          </div>
        </AccordionTrigger>

        <AccordionContent className="px-4 pb-4">
          <div className="pt-4 border-t">
            <DuplicateExpandedView
              cluster={cluster}
              onMerge={onMerge}
              onMergePair={onMergePair}
              onDismiss={onDismiss}
              reasoning={reasoning}
              isLoading={isLoading}
            />
          </div>
        </AccordionContent>
      </Card>
    </AccordionItem>
  );
}
