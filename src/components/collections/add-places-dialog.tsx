'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/adapters/dialog";
import { Button } from "@/components/adapters/button";
import { Input } from "@/components/adapters/input";
import { Checkbox } from "@/components/adapters/checkbox";
import { Badge } from "@/components/adapters/badge";
import { Search, MapPin, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useDebounce } from '@/hooks/use-debounce';
import type { Place } from '@/types/database';

interface AddPlacesDialogProps {
  collectionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPlacesAdded: () => void;
  existingPlaceIds?: string[];
}

export function AddPlacesDialog({
  collectionId,
  open,
  onOpenChange,
  onPlacesAdded,
  existingPlaceIds = [],
}: AddPlacesDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const debouncedSearch = useDebounce(searchQuery, 300);

  // Fetch places based on search
  useEffect(() => {
    const fetchPlaces = async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        if (debouncedSearch) {
          params.append('search', debouncedSearch);
        }
        params.append('status', 'library'); // Only show library places

        const response = await fetch(`/api/places?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch places');

        const data = await response.json();
        setPlaces(data.places || []);
      } catch (error) {
        console.error('Error fetching places:', error);
        toast.error('Failed to load places');
      } finally {
        setIsLoading(false);
      }
    };

    if (open) {
      fetchPlaces();
    }
  }, [debouncedSearch, open]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setSelectedPlaceIds(new Set());
    }
  }, [open]);

  const handleTogglePlace = (placeId: string) => {
    const newSelected = new Set(selectedPlaceIds);
    if (newSelected.has(placeId)) {
      newSelected.delete(placeId);
    } else {
      newSelected.add(placeId);
    }
    setSelectedPlaceIds(newSelected);
  };

  const handleSelectAll = () => {
    const availablePlaces = places.filter((p) => !existingPlaceIds.includes(p.id));
    if (selectedPlaceIds.size === availablePlaces.length) {
      setSelectedPlaceIds(new Set());
    } else {
      setSelectedPlaceIds(new Set(availablePlaces.map((p) => p.id)));
    }
  };

  const handleSubmit = async () => {
    if (selectedPlaceIds.size === 0) {
      toast.error('Please select at least one place');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/collections/${collectionId}/places`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeIds: Array.from(selectedPlaceIds),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to add places');
      }

      const addedCount = data.results?.successful?.length || selectedPlaceIds.size;
      toast.success(`Added ${addedCount} ${addedCount === 1 ? 'place' : 'places'} to collection`);

      onPlacesAdded();
      onOpenChange(false);
    } catch (error) {
      console.error('Error adding places:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to add places');
    } finally {
      setIsSubmitting(false);
    }
  };

  const availablePlaces = useMemo(
    () => places.filter((p) => !existingPlaceIds.includes(p.id)),
    [places, existingPlaceIds]
  );

  const allSelected = availablePlaces.length > 0 && selectedPlaceIds.size === availablePlaces.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Places to Collection</DialogTitle>
          <DialogDescription>
            Search and select places from your library to add to this collection
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search places by name, city, or country..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Select All */}
        {availablePlaces.length > 0 && (
          <div className="flex items-center gap-2 pb-2 border-b">
            <Checkbox
              id="select-all"
              checked={allSelected}
              onCheckedChange={handleSelectAll}
            />
            <label
              htmlFor="select-all"
              className="text-sm font-medium cursor-pointer"
            >
              Select all ({availablePlaces.length} available)
            </label>
          </div>
        )}

        {/* Places List */}
        <div className="flex-1 overflow-y-auto min-h-[300px] -mx-6 px-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : availablePlaces.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {places.length === 0
                ? 'No places found. Try a different search.'
                : 'All matching places are already in this collection.'}
            </div>
          ) : (
            <div className="space-y-2">
              {availablePlaces.map((place) => (
                <PlaceItem
                  key={place.id}
                  place={place}
                  selected={selectedPlaceIds.has(place.id)}
                  onToggle={() => handleTogglePlace(place.id)}
                />
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <div className="flex items-center justify-between w-full">
            <span className="text-sm text-muted-foreground">
              {selectedPlaceIds.size} selected
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || selectedPlaceIds.size === 0}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  `Add ${selectedPlaceIds.size} ${selectedPlaceIds.size === 1 ? 'Place' : 'Places'}`
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlaceItem({
  place,
  selected,
  onToggle,
}: {
  place: Place;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 p-3 border rounded-lg hover:bg-accent/5 cursor-pointer"
      onClick={onToggle}
    >
      <Checkbox checked={selected} onCheckedChange={onToggle} />
      <div className="flex-1 min-w-0">
        <h4 className="font-medium truncate">{place.name}</h4>
        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
          {place.kind && (
            <Badge variant="outline" className="text-xs">
              {place.kind}
            </Badge>
          )}
          {(place.city || place.country) && (
            <div className="flex items-center gap-1 truncate">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {[place.city, place.country].filter(Boolean).join(', ')}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
