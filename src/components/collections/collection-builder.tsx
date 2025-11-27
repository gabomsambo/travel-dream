'use client';

import { useState, useOptimistic, startTransition, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ArrowLeft, Plus, Share2, Route, Save, Sparkles, Calendar } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { CollectionStats } from './collection-stats';
import { AddPlacesDialog } from './add-places-dialog';
import { ShareDialog } from './share-dialog';
import Link from 'next/link';
import { TransportModeToggle } from './transport-mode-toggle';
import { ItineraryMap } from './itinerary-map';
import { optimizeCollectionRoute } from '@/lib/algorithms/tsp';
import type { Collection, Place } from '@/types/database';
import { toast } from 'sonner';

const DraggablePlacesList = dynamic(
  () => import('./draggable-places-list').then((mod) => mod.DraggablePlacesList),
  { ssr: false }
);

interface CollectionBuilderProps {
  initialCollection: Collection & {
    places: (Place & { isPinned?: boolean; note?: string | null; orderIndex?: number })[];
    transportMode?: 'drive' | 'walk';
  };
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

  const [transportMode, setTransportMode] = useState<'drive' | 'walk'>(
    initialCollection.transportMode || 'drive'
  );
  const [pinnedPlaceIds, setPinnedPlaceIds] = useState<string[]>(
    initialCollection.places.filter((p) => p.isPinned).map((p) => p.id)
  );
  const [placeNotes, setPlaceNotes] = useState<Record<string, string>>(
    initialCollection.places.reduce((acc, p) => {
      if (p.note) acc[p.id] = p.note;
      return acc;
    }, {} as Record<string, string>)
  );
  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleBack = () => {
    router.push('/collections');
  };

