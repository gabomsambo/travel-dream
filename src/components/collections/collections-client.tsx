'use client';

import { useState, useEffect, useMemo } from 'react';
import { CollectionsGrid } from './collections-grid';
import { CollectionSortDropdown } from './collection-sort-dropdown';
import { Button } from "@/components/adapters/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/adapters/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/adapters/input";
import { Label } from "@/components/adapters/label";
import { Textarea } from "@/components/adapters/textarea";
import { FolderPlus } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import type { Collection } from '@/types/database';

type SortOption = "recent" | "most-places" | "last-edited";

interface CollectionsClientProps {
  initialCollections: (Collection & { placeCount?: number })[];
}

export function CollectionsClient({ initialCollections }: CollectionsClientProps) {
  const router = useRouter();
  const [collections, setCollections] = useState(initialCollections);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("recent");

  // Delete confirmation and undo state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [collectionToDelete, setCollectionToDelete] = useState<string | null>(null);
  const [deletedCollection, setDeletedCollection] = useState<(Collection & { placeCount?: number }) | null>(null);
  const [deleteTimeout, setDeleteTimeout] = useState<NodeJS.Timeout | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Collection name is required');
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to create collection');
      }

      toast.success('Collection created successfully');
      setCreateDialogOpen(false);
      setName('');
      setDescription('');

      // Refresh the page to show the new collection
      router.refresh();
    } catch (error) {
      console.error('Error creating collection:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create collection');
    } finally {
      setIsCreating(false);
    }
  };

  // Sort collections
  const sortedCollections = useMemo(() => {
    return [...collections].sort((a, b) => {
      switch (sortBy) {
        case "recent":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "most-places":
          return (b.placeCount || 0) - (a.placeCount || 0);
        case "last-edited":
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        default:
          return 0;
      }
    });
  }, [collections, sortBy]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (deleteTimeout) clearTimeout(deleteTimeout);
    };
  }, [deleteTimeout]);

  const handleDelete = (collectionId: string) => {
    setCollectionToDelete(collectionId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!collectionToDelete) return;

    const toDelete = collections.find(c => c.id === collectionToDelete);
    if (!toDelete) return;

    setDeletedCollection(toDelete);
    setDeleteDialogOpen(false);

    // Optimistically remove from UI
    setCollections(collections.filter(c => c.id !== collectionToDelete));

    // Set 5s timer for actual deletion
    const timeout = setTimeout(async () => {
      try {
        const response = await fetch(`/api/collections/${collectionToDelete}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          throw new Error('Failed to delete collection');
        }

        router.refresh();
      } catch (error) {
        console.error('Error deleting collection:', error);
        toast.error('Failed to delete collection');
        // Restore on error
        if (toDelete) {
          setCollections(prev => [...prev, toDelete]);
        }
      }
      setDeletedCollection(null);
    }, 5000);

    setDeleteTimeout(timeout);
    setCollectionToDelete(null);
  };

  const handleUndo = () => {
    if (deleteTimeout) clearTimeout(deleteTimeout);
    if (deletedCollection) {
      setCollections(prev => [...prev, deletedCollection]);
    }
    setDeletedCollection(null);
    setDeleteTimeout(null);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Collections</h1>
          <p className="text-muted-foreground mt-1">
            Organize your travel places into curated collections
          </p>
        </div>
        <div className="flex items-center gap-3">
          <CollectionSortDropdown value={sortBy} onChange={setSortBy} />
          <Button onClick={() => setCreateDialogOpen(true)} size="lg">
            <FolderPlus className="h-5 w-5 mr-2" />
            New Collection
          </Button>
        </div>
      </div>

      {/* Collections Grid */}
      <CollectionsGrid collections={sortedCollections} onDelete={handleDelete} onCreateClick={() => setCreateDialogOpen(true)} />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Collection?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all places from this collection. You can undo this action within 5 seconds.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Undo Toast */}
      {deletedCollection && (
        <div className="fixed bottom-4 right-4 z-50 bg-background border rounded-lg shadow-lg p-4 flex items-center gap-3 animate-in slide-in-from-bottom-5">
          <div className="flex-1">
            <p className="font-medium">Collection deleted</p>
            <p className="text-sm text-muted-foreground">{deletedCollection.name}</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleUndo}>
            Undo
          </Button>
        </div>
      )}

      {/* Create Collection Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Collection</DialogTitle>
            <DialogDescription>
              Give your collection a name and optional description
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Tokyo Food Tour, Paris Museums..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleCreate();
                  }
                }}
                maxLength={200}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Optional description of this collection..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={1000}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateDialogOpen(false);
                setName('');
                setDescription('');
              }}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isCreating || !name.trim()}>
              {isCreating ? 'Creating...' : 'Create Collection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
