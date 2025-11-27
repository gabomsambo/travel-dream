'use client';

import { useState, useCallback, useOptimistic, useEffect, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DuplicateClusterCard } from './duplicate-cluster-card';
import { DuplicateReviewToolbar } from './duplicate-review-toolbar';
import { Accordion } from '@/components/ui-v2/accordion';
import { toast } from 'sonner';
import { recommendMergeTarget, computeMergedPlace } from '@/lib/duplicate-target-selector';
import type { Place } from '@/types/database';

interface DuplicateCluster {
  cluster_id: string;
  places: Place[];
  avgConfidence: number;
}

interface DuplicatesPageClientProps {
  initialData: DuplicateCluster[];
}

type ClusterAction =
  | { type: 'dismiss'; clusterId: string }
  | { type: 'merge'; clusterId: string };

function clusterReducer(state: DuplicateCluster[], action: ClusterAction): DuplicateCluster[] {
  switch (action.type) {
    case 'dismiss':
    case 'merge':
      return state.filter(c => c.cluster_id !== action.clusterId);
    default:
      return state;
  }
}

export function DuplicatesPageClient({ initialData }: DuplicatesPageClientProps) {
  const router = useRouter();
  const [clusters, setOptimisticClusters] = useOptimistic(initialData, clusterReducer);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedClusterId, setExpandedClusterId] = useState<string | undefined>(undefined);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const toggleSelection = useCallback((clusterId: string) => {
    setSelected(prev => {
      const newSet = new Set(prev);
      if (newSet.has(clusterId)) {
        newSet.delete(clusterId);
      } else {
        newSet.add(clusterId);
      }
      return newSet;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  const generatePairsFromCluster = useCallback((cluster: DuplicateCluster) => {
    const pairs: Array<{ placeId1: string; placeId2: string }> = [];
    for (let i = 0; i < cluster.places.length; i++) {
      for (let j = i + 1; j < cluster.places.length; j++) {
        pairs.push({
          placeId1: cluster.places[i].id,
          placeId2: cluster.places[j].id,
        });
      }
    }
    return pairs;
  }, []);

  const handleDismiss = useCallback(async (cluster: DuplicateCluster) => {
    setIsLoading(true);
    const pairs = generatePairsFromCluster(cluster);

    startTransition(() => {
      setOptimisticClusters({ type: 'dismiss', clusterId: cluster.cluster_id });
    });

    try {
      const response = await fetch('/api/places/dismiss-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairs }),
      });

      if (!response.ok) {
        throw new Error('Failed to dismiss cluster');
      }

      toast.success('Cluster dismissed');
      setExpandedClusterId(undefined);

      // Move to next cluster if available
      if (currentIndex >= clusters.length - 1) {
        setCurrentIndex(Math.max(0, clusters.length - 2));
      }
    } catch (error) {
      toast.error('Failed to dismiss cluster');
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }, [generatePairsFromCluster, router, currentIndex, clusters.length]);

  const handleMerge = useCallback(async (cluster: DuplicateCluster) => {
    setIsLoading(true);
    const targetId = recommendMergeTarget(cluster.places);
    const target = cluster.places.find(p => p.id === targetId);
    const sources = cluster.places.filter(p => p.id !== targetId);

    if (!target) {
      toast.error('No target found for merge');
      setIsLoading(false);
      return;
    }

    startTransition(() => {
      setOptimisticClusters({ type: 'merge', clusterId: cluster.cluster_id });
    });

    try {
      const response = await fetch('/api/places/bulk-merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clusters: [{
            targetId: target.id,
            sourceIds: sources.map(p => p.id),
            confidence: cluster.avgConfidence,
          }],
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to merge cluster');
      }

      const result = await response.json();
      if (result.success > 0) {
        toast.success(`Merged ${cluster.places.length} places`);
        setExpandedClusterId(undefined);
        // Clear duplicate detection cache and refresh
        await fetch('/api/places/duplicates', { method: 'DELETE' });
        router.refresh();

        // Move to next cluster if available
        if (currentIndex >= clusters.length - 1) {
          setCurrentIndex(Math.max(0, clusters.length - 2));
        }
      } else {
        throw new Error('Merge failed');
      }
    } catch (error) {
      toast.error('Failed to merge cluster');
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }, [router, currentIndex, clusters.length]);

  const handleMergePair = useCallback(async (cluster: DuplicateCluster, targetId: string, sourceId: string) => {
    setIsLoading(true);
    const target = cluster.places.find(p => p.id === targetId);
    const source = cluster.places.find(p => p.id === sourceId);

    if (!target || !source) {
      toast.error('Invalid places for merge');
      setIsLoading(false);
      return;
    }

    console.log('[Merge] Starting merge:', { targetId: target.id, targetName: target.name, sourceId: source.id, sourceName: source.name });

    try {
      const response = await fetch('/api/places/bulk-merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clusters: [{
            targetId: target.id,
            sourceIds: [source.id],
            confidence: cluster.avgConfidence,
          }],
        }),
      });

      const result = await response.json();
      console.log('[Merge] API response:', result);

      if (!response.ok) {
        console.error('[Merge] API error:', result);
        throw new Error(result.message || 'Failed to merge places');
      }

      if (result.success > 0) {
        toast.success(`Merged "${source.name}" into "${target.name}"`);
        // Clear duplicate detection cache and refresh
        await fetch('/api/places/duplicates', { method: 'DELETE' });
        router.refresh();
      } else {
        // Check what went wrong
        const errorMsg = result.results?.[0]?.error || 'Merge failed';
        console.error('[Merge] Merge failed:', errorMsg);
        toast.error(`Merge failed: ${errorMsg}`);
      }
    } catch (error) {
      console.error('[Merge] Exception:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to merge places');
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  const handleBulkMerge = useCallback(async () => {
    const selectedClusters = clusters.filter(c => selected.has(c.cluster_id));

    if (selectedClusters.length === 0) return;

    setIsLoading(true);

    try {
      const response = await fetch('/api/places/bulk-merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clusters: selectedClusters.map(c => {
            const targetId = recommendMergeTarget(c.places);
            return {
              targetId,
              sourceIds: c.places.filter(p => p.id !== targetId).map(p => p.id),
              confidence: c.avgConfidence,
            };
          }),
        }),
      });

      const result = await response.json();

      if (result.success > 0) {
        toast.success(`Merged ${result.success} duplicate groups`);
        clearSelection();
        // Clear duplicate detection cache and refresh
        await fetch('/api/places/duplicates', { method: 'DELETE' });
        router.refresh();
      }

      if (result.failed > 0) {
        toast.error(`Failed to merge ${result.failed} groups`);
      }
    } catch (error) {
      toast.error('Failed to merge duplicates');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [clusters, selected, clearSelection, router]);

  const handleBulkDismiss = useCallback(async () => {
    const selectedClusters = clusters.filter(c => selected.has(c.cluster_id));

    if (selectedClusters.length === 0) return;

    setIsLoading(true);

    // Collect all pairs from all selected clusters
    const allPairs: Array<{ placeId1: string; placeId2: string }> = [];
    for (const cluster of selectedClusters) {
      allPairs.push(...generatePairsFromCluster(cluster));
    }

    try {
      const response = await fetch('/api/places/dismiss-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairs: allPairs }),
      });

      if (!response.ok) {
        throw new Error('Failed to dismiss clusters');
      }

      toast.success(`Dismissed ${selectedClusters.length} groups`);
      clearSelection();
      router.refresh();
    } catch (error) {
      toast.error('Failed to dismiss duplicates');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [clusters, selected, generatePairsFromCluster, clearSelection, router]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts when input elements are focused
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.role === 'combobox'
      ) {
        return;
      }

      switch (e.key) {
        case 'j':
          e.preventDefault();
          setCurrentIndex(prev => Math.min(prev + 1, clusters.length - 1));
          break;
        case 'k':
          e.preventDefault();
          setCurrentIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (clusters[currentIndex]) {
            const clusterId = clusters[currentIndex].cluster_id;
            setExpandedClusterId(prev => prev === clusterId ? undefined : clusterId);
          }
          break;
        case ' ':
          e.preventDefault();
          if (clusters[currentIndex]) {
            toggleSelection(clusters[currentIndex].cluster_id);
          }
          break;
        case 'm':
          e.preventDefault();
          if (expandedClusterId) {
            const cluster = clusters.find(c => c.cluster_id === expandedClusterId);
            if (cluster) handleMerge(cluster);
          } else if (selected.size > 0) {
            handleBulkMerge();
          }
          break;
        case 'd':
          e.preventDefault();
          if (expandedClusterId) {
            const cluster = clusters.find(c => c.cluster_id === expandedClusterId);
            if (cluster) handleDismiss(cluster);
          } else if (selected.size > 0) {
            handleBulkDismiss();
          }
          break;
        case 'Escape':
          e.preventDefault();
          setExpandedClusterId(undefined);
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    clusters,
    currentIndex,
    expandedClusterId,
    selected.size,
    toggleSelection,
    handleMerge,
    handleDismiss,
    handleBulkMerge,
    handleBulkDismiss,
  ]);

  // Auto-scroll to current item
  useEffect(() => {
    const currentElement = document.querySelector(`[data-cluster-index="${currentIndex}"]`);
    if (currentElement) {
      currentElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentIndex]);

  return (
    <div className="flex flex-col h-full">
      <DuplicateReviewToolbar
        selectedCount={selected.size}
        onMerge={handleBulkMerge}
        onDismiss={handleBulkDismiss}
        onClear={clearSelection}
        isLoading={isLoading}
      />

      <div className="flex-1 overflow-auto p-4">
        {clusters.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            <div className="text-4xl mb-4">🎉</div>
            <h3 className="text-lg font-medium mb-2">No duplicate clusters found</h3>
            <p className="text-sm">Your places collection is clean!</p>
          </div>
        ) : (
          <Accordion
            type="single"
            collapsible
            value={expandedClusterId}
            onValueChange={setExpandedClusterId}
            className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4"
          >
            {clusters.map((cluster, idx) => (
              <div
                key={cluster.cluster_id}
                data-cluster-index={idx}
                className={idx === currentIndex ? 'ring-2 ring-offset-2 ring-primary rounded-lg' : ''}
              >
                <DuplicateClusterCard
                  cluster={cluster}
                  selected={selected.has(cluster.cluster_id)}
                  onSelect={() => toggleSelection(cluster.cluster_id)}
                  onMerge={() => handleMerge(cluster)}
                  onMergePair={(targetId, sourceId) => handleMergePair(cluster, targetId, sourceId)}
                  onDismiss={() => handleDismiss(cluster)}
                  isLoading={isLoading}
                />
              </div>
            ))}
          </Accordion>
        )}
      </div>

      {/* Keyboard hints footer */}
      <div className="border-t bg-muted/50 px-4 py-2 text-xs text-muted-foreground hidden md:flex gap-4 justify-center">
        <span><kbd className="bg-background px-1.5 py-0.5 rounded border font-mono">j</kbd> / <kbd className="bg-background px-1.5 py-0.5 rounded border font-mono">k</kbd> Navigate</span>
        <span><kbd className="bg-background px-1.5 py-0.5 rounded border font-mono">Enter</kbd> Expand</span>
        <span><kbd className="bg-background px-1.5 py-0.5 rounded border font-mono">Space</kbd> Select</span>
        <span><kbd className="bg-background px-1.5 py-0.5 rounded border font-mono">m</kbd> Merge</span>
        <span><kbd className="bg-background px-1.5 py-0.5 rounded border font-mono">d</kbd> Dismiss</span>
        <span><kbd className="bg-background px-1.5 py-0.5 rounded border font-mono">Esc</kbd> Collapse</span>
      </div>
    </div>
  );
}