  // Auto-save transport mode (debounced)
  useEffect(() => {
    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        await fetch(`/api/collections/${collection.id}/settings`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transportMode }),
        });
      } catch (error) {
        console.error('Error saving transport mode:', error);
      }
      setIsSaving(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, [transportMode, collection.id]);

  // Update note with debounce
  const updateNote = useCallback(
    (placeId: string, note: string) => {
      setPlaceNotes((prev) => ({ ...prev, [placeId]: note }));

      const timer = setTimeout(async () => {
        setIsSaving(true);
        try {
          await fetch(`/api/collections/${collection.id}/places/${placeId}/note`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note: note || null }),
          });
        } catch (error) {
          console.error('Error saving note:', error);
        }
        setIsSaving(false);
      }, 1000);

      return () => clearTimeout(timer);
    },
    [collection.id]
  );

  // Toggle pin
  const togglePin = async (placeId: string) => {
    setIsSaving(true);
    setPinnedPlaceIds((prev) =>
      prev.includes(placeId) ? prev.filter((id) => id !== placeId) : [...prev, placeId]
    );

    try {
      await fetch(`/api/collections/${collection.id}/places/${placeId}/pin`, {
        method: 'PATCH',
      });
    } catch (error) {
      console.error('Error toggling pin:', error);
      toast.error('Failed to update pin status');
    }
    setIsSaving(false);
  };

  const handleRemovePlace = async (placeId: string) => {
    if (!confirm('Remove this place from the collection?')) {
      return;
    }

    console.log('[CollectionBuilder] Removing place:', placeId);

    const newPlaces = places.filter((p) => p.id !== placeId);

    startTransition(() => {
      setOptimisticPlaces(newPlaces);
    });

    setIsRemoving(placeId);
    try {
      const response = await fetch(
        `/api/collections/${collection.id}/places/${placeId}`,
        {
          method: 'DELETE',
        }
      );

      const result = await response.json();
      console.log('[CollectionBuilder] Delete response:', result);

      if (!response.ok) {
        throw new Error(result.message || 'Failed to remove place');
      }

      setPlaces(newPlaces);
      console.log('[CollectionBuilder] Place removed successfully, new count:', newPlaces.length);
      toast.success('Place removed from collection');
    } catch (error) {
      console.error('[CollectionBuilder] Error removing place:', error);
      startTransition(() => {
        setOptimisticPlaces(places);
      });
      toast.error('Failed to remove place');
    } finally {
      setIsRemoving(null);
    }
  };

  const handleReorder = async (newOrder: Place[]) => {
    startTransition(() => {
      setOptimisticPlaces(newOrder);
    });
    setIsReordering(true);

    try {
      const placeIds = newOrder.map((p) => p.id);
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
      // Filter out pinned places before optimization
      const unpinnedPlaces = optimisticPlaces.filter((p) => !pinnedPlaceIds.includes(p.id));
      
      if (unpinnedPlaces.filter(p => p.coords).length < 2) {
        toast.error('Need at least 2 unpinned places with coordinates to optimize');
        setIsOptimizing(false);
        return;
      }

      const result = optimizeCollectionRoute(unpinnedPlaces, {
        returnToStart: false,
        maxPlaces: 50,
      });

      // Merge optimized unpinned places back with pinned places in original positions
      const newOrder = [];
      let optimizedIndex = 0;
      for (const place of optimisticPlaces) {
        if (pinnedPlaceIds.includes(place.id)) {
          newOrder.push(place);
        } else {
          if (optimizedIndex < result.orderedPlaces.length) {
            newOrder.push(result.orderedPlaces[optimizedIndex]);
            optimizedIndex++;
          }
        }
      }

      await handleReorder(newOrder);

      toast.success(
        `Route optimized! Total distance: ${result.totalDistance.toFixed(1)}km`
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
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="border-b p-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          <div className="flex items-center gap-3">
            {/* Auto-save indicator */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {isSaving ? (
                <>
                  <Save className="h-4 w-4 animate-pulse" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 text-green-600" />
                  <span>Saved</span>
                </>
              )}
            </div>

            {/* Transport mode toggle */}
            <TransportModeToggle value={transportMode} onChange={setTransportMode} />

            {optimisticPlaces.length >= 3 && (
              <Button
                variant="outline"
                onClick={handleOptimizeRoute}
                disabled={isOptimizing || isReordering}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {isOptimizing ? 'Optimizing...' : 'Optimize Route'}
              </Button>
            )}

            <Link href={`/collections/${collection.id}/planner`}>
              <Button variant="outline">
                <Calendar className="h-4 w-4 mr-2" />
                Plan Days
              </Button>
            </Link>

            <Button variant="outline" onClick={() => setShareDialogOpen(true)}>
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>
            <Button onClick={() => setAddPlacesDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Places
            </Button>
          </div>
        </div>

        {/* Collection Title */}
        <div className="mt-4">
          <h1 className="text-3xl font-bold">{collection.name}</h1>
          {collection.description && (
            <p className="text-muted-foreground mt-2">{collection.description}</p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="px-4 py-3 border-b">
        <CollectionStats places={optimisticPlaces} />
      </div>

      {/* Main Content: Two-column split */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full grid grid-cols-2 gap-6 container py-6">
          {/* LEFT: Itinerary List */}
          <div className="overflow-y-auto pl-1 pr-2 space-y-4">
            <h2 className="text-lg font-semibold">
              Itinerary ({optimisticPlaces.length} places)
            </h2>

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
                pinnedPlaceIds={pinnedPlaceIds}
                placeNotes={placeNotes}
                onTogglePin={togglePin}
                onNoteChange={updateNote}
                hoveredPlaceId={hoveredPlaceId}
                onPlaceHover={setHoveredPlaceId}
              />
            )}
          </div>

          {/* RIGHT: Map */}
          <div className="h-full">
            <ItineraryMap
              places={optimisticPlaces}
              hoveredPlaceId={hoveredPlaceId}
              onPlaceHover={setHoveredPlaceId}
              transportMode={transportMode}
            />
          </div>
        </div>
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
