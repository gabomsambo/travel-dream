'use client';

import { CollectionCard } from './collection-card';
import { EmptyState } from './empty-state';
import { FolderHeart } from 'lucide-react';
import type { Collection } from '@/types/database';

interface CollectionsGridProps {
  collections: (Collection & { placeCount?: number; places?: Array<{ coverUrl?: string | null }> })[];
  onDelete?: (collectionId: string) => void;
  onCreateClick?: () => void;
}

export function CollectionsGrid({ collections, onDelete, onCreateClick }: CollectionsGridProps) {
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
        />
      ))}
    </div>
  );
}
