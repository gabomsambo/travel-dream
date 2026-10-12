'use client';

import { CollectionCard, type CollectionCardModel, type CoverCreditUpdate } from './collection-card';
import { EmptyState } from './empty-state';
import { FolderHeart } from 'lucide-react';

interface CollectionsGridProps {
  collections: (CollectionCardModel & { placeCount?: number })[];
  onDelete?: (collectionId: string) => void;
  onCoverChange?: (collectionId: string, coverUrl: string | null, credit?: CoverCreditUpdate) => void;
  onCreateClick?: () => void;
}

export function CollectionsGrid({ collections, onDelete, onCoverChange, onCreateClick }: CollectionsGridProps) {
  if (collections.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <EmptyState
          icon={FolderHeart}
          title="No collections yet"
          description="Create your first collection to start organizing places into trips, themes, or wish lists"
          action={
            onCreateClick
              ? {
                  label: 'Create Your First Collection',
                  onClick: onCreateClick,
                }
              : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {collections.map((collection) => (
        <CollectionCard
          key={collection.id}
          collection={collection}
          placeCount={collection.placeCount || 0}
          onDelete={onDelete}
          onCoverChange={onCoverChange}
        />
      ))}
    </div>
  );
}
