'use client';

import { useState, useOptimistic, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ArrowLeft, Plus, Share2, Route } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CollectionStats } from './collection-stats';
import { CollectionPlaceItem } from './collection-place-item';
import { AddPlacesDialog } from './add-places-dialog';
import { ShareDialog } from './share-dialog';
import { optimizeCollectionRoute } from '@/lib/algorithms/tsp';
import type { Collection, Place } from '@/types/database';
import { toast } from 'sonner';

const DraggablePlacesList = dynamic(
  () => import('./draggable-places-list').then((mod) => mod.DraggablePlacesList),
  { ssr: false }
);

interface CollectionBuilderProps {
  initialCollection: Collection & { places: Place[] };
}

export function CollectionBuilder({ initialCollection }: CollectionBuilderProps) {
  const router = useRouter();
  const [collection, setCollection] = useState(initialCollection);
  const [places, setPlaces] = useState(initialCollection.places);
  const [optimisticPlaces, setOptimisticPlaces] = useOptimistic(places);
  const [addPlacesDialogOpen, setAddPlacesDialogOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);

  const handleBack = () => {
    router.push('/collections');
  };

  const handleRemovePlace = async (placeId: string) => {
    if (!confirm('Remove this place from the collection?')) {
      return;
    }

    setIsRemoving(placeId);
    try {
      const response = await fetch(
        `/api/collections/${collection.id}/places/${placeId}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to remove place');
      }

      setPlaces((prev) => prev.filter((p) => p.id !== placeId));
      toast.success('Place removed from collection');
    } catch (error) {
      console.error('Error removing place:', error);
      toast.error('Failed to remove place');
    } finally {
      setIsRemoving(null);
    }
  };

  const handleReorder = async (placeIds: string[]) => {
    const newOrder = placeIds.map((id) => places.find((p) => p.id === id)!).filter(Boolean);

    startTransition(() => {
      setOptimisticPlaces(newOrder);
    });
    setIsReordering(true);

    try {
      const response = await fetch(`/api/collections/${collection.id}/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeIds }),
      });

      if (!response.ok) {
        throw new Error('Failed to reorder places');
      }

      setPlaces(newOrder);
      toast.success('Places reordered successfully');
    } catch (error) {
      console.error('Error reordering places:', error);
      startTransition(() => {
        setOptimisticPlaces(places);
      });
      toast.error('Failed to reorder places. Please try again.');
    } finally {
      setIsReordering(false);
    }
  };

  const handleOptimizeRoute = async () => {
    if (optimisticPlaces.length < 3) {
      toast.error('Need at least 3 places to optimize route');
      return;
    }

    const placesWithCoords = optimisticPlaces.filter((p) => p.coords);
    if (placesWithCoords.length < 3) {
      toast.error('Need at least 3 places with coordinates to optimize route');
      return;
    }

    setIsOptimizing(true);

    try {
      const result = optimizeCollectionRoute(optimisticPlaces, {
        returnToStart: false,
        maxPlaces: 50,
      });

      const currentDistance = optimisticPlaces.reduce((total, place, i) => {
        if (i === 0 || !place.coords || !optimisticPlaces[i - 1].coords) return total;
        const from = optimisticPlaces[i - 1];
        const to = place;
        const dist =
          Math.sqrt(
            Math.pow((to.coords!.lat - from.coords!.lat), 2) +
            Math.pow((to.coords!.lon - from.coords!.lon), 2)
          ) * 111;
        return total + dist;
      }, 0);

      const improvement = currentDistance - result.totalDistance;
      const improvementPercent = ((improvement / currentDistance) * 100).toFixed(1);

      const orderedPlaceIds = result.orderedPlaces.map((p) => p.id);
      await handleReorder(orderedPlaceIds);

      toast.success(
        `Route optimized! Saved ${improvement.toFixed(1)}km (${improvementPercent}% improvement)`
      );
    } catch (error) {
      console.error('Error optimizing route:', error);
      toast.error('Failed to optimize route. Please try again.');
    } finally {
      setIsOptimizing(false);
    }
  };

  const handlePlacesAdded = () => {
    router.refresh();
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Collections
        </Button>

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold truncate">{collection.name}</h1>
            {collection.description && (
              <p className="text-muted-foreground mt-2">
                {collection.description}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {optimisticPlaces.length >= 3 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleOptimizeRoute}
                disabled={isOptimizing || isReordering}
              >
                <Route className="h-4 w-4 mr-2" />
                {isOptimizing ? 'Optimizing...' : 'Auto-Order'}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShareDialogOpen(true)}
            >
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>
            <Button
              size="sm"
              onClick={() => setAddPlacesDialogOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Places
            </Button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6">
        <CollectionStats places={optimisticPlaces} />
      </div>

      {/* Places List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Places ({optimisticPlaces.length})
          </h2>
          {optimisticPlaces.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Drag places to reorder
            </p>
          )}
        </div>

        {optimisticPlaces.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed rounded-lg">
            <p className="text-muted-foreground mb-4">
              No places in this collection yet
            </p>
            <Button onClick={() => setAddPlacesDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Places
            </Button>
          </div>
        ) : (
          <DraggablePlacesList
            places={optimisticPlaces}
            onReorder={handleReorder}
            onRemove={handleRemovePlace}
            isRemoving={isRemoving}
          />
        )}
      </div>

      {/* Add Places Dialog */}
      <AddPlacesDialog
        collectionId={collection.id}
        open={addPlacesDialogOpen}
        onOpenChange={setAddPlacesDialogOpen}
        onPlacesAdded={handlePlacesAdded}
        existingPlaceIds={places.map((p) => p.id)}
      />

      {/* Share Dialog */}
      <ShareDialog
        collection={{ ...collection, places: optimisticPlaces }}
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
      />
    </div>
  );
}
