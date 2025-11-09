import { Card } from "@/components/adapters/card";
import { DuplicateConfidenceBadge } from './duplicate-confidence-badge';
import type { Place } from '@/types/database';
import { cn } from '@/lib/utils';

interface DuplicateCluster {
  cluster_id: string;
  places: Place[];
  avgConfidence: number;
}

interface DuplicateClusterCardProps {
  cluster: DuplicateCluster;
  selected: boolean;
  onSelect: () => void;
  onDoubleClick?: () => void;
}

export function DuplicateClusterCard({
  cluster,
  selected,
  onSelect,
  onDoubleClick
}: DuplicateClusterCardProps) {
  const displayPlaces = cluster.places.slice(0, 5);
  const remainingCount = cluster.places.length - 5;

  const commonCity = cluster.places[0]?.city;
  const commonCountry = cluster.places[0]?.country;
  const commonKind = cluster.places[0]?.kind;

  return (
    <Card
      className={cn(
        'p-4 cursor-pointer transition-all hover:shadow-md',
        selected && 'ring-2 ring-blue-500'
      )}
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
    >
      <div className="flex items-start justify-between mb-3">
        <DuplicateConfidenceBadge confidence={cluster.avgConfidence} />
        <span className="text-sm text-muted-foreground">
          {cluster.places.length} places
        </span>
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
    </Card>
  );
}
