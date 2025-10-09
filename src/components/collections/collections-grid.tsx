'use client';

import { CollectionCard } from './collection-card';
import { FolderPlus } from 'lucide-react';
import type { Collection } from '@/types/database';

interface CollectionsGridProps {
  collections: (Collection & { placeCount?: number })[];
  onDelete?: (collectionId: string) => void;
}

export function CollectionsGrid({ collections, onDelete }: CollectionsGridProps) {
  if (collections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="p-4 rounded-full bg-muted/50 mb-4">
          <FolderPlus className="h-12 w-12 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">No collections yet</h3>
        <p className="text-muted-foreground max-w-sm">
          Create your first collection to organize your travel places into curated lists
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
