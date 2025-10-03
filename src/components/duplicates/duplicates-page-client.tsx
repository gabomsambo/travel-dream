'use client';

import { useState, useCallback } from 'react';
import { DuplicateClusterCard } from './duplicate-cluster-card';
import { DuplicateReviewToolbar } from './duplicate-review-toolbar';
import { toast } from 'sonner';
import type { Place } from '@/types/database';

interface DuplicateCluster {
  cluster_id: string;
  places: Place[];
  avgConfidence: number;
}

interface DuplicatesPageClientProps {
  initialData: DuplicateCluster[];
}

export function DuplicatesPageClient({ initialData }: DuplicatesPageClientProps) {
  const [clusters, setClusters] = useState(initialData);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  const handleBulkMerge = useCallback(async () => {
    const selectedClusters = clusters.filter(c => selected.has(c.cluster_id));

    if (selectedClusters.length === 0) return;

    try {
      const response = await fetch('/api/places/bulk-merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clusters: selectedClusters.map(c => ({
            targetId: c.places[0].id,
            sourceIds: c.places.slice(1).map(p => p.id),
            confidence: c.avgConfidence,
          })),
        }),
      });

      const result = await response.json();

      if (result.success > 0) {
        toast.success(`Merged ${result.success} duplicate groups`);
        setClusters(prev => prev.filter(c => !selected.has(c.cluster_id)));
        clearSelection();
      }

      if (result.failed > 0) {
        toast.error(`Failed to merge ${result.failed} groups`);
      }
    } catch (error) {
      toast.error('Failed to merge duplicates');
      console.error(error);
    }
  }, [clusters, selected, clearSelection]);

  const handleDismiss = useCallback(() => {
    setClusters(prev => prev.filter(c => !selected.has(c.cluster_id)));
    clearSelection();
    toast.success(`Dismissed ${selected.size} groups`);
  }, [selected, clearSelection]);

  return (
    <div className="flex flex-col h-full">
      <DuplicateReviewToolbar
        selectedCount={selected.size}
        onMerge={handleBulkMerge}
        onDismiss={handleDismiss}
        onClear={clearSelection}
      />

      <div className="flex-1 overflow-auto p-4">
        {clusters.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            No duplicate clusters found
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clusters.map(cluster => (
              <DuplicateClusterCard
                key={cluster.cluster_id}
                cluster={cluster}
                selected={selected.has(cluster.cluster_id)}
                onSelect={() => toggleSelection(cluster.cluster_id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
